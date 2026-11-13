import { eq } from "drizzle-orm";
import { courses, type CourseStatus } from "~/db/schema";
import type { Db, Failure } from "~/lib/refunds.server";

// ─── Course status ───
// A Platform Admin changing a course's status. Takes the database first, so
// tests can hand in an in-memory one.

export type ChangeCourseStatusResult =
  | { ok: true; course: typeof courses.$inferSelect }
  | Failure;

export function changeCourseStatus(
  db: Db,
  courseId: number,
  status: CourseStatus
): ChangeCourseStatusResult {
  const course = db
    .update(courses)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, courseId))
    .returning()
    .get();
  if (!course) {
    return { ok: false, status: 404, error: "Course not found" };
  }
  return { ok: true, course };
}
