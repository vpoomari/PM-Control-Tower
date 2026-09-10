// PM CONTROL TOWER — Milestone Item API
// PATCH  /api/projects/[id]/milestones/[msId] — updates incl. status COMPLETED → completedAt stamp
// DELETE /api/projects/[id]/milestones/[msId]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const milestoneUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  baselineDate: z.coerce.date().optional().nullable(),
  isCritical: z.boolean().optional(),
  status: z.string().trim().min(2).optional(),
  wbsId: z.string().nullable().optional(),
  gateId: z.string().nullable().optional(),
});

type MilestoneUpdate = z.infer<typeof milestoneUpdateSchema> & { completedAt?: Date | null };

export const PATCH = withApi(async (ctx) => {
  const { id, msId } = ctx.params;
  const before = await db.milestone.findFirst({ where: { id: msId, projectId: id } });
  if (!before) throw new ApiError(404, "Milestone not found in this project");

  const body = await parseBody(ctx.req, milestoneUpdateSchema);
  if (body.wbsId) {
    const node = await db.wBSNode.findFirst({ where: { id: body.wbsId, projectId: id }, select: { id: true } });
    if (!node) throw new ApiError(400, "WBS node not found in this project");
  }

  const data: MilestoneUpdate = { ...body };
  if (body.status !== undefined && body.status !== before.status) {
    if (body.status === "COMPLETED") data.completedAt = before.completedAt ?? new Date();
    else data.completedAt = null;
  }

  const milestone = await db.milestone.update({ where: { id: msId }, data });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Milestone", entityId: msId, entityName: `${milestone.code} ${milestone.name}`,
    before, after: milestone, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("task:changed", { entity: "milestone", action: "updated", projectId: id, milestoneId: msId, status: milestone.status }, projectRoom(id));

  return ok(milestone);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id, msId } = ctx.params;
  const milestone = await db.milestone.findFirst({ where: { id: msId, projectId: id } });
  if (!milestone) throw new ApiError(404, "Milestone not found in this project");

  await db.milestone.delete({ where: { id: msId } });
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Milestone", entityId: msId, entityName: `${milestone.code} ${milestone.name}`,
    before: milestone, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("task:changed", { entity: "milestone", action: "deleted", projectId: id, milestoneId: msId }, projectRoom(id));

  return ok({ deleted: true, id: msId });
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
