import type {
  CourseRef,
  createCoursePermissions,
} from "~/modules/permissions/course-permissions.server";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type LessonParams = { slug: string; lessonId: string };

export type CoursePermissions = ReturnType<typeof createCoursePermissions>;

export type LessonViewerDeps = {
  db: Db;
  coursePermissions: CoursePermissions;
};

/**
 * The course this lesson belongs to, as `coursePermissions` looks it up: it
 * treats a lesson in another course, or a malformed id, as not found.
 */
export function lessonRef(params: LessonParams): CourseRef {
  return { slug: params.slug, lessonId: params.lessonId };
}
