// PM CONTROL TOWER — Roll-up & Reschedule Services
// WBS actual roll-ups, task summary roll-ups, and CPM persistence.

import { db } from "../db";
import { computeCPM, dayToDate } from "./cpm";
import { round2 } from "../constants";
import { emitRealtime, projectRoom } from "../realtime";

/** Recompute WBS summary nodes (hours, cost, progress) bottom-up for a project. */
export async function rollupWbsActuals(projectId: string): Promise<void> {
  const nodes = await db.wBSNode.findMany({ where: { projectId }, orderBy: { level: "asc" } });
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
    await db.wBSNode.update({ where: { id: n.id }, data: { plannedHours: round2(plannedHours), plannedCost: round2(plannedCost), actualHours: round2(actualHours), actualCost: round2(actualCost), progress } });
  }
  // Project planned hours from leaf WBS; actual hours are incremented by the timesheet cascade
  const leafNodes = nodes.filter((n) => !(childrenOf.get(n.id) || []).length);
  const leafHours = leafNodes.reduce((s, n) => s + n.plannedHours, 0);
  const leafPlannedCost = leafNodes.reduce((s, n) => s + n.plannedCost, 0);
  await db.project.update({ where: { id: projectId }, data: { plannedHours: round2(leafHours) } });
  // Budget defaults to planned cost when not configured
  if (leafPlannedCost > 0) {
    const p = await db.project.findUnique({ where: { id: projectId }, select: { currentBudget: true, baselineBudget: true } });
    if (p && !p.currentBudget) {
      await db.project.update({ where: { id: projectId }, data: { currentBudget: round2(leafPlannedCost), baselineBudget: p.baselineBudget || round2(leafPlannedCost) } });
    }
  }
}

/** Run CPM for a project and persist schedule fields + critical flags. */
export async function rescheduleProject(projectId: string): Promise<{ criticalCount: number; projectFinish: Date | null }> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { tasks: true, dependencies: true } });
  if (!project) return { criticalCount: 0, projectFinish: null };
  const leaves = project.tasks.filter((t) => !t.isSummary);
  if (!leaves.length) return { criticalCount: 0, projectFinish: null };

  // Seed durations from dates when duration not set
  const tasks = project.tasks.map((t) => ({
    id: t.id, name: t.name, isSummary: t.isSummary, parentId: t.parentId,
    durationDays: t.durationDays > 0 ? t.durationDays : (t.startDate && t.endDate ? Math.max(1, Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86_400_000)) : 1),
    startDate: t.startDate,
  }));
  const deps = project.dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, depType: d.depType, lagDays: d.lagDays }));
  const cpm = computeCPM(tasks, deps, project.startDate);

  let criticalCount = 0;
  let finishDay = 0;
  for (const t of project.tasks) {
    const r = cpm.get(t.id);
    if (!r) continue;
    if (r.critical && !t.isSummary) criticalCount += 1;
    finishDay = Math.max(finishDay, r.ef);
    await db.task.update({
      where: { id: t.id },
      data: {
        earliestStart: dayToDate(r.es),
        earliestFinish: dayToDate(r.ef),
        latestStart: dayToDate(r.ls),
        latestFinish: dayToDate(r.lf),
        totalFloat: round2(r.totalFloat),
        freeFloat: round2(r.freeFloat),
        isCritical: r.critical,
      },
    });
  }
  const projectFinish = finishDay ? dayToDate(finishDay) : null;
  if (projectFinish) {
    await db.project.update({ where: { id: projectId }, data: { endDate: projectFinish } });
  }
  emitRealtime("schedule:changed", { projectId, criticalCount, finish: projectFinish?.toISOString() }, projectRoom(projectId));
  return { criticalCount, projectFinish };
}
