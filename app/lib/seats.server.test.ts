import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let seat: typeof schema.coupons.$inferSelect;
let purchase: typeof schema.purchases.$inferSelect;

function addLearner(name: string) {
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

function seatRow() {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.id, seat.id))
    .get();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const team = db.insert(schema.teams).values({}).returning().get();
  purchase = db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 15800,
      country: "NL",
    })
    .returning()
    .get();
  seat = db
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: "SEAT-1",
      purchaseId: purchase.id,
    })
    .returning()
    .get();
});

describe("claimSeat", () => {
  it("marks the Seat Claimed and enrolls the Student", () => {
    const learner = addLearner("Robin");
    const result = claimSeat(db, "SEAT-1", learner.id, "NL");
    if (!result.ok) throw new Error(result.error);
    expect(result.enrollment).toMatchObject({
      userId: learner.id,
      courseId: base.course.id,
    });
    expect(seatRow()?.redeemedByUserId).toBe(learner.id);
    expect(seatRow()?.redeemedAt).not.toBeNull();
  });

  it("refuses an unknown code", () => {
    expect(claimSeat(db, "NOPE", base.user.id, "NL")).toEqual({
      ok: false,
      status: 404,
      error: "Coupon not found",
    });
  });

  it("refuses a Seat that is already Claimed", () => {
    claimSeat(db, "SEAT-1", addLearner("Robin").id, "NL");
    expect(claimSeat(db, "SEAT-1", addLearner("Sam").id, "NL")).toEqual({
      ok: false,
      status: 409,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses a Seat on hold", () => {
    db.insert(schema.refunds)
      .values({
        purchaseId: purchase.id,
        status: RefundStatus.Open,
        reason: "changed my mind",
      })
      .run();
    const result = claimSeat(db, "SEAT-1", addLearner("Robin").id, "NL");
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(seatRow()?.redeemedByUserId).toBeNull();
  });

  it("refuses a refunded Seat", () => {
    db.update(schema.coupons)
      .set({ refundedAt: new Date().toISOString() })
      .where(eq(schema.coupons.id, seat.id))
      .run();
    const result = claimSeat(db, "SEAT-1", addLearner("Robin").id, "NL");
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(seatRow()?.redeemedByUserId).toBeNull();
  });

  it("refuses someone already enrolled, leaving the Seat Unclaimed", () => {
    const learner = addLearner("Robin");
    db.insert(schema.enrollments)
      .values({ userId: learner.id, courseId: base.course.id })
      .run();
    expect(claimSeat(db, "SEAT-1", learner.id, "NL")).toEqual({
      ok: false,
      status: 409,
      error: "You are already enrolled in this course",
    });
    expect(seatRow()?.redeemedByUserId).toBeNull();
  });

  it("refuses a claim from another country", () => {
    expect(claimSeat(db, "SEAT-1", addLearner("Robin").id, "DE")).toEqual({
      ok: false,
      status: 403,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });
    expect(seatRow()?.redeemedByUserId).toBeNull();
  });
});
