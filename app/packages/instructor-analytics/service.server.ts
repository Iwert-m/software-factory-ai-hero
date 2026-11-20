import { and, count, countDistinct, eq, sum } from "drizzle-orm";
import { CourseStatus, courses, purchases, users } from "~/db/schema";
import { rangeStart, splitRevenue, type AnalyticsRange } from "./config";
import {
  getCourseDropOff,
  getCourseProgressSummary,
  getCourseQuizPassRates,
  getCourseRevenueByCountry,
  getRatingSummary,
  getRefundExposure,
  getRevenueOverTime,
  getStudentRevenue,
  getTopBuyers,
  getUnansweredQuestions,
  ownedBy,
  purchaseScope,
  type Queryable,
  type RevenueSummary,
} from "./lib/panels.server";

// ─── Instructor Analytics service ───
// Everything the analytics page shows, computed from the database at one
// instant. The route only authenticates and parses the URL; who may see what
// and every figure on the page are decided here.
//
// Both dependencies arrive as arguments — the database and the moment "now" —
// so a test can hand in an in-memory database and a fixed date. This package
// may not import the app's shared connection (`~/db`): the
// `packages-get-db-injected` rule in .dependency-cruiser.cjs enforces it.

export type {
  CourseCountryRevenue,
  CourseFunnel,
  CourseProgressSummary,
  FunnelLesson,
  QuizPassRate,
  RefundExposure,
  RevenueSeries,
} from "./lib/panels.server";

export type AnalyticsViewer = { userId: number; isAdmin: boolean };

export type AnalyticsQuery = {
  range: AnalyticsRange;
  /**
   * Raw requests from the URL, not yet trusted. Only an admin's instructor
   * request is honoured, and only a course the resolved instructor owns.
   */
  requestedInstructorId: number | null;
  requestedCourseId: number | null;
};

export type InstructorAnalytics = ReturnType<typeof getInstructorAnalytics>;

/**
 * Everything the analytics page shows, as of `now`.
 *
 * Decides what the viewer may see: an instructor is pinned to their own
 * figures whatever they ask for, an admin may pick one instructor or none
 * (null — platform-wide), and a course is only selected if it belongs to
 * whoever is being looked at.
 */
export function getInstructorAnalytics(
  db: Queryable,
  viewer: AnalyticsViewer,
  query: AnalyticsQuery,
  now: Date
) {
  const { range } = query;
  // Read once, so every panel agrees on where the range begins.
  const since = rangeStart(range, now);

  const instructorId = viewer.isAdmin
    ? query.requestedInstructorId
    : viewer.userId;

  // The selector lists every course the viewer owns rather than only the ones
  // that sold: a course nobody is finishing is exactly what that tab is for.
  const courseOptions = db
    .select({ courseId: courses.id, title: courses.title })
    .from(courses)
    .where(ownedBy(instructorId))
    .orderBy(courses.title)
    .all();

  // Checked against the list rather than trusted: the id arrives in the URL,
  // and an instructor may not read another instructor's funnel.
  const selectedCourseId = courseOptions.some(
    (course) => course.courseId === query.requestedCourseId
  )
    ? query.requestedCourseId
    : null;

  // Gross revenue, the platform's fee and the instructor's net for the range.
  const summaryRow = db
    .select({
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, since))
    .get();

  // sum() returns null over an empty set, and a string when SQLite has rows.
  const summary: RevenueSummary = {
    ...splitRevenue(Number(summaryRow?.gross ?? 0)),
    purchaseCount: summaryRow?.purchaseCount ?? 0,
  };

  // Revenue broken down by course, biggest earner first. Courses with no sales
  // in the range are absent rather than listed at zero.
  const courseRevenue = db
    .select({
      courseId: courses.id,
      title: courses.title,
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, since))
    .groupBy(courses.id)
    .all()
    .map((row) => ({
      courseId: row.courseId,
      title: row.title,
      ...splitRevenue(Number(row.gross ?? 0)),
      purchaseCount: row.purchaseCount,
    }))
    .sort((a, b) => b.grossCents - a.grossCents);

  // How many people paid, and how many are learning. Deliberately two numbers:
  // one team purchase is a single buyer covering several seats, and someone who
  // redeems a seat enrols without a purchase row of their own.
  const buyerCountRow = db
    .select({ buyerCount: countDistinct(purchases.userId) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, since))
    .get();

  const students = getStudentRevenue(db, instructorId, since);
  const attributedRevenue = students.reduce(
    (total, student) => total + student.revenueCents,
    0
  );

  const audience = {
    buyerCount: buyerCountRow?.buyerCount ?? 0,
    studentCount: students.length,
    revenuePerStudentCents:
      students.length === 0
        ? null
        : Math.round(attributedRevenue / students.length),
  };

  // Everyone who owns at least one course, for the admin's instructor picker.
  // Owners rather than users with the instructor role: an admin who owns a
  // course contributes to the platform-wide total.
  const instructors = viewer.isAdmin
    ? db
        .selectDistinct({ id: users.id, name: users.name })
        .from(courses)
        .innerJoin(users, eq(courses.instructorId, users.id))
        .orderBy(users.name)
        .all()
    : [];

  // Drives the "publish your first course" empty state. The platform-wide view
  // always has courses in it, so the prompt only makes sense for one named
  // instructor.
  const publishedRow =
    instructorId === null
      ? undefined
      : db
          .select({ id: courses.id })
          .from(courses)
          .where(
            and(
              eq(courses.instructorId, instructorId),
              eq(courses.status, CourseStatus.Published)
            )
          )
          .get();

  return {
    // Split rather than filtered: the range applies, but questions older than
    // it are still reported, because months of silence is the urgent case.
    questions: getUnansweredQuestions(db, instructorId, since),
    audience,
    buyers: getTopBuyers(db, instructorId, since),
    ratings: getRatingSummary(db, instructorId, since),
    instructorId,
    selectedCourseId,
    summary,
    series: getRevenueOverTime(db, instructorId, range, since, now),
    courses: courseRevenue,
    courseOptions,
    // Progress and drop-off carry no usable timestamp, so they span all time
    // whatever the range control says — and the tab says so on screen.
    progress:
      selectedCourseId === null
        ? null
        : getCourseProgressSummary(db, selectedCourseId),
    funnel:
      selectedCourseId === null ? null : getCourseDropOff(db, selectedCourseId),
    // Quiz attempts and purchases are both timestamped, so unlike the two
    // panels above these do honour the range control.
    quizzes:
      selectedCourseId === null
        ? null
        : getCourseQuizPassRates(db, selectedCourseId, since),
    countries:
      selectedCourseId === null
        ? null
        : getCourseRevenueByCountry(db, selectedCourseId, since),
    instructors,
    refundExposure: getRefundExposure(
      db,
      instructorId,
      since,
      now,
      summary.grossCents
    ),
    unpublished: instructorId !== null && publishedRow === undefined,
  };
}
