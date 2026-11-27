import * as schema from "~/db/schema";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
import { setCurrentUserId } from "~/lib/session";
import { markdown } from "~/lib/text";
import { createCoursePermissions } from "~/modules/permissions/course-permissions.server";
import { createTestDb, seedBaseData } from "~/test/setup";
import { createLessonViewer, type LessonParams } from "../index.server";

/** A course with one lesson, and a viewer bound to its test database. */
export function lessonWorld() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const viewer = createLessonViewer(db, createCoursePermissions(db));
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  const lesson = db
    .insert(schema.lessons)
    .values({
      moduleId: mod.id,
      title: "Error Handling Patterns",
      content: markdown("# Results\n\nPrefer a Result type."),
      position: 1,
    })
    .returning()
    .get();
  const params: LessonParams = {
    slug: base.course.slug,
    lessonId: String(lesson.id),
  };

  function enroll(userId = base.user.id) {
    enrollStudentInTransaction(db, userId, base.course.id, new Date());
  }

  async function loadFull(userId = base.user.id) {
    const page = await viewer.load(await asUser(userId), params);
    if (page.view !== "full") throw new Error(`Expected full: ${page.view}`);
    return page;
  }

  return { db, base, viewer, lesson, params, enroll, loadFull };
}

/** Signs in through the real session cookie, as the DevUI panel does. */
export async function asUser(userId: number, form?: Record<string, string>) {
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  return new Request("http://localhost/", {
    method: form ? "POST" : "GET",
    headers: { Cookie: setCookie.split(";")[0] },
    body: form ? new URLSearchParams(form) : undefined,
  });
}

/** The status of the response a loader or action threw. */
export async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (thrown) {
    return (thrown as { init?: { status?: number } }).init?.status;
  }
  throw new Error("Expected a thrown response");
}
