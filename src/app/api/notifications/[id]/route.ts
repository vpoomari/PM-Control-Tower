// PM CONTROL TOWER — Notification detail
// PATCH /api/notifications/[id] — mark own notification as read ({ read: true })

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";

const patchSchema = z.object({ read: z.literal(true) });

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  await parseBody(ctx.req, patchSchema);

  const notification = await db.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== ctx.session.id) {
    // Own-only access: another user's notification is indistinguishable from missing
    throw new ApiError(404, "Notification not found");
  }
  const updated = notification.readAt
    ? notification
    : await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return ok({ id: updated.id, readAt: updated.readAt });
}, { permission: "inbox.use", rateLimit: { limit: 300, windowMs: 60_000 } });
