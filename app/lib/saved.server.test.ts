import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { addDays, addHours } from "~/test/dates";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  MAX_NOTE_LENGTH,
  saveNote,
  toggleBookmark,
} from "./saved.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date();
const T1 = addHours(NOW, -2);
const T2 = addHours(NOW, -1);
const T3 = NOW;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("adds a Bookmark, and a second toggle removes it", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on a Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0]);
    // A racing request that already passed its check inserts the same pair.
    db.insert(schema.bookmarks)
      .values({ userId: base.user.id, lessonId: lessonIds[0] })
      .onConflictDoNothing()
      .run();

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });

  it("keeps one Student's Bookmark out of another's view", () => {
    const ben = addStudent("Ben");
    toggleBookmark(db, base.user.id, lessonIds[0]);

    expect(isBookmarked(db, ben.id, lessonIds[0])).toBe(false);
  });
});

describe("saving a Note", () => {
  it("creates a Note, with the body trimmed", () => {
    saveNote(db, base.user.id, lessonIds[0], "  Remember this  ", T1);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Remember this",
      updatedAt: T1.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", T1);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", T2);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second draft",
      updatedAt: T2.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("keeps the Note's first-written time on a re-save", () => {
    saveNote(db, base.user.id, lessonIds[0], "First draft", T1);
    saveNote(db, base.user.id, lessonIds[0], "Second draft", T2);

    const row = db.select().from(schema.notes).get();
    expect(row?.createdAt).toBe(T1.toISOString());
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH),
      T1
    );

    expect(result.ok).toBe(true);
  });

  it("refuses a Note over 2,000 characters and keeps the old one", () => {
    saveNote(db, base.user.id, lessonIds[0], "Short", T1);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      T2
    );

    expect(result).toMatchObject({ ok: false });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Short");
  });

  it("refuses an empty Note", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "   ", T1)).toMatchObject({
      ok: false,
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeNull();
  });

  it("keeps the characters as typed", () => {
    saveNote(db, base.user.id, lessonIds[0], "# not a heading\n*plain*", T1);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# not a heading\n*plain*"
    );
  });
});

describe("the Saved lists", () => {
  it("lists a Student's Bookmarks newest first, with Lesson and Course", () => {
    for (const [lessonId, at] of [
      [lessonIds[0], T1],
      [lessonIds[1], T3],
      [lessonIds[2], T2],
    ] as const) {
      db.insert(schema.bookmarks)
        .values({
          userId: base.user.id,
          lessonId,
          createdAt: at.toISOString(),
        })
        .run();
    }

    const rows = listBookmarks(db, base.user.id);

    expect(rows.map((row) => row.lessonId)).toEqual([
      lessonIds[1],
      lessonIds[2],
      lessonIds[0],
    ]);
    expect(rows[0]).toMatchObject({
      lessonTitle: "Lesson 2",
      moduleTitle: "Basics",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });

  it("lists a Student's Notes last edited first, with Lesson and Course", () => {
    saveNote(db, base.user.id, lessonIds[0], "Oldest", T1);
    saveNote(db, base.user.id, lessonIds[1], "Newest", T3);
    saveNote(db, base.user.id, lessonIds[2], "Middle", T2);
    // Editing the oldest Note puts it first.
    saveNote(db, base.user.id, lessonIds[0], "Oldest, edited", addHours(T3, 1));

    const rows = listNotes(db, base.user.id);

    expect(rows.map((row) => row.body)).toEqual([
      "Oldest, edited",
      "Newest",
      "Middle",
    ]);
    expect(rows[0]).toMatchObject({
      lessonTitle: "Lesson 1",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });

  it("contains only the Student's own rows", () => {
    const ben = addStudent("Ben");
    toggleBookmark(db, ben.id, lessonIds[0]);
    saveNote(db, ben.id, lessonIds[0], "Ben's private thoughts", T1);

    expect(listBookmarks(db, base.user.id)).toEqual([]);
    expect(listNotes(db, base.user.id)).toEqual([]);
    expect(getNote(db, base.user.id, lessonIds[0])).toBeNull();
  });
});

describe("approving a Refund Request", () => {
  it("leaves the Student's Bookmarks and Notes in place", async () => {
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: addDays(T1, -2).toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    toggleBookmark(db, base.user.id, lessonIds[0]);
    saveNote(db, base.user.id, lessonIds[0], "Keep me", T1);

    const notifications = fakeNotifications();
    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      T1,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    await approveRefundRequest(
      db,
      raised.refundRequestId,
      admin.id,
      null,
      T2,
      notifications
    );

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });
});
