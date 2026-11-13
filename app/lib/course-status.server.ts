import { eq } from "drizzle-orm";
import { courses, users, CourseStatus } from "~/db/schema";
import type { Notification } from "~/lib/notifications.server";
import type { Db, Failure } from "~/lib/refunds.server";

// ─── Course status ───
// A Platform Admin changing a course's status. Takes the database first, so
// tests can hand in an in-memory one.

export type ChangeCourseStatusResult =
  | {
      ok: true;
      course: typeof courses.$inferSelect;
      notifications: Notification[];
    }
  | Failure;

const STATUS_VERBS: Record<CourseStatus, string> = {
  [CourseStatus.Draft]: "unpublished",
  [CourseStatus.Published]: "published",
  [CourseStatus.Archived]: "archived",
};

/** The Instructor is told, unless they made the change themselves. */
function buildCourseStatusChanged(
  db: Db,
  course: typeof courses.$inferSelect,
  actorId: number
): Notification[] {
  if (course.instructorId === actorId) return [];
  const instructor = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, course.instructorId))
    .get();
  if (!instructor) return [];

  return [
    {
      kind: "course-status-changed",
      recipients: [{ id: String(instructor.id), name: instructor.name }],
      body: `A Platform Admin ${STATUS_VERBS[course.status]} “${course.title}”`,
      url: `/instructor/${course.id}`,
    },
  ];
}

export function changeCourseStatus(
  db: Db,
  courseId: number,
  status: CourseStatus,
  actorId: number
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
  return {
    ok: true,
    course,
    notifications: buildCourseStatusChanged(db, course, actorId),
  };
}
