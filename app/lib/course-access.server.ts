import { data } from "react-router";
import { db } from "~/db";
import { getCurrentUserId } from "~/lib/session";
import { resolveCountry } from "~/lib/country.server";
import {
  courseStaffAccess,
  instructorAccess,
  lessonAccess,
  type LessonAccess,
  type LessonRef,
  type Refusal,
  type RefusalReason,
  type Viewer,
} from "~/packages/course-access/service.server";

// ─── Course Access route adapter ───
// The thin layer between routes and the Course Access package: works out the
// viewer from the request, and turns every refusal into one HTTP status and
// message. The decisions themselves live in the package.

const REFUSALS: Record<RefusalReason, { status: number; message: string }> = {
  "signed-out": { status: 401, message: "Select a user from the DevUI panel." },
  "not-found": { status: 404, message: "Lesson not found in this course." },
  "no-enrollment": {
    status: 403,
    message: "You must be enrolled in this course.",
  },
  "country-lock": {
    status: 403,
    message:
      "This course was bought at a Purchasing-Power Price and can only be watched from the country it was bought in.",
  },
  "not-course-staff": {
    status: 403,
    message: "Only this course's instructor can do that.",
  },
  "not-instructor": {
    status: 403,
    message: "Only instructors can access this page.",
  },
};

function refuse(refusal: Refusal): never {
  const { status, message } = REFUSALS[refusal.reason];
  throw data(message, { status });
}

/** The session user and the resolved country (ADR-0012). */
async function viewerOf(request: Request): Promise<Viewer> {
  const [userId, country] = await Promise.all([
    getCurrentUserId(request),
    resolveCountry(request),
  ]);
  return { userId, country };
}

/**
 * For actions: throws on any refusal, so only a viewer with Course Access to
 * this lesson of this course gets past.
 */
export async function requireLessonAccess(request: Request, lesson: LessonRef) {
  const access = lessonAccess(db, await viewerOf(request), lesson);
  if (!access.ok) refuse(access);
  return access;
}

/**
 * For the lesson loader: throws only on not found. Any other refusal comes
 * back as the paywall reason.
 */
export async function getLessonAccess(
  request: Request,
  lesson: LessonRef
): Promise<Exclude<LessonAccess, { reason: "not-found" }>> {
  const access = lessonAccess(db, await viewerOf(request), lesson);
  if (!access.ok && access.reason === "not-found") refuse(access);
  return access;
}

/** Throws unless the viewer is this course's Instructor or a Platform Admin. */
export async function requireCourseStaff(request: Request, courseId: number) {
  const access = courseStaffAccess(db, await viewerOf(request), courseId);
  if (!access.ok) refuse(access);
  return access;
}

/** Throws unless the viewer is an Instructor or a Platform Admin. */
export async function requireInstructor(request: Request) {
  const access = instructorAccess(db, await viewerOf(request));
  if (!access.ok) refuse(access);
  return access;
}

/** Throws 401 unless someone is signed in. Reads only the session. */
export async function requireUserId(request: Request): Promise<number> {
  const userId = await getCurrentUserId(request);
  if (!userId) refuse({ ok: false, reason: "signed-out" });
  return userId;
}
