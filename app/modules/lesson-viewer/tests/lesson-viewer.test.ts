import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { asUser, lessonWorld, statusOf } from "./fixtures";

let world: ReturnType<typeof lessonWorld>;
let base: typeof world.base;
let viewer: typeof world.viewer;
let params: typeof world.params;
let enroll: typeof world.enroll;
let loadFull: typeof world.loadFull;

beforeEach(() => {
  world = lessonWorld();
  ({ base, viewer, params, enroll, loadFull } = world);
});

describe("load", () => {
  it("locks the lesson for a Student who has not enrolled", async () => {
    const page = await viewer.load(await asUser(base.user.id), params);

    expect(page.view).toBe("locked");
    expect(page).not.toHaveProperty("contentHtml");
    expect(page).not.toHaveProperty("note");
  });

  it("shows an enrolled Student the full lesson, in progress, with no note yet", async () => {
    enroll();

    const page = await loadFull();

    expect(page.lesson.title).toBe("Error Handling Patterns");
    expect(page.contentHtml).toContain("Prefer a Result type.");
    expect(page.lessonStatus).toBe(schema.LessonProgressStatus.InProgress);
    expect(page.note).toBeNull();
  });

  it("is not found through another course's slug", async () => {
    enroll();

    const status = await statusOf(
      viewer.load(await asUser(base.user.id), { ...params, slug: "nope" })
    );

    expect(status).toBe(404);
  });
});

describe("act", () => {
  it("saves the Student's note, and the next load shows it", async () => {
    enroll();

    const result = await viewer.act(
      await asUser(base.user.id, {
        intent: "save-note",
        body: "  Use Result  ",
      }),
      params
    );
    const page = await loadFull();

    expect(result).toEqual({ ok: true });
    expect(page.note?.body).toBe("Use Result");
  });

  it("refuses an empty note with a message for the form", async () => {
    enroll();

    const result = await viewer.act(
      await asUser(base.user.id, { intent: "save-note", body: "   " }),
      params
    );

    expect(result).toEqual({
      ok: false,
      error: "Write something before saving your note.",
    });
  });

  it("keeps one Student's note from another Student", async () => {
    enroll();
    enroll(base.instructor.id);
    await viewer.act(
      await asUser(base.user.id, { intent: "save-note", body: "Mine" }),
      params
    );

    const page = await loadFull(base.instructor.id);

    expect(page.note).toBeNull();
  });

  it("marks the lesson complete", async () => {
    enroll();

    await viewer.act(
      await asUser(base.user.id, { intent: "mark-complete" }),
      params
    );
    const page = await loadFull();

    expect(page.lessonStatus).toBe(schema.LessonProgressStatus.Completed);
  });

  it("rejects an unknown intent with 400", async () => {
    enroll();

    const status = await statusOf(
      viewer.act(await asUser(base.user.id, { intent: "nope" }), params)
    );

    expect(status).toBe(400);
  });
});
