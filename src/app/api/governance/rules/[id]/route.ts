// PM CONTROL TOWER — Governance Rule Detail API
// PATCH  /api/governance/rules/[id] — update rule (incl. isActive toggle)
// DELETE /api/governance/rules/[id]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { RULE_METRICS, RULE_OPERATORS, SEVERITY } from "@/lib/constants";

const patchSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  metric: z.enum(RULE_METRICS).optional(),
  operator: z.enum(RULE_OPERATORS).optional(),
  threshold: z.coerce.number().optional(),
  severity: z.enum(SEVERITY).optional(),
  scopeType: z.enum(["GLOBAL", "PROJECT"]).optional(),
  scopeId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  actionNotify: z.boolean().optional(),
  actionInbox: z.boolean().optional(),
  actionRecalcHealth: z.boolean().optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.governanceRule.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Governance rule not found");

  const scopeType = body.scopeType ?? before.scopeType;
  if (scopeType === "PROJECT") {
    const scopeId = body.scopeId !== undefined ? body.scopeId : before.scopeId;
    if (!scopeId) throw new ApiError(400, "scopeId is required when scopeType is PROJECT");
    const project = await db.project.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!project) throw new ApiError(404, "Scope project not found");
  }

  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.metric !== undefined ? { metric: body.metric } : {}),
    ...(body.operator !== undefined ? { operator: body.operator } : {}),
    ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
    ...(body.severity !== undefined ? { severity: body.severity } : {}),
    ...(body.scopeType !== undefined ? { scopeType: body.scopeType } : {}),
    ...(body.scopeId !== undefined ? { scopeId: body.scopeId } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(body.actionNotify !== undefined ? { actionNotify: body.actionNotify } : {}),
    ...(body.actionInbox !== undefined ? { actionInbox: body.actionInbox } : {}),
    ...(body.actionRecalcHealth !== undefined ? { actionRecalcHealth: body.actionRecalcHealth } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.governanceRule.update({ where: { id }, data });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "GovernanceRule", entityId: id, entityName: updated.name,
    before, after: updated, ipAddress: ctx.ip,
  });
  return ok({ rule: updated });
}, { permission: "governance.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const rule = await db.governanceRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, "Governance rule not found");

  await db.governanceRule.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "GovernanceRule", entityId: id, entityName: rule.name,
    before: { metric: rule.metric, operator: rule.operator, threshold: rule.threshold, isActive: rule.isActive },
    ipAddress: ctx.ip, severity: "WARNING",
  });
  return ok({ deleted: true, id });
}, { permission: "governance.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
