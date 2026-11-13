import { and, eq } from "drizzle-orm";
import { coupons, courses, enrollments, purchases, users } from "~/db/schema";
import { buildSeatClaimed, type Notification } from "~/lib/notifications.server";
import { getSeatAvailability, type Db, type Failure } from "~/lib/refunds.server";

// ─── Seats ───
// Claiming a Seat on a Team Licence. Takes the database first, so tests can
// hand in an in-memory one.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  | {
      ok: true;
      enrollment: typeof enrollments.$inferSelect;
      notifications: Notification[];
    }
  | Failure;

export function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string
): ClaimSeatResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, status: 404, error: "Coupon not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return {
      ok: false,
      status: 409,
      error: "Coupon has already been redeemed",
    };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, status: 409, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, status: 409, error: SEAT_REFUNDED };
  }

  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, seat.courseId)
      )
    )
    .get();
  if (existingEnrollment) {
    return {
      ok: false,
      status: 409,
      error: "You are already enrolled in this course",
    };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      status: 403,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({ redeemedByUserId: userId, redeemedAt: new Date().toISOString() })
    .where(eq(coupons.id, seat.id))
    .run();

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId: seat.courseId })
    .returning()
    .get();

  return {
    ok: true,
    enrollment,
    notifications: notifyTeamAdmin(db, seat.purchaseId, userId),
  };
}

function notifyTeamAdmin(
  db: Db,
  purchaseId: number,
  claimerId: number
): Notification[] {
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();
  if (!purchase) return [];

  const teamAdmin = db
    .select()
    .from(users)
    .where(eq(users.id, purchase.userId))
    .get();
  const claimer = db.select().from(users).where(eq(users.id, claimerId)).get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, purchase.courseId))
    .get();
  if (!teamAdmin || !claimer || !course) return [];

  const seats = db
    .select()
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .all();

  return buildSeatClaimed({
    purchaseId,
    teamAdmin,
    claimer,
    courseTitle: course.title,
    claimedCount: seats.filter((s) => s.redeemedByUserId !== null).length,
    seatCount: seats.length,
  });
}
