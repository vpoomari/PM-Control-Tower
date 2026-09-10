// PM CONTROL TOWER — Control Automations Engine
// WHEN trigger → IF conditions → THEN actions, with execution history, error
// handling, retry counters and audit trail.

import { db } from "../db";
import { fromJson, toJson, round2 } from "../constants";
import { recalcProjectHealth } from "./health";
import { evaluateGovernance } from "./governance";
import { rescheduleProject } from "./rollup";
import { emitRealtime } from "../realtime";
import { writeAudit } from "../audit";

interface TriggerContext {
  entityType?: string;
  entityId?: string;
  projectId?: string;
  timesheetId?: string;
  projects?: string[];
  [k: string]: unknown;
}

interface Condition { field: string; op: string; value: unknown }
interface Action { type: string; params?: Record<string, unknown> }

function matchCondition(cond: Condition, ctx: TriggerContext): boolean {
  const actual = (ctx as Record<string, unknown>)[cond.field];
  switch (cond.op) {
    case "EQ": return actual === cond.value;
    case "NEQ": return actual !== cond.value;
    case "GT": return Number(actual) > Number(cond.value);
    case "GTE": return Number(actual) >= Number(cond.value);
    case "LT": return Number(actual) < Number(cond.value);
    case "LTE": return Number(actual) <= Number(cond.value);
    case "CONTAINS": return String(actual ?? "").toLowerCase().includes(String(cond.value).toLowerCase());
    case "EXISTS": return actual !== undefined && actual !== null;
    default: return true;
  }
}

async function executeAction(action: Action, ctx: TriggerContext, ruleName: string): Promise<Record<string, unknown>> {
  const projectId = (action.params?.projectId as string) || (ctx.projectId as string) || (ctx.projects?.[0] as string);
  switch (action.type) {
    case "CREATE_INBOX_ITEM": {
      const users = await resolveUsers(action.params, ctx);
      for (const uid of users) {
        await db.inboxItem.create({
          data: {
            userId: uid, category: (action.params?.category as string) || "ACTION_REQUIRED",
            title: (action.params?.title as string) || `Automation: ${ruleName}`,
            message: (action.params?.message as string) || `Triggered by ${ctx.entityType || "event"}`,
            entityType: (ctx.entityType as string) || "Automation", entityId: (ctx.entityId as string) || null,
            projectId: projectId || null, priority: (action.params?.priority as string) || "HIGH",
            actionUrl: (action.params?.actionUrl as string) || "#/inbox", sourceType: "AUTOMATION",
          },
        });
      }
      emitRealtime("inbox:changed", { rule: ruleName, count: users.length });
      return { inboxItems: users.length };
    }
    case "NOTIFY_PM":
    case "NOTIFY_ROLE":
    case "NOTIFY_USER": {
      const users = await resolveUsers(action.params, ctx);
      for (const uid of users) {
        await db.notification.create({
          data: {
            userId: uid, notifType: "AUTOMATION", category: "AUTOMATION",
            title: (action.params?.title as string) || `Automation: ${ruleName}`,
            message: (action.params?.message as string) || `Triggered by ${ctx.entityType || "event"}`,
            entityType: (ctx.entityType as string) || "Automation", entityId: (ctx.entityId as string) || null,
            projectId: projectId || null, severity: (action.params?.severity as string) || "INFO",
            channel: (action.params?.channel as string) || "IN_APP",
          },
        });
      }
      emitRealtime("notification:created", { rule: ruleName, count: users.length });
      return { notifications: users.length };
    }
    case "RECALC_HEALTH": {
      const pids = (ctx.projects as string[]) || (projectId ? [projectId] : []);
      for (const pid of pids) await recalcProjectHealth(pid, `AUTOMATION:${ruleName}`);
      return { healthRecalculated: pids.length };
    }
    case "EVALUATE_GOVERNANCE": {
      const pids = (ctx.projects as string[]) || (projectId ? [projectId] : undefined);
      const r = await evaluateGovernance(pids?.[0]);
      return { breaches: r.breaches.length, evaluated: r.evaluated };
    }
    case "RECALC_CPM": {
      const pids = (ctx.projects as string[]) || (projectId ? [projectId] : []);
      for (const pid of pids) await rescheduleProject(pid);
      return { rescheduled: pids.length };
    }
    case "CREATE_ALERT": {
      const alert = await db.alertEvent.create({
        data: {
          projectId: projectId || null, alertType: "AUTOMATION",
          severity: (action.params?.severity as string) || "WARNING",
          title: (action.params?.title as string) || `Automation alert: ${ruleName}`,
          message: (action.params?.message as string) || `Raised by automation ${ruleName}`,
          source: "AUTOMATION",
        },
      });
      emitRealtime("alert:created", { alertId: alert.id, severity: alert.severity });
      return { alertId: alert.id };
    }
    case "CREATE_NOTIFICATION":
      return executeAction({ ...action, type: "NOTIFY_USER" }, ctx, ruleName);
    default:
      return { skipped: action.type };
  }
}

async function resolveUsers(params: Record<string, unknown> | undefined, ctx: TriggerContext): Promise<string[]> {
  const out = new Set<string>();
  if (params?.userIds && Array.isArray(params.userIds)) (params.userIds as string[]).forEach((u) => out.add(u));
  if (params?.roles && Array.isArray(params.roles)) {
    const users = await db.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { code: { in: params.roles as string[] } } } } },
      select: { id: true },
    });
    users.forEach((u) => out.add(u.id));
  }
  const projectId = (ctx.projectId as string) || (ctx.projects?.[0] as string);
  if ((params?.target === "PM" || actionIsNotifyPm(params)) && projectId) {
    const p = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true, managerId: true } });
    if (p?.ownerId) out.add(p.ownerId);
    if (p?.managerId) out.add(p.managerId);
  }
  if (!out.size) {
    const admins = await db.user.findMany({ where: { isActive: true, userRoles: { some: { role: { code: "PMO_ADMIN" } } } }, select: { id: true } });
    admins.forEach((u) => out.add(u.id));
  }
  return [...out];
}

function actionIsNotifyPm(params: Record<string, unknown> | undefined): boolean {
  return Boolean(params?.target === "PM");
}

/** Entry point: run all active automation rules for a trigger type. When onlyRuleId is
 *  provided, execution is restricted to that single rule (manual run endpoint). */
export async function runAutomations(triggerType: string, ctx: TriggerContext = {}, onlyRuleId?: string): Promise<void> {
  let rules;
  try {
    rules = await db.automationRule.findMany({ where: { isActive: true, triggerType } });
  } catch {
    return; // DB not ready — never block the business flow
  }
  if (onlyRuleId) rules = rules.filter((r) => r.id === onlyRuleId);
  for (const rule of rules) {
    const started = Date.now();
    let attempts = 0;
    const maxAttempts = 2;
    let lastError: string | null = null;
    let output: Record<string, unknown> = {};
    let status = "SUCCESS";

    try {
      const conditions = fromJson<Condition[]>(rule.conditionsJson, []);
      const conditionsMet = conditions.every((c) => matchCondition(c, ctx));
      if (!conditionsMet) {
        await db.automationExecution.create({
          data: { ruleId: rule.id, projectId: (ctx.projectId as string) || null, status: "SKIPPED", triggeredBy: "SYSTEM", entityType: (ctx.entityType as string) || null, entityId: (ctx.entityId as string) || null, inputJson: toJson(ctx), outputJson: toJson({ reason: "conditions not met" }), durationMs: Date.now() - started },
        });
        continue;
      }
      const actions = fromJson<Action[]>(rule.actionsJson, []);
      for (const a of actions) {
        attempts += 1;
        try {
          const r = await executeAction(a, ctx, rule.name);
          output = { ...output, [a.type]: r };
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          status = attempts >= maxAttempts ? "FAILED" : "PARTIAL";
        }
      }
      await db.automationRule.update({
        where: { id: rule.id },
        data: { executionCount: { increment: 1 }, failureCount: status === "FAILED" ? { increment: 1 } : { increment: 0 }, lastRunAt: new Date() },
      });
    } catch (err) {
      status = "FAILED";
      lastError = err instanceof Error ? err.message : String(err);
      await db.automationRule.update({ where: { id: rule.id }, data: { failureCount: { increment: 1 } } }).catch(() => undefined);
    }
    await db.automationExecution.create({
      data: {
        ruleId: rule.id, projectId: (ctx.projectId as string) || null, status, triggeredBy: "SYSTEM",
        entityType: (ctx.entityType as string) || null, entityId: (ctx.entityId as string) || null,
        inputJson: toJson(ctx), outputJson: toJson(output), error: lastError,
        durationMs: Date.now() - started, attempts: Math.max(1, attempts),
      },
    });
    emitRealtime("automation:executed", { rule: rule.name, status, durationMs: Date.now() - started });
    await writeAudit({ action: "EXECUTE", entityType: "AutomationRule", entityId: rule.id, entityName: rule.name, after: { status, output }, severity: status === "FAILED" ? "WARNING" : "INFO", context: `Trigger: ${triggerType}` });
  }
}
