import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { postComment } from "./comments.server";
import { MAX_COMMENT_LENGTH } from "./comments";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  [lessonId, otherLessonId] = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function mustPost(
  userId: number,
  onLesson: number,
  parentId: number | null,
  body: string
) {
  const result = postComment(db, userId, onLesson, parentId, body);
  if (!result.ok) throw new Error(result.error);
  return result.comment;
}

describe("postComment", () => {
  it("posts a Question on a lesson, trimmed", () => {
    const comment = mustPost(base.user.id, lessonId, null, "  How?  ");
    expect(comment).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "How?",
    });
  });

  it("posts a Reply under a Question", () => {
    const question = mustPost(base.user.id, lessonId, null, "How?");
    const reply = mustPost(base.instructor.id, lessonId, question.id, "Like this");
    expect(reply.parentId).toBe(question.id);
  });

  it("rejects an empty comment", () => {
    expect(postComment(db, base.user.id, lessonId, null, "   ")).toEqual({
      ok: false,
      status: 400,
      error: "Comment cannot be empty",
    });
  });

  it("rejects a comment that is too long and stores nothing", () => {
    const result = postComment(
      db,
      base.user.id,
      lessonId,
      null,
      "x".repeat(MAX_COMMENT_LENGTH + 1)
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(db.select().from(schema.comments).all()).toHaveLength(0);
  });

  it("rejects a comment on a lesson that does not exist", () => {
    expect(postComment(db, base.user.id, 999, null, "Hi")).toEqual({
      ok: false,
      status: 404,
      error: "Lesson not found",
    });
  });

  it("rejects a Reply to a Question that does not exist", () => {
    expect(postComment(db, base.user.id, lessonId, 999, "Hi")).toEqual({
      ok: false,
      status: 404,
      error: "Parent comment not found",
    });
  });

  it("rejects a Reply whose Question is on another lesson", () => {
    const question = mustPost(base.user.id, otherLessonId, null, "Q");
    expect(postComment(db, base.user.id, lessonId, question.id, "R")).toEqual({
      ok: false,
      status: 400,
      error: "Parent comment belongs to a different lesson",
    });
  });

  it("rejects a Reply to a Reply", () => {
    const question = mustPost(base.user.id, lessonId, null, "Q");
    const reply = mustPost(base.user.id, lessonId, question.id, "R");
    expect(postComment(db, base.user.id, lessonId, reply.id, "RR")).toEqual({
      ok: false,
      status: 400,
      error: "Replies can only be one level deep",
    });
  });
});
