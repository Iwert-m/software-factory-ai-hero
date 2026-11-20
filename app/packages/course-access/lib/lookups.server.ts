import { and, eq } from "drizzle-orm";
import {
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
  users,
} from "~/db/schema";
import type { Db } from "~/lib/refunds.server";

export function findUser(db: Db, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

export function findCourse(db: Db, courseId: number) {
  return db.select().from(courses).where(eq(courses.id, courseId)).get();
}

/** The course, but only when the lesson is in one of its modules. */
export function findCourseOfLesson(
  db: Db,
  courseId: number,
  lessonId: number
) {
  return db
    .select({ course: courses })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(and(eq(lessons.id, lessonId), eq(courses.id, courseId)))
    .get()?.course;
}

/**
 * The country of the first Purchase for this user and course, as the lookup
 * has always worked. Which Purchase should decide is an open domain question.
 */
export function findPurchaseCountry(db: Db, userId: number, courseId: number) {
  return (
    db
      .select({ country: purchases.country })
      .from(purchases)
      .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
      .get()?.country ?? null
  );
}

export function hasEnrollment(db: Db, userId: number, courseId: number) {
  return !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}
