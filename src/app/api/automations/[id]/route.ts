// PM CONTROL TOWER — Automation rule detail
// PATCH  /api/automations/[id] — update rule (name/description/conditions/actions/isActive)
// DELETE /api/automations/[id] — delete rule

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { toJson } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "EXISTS"]),
  value: z.unknown().optional(),
});

const actionSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  conditions: z.array(conditionSchema).optional(),
  actions: z.array(actionSchema).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(10).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const rule = await db.automationRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, "Automation rule not found");
  const body = await parseBody(ctx.req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No fields to update");

  const before = { name: rule.name, description: rule.description, isActive: rule.isActive, priority: rule.priority };
  const updated = await db.automationRule.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.conditions !== undefined ? { conditionsJson: toJson(body.conditions) } : {}),
      ...(body.actions !== undefined ? { actionsJson: toJson(body.actions) } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "AutomationRule", entityId: id, entityName: updated.name,
    before, after: { name: updated.name, description: updated.description, isActive: updated.isActive, priority: updated.priority },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(updated);
}, { permission: "automation.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const rule = await db.automationRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, "Automation rule not found");
  await db.automationRule.delete({ where: { id } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "DELETE", entityType: "AutomationRule", entityId: id, entityName: rule.name,
    before: { name: rule.name, triggerType: rule.triggerType, isActive: rule.isActive },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok({ deleted: true, id });
}, { permission: "automation.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
