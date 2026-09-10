// PM CONTROL TOWER — Governance Rules API
// GET  /api/governance/rules — rule catalogue
// POST /api/governance/rules — create a threshold rule (metric × operator × threshold)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { RULE_METRICS, RULE_OPERATORS, SEVERITY } from "@/lib/constants";

export const GET = withApi(async () => {
  const rules = await db.governanceRule.findMany({
    orderBy: { createdAt: "desc" },
  });
  return ok({
    rules,
    total: rules.length,
    active: rules.filter((r) => r.isActive).length,
    metrics: RULE_METRICS,
    operators: RULE_OPERATORS,
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional().nullable(),
  metric: z.enum(RULE_METRICS),
  operator: z.enum(RULE_OPERATORS).default("LT"),
  threshold: z.coerce.number(),
  severity: z.enum(SEVERITY).default("WARNING"),
  scopeType: z.enum(["GLOBAL", "PROJECT"]).default("GLOBAL"),
  scopeId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  actionNotify: z.boolean().default(true),
  actionInbox: z.boolean().default(true),
  actionRecalcHealth: z.boolean().default(true),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  if (body.scopeType === "PROJECT") {
    if (!body.scopeId) throw new ApiError(400, "scopeId is required when scopeType is PROJECT");
    const project = await db.project.findUnique({ where: { id: body.scopeId }, select: { id: true } });
    if (!project) throw new ApiError(404, "Scope project not found");
  }

  const created = await db.governanceRule.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      metric: body.metric,
      operator: body.operator,
      threshold: body.threshold,
      severity: body.severity,
      scopeType: body.scopeType,
      scopeId: body.scopeType === "PROJECT" ? body.scopeId ?? null : null,
      isActive: body.isActive,
      actionNotify: body.actionNotify,
      actionInbox: body.actionInbox,
      actionRecalcHealth: body.actionRecalcHealth,
      createdBy: session.id,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "GovernanceRule", entityId: created.id, entityName: created.name,
    after: { metric: created.metric, operator: created.operator, threshold: created.threshold, severity: created.severity, scopeType: created.scopeType },
    ipAddress: ctx.ip,
  });
  return ok({ rule: created }, 201);
}, { permission: "governance.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
