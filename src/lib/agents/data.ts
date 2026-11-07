// PM CONTROL TOWER — agent data layer: shared, read-only queries.
// Every agent finding must be traceable to one of these queries — no agent
// invents numbers. Keep this file PURE READS (structural test enforces it).

import { db } from "@/lib/db";

const TERMINAL_TASK = ["COMPLETED", "CANCELLED", "ON_HOLD"] as const;
const PROJECT_SELECT = { select: { id: true, code: true, name: true } } as const;

export interface ProjectRef { id: string; code: string; name: string }

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Tasks past their end date that are not in a terminal status. */
export async function overdueTasks(limit = 100) {
  return db.task.findMany({
    where: { endDate: { lt: new Date() }, status: { notIn: [...TERMINAL_TASK] } },
    orderBy: { endDate: "asc" },
    take: limit,
    include: { project: PROJECT_SELECT, assignee: { select: { id: true, name: true } } },
  });
}

/** Milestones due within the horizon (or already overdue) and not completed. */
export async function milestonesDue(horizonDays: number, limit = 100) {
  return db.milestone.findMany({
    where: {
      completedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED", "DONE"] },
      dueDate: { lte: daysFromNow(horizonDays) },
    },
    orderBy: { dueDate: "asc" },
    take: limit,
    include: { project: PROJECT_SELECT },
  });
}

/** Overdue predecessor tasks and the successors their delay ripples into. */
export async function dependencyRipples(limit = 60) {
  const preds = await db.dependency.findMany({
    where: {
      predecessor: { endDate: { lt: new Date() }, status: { notIn: [...TERMINAL_TASK] } },
      successor: { status: { notIn: [...TERMINAL_TASK] } },
    },
    take: limit,
    include: {
      predecessor: { select: { id: true, code: true, name: true, endDate: true, projectId: true } },
      successor: { select: { id: true, code: true, name: true, endDate: true, projectId: true, assigneeId: true } },
      project: PROJECT_SELECT,
    },
  });
  return preds;
}

/** Latest EVM period per project (cost/schedule performance at a glance). */
export async function latestEvmPeriods() {
  const periods = await db.evmPeriod.findMany({
    orderBy: { statusDate: "desc" },
    take: 400,
    include: { project: PROJECT_SELECT },
  });
  const latest = new Map<string, (typeof periods)[number]>();
  for (const p of periods) if (!latest.has(p.projectId)) latest.set(p.projectId, p);
  return [...latest.values()];
}

/** Budget roll-up per project: baseline vs current vs actual vs forecast. */
export async function budgetRollup() {
  const lines = await db.budgetLine.findMany({
    select: {
      projectId: true, baselineAmount: true, currentAmount: true,
      actualAmount: true, forecastAmount: true,
      project: PROJECT_SELECT,
    },
  });
  const byProject = new Map<string, {
    project: ProjectRef; baseline: number; current: number; actual: number; forecast: number;
  }>();
  for (const l of lines) {
    const row = byProject.get(l.projectId) ??
      { project: l.project, baseline: 0, current: 0, actual: 0, forecast: 0 };
    row.baseline += l.baselineAmount;
    row.current += l.currentAmount;
    row.actual += l.actualAmount;
    row.forecast += l.forecastAmount;
    byProject.set(l.projectId, row);
  }
  return [...byProject.values()];
}

/**
 * Per-resource load: active allocation % summed across assignments that are
 * active now (no explicit end, or not yet past) — the heatmap number.
 */
export async function resourceLoad() {
  const now = new Date();
  const assignments = await db.assignment.findMany({
    where: { status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gte: now } }] },
    select: {
      id: true, allocationPercent: true, resourceId: true, projectId: true, taskId: true,
      resource: { select: { id: true, name: true, primarySkill: true, skills: true, capacityHoursPerWeek: true, availabilityStatus: true } },
      project: PROJECT_SELECT,
    },
  });
  const byResource = new Map<string, {
    resourceId: string;
    name: string;
    skill: string | null;
    capacity: number;
    availability: string;
    totalAllocation: number;
    assignments: typeof assignments;
  }>();
  for (const a of assignments) {
    const row = byResource.get(a.resourceId) ?? {
      resourceId: a.resourceId, name: a.resource.name, skill: a.resource.primarySkill,
      capacity: a.resource.capacityHoursPerWeek, availability: a.resource.availabilityStatus,
      totalAllocation: 0, assignments: [],
    };
    row.totalAllocation += a.allocationPercent;
    row.assignments.push(a);
    byResource.set(a.resourceId, row);
  }
  return [...byResource.values()].sort((a, b) => b.totalAllocation - a.totalAllocation);
}

/** Data-quality checks: duplicate codes, missing dates, ownerless items. */
export async function dataQualityIssues(gateHorizonDays = 14) {
  const [dupTasks, noDueMilestones, ownerlessRisks, unassignedOverdue, gateSoon] = await Promise.all([
    // duplicate task codes within the same project
    db.$queryRaw<Array<{ projectId: string; code: string; n: bigint }>>`
      SELECT projectId, code, COUNT(*) AS n FROM Task
      WHERE status NOT IN ('COMPLETED','CANCELLED')
      GROUP BY projectId, code HAVING COUNT(*) > 1 LIMIT 20`,
    db.milestone.count({ where: { completedAt: null, dueDate: null } }),
    db.risk.count({ where: { status: "OPEN", ownerName: null } }),
    db.task.count({
      where: { endDate: { lt: new Date() }, status: { notIn: [...TERMINAL_TASK] }, assigneeId: null },
    }),
    db.stageGate.findMany({
      where: { decisionStatus: "PENDING", plannedDate: { lte: daysFromNow(gateHorizonDays) } },
      orderBy: { plannedDate: "asc" },
      take: 30,
      include: { project: PROJECT_SELECT },
    }),
  ]);
  return { dupTasks, noDueMilestones, ownerlessRisks, unassignedOverdue, gateSoon };
}

/** Open risks at or above a score threshold (probability × impact). */
export async function hotRisks(minScore = 9, limit = 40) {
  return db.risk.findMany({
    where: { status: "OPEN", score: { gte: minScore } },
    orderBy: { score: "desc" },
    take: limit,
    include: { project: PROJECT_SELECT },
  });
}

/** Recent decisions + closed risks — the raw material for the knowledge curator. */
export async function knowledgeSources(sinceDays = 7) {
  const since = daysFromNow(-sinceDays);
  const [decisions, closedRisks] = await Promise.all([
    db.decision.findMany({
      where: { decisionDate: { gte: since }, status: { in: ["ACTIVE", "CLOSED", "DECIDED"] } },
      orderBy: { decisionDate: "desc" },
      take: 25,
    }),
    db.risk.findMany({
      where: { status: { in: ["CLOSED", "MITIGATED"] }, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);
  return { decisions, closedRisks };
}

/** Count of active projects — used for context lines in briefings. */
export async function projectCount(): Promise<number> {
  return db.project.count();
}

/** Lightweight project list (code + name) for natural-language matching. */
export async function projectsBrief(): Promise<ProjectRef[]> {
  return db.project.findMany({ ...PROJECT_SELECT, orderBy: { code: "asc" } });
}
