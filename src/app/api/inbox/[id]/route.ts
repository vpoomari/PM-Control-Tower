// PM CONTROL TOWER — Inbox Item Update API
// PATCH /api/inbox/[id] — mark OPEN | DONE | DISMISSED (own items only), or action:"complete"

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const patchSchema = z.object({
  status: z.enum(["OPEN", "DONE", "DISMISSED"]).optional(),
  action: z.enum(["complete"]).optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);
  if (!body.status && !body.action) throw new ApiError(400, "Provide status (OPEN|DONE|DISMISSED) or action:'complete'");

  const item = await db.inboxItem.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "Inbox item not found");
  if (item.userId !== session.id) throw new ApiError(403, "You can only update your own inbox items");

  const nextStatus = body.action === "complete" ? "DONE" : body.status ?? item.status;
  const updated = await db.inboxItem.update({
    where: { id },
    data: {
      status: nextStatus,
      completedAt: nextStatus === "DONE" ? (item.completedAt ?? new Date()) : null,
    },
  });

  emitRealtime("inbox:changed", { userId: session.id, itemId: id, status: nextStatus }, `user:${session.id}`);
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "InboxItem", entityId: id, entityName: item.title,
    before: { status: item.status }, after: { status: nextStatus }, ipAddress: ctx.ip,
  });
  return ok({ item: updated });
}, { permission: "inbox.use", rateLimit: { limit: 300, windowMs: 60_000 } });
