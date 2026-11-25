import { db } from "~/db";
import type { Db } from "~/lib/notes.server";
import { coursePermissions } from "~/modules/permissions/course-permissions.server";
import { actOnLesson } from "./lib/act";
import { loadLesson } from "./lib/load";
import type { CoursePermissions, LessonParams } from "./lib/lesson-ref";

export type { LessonParams } from "./lib/lesson-ref";

/** Everything the lesson page shows: a locked preview or the full lesson. */
export type LessonPage = Awaited<ReturnType<typeof loadLesson>>;
export type FullLessonPage = Extract<LessonPage, { view: "full" }>;
export type LockedLessonPage = Extract<LessonPage, { view: "locked" }>;

/**
 * The lesson page bound to a database. The app uses `lessonViewer`, which
 * reads the app database; tests build their own against a test database.
 */
export function createLessonViewer(
  database: Db,
  permissions: CoursePermissions
) {
  const deps = { db: database, coursePermissions: permissions };
  return {
    /**
     * What the person making this request may see of the lesson. Throws 404
     * for an unknown course, a malformed lesson id, or a lesson from another
     * course. Someone who can't view the content gets the locked view.
     */
    load(request: Request, params: LessonParams) {
      return loadLesson(deps, request, params);
    },

    /**
     * Runs the form's `intent` (comments, Bookmarks, Notes, progress,
     * quizzes) after checking that intent's own capability. Throws 400 for
     * an unknown intent and the permission error for a refusal.
     */
    act(request: Request, params: LessonParams) {
      return actOnLesson(deps, request, params);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonViewer = /* @__PURE__ */ createLessonViewer(
  db,
  coursePermissions
);
