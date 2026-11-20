import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import type { AnalyticsRange } from "../config";
import {
  getInstructorAnalytics,
  type AnalyticsQuery,
  type AnalyticsViewer,
} from "../service.server";

// Local noon, like the refund tests: the refund window is counted in local
// calendar days.
const NOW = new Date(2026, 10, 18, 12, 0, 0);

function daysBefore(days: number, hour = 12) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  when.setHours(hour, 0, 0, 0);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let otherInstructor: typeof schema.users.$inferSelect;
let otherCourse: typeof schema.courses.$inferSelect;
let admin: typeof schema.users.$inferSelect;

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function addCourse(
  instructorId: number,
  slug: string,
  status = CourseStatus.Published
) {
  return db
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: slug,
      salesCopy: markdown(slug),
      instructorId,
      categoryId: base.category.id,
      status,
    })
    .returning()
    .get();
}

function addPurchase(courseId: number, amountPaid: number, createdAt: string) {
  return db
    .insert(schema.purchases)
    .values({ userId: base.user.id, courseId, amountPaid, createdAt })
    .returning()
    .get();
}

function analytics(
  viewer: AnalyticsViewer,
  query: Partial<AnalyticsQuery> & { range?: AnalyticsRange } = {}
) {
  return getInstructorAnalytics(
    db,
    viewer,
    {
      range: "all",
      requestedInstructorId: null,
      requestedCourseId: null,
      ...query,
    },
    NOW
  );
}

const asInstructor = () => ({ userId: base.instructor.id, isAdmin: false });
const asAdmin = () => ({ userId: admin.id, isAdmin: true });

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  admin = addUser("Admin", UserRole.Admin);
  otherInstructor = addUser("Other", UserRole.Instructor);
  otherCourse = addCourse(otherInstructor.id, "other-course");
});

describe("getInstructorAnalytics", () => {
  describe("who sees what", () => {
    beforeEach(() => {
      addPurchase(base.course.id, 1000, daysBefore(3));
      addPurchase(otherCourse.id, 5000, daysBefore(3));
    });

    it("pins an instructor to their own figures, whatever they ask for", () => {
      const result = analytics(asInstructor(), {
        requestedInstructorId: otherInstructor.id,
      });

      expect(result.instructorId).toBe(base.instructor.id);
      expect(result.summary.grossCents).toBe(1000);
      expect(result.courses.map((c) => c.courseId)).toEqual([base.course.id]);
      expect(result.instructors).toEqual([]);
    });

    it("won't select another instructor's course for an instructor", () => {
      const result = analytics(asInstructor(), {
        requestedCourseId: otherCourse.id,
      });

      expect(result.selectedCourseId).toBeNull();
      expect(result.progress).toBeNull();
      expect(result.funnel).toBeNull();
      expect(result.quizzes).toBeNull();
      expect(result.countries).toBeNull();
    });

    it("selects a course the instructor owns", () => {
      const result = analytics(asInstructor(), {
        requestedCourseId: base.course.id,
      });

      expect(result.selectedCourseId).toBe(base.course.id);
      expect(result.progress).not.toBeNull();
      expect(result.countries?.grossCents).toBe(1000);
    });

    it("shows an admin the whole platform when no instructor is picked", () => {
      const result = analytics(asAdmin());

      expect(result.instructorId).toBeNull();
      expect(result.summary.grossCents).toBe(6000);
      expect(result.instructors.map((i) => i.id).sort()).toEqual(
        [base.instructor.id, otherInstructor.id].sort()
      );
      expect(result.unpublished).toBe(false);
    });

    it("lets an admin narrow to one instructor", () => {
      const result = analytics(asAdmin(), {
        requestedInstructorId: otherInstructor.id,
      });

      expect(result.instructorId).toBe(otherInstructor.id);
      expect(result.summary.grossCents).toBe(5000);
    });

    it("flags an instructor with nothing published", () => {
      const newcomer = addUser("Newcomer", UserRole.Instructor);
      addCourse(newcomer.id, "draft-course", CourseStatus.Draft);

      const result = analytics({ userId: newcomer.id, isAdmin: false });

      expect(result.unpublished).toBe(true);
    });
  });

  describe("the range", () => {
    beforeEach(() => {
      addPurchase(base.course.id, 100, daysBefore(3));
      addPurchase(base.course.id, 200, daysBefore(20));
      addPurchase(base.course.id, 400, daysBefore(60));
    });

    it("counts only purchases since the range began, measured from now", () => {
      expect(analytics(asInstructor(), { range: "7d" }).summary).toMatchObject({
        grossCents: 100,
        purchaseCount: 1,
      });
      expect(analytics(asInstructor(), { range: "30d" }).summary).toMatchObject(
        { grossCents: 300, purchaseCount: 2 }
      );
      expect(analytics(asInstructor(), { range: "all" }).summary).toMatchObject(
        { grossCents: 700, purchaseCount: 3 }
      );
    });

    it("draws a day for every day of a fixed range, ending today", () => {
      const { series } = analytics(asInstructor(), { range: "7d" });

      expect(series.granularity).toBe("day");
      expect(series.points).toHaveLength(8);
      expect(series.points.at(-1)?.bucket).toBe(NOW.toISOString().slice(0, 10));
      expect(series.points.reduce((t, p) => t + p.grossCents, 0)).toBe(100);
    });

    it("draws all time by month, from the first sale", () => {
      const { series } = analytics(asInstructor(), { range: "all" });

      expect(series.granularity).toBe("month");
      expect(series.points[0].bucket).toBe(daysBefore(60).slice(0, 7));
      expect(series.points.at(-1)?.bucket).toBe(NOW.toISOString().slice(0, 7));
    });
  });

  describe("refund exposure", () => {
    it("counts purchases still inside the window, and days left", () => {
      addPurchase(base.course.id, 1000, daysBefore(3));
      addPurchase(base.course.id, 3000, daysBefore(20));

      const { refundExposure } = analytics(asInstructor());

      expect(refundExposure).toMatchObject({
        grossCents: 1000,
        netCents: 800,
        purchaseCount: 1,
        sharePercent: 25,
        closingTodayCount: 0,
      });
      expect(refundExposure.courses).toEqual([
        {
          courseId: base.course.id,
          title: base.course.title,
          grossCents: 1000,
          purchaseCount: 1,
          daysLeft: 11,
        },
      ]);
    });

    it("keeps the whole fourteenth day, even for a late-night purchase", () => {
      addPurchase(base.course.id, 1000, daysBefore(14, 23));
      addPurchase(base.course.id, 1000, daysBefore(15, 23));

      const { refundExposure } = analytics(asInstructor());

      expect(refundExposure.purchaseCount).toBe(1);
      expect(refundExposure.closingTodayCount).toBe(1);
      expect(refundExposure.courses[0].daysLeft).toBe(0);
    });

    it("headlines a course with its most urgent purchase", () => {
      addPurchase(base.course.id, 1000, daysBefore(1));
      addPurchase(base.course.id, 1000, daysBefore(10));

      const { refundExposure } = analytics(asInstructor());

      expect(refundExposure.courses[0]).toMatchObject({
        purchaseCount: 2,
        daysLeft: 4,
      });
    });

    it("is empty when every purchase is past its window", () => {
      addPurchase(base.course.id, 1000, daysBefore(30));

      const { refundExposure } = analytics(asInstructor());

      expect(refundExposure.purchaseCount).toBe(0);
      expect(refundExposure.courses).toEqual([]);
    });
  });
});
