// PM CONTROL TOWER — Webhook subscription detail
// PATCH  /api/webhooks/[id] — status (ACTIVE|PAUSED), events, url
// DELETE /api/webhooks/[id] — remove subscription

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  events: z.string().min(1).optional(),
  url: z.string().url().max(2048).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const subscription = await db.webhookSubscription.findUnique({ where: { id } });
  if (!subscription) throw new ApiError(404, "Webhook subscription not found");
  const body = await parseBody(ctx.req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No fields to update");

  const before = { status: subscription.status, events: subscription.events, url: subscription.url };
  const updated = await db.webhookSubscription.update({
    where: { id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.events !== undefined ? { events: body.events } : {}),
      ...(body.url !== undefined ? { url: body.url } : {}),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "WebhookSubscription", entityId: id, entityName: updated.name,
    before, after: { status: updated.status, events: updated.events, url: updated.url },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(updated);
}, { permission: "integration.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const subscription = await db.webhookSubscription.findUnique({ where: { id } });
  if (!subscription) throw new ApiError(404, "Webhook subscription not found");
  await db.webhookSubscription.delete({ where: { id } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "DELETE", entityType: "WebhookSubscription", entityId: id, entityName: subscription.name,
    before: { url: subscription.url, events: subscription.events, status: subscription.status },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok({ deleted: true, id });
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
