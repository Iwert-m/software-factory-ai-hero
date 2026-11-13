import { eq } from "drizzle-orm";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { MIN_COMMENT_LENGTH, MAX_COMMENT_LENGTH } from "~/lib/comments";
import {
  buildNewQuestion,
  buildReply,
  type Notification,
} from "~/lib/notifications.server";
import type { Db, Failure } from "~/lib/refunds.server";

// ─── Comments ───
// Posting a Comment (a Question, or a Reply under one). Takes the database
// first, so tests can hand in an in-memory one.

type Comment = typeof comments.$inferSelect;

export type PostCommentResult = 
  | { ok: true; comment: Comment; notifications: Notification[] }
  | Failure;

export function postComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
): PostCommentResult {
  return db.transaction((tx): PostCommentResult => {
    const trimmed = body.trim();
    if (trimmed.length < MIN_COMMENT_LENGTH) {
      return { ok: false, status: 400, error: "Comment cannot be empty" };
    }
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      return {
        ok: false,
        status: 400,
        error: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`,
      };
    }

    const course = tx
      .select({
        slug: courses.slug,
        instructorId: courses.instructorId,
        lessonTitle: lessons.title,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(lessons.id, lessonId))
      .get();
    if (!course) {
      return { ok: false, status: 404, error: "Lesson not found" };
    }

    let parent: Comment | undefined;
    if (parentId !== null) {
      parent = tx
        .select()
        .from(comments)
        .where(eq(comments.id, parentId))
        .get();
      if (!parent) {
        return { ok: false, status: 404, error: "Parent comment not found" };
      }
      if (parent.lessonId !== lessonId) {
        return {
          ok: false,
          status: 400,
          error: "Parent comment belongs to a different lesson",
        };
      }
      if (parent.parentId !== null) {
        return {
          ok: false,
          status: 400,
          error: "Replies can only be one level deep",
        };
      }
    }

    const comment = tx
      .insert(comments)
      .values({ userId, lessonId, parentId, body: trimmed })
      .returning()
      .get();

    const findUser = (id: number) =>
      tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, id))
        .get();
    const author = findUser(userId);
    const recipient = findUser(parent ? parent.userId : course.instructorId);
    const context = {
      lessonId,
      lessonTitle: course.lessonTitle,
      courseSlug: course.slug,
    };
    let notifications: Notification[] = [];
    if (author && recipient) {
      notifications = parent
        ? buildReply({
            ...context,
            author,
            questionId: parent.id,
            questionAuthor: recipient,
          })
        : buildNewQuestion({
            ...context,
            author,
            questionId: comment.id,
            instructor: recipient,
          });
    }

    return { ok: true, comment, notifications };
  });
}
