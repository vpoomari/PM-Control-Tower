// PM CONTROL TOWER — Assumption Detail API
// GET    /api/assumptions/[id]
// PATCH  /api/assumptions/[id] — status (VALID|AT_RISK|INVALID|CLOSED), validation stamp
// DELETE /api/assumptions/[id]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const ASSUMPTION_STATUSES = ["VALID", "AT_RISK", "INVALID", "CLOSED"] as const;

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const assumption = await db.assumption.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  if (!assumption) throw new ApiError(404, "Assumption not found");
  return ok({ assumption });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const patchSchema = z.object({
  description: z.string().min(3).optional(),
  rationale: z.string().optional().nullable(),
  impactIfFalse: z.string().optional().nullable(),
  status: z.enum(ASSUMPTION_STATUSES).optional(),
  ownerName: z.string().optional().nullable(),
  validationDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.assumption.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Assumption not found");

  const statusChanged = body.status !== undefined && body.status !== before.status;
  const data = {
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.rationale !== undefined ? { rationale: body.rationale } : {}),
    ...(body.impactIfFalse !== undefined ? { impactIfFalse: body.impactIfFalse } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    // Stamp validation date when the status review happens (unless explicitly provided)
    ...(statusChanged && body.validationDate === undefined ? { validationDate: new Date() } : {}),
    ...(body.validationDate !== undefined ? { validationDate: body.validationDate } : {}),
    ...(body.ownerName !== undefined ? { ownerName: body.ownerName } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.assumption.update({ where: { id }, data });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Assumption", entityId: id, entityName: `${updated.code} — ${updated.description.slice(0, 60)}`,
    before: { status: before.status }, after: { status: updated.status, validationDate: updated.validationDate },
    ipAddress: ctx.ip,
  });
  emitRealtime("raid:changed", { projectId: updated.projectId, type: "assumption", assumptionId: updated.id, code: updated.code, status: updated.status, action: "UPDATED" }, projectRoom(updated.projectId));
  return ok({ assumption: updated });
}, { permission: "raid.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const assumption = await db.assumption.findUnique({ where: { id } });
  if (!assumption) throw new ApiError(404, "Assumption not found");

  await db.assumption.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Assumption", entityId: id, entityName: `${assumption.code} — ${assumption.description.slice(0, 60)}`,
    before: { status: assumption.status }, ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("raid:changed", { projectId: assumption.projectId, type: "assumption", assumptionId: id, code: assumption.code, action: "DELETED" }, projectRoom(assumption.projectId));
  return ok({ deleted: true, id });
}, { permission: "raid.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
