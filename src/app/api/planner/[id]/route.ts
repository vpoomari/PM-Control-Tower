// PM CONTROL TOWER — Planner Entry Detail API
// PATCH  /api/planner/[id] — status / date move / notes (own entries only)
// DELETE /api/planner/[id] — remove an entry (own only)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  entryType: z.enum(["TASK", "MEETING", "CALENDAR", "FOCUS", "BREAK"]).optional(),
  date: z.coerce.date().optional(),
  startTime: z.string().max(5).optional().nullable(),
  endTime: z.string().max(5).optional().nullable(),
  durationMins: z.coerce.number().int().min(5).max(960).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "DONE", "MOVED", "CANCELLED"]).optional(),
  estimatedHours: z.coerce.number().min(0).max(24).optional(),
  notes: z.string().optional().nullable(),
});

async function loadOwnEntry(id: string, userId: string) {
  const entry = await db.plannerEntry.findUnique({
    where: { id },
    include: { task: { select: { code: true, name: true } }, project: { select: { code: true, name: true } }, meeting: { select: { title: true } } },
  });
  if (!entry) throw new ApiError(404, "Planner entry not found");
  if (entry.userId !== userId) throw new ApiError(403, "You can only manage your own planner entries");
  return entry;
}

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const before = await loadOwnEntry(id, session.id);
  const body = await parseBody(ctx.req, patchSchema);

  const data = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.entryType !== undefined ? { entryType: body.entryType } : {}),
    ...(body.date !== undefined ? { date: body.date } : {}),
    ...(body.startTime !== undefined ? { startTime: body.startTime } : {}),
    ...(body.endTime !== undefined ? { endTime: body.endTime } : {}),
    ...(body.durationMins !== undefined ? { durationMins: body.durationMins } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.estimatedHours !== undefined ? { estimatedHours: body.estimatedHours } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.plannerEntry.update({
    where: { id },
    data,
    include: { task: { select: { id: true, code: true, name: true } }, project: { select: { id: true, code: true, name: true } }, meeting: { select: { id: true, title: true, scheduledAt: true } } },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "PlannerEntry", entityId: id, entityName: before.title,
    before: { status: before.status, date: before.date }, after: { status: updated.status, date: updated.date },
    ipAddress: ctx.ip,
  });
  emitRealtime("planner:changed", { userId: session.id, entryId: id, action: "UPDATED", status: updated.status }, `user:${session.id}`);
  return ok({ entry: updated });
}, { permission: "inbox.use", rateLimit: { limit: 300, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const entry = await loadOwnEntry(id, session.id);

  await db.plannerEntry.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "PlannerEntry", entityId: id, entityName: entry.title,
    before: { status: entry.status, date: entry.date }, ipAddress: ctx.ip,
  });
  emitRealtime("planner:changed", { userId: session.id, entryId: id, action: "DELETED" }, `user:${session.id}`);
  return ok({ deleted: true, id });
}, { permission: "inbox.use", rateLimit: { limit: 120, windowMs: 60_000 } });
