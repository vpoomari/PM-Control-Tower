// PM CONTROL TOWER — Manual automation run
// POST /api/automations/[id]/run — execute a single rule on demand

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { runAutomations } from "@/lib/engines/automations";
import { writeAudit } from "@/lib/audit";

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const rule = await db.automationRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, "Automation rule not found");
  if (!rule.isActive) throw new ApiError(409, "Rule is inactive — activate it before running");

  const startedAt = new Date();
  const triggerCtx = {
    entityType: "Manual",
    entityId: rule.id,
    ...(rule.triggerType === "TASK_OVERDUE" ? { criticality: "HIGH" } : {}),
  };
  await runAutomations(rule.triggerType, triggerCtx, rule.id);

  const executions = await db.automationExecution.findMany({
    where: { ruleId: rule.id, createdAt: { gte: startedAt } },
    orderBy: { createdAt: "desc" },
  });

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "EXECUTE", entityType: "AutomationRule", entityId: rule.id, entityName: rule.name,
    after: { trigger: "MANUAL", executions: executions.length, statuses: executions.map((e) => e.status) },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: executions.some((e) => e.status === "FAILED") ? "WARNING" : "INFO",
    context: `Manual run — trigger ${rule.triggerType}`,
  });

  return ok({ ruleId: rule.id, executions });
}, { permission: "automation.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
