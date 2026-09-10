// PM CONTROL TOWER — Control Automations API
// GET  /api/automations — rules (with last 10 executions each) + execution history
// POST /api/automations — create automation rule

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { toJson, AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "EXISTS"]),
  value: z.unknown().optional(),
});

const actionSchema = z.object({
  type: z.string().refine((t) => (AUTOMATION_ACTIONS as readonly string[]).includes(t), "Unknown action type"),
  params: z.record(z.string(), z.unknown()).optional(),
});

const createRuleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  triggerType: z.string().refine((t) => (AUTOMATION_TRIGGERS as readonly string[]).includes(t), "Unknown trigger type"),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1, "At least one action is required"),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
});

export const GET = withApi(async () => {
  const [rules, history] = await Promise.all([
    db.automationRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        executions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    }),
    db.automationExecution.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { rule: { select: { name: true, triggerType: true } } },
    }),
  ]);
  return ok({ rules, history });
}, { permission: "automation.manage", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createRuleSchema);
  const rule = await db.automationRule.create({
    data: {
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      conditionsJson: toJson(body.conditions),
      actionsJson: toJson(body.actions),
      isActive: body.isActive,
      priority: body.priority,
      createdBy: ctx.session.id,
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "AutomationRule", entityId: rule.id, entityName: rule.name,
    after: { triggerType: rule.triggerType, isActive: rule.isActive, actions: body.actions.map((a) => a.type) },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(rule, 201);
}, { permission: "automation.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
