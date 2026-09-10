// PM CONTROL TOWER — Webhook subscriptions
// GET  /api/webhooks — subscriptions with delivery counters
// POST /api/webhooks — create subscription with vault-backed secret reference

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  url: z.string().url().max(2048),
  events: z.string().min(1, "Provide a comma-separated event list"), // csv, e.g. "project:created,timesheet:approved"
  maxRetries: z.number().int().min(0).max(10).default(3),
  authType: z.enum(["HMAC_SHA256", "BEARER", "NONE"]).default("HMAC_SHA256"),
});

export const GET = withApi(async () => {
  const subscriptions = await db.webhookSubscription.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { deliveries: true } } },
  });
  return ok({
    subscriptions: subscriptions.map((s) => ({
      ...s,
      deliveryLog: s._count.deliveries,
      _count: undefined,
    })),
    total: subscriptions.length,
  });
}, { permission: "integration.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  // Sequential vault reference: vault://pmct/webhooks/wh-<n>
  const existing = await db.webhookSubscription.count();
  const secretRef = `vault://pmct/webhooks/wh-${String(existing + 1).padStart(3, "0")}`;

  const subscription = await db.webhookSubscription.create({
    data: {
      name: body.name,
      url: body.url,
      events: body.events,
      secretRef,
      status: "ACTIVE",
      authType: body.authType,
      maxRetries: body.maxRetries,
      createdBy: ctx.session.id,
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "WebhookSubscription", entityId: subscription.id, entityName: subscription.name,
    after: { url: subscription.url, events: subscription.events, secretRef, authType: subscription.authType },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(subscription, 201);
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
