import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { createComment } from "~/lib/comments.server";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import { asUser, lessonWorld, statusOf } from "./fixtures";

let world: ReturnType<typeof lessonWorld>;

beforeEach(() => {
  world = lessonWorld();
  world.enroll();
});

function addQuiz(lessonId = world.lesson.id) {
  const { db } = world;
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check", passingScore: 0.7 })
    .returning()
    .get();
  const question = db
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "Throw or return?",
      questionType: schema.QuestionType.MultipleChoice,
      position: 1,
    })
    .returning()
    .get();
  const [right, wrong] = [true, false].map((isCorrect) =>
    db
      .insert(schema.quizOptions)
      .values({
        questionId: question.id,
        optionText: isCorrect ? "Return" : "Throw",
        isCorrect,
      })
      .returning()
      .get()
  );
  return { quiz, question, right, wrong };
}

function submitQuiz(quizId: number, answers: Record<string, string>) {
  return asUser(world.base.user.id, {
    intent: "submit-quiz",
    quizId: String(quizId),
    ...answers,
  });
}

describe("quiz", () => {
  it("shows the quiz without saying which option is correct", async () => {
    addQuiz();

    const page = await world.loadFull();

    expect(page.quiz?.questions[0].options).toHaveLength(2);
    expect(page.quiz?.questions[0].options[0]).not.toHaveProperty("isCorrect");
    expect(page.bestAttempt).toBeNull();
  });

  it("scores a right answer as a pass and remembers the best attempt", async () => {
    const { quiz, question, right } = addQuiz();

    const result = await world.viewer.act(
      await submitQuiz(quiz.id, {
        [`question-${question.id}`]: String(right.id),
      }),
      world.params
    );
    const page = await world.loadFull();

    expect(result).toMatchObject({
      quizResult: { score: 1, passed: true, grade: "A", totalCorrect: 1 },
    });
    expect(page.bestAttempt).toEqual({ score: 1, passed: true });
  });

  it("scores a wrong answer as a fail", async () => {
    const { quiz, question, wrong, right } = addQuiz();

    const result = await world.viewer.act(
      await submitQuiz(quiz.id, {
        [`question-${question.id}`]: String(wrong.id),
      }),
      world.params
    );

    expect(result).toMatchObject({
      quizResult: {
        score: 0,
        passed: false,
        grade: "F",
        questionResults: [
          {
            correct: false,
            selectedOptionId: wrong.id,
            correctOptionId: right.id,
          },
        ],
      },
    });
  });

  it("will not score a quiz from another lesson", async () => {
    const other = world.db
      .insert(schema.lessons)
      .values({ moduleId: world.lesson.moduleId, title: "Other", position: 2 })
      .returning()
      .get();
    const { quiz } = addQuiz(other.id);

    const status = await statusOf(
      world.viewer.act(await submitQuiz(quiz.id, {}), world.params)
    );

    expect(status).toBe(404);
  });
});

describe("bookmarks, comments and video", () => {
  it("toggles the bookmark on and off", async () => {
    const toggle = async () =>
      world.viewer.act(
        await asUser(world.base.user.id, { intent: "toggle-bookmark" }),
        world.params
      );

    expect(await toggle()).toEqual({ ok: true, bookmarked: true });
    expect((await world.loadFull()).bookmarked).toBe(true);
    expect(await toggle()).toEqual({ ok: true, bookmarked: false });
  });

  it("shows the thread with replies and marks the instructor's posts", async () => {
    const { db, base, lesson } = world;
    const notifications = fakeNotifications();
    const question = await createComment(
      db,
      base.user.id,
      lesson.id,
      null,
      "Why Result?",
      new Date(),
      notifications
    );
    if (!question.ok) throw new Error("comment not created");
    await createComment(
      db,
      base.instructor.id,
      lesson.id,
      question.comment.id,
      "It is explicit.",
      new Date(),
      notifications
    );

    const page = await world.loadFull();

    expect(page.comments).toHaveLength(1);
    expect(page.comments[0].bodyHtml).toContain("Why Result?");
    expect(page.comments[0].author.isInstructor).toBe(false);
    expect(page.comments[0].replies[0].author.isInstructor).toBe(true);
    expect(page.instructorName).toBe(base.instructor.name);
  });

  it("resumes the video and reports how much was watched", async () => {
    const { db, base, lesson } = world;
    db.update(schema.lessons)
      .set({ videoUrl: "https://youtu.be/x", durationMinutes: 10 })
      .run();
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        eventType: "pause",
        positionSeconds: 150,
      })
      .run();

    const page = await world.loadFull();

    expect(page.lastWatchPosition).toBe(150);
    expect(page.watchProgress).toBe(25);
  });
});
