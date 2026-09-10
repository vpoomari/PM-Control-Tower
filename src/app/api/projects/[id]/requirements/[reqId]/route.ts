// PM CONTROL TOWER — Requirement Item API
// PATCH  /api/projects/[id]/requirements/[reqId]
// DELETE /api/projects/[id]/requirements/[reqId]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const requirementUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().optional().nullable(),
  reqType: z.string().trim().min(2).optional(),
  priority: z.string().trim().min(2).optional(),
  status: z.string().trim().min(2).optional(),
  acceptanceCriteria: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  effortEstimate: z.coerce.number().min(0).optional(),
  wbsId: z.string().nullable().optional(),
});

export const PATCH = withApi(async (ctx) => {
  const { id, reqId } = ctx.params;
  const before = await db.requirement.findFirst({ where: { id: reqId, projectId: id } });
  if (!before) throw new ApiError(404, "Requirement not found in this project");

  const body = await parseBody(ctx.req, requirementUpdateSchema);
  if (body.wbsId) {
    const wbs = await db.wBSNode.findFirst({ where: { id: body.wbsId, projectId: id }, select: { id: true } });
    if (!wbs) throw new ApiError(400, "WBS node not found in this project");
  }

  const requirement = await db.requirement.update({ where: { id: reqId }, data: body });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Requirement", entityId: reqId, entityName: `${requirement.reqCode} ${requirement.title}`,
    before, after: requirement, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("project:updated", { entity: "requirement", action: "updated", projectId: id, requirementId: reqId }, projectRoom(id));

  return ok(requirement);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id, reqId } = ctx.params;
  const requirement = await db.requirement.findFirst({ where: { id: reqId, projectId: id } });
  if (!requirement) throw new ApiError(404, "Requirement not found in this project");

  await db.requirement.delete({ where: { id: reqId } });
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Requirement", entityId: reqId, entityName: `${requirement.reqCode} ${requirement.title}`,
    before: requirement, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("project:updated", { entity: "requirement", action: "deleted", projectId: id, requirementId: reqId }, projectRoom(id));

  return ok({ deleted: true, id: reqId });
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
