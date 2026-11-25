import type {
  CourseRef,
  createCoursePermissions,
} from "~/modules/permissions/course-permissions.server";
import type { Db } from "~/lib/notes.server";

export type LessonParams = { slug: string; lessonId: string };

export type CoursePermissions = ReturnType<typeof createCoursePermissions>;

export type LessonViewerDeps = {
  db: Db;
  coursePermissions: CoursePermissions;
};

/**
 * The course named by this route's slug, through this lesson. A lesson in
 * another course, or a malformed lesson id, counts as not found.
 */
export function lessonRef(params: LessonParams): CourseRef {
  return { slug: params.slug, lessonId: params.lessonId };
}
