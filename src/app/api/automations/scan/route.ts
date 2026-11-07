// PM CONTROL TOWER — Overdue scanner (time-based triggers)
// POST /api/automations/scan — no scheduler exists in-process, so overdue tasks and
// missed milestones are discovered on demand (automations view "Scan now" + on-mount).
// Dedupe: each rule fires at most once per entity per 24h window (execution history).

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { runAutomations } from "@/lib/engines/automations";
import { AUTOMATION_TRIGGERS } from "@/lib/constants";

const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_DONE = ["COMPLETED", "DONE", "CANCELLED"];

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");

  const [taskRules, milestoneRules] = await Promise.all([
    db.automationRule.findMany({ where: { isActive: true, triggerType: "TASK_OVERDUE" } }),
    db.automationRule.findMany({ where: { isActive: true, triggerType: "MILESTONE_MISSED" } }),
  ]);
  if (!taskRules.length && !milestoneRules.length) {
    return ok({ scanned: true, taskRules: 0, milestoneRules: 0, overdueTasks: 0, missedMilestones: 0, fired: 0 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - DAY_MS);

  // Recent executions per rule → per-entity 24h dedupe sets
  const recent = await db.automationExecution.findMany({
    where: { createdAt: { gte: since }, ruleId: { in: [...taskRules, ...milestoneRules].map((r) => r.id) } },
    select: { ruleId: true, entityType: true, entityId: true },
  });
  const firedRecently = new Map<string, Set<string | null>>();
  for (const e of recent) {
    const key = `${e.ruleId}:${e.entityType ?? ""}`;
    const set = firedRecently.get(key) ?? new Set<string | null>();
    set.add(e.entityId);
    firedRecently.set(key, set);
  }

  // Date predicates run in JS, not SQL: imported plan dates are stored as
  // ISO-8601 TEXT while Prisma writes epoch-ms INTEGER — SQLite can't compare
  // the two storages, so `endDate: { lt: now }` silently matched 0 rows.
  // `not: null` is storage-agnostic; we then window, sort and cap in JS.
  const TASK_SCAN_CAP = 5000;
  const overdueTasks = (
    await db.task.findMany({
      where: { endDate: { not: null }, status: { notIn: TASK_DONE } },
      select: {
        id: true, code: true, name: true, endDate: true, status: true, criticality: true,
        projectId: true, progress: true, isCritical: true,
        project: { select: { code: true, name: true } },
      },
      take: TASK_SCAN_CAP,
    })
  )
    .filter((t) => t.endDate !== null && t.endDate.getTime() < now.getTime())
    .sort((a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0))
    .slice(0, 200);

  const missedMilestones = (
    await db.milestone.findMany({
      where: { dueDate: { not: null }, status: { not: "COMPLETED" } },
      select: {
        id: true, code: true, name: true, dueDate: true, status: true, isCritical: true,
        projectId: true, project: { select: { code: true } },
      },
      take: TASK_SCAN_CAP,
    })
  )
    .filter((m) => m.dueDate !== null && m.dueDate.getTime() < now.getTime())
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 200);

  let fired = 0;
  for (const rule of taskRules) {
    for (const t of overdueTasks) {
      if (firedRecently.get(`${rule.id}:Task`)?.has(t.id)) continue;
      if (!t.endDate) continue;
      const daysOverdue = Math.floor((now.getTime() - t.endDate.getTime()) / DAY_MS);
      await runAutomations("TASK_OVERDUE", {
        entityType: "Task", entityId: t.id, projectId: t.projectId,
        code: t.code, name: t.name, status: t.status, progress: t.progress,
        endDate: t.endDate, daysOverdue, criticality: t.criticality,
        isCritical: t.isCritical, projectCode: t.project.code,
      }, rule.id, { bypassConditions: false });
      fired += 1;
    }
  }
  for (const rule of milestoneRules) {
    for (const m of missedMilestones) {
      if (firedRecently.get(`${rule.id}:Milestone`)?.has(m.id)) continue;
      const daysMissed = Math.floor((now.getTime() - m.dueDate!.getTime()) / DAY_MS);
      await runAutomations("MILESTONE_MISSED", {
        entityType: "Milestone", entityId: m.id, projectId: m.projectId,
        code: m.code, name: m.name, status: m.status, dueDate: m.dueDate,
        daysMissed, isCritical: m.isCritical, projectCode: m.project.code,
      }, rule.id, { bypassConditions: false });
      fired += 1;
    }
  }

  const legal = AUTOMATION_TRIGGERS as readonly string[];
  return ok({
    scanned: true,
    at: now.toISOString(),
    taskRules: taskRules.length,
    milestoneRules: milestoneRules.length,
    overdueTasks: overdueTasks.length,
    missedMilestones: missedMilestones.length,
    fired,
    triggers: { taskOverdue: legal.includes("TASK_OVERDUE"), milestoneMissed: legal.includes("MILESTONE_MISSED") },
  });
}, { permission: "automation.manage", rateLimit: { limit: 12, windowMs: 60_000 } });
