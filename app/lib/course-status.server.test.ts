import { describe, it, expect } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { CourseStatus } from "~/db/schema";
import { changeCourseStatus } from "./course-status.server";

describe("changeCourseStatus", () => {
  it("changes the course's status", () => {
    const db = createTestDb();
    const base = seedBaseData(db);
    const result = changeCourseStatus(db, base.course.id, CourseStatus.Archived);
    if (!result.ok) throw new Error(result.error);
    expect(result.course.id).toBe(base.course.id);
    expect(result.course.status).toBe(CourseStatus.Archived);
  });

  it("refuses a course that does not exist", () => {
    const db = createTestDb();
    expect(changeCourseStatus(db, 999, CourseStatus.Published)).toEqual({
      ok: false,
      status: 404,
      error: "Course not found",
    });
  });
});
