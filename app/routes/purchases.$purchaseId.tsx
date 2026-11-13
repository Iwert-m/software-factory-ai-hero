import { Link } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/purchases.$purchaseId";
import { db } from "~/db";
import { getCurrentUserId } from "~/lib/session";
import { getPurchaseForBuyer } from "~/lib/refunds.server";
import { formatPrice } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";

const purchaseParamsSchema = z.object({
  purchaseId: z.coerce.number().int(),
});

export function meta() {
  return [{ title: "Purchase — Cadence" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  const parsed = purchaseParamsSchema.safeParse(params);

  // A Notification can outlive its Purchase (ADR 0013): a missing or foreign
  // Purchase gets a "not available" page, not an error.
  if (!currentUserId || !parsed.success) return { purchase: null };

  return {
    purchase: getPurchaseForBuyer(db, parsed.data.purchaseId, currentUserId),
  };
}

export default function PurchasePage({ loaderData }: Route.ComponentProps) {
  const { purchase } = loaderData;

  if (!purchase) {
    return (
      <div className="mx-auto max-w-3xl p-6 lg:p-8">
        <h1 className="mb-2 text-2xl font-bold">Purchase not available</h1>
        <p className="mb-4 text-muted-foreground">
          This purchase does not exist, or it is not yours.
        </p>
        <Link to="/settings" className="text-sm underline">
          Go to your settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <h1 className="mb-2 text-2xl font-bold">{purchase.courseTitle}</h1>
      <p className="mb-6 text-muted-foreground">
        {purchase.kind === "team_licence"
          ? "Team Licence"
          : "Individual Purchase"}
      </p>
      <Card>
        <CardContent className="space-y-2 p-6 text-sm">
          <p>Paid: {formatPrice(purchase.amountPaid)}</p>
          <p>
            Purchased: {new Date(purchase.purchasedAt).toLocaleDateString()}
          </p>
          {purchase.latestRefundRequest && (
            <p>
              Refund Request: {purchase.latestRefundRequest.status}
              {purchase.latestRefundRequest.decisionNote
                ? ` — ${purchase.latestRefundRequest.decisionNote}`
                : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
