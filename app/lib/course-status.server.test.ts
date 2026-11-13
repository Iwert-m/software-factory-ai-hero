import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import { CourseStatus, UserRole, courses, users } from "~/db/schema";
import { changeCourseStatus } from "./course-status.server";

function seedAdmin(db: ReturnType<typeof createTestDb>) {
  return db
    .insert(users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
}

describe("changeCourseStatus", () => {
  it("changes the course's status", () => {
    const db = createTestDb();
    const base = seedBaseData(db);
    const admin = seedAdmin(db);
    const result = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Archived,
      admin.id
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.course.id).toBe(base.course.id);
    expect(result.course.status).toBe(CourseStatus.Archived);
  });

  it("refuses a course that does not exist", () => {
    const db = createTestDb();
    const admin = seedAdmin(db);
    expect(
      changeCourseStatus(db, 999, CourseStatus.Published, admin.id)
    ).toEqual({
      ok: false,
      status: 404,
      error: "Course not found",
    });
  });

  it("tells the Instructor when a Platform Admin changes the status", () => {
    const db = createTestDb();
    const base = seedBaseData(db);
    const admin = seedAdmin(db);
    db.update(courses)
      .set({ title: "React Patterns" })
      .where(eq(courses.id, base.course.id))
      .run();

    const result = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Draft,
      admin.id
    );
    if (!result.ok) throw new Error(result.error);

    expect(result.notifications).toEqual([
      {
        kind: "course-status-changed",
        recipients: [
          { id: String(base.instructor.id), name: base.instructor.name },
        ],
        body: "A Platform Admin unpublished “React Patterns”",
        url: `/instructor/${base.course.id}`,
      },
    ]);
  });

  it("describes publishing and archiving", () => {
    const db = createTestDb();
    const base = seedBaseData(db);
    const admin = seedAdmin(db);
    const published = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Published,
      admin.id
    );
    const archived = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Archived,
      admin.id
    );
    if (!published.ok || !archived.ok) throw new Error("failed");
    expect(published.notifications[0].body).toBe(
      "A Platform Admin published “Test Course”"
    );
    expect(archived.notifications[0].body).toBe(
      "A Platform Admin archived “Test Course”"
    );
  });

  it("tells nobody when the actor is the course's Instructor", () => {
    const db = createTestDb();
    const base = seedBaseData(db);
    const result = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Draft,
      base.instructor.id
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.notifications).toEqual([]);
  });
});
