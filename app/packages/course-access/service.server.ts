import { UserRole } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import {
  findCourse,
  findCourseOfLesson,
  findPurchaseCountry,
  findUser,
  hasEnrollment,
} from "./lib/lookups.server";
import { countryLock } from "./lib/country-lock";

// ─── Course Access service ───
// "May this viewer do this, and if not, why?" answered from the database.
//
// The database arrives as an argument (`packages-get-db-injected`), and the
// viewer arrives already worked out: this package never reads the session or
// the request and never throws HTTP errors. The route adapter in
// `~/lib/course-access.server` does that.
//
// Checks run in one order everywhere: not found → signed out → staff →
// Enrollment → Country Lock. A course's Instructor and every Platform Admin
// are staff, and staff are never refused for Enrollment or Country Lock.

/** Who is asking. A `userId` with no matching user counts as signed out. */
export type Viewer = { userId: number | null; country: string | null };

export type LessonRef = { courseId: number; lessonId: number };

/** Every way Course Access can be refused. A refusal never carries content. */
export type Refusal =
  | { ok: false; reason: "signed-out" }
  /** The course is missing, or the lesson is not in that course. */
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "no-enrollment"; userId: number }
  | {
      ok: false;
      reason: "country-lock";
      userId: number;
      purchaseCountry: string;
      currentCountry: string;
    }
  | { ok: false; reason: "not-course-staff"; userId: number }
  | { ok: false; reason: "not-instructor"; userId: number };

export type RefusalReason = Refusal["reason"];

/** The refusals named in `R`, and only those. */
export type Refused<R extends RefusalReason> = Extract<Refusal, { reason: R }>;

export type LessonAccess =
  | {
      ok: true;
      userId: number;
      /** The course's Instructor or a Platform Admin. */
      canModerate: boolean;
      /** Has an Enrollment: mark in progress, record Watched time. */
      tracksProgress: boolean;
    }
  | Refused<"not-found" | "signed-out" | "no-enrollment" | "country-lock">;

export type CourseStaffAccess =
  | { ok: true; userId: number; isAdmin: boolean }
  | Refused<"not-found" | "signed-out" | "not-course-staff">;

export type InstructorAccess =
  | { ok: true; userId: number; isAdmin: boolean }
  | Refused<"signed-out" | "not-instructor">;

function signedInUser(db: Db, viewer: Viewer) {
  return viewer.userId === null ? undefined : findUser(db, viewer.userId);
}

function isStaffOf(
  user: { id: number; role: UserRole },
  course: { instructorId: number }
) {
  // Owning the course is enough, whatever the person's role is now.
  return user.role === UserRole.Admin || course.instructorId === user.id;
}

/**
 * May the viewer take this lesson of this course? Checked per lesson, so a
 * lesson can never be checked against the wrong course.
 */
export function lessonAccess(
  db: Db,
  viewer: Viewer,
  lesson: LessonRef
): LessonAccess {
  const course = findCourseOfLesson(db, lesson.courseId, lesson.lessonId);
  if (!course) return { ok: false, reason: "not-found" };

  const user = signedInUser(db, viewer);
  if (!user) return { ok: false, reason: "signed-out" };

  const isStaff = isStaffOf(user, course);
  const enrolled = hasEnrollment(db, user.id, course.id);

  if (!isStaff) {
    if (!enrolled) {
      return { ok: false, reason: "no-enrollment", userId: user.id };
    }
    const lock = countryLock(
      course,
      findPurchaseCountry(db, user.id, course.id),
      viewer.country
    );
    if (lock) {
      return { ok: false, reason: "country-lock", userId: user.id, ...lock };
    }
  }

  return {
    ok: true,
    userId: user.id,
    canModerate: isStaff,
    tracksProgress: enrolled,
  };
}

/** May the viewer act for this course: its Instructor or a Platform Admin? */
export function courseStaffAccess(
  db: Db,
  viewer: Viewer,
  courseId: number
): CourseStaffAccess {
  const course = findCourse(db, courseId);
  if (!course) return { ok: false, reason: "not-found" };

  const user = signedInUser(db, viewer);
  if (!user) return { ok: false, reason: "signed-out" };

  if (!isStaffOf(user, course)) {
    return { ok: false, reason: "not-course-staff", userId: user.id };
  }
  return { ok: true, userId: user.id, isAdmin: user.role === UserRole.Admin };
}

/**
 * Is the viewer an Instructor or a Platform Admin, without tying them to a
 * course? For pages that span all of someone's courses.
 */
export function instructorAccess(db: Db, viewer: Viewer): InstructorAccess {
  const user = signedInUser(db, viewer);
  if (!user) return { ok: false, reason: "signed-out" };

  if (user.role !== UserRole.Instructor && user.role !== UserRole.Admin) {
    return { ok: false, reason: "not-instructor", userId: user.id };
  }
  return { ok: true, userId: user.id, isAdmin: user.role === UserRole.Admin };
}
