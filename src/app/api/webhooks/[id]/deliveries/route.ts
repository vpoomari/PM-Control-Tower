// PM CONTROL TOWER — Webhook delivery history
// GET /api/webhooks/[id]/deliveries — last 50 delivery attempts

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const subscription = await db.webhookSubscription.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!subscription) throw new ApiError(404, "Webhook subscription not found");
  const deliveries = await db.webhookDelivery.findMany({
    where: { subscriptionId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({ subscription, deliveries, total: deliveries.length });
}, { permission: "integration.view", rateLimit: { limit: 300, windowMs: 60_000 } });
