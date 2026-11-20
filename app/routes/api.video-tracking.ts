import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.video-tracking";
import { requireLessonAccess } from "~/lib/course-access.server";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { videoWatchEvents } from "~/db/schema";

const videoTrackingSchema = z.object({
  // Trusting the client's course id is safe: a lesson that isn't in that
  // course is refused as not found.
  courseId: z.number(),
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

export async function action({ request }: Route.ActionArgs) {
  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { courseId, lessonId, eventType, positionSeconds } = parsed.data;

  // Watched time feeds the Watch Limit, so only Course Access to this lesson
  // may write it, and only an Enrollment is tracked.
  const access = await requireLessonAccess(request, { courseId, lessonId });
  if (!access.tracksProgress) return { success: true };

  db
    .insert(videoWatchEvents)
    .values({
      userId: access.userId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();

  return { success: true };
}
