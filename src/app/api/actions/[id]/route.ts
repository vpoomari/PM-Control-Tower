// PM CONTROL TOWER — PATCH /api/actions/[id]
// Update status / owner / due date / escalation on an action register entry.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  ownerName: z.string().max(120).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  dueDate: z.string().nullable().optional(),
  escalationLevel: z.enum(["NONE", "PM", "SPONSOR", "LEADERSHIP"]).optional(),
  notes: z.string().max(2000).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const existing = await db.actionItem.findUnique({ where: { id: ctx.params.id } });
  if (!existing) throw new ApiError(404, "Action not found");
  const body = await parseBody(ctx.req, patchSchema);
  const action = await db.actionItem.update({
    where: { id: ctx.params.id },
    data: {
      ...(body.status ? { status: body.status, ...(body.status === "DONE" ? { completedAt: new Date() } : {}) } : {}),
      ...(body.ownerName !== undefined ? { ownerName: body.ownerName } : {}),
      ...(body.priority ? { priority: body.priority } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
      ...(body.escalationLevel ? { escalationLevel: body.escalationLevel } : {}),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: body.status === "DONE" ? "EXECUTE" : "UPDATE", entityType: "ActionItem", entityId: action.id, entityName: action.title,
    before: { status: existing.status, owner: existing.ownerName }, after: { status: action.status, owner: action.ownerName },
    context: "Action register updated",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  emitRealtime("governance:changed", { kind: "action", id: action.id, code: action.code });
  return ok(action);
}, { permission: "inbox.use", rateLimit: { limit: 120, windowMs: 60_000 } });
