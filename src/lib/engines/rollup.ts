// PM CONTROL TOWER — Roll-up & Reschedule Services
// WBS actual roll-ups, task summary roll-ups, and CPM persistence.

import { db } from "../db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeCPM, dayToDate, CpmResult } from "./cpm";
import * as calendars from "./calendars";
import { round2 } from "../constants";
import { emitRealtime, projectRoom } from "../realtime";

/** Recompute WBS summary nodes (hours, cost, progress) bottom-up for a project.
 *  Accepts a transaction client so callers inside an interactive transaction (CSV import)
 *  keep the read-your-writes and all-or-nothing semantics. */
export async function rollupWbsActuals(projectId: string, client: Prisma.TransactionClient | PrismaClient = db): Promise<void> {
  const nodes = await client.wBSNode.findMany({ where: { projectId }, orderBy: { level: "asc" } });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const list = childrenOf.get(n.parentId) || [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }
  // process deepest first
  const depth = (n: (typeof nodes)[number]): number => {
    let d = 0, p = byId.get(n.parentId || "");
    while (p) { d++; p = byId.get(p.parentId || ""); }
    return d;
  };
  const sorted = [...nodes].sort((a, b) => depth(b) - depth(a));
  for (const n of sorted) {
    const kids = childrenOf.get(n.id) || [];
    if (!kids.length) continue; // leaf
    const plannedHours = kids.reduce((s, k) => s + k.plannedHours, 0);
    const plannedCost = kids.reduce((s, k) => s + k.plannedCost, 0);
    const actualHours = kids.reduce((s, k) => s + k.actualHours, 0);
    const actualCost = kids.reduce((s, k) => s + k.actualCost, 0);
    const progress = plannedHours > 0 ? round2(kids.reduce((s, k) => s + k.plannedHours * k.progress, 0) / plannedHours) : 0;
    await client.wBSNode.update({ where: { id: n.id }, data: { plannedHours: round2(plannedHours), plannedCost: round2(plannedCost), actualHours: round2(actualHours), actualCost: round2(actualCost), progress } });
  }
  // Project planned hours from leaf WBS; actual hours are incremented by the timesheet cascade
  const leafNodes = nodes.filter((n) => !(childrenOf.get(n.id) || []).length);
  const leafHours = leafNodes.reduce((s, n) => s + n.plannedHours, 0);
  const leafPlannedCost = leafNodes.reduce((s, n) => s + n.plannedCost, 0);
  await client.project.update({ where: { id: projectId }, data: { plannedHours: round2(leafHours) } });
  // Budget defaults to planned cost when not configured
  if (leafPlannedCost > 0) {
    const p = await client.project.findUnique({ where: { id: projectId }, select: { currentBudget: true, baselineBudget: true } });
    if (p && !p.currentBudget) {
      await client.project.update({ where: { id: projectId }, data: { currentBudget: round2(leafPlannedCost), baselineBudget: p.baselineBudget || round2(leafPlannedCost) } });
    }
  }
}

/** Load project scheduling inputs, map constraints/deadlines into working-index
 * space and run CPM once. Shared by rescheduleProject (persistence) and the
 * Tools diagnostics API (read-only schedule AUDIT). */
export type ScheduleProject = Prisma.ProjectGetPayload<{ include: { tasks: true; dependencies: true; calendar: true } }>;
export interface ScheduleTaskInput {
  id: string; name?: string; isSummary?: boolean; parentId?: string | null; durationDays: number;
  startDate?: Date | string | null; seedDay?: number | null; endSeedDay?: number | null; constraintType?: string | null; constraintDay?: number | null; deadlineDay?: number | null;
}
export async function scheduleInputs(projectId: string): Promise<{
  project: ScheduleProject | null;
  cal: ReturnType<typeof calendars.configFrom>;
  calOn: boolean;
  wi: calendars.WorkingIndex;
  cpmTasks: ScheduleTaskInput[];
  deps: { predecessorId: string; successorId: string; depType: string; lagDays: number }[];
  cpm: Map<string, CpmResult>;
  dayMs: number;
} | null> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { tasks: true, dependencies: true, calendar: true } });
  if (!project) return null;
  const leaves = project.tasks.filter((t) => !t.isSummary);
  if (!leaves.length) return null;

  const cal = calendars.configFrom(project.calendar?.workingDays, project.calendar?.hoursPerDay ?? null, project.calendar?.holidays, project.calendar?.calendarName);
  const calOn = !!project.calendar;

  const dayMs = 86_400_000;
  const startAnchor = project.startDate
    ?? project.tasks.map((t) => t.startDate).filter((d): d is Date => !!d).reduce<Date | null>((m, d) => (!m || d < m ? d : m), null)
    ?? new Date();
  const deps = project.dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, depType: d.depType, lagDays: d.lagDays }));

  if (calOn) {
    // ---- Compact working-index space (calendar ON) ----
    // es/ef/ls/lf count WORKING days from the project start; dates are decoded
    // through the WorkingIndex so weekends and holidays are skipped automatically.
    const wi = new calendars.WorkingIndex(startAnchor, 3650, cal); // 10-year window; linear extrapolation beyond
    const day0 = (d: Date | null | undefined) => Math.floor(new Date(d ?? startAnchor).getTime() / dayMs);
    const cpmTasks: ScheduleTaskInput[] = project.tasks.map((t) => {
      const durationDays = t.durationDays > 0 ? t.durationDays : (t.startDate && t.endDate ? Math.max(1, Math.round((t.endDate.getTime() - t.startDate.getTime()) / dayMs)) : 1);
      const ctype = (t.constraintType || "ASAP");
      const hasDate = t.constraintDate != null && ctype !== "ASAP";
      return {
        id: t.id, name: t.name, isSummary: t.isSummary, parentId: t.parentId,
        durationDays,
        seedDay: t.startDate ? wi.toIndex(day0(t.startDate)) : null,
        endSeedDay: t.endDate ? wi.toIndex(day0(t.endDate)) : null,
        constraintType: hasDate ? ctype : null,
        constraintDay: hasDate ? wi.toIndex(day0(t.constraintDate as Date)) : null,
        deadlineDay: t.deadline ? wi.toIndex(day0(t.deadline)) : null,
      };
    });
    const cpm = computeCPM(cpmTasks, deps); // no projectStart → 0-based compact anchors
    return { project, cal, calOn, wi, cpmTasks, deps, cpm, dayMs };
  }

  // ---- Legacy absolute epoch-day space (no calendar saved) — byte-identical to
  // the historic engine so existing plans keep their persisted values. ----
  const cpmTasks: ScheduleTaskInput[] = project.tasks.map((t) => {
    const durationDays = t.durationDays > 0 ? t.durationDays : (t.startDate && t.endDate ? Math.max(1, Math.round((t.endDate.getTime() - t.startDate.getTime()) / dayMs)) : 1);
    const ctype = (t.constraintType || "ASAP");
    const hasDate = t.constraintDate != null && ctype !== "ASAP";
    return {
      id: t.id, name: t.name, isSummary: t.isSummary, parentId: t.parentId, startDate: t.startDate,
      durationDays,
      seedDay: t.startDate ? Math.floor(new Date(t.startDate).getTime() / dayMs) : null,
      endSeedDay: t.endDate ? Math.floor(new Date(t.endDate).getTime() / dayMs) : null,
      constraintType: hasDate ? ctype : null,
      constraintDay: hasDate ? day0Legacy(t.constraintDate as Date, dayMs) : null,
      deadlineDay: t.deadline ? day0Legacy(t.deadline, dayMs) : null,
    };
  });
  const cpm = computeCPM(cpmTasks, deps, project.startDate);
  return { project, cal, calOn, wi: new calendars.WorkingIndex(startAnchor, 1, cal), cpmTasks, deps, cpm, dayMs };
}

/** Legacy-space day number (absolute epoch day) used when no calendar is saved. */
function day0Legacy(d: Date, dayMs: number): number { return Math.floor(new Date(d).getTime() / dayMs); }

/** Run CPM for a project and persist schedule fields + critical flags.
 * Honors the project working-time calendar (if configured) and task constraints
 * (SNET/SNLT/FNET/FNLT/MSO/ALAP) with working-index clamps; conflicts surface as
 * violation counts the Schedule Doctor reports. */
export async function rescheduleProject(projectId: string): Promise<{ criticalCount: number; projectFinish: Date | null; violationCount: number }> {
  const inputs = await scheduleInputs(projectId);
  if (!inputs || !inputs.project) return { criticalCount: 0, projectFinish: null, violationCount: 0 };
  const { project, calOn, wi, cpm, dayMs } = inputs;

  let criticalCount = 0;
  let violationCount = 0;
  let finishDay = 0;
  const toCal = (idx: number): Date => {
    if (calOn && idx >= 0 && idx < wi.length) return new Date(wi.toDay(idx) * dayMs);
    return dayToDate(idx);
  };
  const updates: Promise<unknown>[] = [];
  for (const t of project.tasks) {
    const r = cpm.get(t.id);
    if (!r) continue;
    if (r.critical && !t.isSummary) criticalCount += 1;
    if ((r.violationDays ?? 0) > 0) violationCount += 1;
    finishDay = Math.max(finishDay, r.ef);
    // ALAP tasks are deliberately scheduled at their LATE start (leanest backward plan)
    const startIdx = (t.constraintType === "ALAP") ? r.ls : r.es;
    updates.push(db.task.update({
      where: { id: t.id },
      data: {
        earliestStart: toCal(startIdx),
        earliestFinish: toCal(r.ef),
        latestStart: toCal(r.ls),
        latestFinish: toCal(r.lf),
        totalFloat: round2(r.totalFloat),
        freeFloat: round2(r.freeFloat),
        isCritical: r.critical,
      },
    }));
  }
  // SQLite tolerates modest write parallelism; chunk to keep locks short
  for (let i = 0; i < updates.length; i += 24) await Promise.all(updates.slice(i, i + 24));
  const projectFinishDate = finishDay ? toCal(Math.max(...project.tasks.map((t) => { const r = cpm.get(t.id); return r ? Math.max(r.ef, 0) : 0; }))) : null;
  if (projectFinishDate) {
    await db.project.update({ where: { id: projectId }, data: { endDate: projectFinishDate } });
  }
  emitRealtime("schedule:changed", { projectId, criticalCount, finish: projectFinishDate?.toISOString() ?? null }, projectRoom(projectId));
  // Central SCHEDULE_CHANGED emission: every reschedule path (task edits, dependency
  // create/edit/delete, leveling, calendar changes, manual recalc) flows through here.
  // fireAutomations is depth-guarded, so a RECALC_CPM automation action re-entering
  // rescheduleProject will not loop. Dynamic import breaks the automations→rollup cycle.
  void import("./automations")
    .then((m) => m.fireAutomations("SCHEDULE_CHANGED", {
      entityType: "Project", entityId: projectId, projectId,
      criticalCount, projectFinish: projectFinishDate ?? null,
      violationCount, source: "CPM_RESCHEDULE",
    }))
    .catch(() => undefined);
  return { criticalCount, projectFinish: projectFinishDate, violationCount };
}
