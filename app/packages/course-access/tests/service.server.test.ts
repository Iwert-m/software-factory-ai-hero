import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import {
  courseStaffAccess,
  instructorAccess,
  lessonAccess,
} from "../service.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;

function addLesson(courseId: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson", position: 1 })
    .returning()
    .get();
}

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function addCourse(
  instructorId: number,
  slug: string,
  values: Partial<typeof schema.courses.$inferInsert> = {}
) {
  return db
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: slug,
      salesCopy: markdown(slug),
      instructorId,
      categoryId: base.category.id,
      status: CourseStatus.Published,
      ...values,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  lesson = addLesson(base.course.id);
});

const lessonOf = () => ({ courseId: base.course.id, lessonId: lesson.id });

describe("lessonAccess", () => {
  it("refuses a signed-out viewer", () => {
    expect(
      lessonAccess(db, { userId: null, country: null }, lessonOf())
    ).toEqual({ ok: false, reason: "signed-out" });
  });

  it("treats a user id with no matching user as signed out", () => {
    expect(
      lessonAccess(db, { userId: 9999, country: null }, lessonOf())
    ).toEqual({ ok: false, reason: "signed-out" });
  });

  it("refuses a Student without an Enrollment", () => {
    expect(
      lessonAccess(db, { userId: base.user.id, country: null }, lessonOf())
    ).toEqual({ ok: false, reason: "no-enrollment", userId: base.user.id });
  });

  it("returns not found for a lesson from another course, even to an enrolled Student", () => {
    const otherCourse = addCourse(base.instructor.id, "other");
    const otherLesson = addLesson(otherCourse.id);
    enroll(base.user.id, base.course.id);
    expect(
      lessonAccess(
        db,
        { userId: base.user.id, country: null },
        { courseId: base.course.id, lessonId: otherLesson.id }
      )
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("returns not found before signed out", () => {
    expect(
      lessonAccess(
        db,
        { userId: null, country: null },
        { courseId: base.course.id, lessonId: 9999 }
      )
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("returns not found for a missing course", () => {
    expect(
      lessonAccess(
        db,
        { userId: base.user.id, country: null },
        { courseId: 9999, lessonId: lesson.id }
      )
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("grants the course's Instructor without an Enrollment, as a moderator", () => {
    expect(
      lessonAccess(db, { userId: base.instructor.id, country: null }, lessonOf())
    ).toEqual({
      ok: true,
      userId: base.instructor.id,
      canModerate: true,
      tracksProgress: false,
    });
  });

  it("refuses another Instructor without an Enrollment", () => {
    const other = addUser("Other", UserRole.Instructor);
    expect(
      lessonAccess(db, { userId: other.id, country: null }, lessonOf())
    ).toEqual({ ok: false, reason: "no-enrollment", userId: other.id });
  });

  it("grants a Platform Admin without an Enrollment, as a moderator", () => {
    const admin = addUser("Admin", UserRole.Admin);
    expect(
      lessonAccess(db, { userId: admin.id, country: null }, lessonOf())
    ).toEqual({
      ok: true,
      userId: admin.id,
      canModerate: true,
      tracksProgress: false,
    });
  });

  it("grants an owner whose role changed, because ownership counts", () => {
    db.update(schema.users)
      .set({ role: UserRole.Student })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    expect(
      lessonAccess(db, { userId: base.instructor.id, country: null }, lessonOf())
    ).toMatchObject({ ok: true, canModerate: true });
  });

  it("grants a Student with an Enrollment, tracking their progress", () => {
    enroll(base.user.id, base.course.id);
    expect(
      lessonAccess(db, { userId: base.user.id, country: null }, lessonOf())
    ).toEqual({
      ok: true,
      userId: base.user.id,
      canModerate: false,
      tracksProgress: true,
    });
  });
});


describe("lessonAccess — Country Lock", () => {
  function pricedLesson(price: number, pppEnabled: boolean) {
    const course = addCourse(base.instructor.id, "priced", {
      price,
      pppEnabled,
    });
    return { course, lesson: addLesson(course.id) };
  }

  function purchase(courseId: number, country: string | null, userId = base.user.id) {
    db.insert(schema.purchases)
      .values({ userId, courseId, amountPaid: 1000, country })
      .run();
  }

  const PPP = { price: 4999, pppEnabled: true };

  it.each([
    // [what, course, purchase country, current country, locked?]
    ["free course", { price: 0, pppEnabled: true }, "IN", "US", false],
    ["Purchasing-Power Price turned off", { price: 4999, pppEnabled: false }, "IN", "US", false],
    ["no Purchase country recorded", PPP, null, "US", false],
    ["full-price Purchase viewed elsewhere", PPP, "US", "IN", false],
    ["full-price Purchase, current country unknown", PPP, "US", null, false],
    ["30% off, same country", PPP, "PL", "PL", false],
    ["50% off, same country", PPP, "IN", "IN", false],
    ["70% off, same country", PPP, "NG", "NG", false],
    ["discounted, current country unknown", PPP, "IN", null, false],
    ["30% off, another country", PPP, "PL", "DE", true],
    ["50% off, another country", PPP, "IN", "US", true],
    ["70% off, another country", PPP, "NG", "GB", true],
  ] as const)(
    "%s",
    (_what, courseValues, purchaseCountry, currentCountry, locked) => {
      const { course, lesson } = pricedLesson(
        courseValues.price,
        courseValues.pppEnabled
      );
      enroll(base.user.id, course.id);
      purchase(course.id, purchaseCountry);

      const result = lessonAccess(
        db,
        { userId: base.user.id, country: currentCountry },
        { courseId: course.id, lessonId: lesson.id }
      );

      expect(result).toEqual(
        locked
          ? {
              ok: false,
              reason: "country-lock",
              userId: base.user.id,
              purchaseCountry,
              currentCountry,
            }
          : {
              ok: true,
              userId: base.user.id,
              canModerate: false,
              tracksProgress: true,
            }
      );
    }
  );

  it("refuses a Lapsed Student with a Purchase but no Enrollment as not enrolled", () => {
    const { course, lesson } = pricedLesson(PPP.price, PPP.pppEnabled);
    purchase(course.id, "IN");
    expect(
      lessonAccess(
        db,
        { userId: base.user.id, country: "US" },
        { courseId: course.id, lessonId: lesson.id }
      )
    ).toEqual({ ok: false, reason: "no-enrollment", userId: base.user.id });
  });

  it("never locks the course's Instructor or a Platform Admin", () => {
    const { course, lesson } = pricedLesson(PPP.price, PPP.pppEnabled);
    const admin = addUser("Admin", UserRole.Admin);
    for (const userId of [base.instructor.id, admin.id]) {
      enroll(userId, course.id);
      purchase(course.id, "IN", userId);
      expect(
        lessonAccess(
          db,
          { userId, country: "US" },
          { courseId: course.id, lessonId: lesson.id }
        )
      ).toEqual({ ok: true, userId, canModerate: true, tracksProgress: true });
    }
  });

  // Pins today's lookup: the first Purchase for the user and course decides,
  // even when a later one was made at full price. Which Purchase should decide
  // is a follow-up (ADR-0004, ADR-0009).
  it("uses the first Purchase for the user and course", () => {
    const { course, lesson } = pricedLesson(PPP.price, PPP.pppEnabled);
    enroll(base.user.id, course.id);
    purchase(course.id, "IN");
    purchase(course.id, "US");
    expect(
      lessonAccess(
        db,
        { userId: base.user.id, country: "US" },
        { courseId: course.id, lessonId: lesson.id }
      )
    ).toEqual({
      ok: false,
      reason: "country-lock",
      userId: base.user.id,
      purchaseCountry: "IN",
      currentCountry: "US",
    });
  });
});

describe("courseStaffAccess", () => {
  const staff = (userId: number | null, courseId = base.course.id) =>
    courseStaffAccess(db, { userId, country: "US" }, courseId);

  it("returns not found for a missing course, even when signed out", () => {
    expect(staff(null, 9999)).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses a signed-out viewer", () => {
    expect(staff(null)).toEqual({ ok: false, reason: "signed-out" });
  });

  it("refuses a Student, even with an Enrollment", () => {
    enroll(base.user.id, base.course.id);
    expect(staff(base.user.id)).toEqual({
      ok: false,
      reason: "not-course-staff",
      userId: base.user.id,
    });
  });

  it("refuses another Instructor", () => {
    const other = addUser("Other", UserRole.Instructor);
    expect(staff(other.id)).toEqual({
      ok: false,
      reason: "not-course-staff",
      userId: other.id,
    });
  });

  it("grants the course's Instructor, even after a role change", () => {
    expect(staff(base.instructor.id)).toEqual({
      ok: true,
      userId: base.instructor.id,
      isAdmin: false,
    });
    db.update(schema.users)
      .set({ role: UserRole.Student })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    expect(staff(base.instructor.id)).toMatchObject({ ok: true });
  });

  it("grants a Platform Admin", () => {
    const admin = addUser("Admin", UserRole.Admin);
    expect(staff(admin.id)).toEqual({ ok: true, userId: admin.id, isAdmin: true });
  });
});

describe("instructorAccess", () => {
  const instructor = (userId: number | null) =>
    instructorAccess(db, { userId, country: null });

  it("refuses a signed-out viewer and a user id with no user", () => {
    expect(instructor(null)).toEqual({ ok: false, reason: "signed-out" });
    expect(instructor(9999)).toEqual({ ok: false, reason: "signed-out" });
  });

  it("refuses a Student", () => {
    expect(instructor(base.user.id)).toEqual({
      ok: false,
      reason: "not-instructor",
      userId: base.user.id,
    });
  });

  it("grants an Instructor", () => {
    expect(instructor(base.instructor.id)).toEqual({
      ok: true,
      userId: base.instructor.id,
      isAdmin: false,
    });
  });

  it("grants a Platform Admin", () => {
    const admin = addUser("Admin", UserRole.Admin);
    expect(instructor(admin.id)).toEqual({
      ok: true,
      userId: admin.id,
      isAdmin: true,
    });
  });
});
