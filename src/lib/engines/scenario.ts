// PM CONTROL TOWER — Scenario Sandbox Engine (pure)
// Branch (deep clone) → apply overrides → run the SAME engines on the clone
// (computeCPM here; engines are injected data, never forked code) → diff →
// merge converts accepted overrides into real changes inside one audited
// transaction (orchestrated by the API layer). Production roll-ups never read
// scenario rows: the sandbox lives in a JSON snapshot, structurally isolated.

import { computeCPM } from "./cpm";

export interface ScenarioTask { id: string; name: string; durationDays: number; isSummary: boolean; assigneeId?: string | null }
export interface ScenarioDep { predecessorId: string; successorId: string; depType: string; lagDays: number }
export interface ScenarioSnapshot {
  projectId: string; projectName: string; projectStart: string | null;
  budget: number | null;
  tasks: ScenarioTask[];
  deps: ScenarioDep[];
  assignments: { id: string; resourceId: string; resourceName: string; allocationPercent: number; taskId: string | null }[];
}

export interface ScenarioOverrides {
  durationChanges?: Record<string, number>;          // taskId → new duration days
  removeAssignments?: string[];                       // assignment ids to drop
  reassignResource?: { fromResourceId: string; toResourceId: string; toResourceName: string };
  budgetDelta?: number;
}

export function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

export function applyOverrides(snapshot: ScenarioSnapshot, ov: ScenarioOverrides): { simulated: ScenarioSnapshot; applied: string[] } {
  const sim = deepClone(snapshot);
  const applied: string[] = [];
  if (ov.durationChanges) {
    for (const [tid, days] of Object.entries(ov.durationChanges)) {
      const t = sim.tasks.find((x) => x.id === tid);
      if (t && days > 0) { t.durationDays = days; applied.push(`duration ${t.name} → ${days}d`); }
    }
  }
  if (ov.removeAssignments?.length) {
    sim.assignments = sim.assignments.filter((a) => !ov.removeAssignments!.includes(a.id));
    applied.push(`${ov.removeAssignments.length} assignment(s) removed`);
  }
  if (ov.reassignResource) {
    let n = 0;
    for (const a of sim.assignments) {
      if (a.resourceId === ov.reassignResource.fromResourceId) { a.resourceId = ov.reassignResource.toResourceId; a.resourceName = ov.reassignResource.toResourceName; n++; }
    }
    if (n) applied.push(`${n} assignment(s) reassigned to ${ov.reassignResource.toResourceName}`);
  }
  if (ov.budgetDelta) { sim.budget = (sim.budget ?? 0) + ov.budgetDelta; applied.push(`budget ${ov.budgetDelta > 0 ? "+" : ""}${ov.budgetDelta}`); }
  return { simulated: sim, applied };
}

function finishDay(snapshot: ScenarioSnapshot): number {
  const res = computeCPM(snapshot.tasks.map((t) => ({ id: t.id, durationDays: t.durationDays, isSummary: t.isSummary })), snapshot.deps, null);
  return Math.max(0, ...[...res.values()].map((r) => r.ef));
}

export interface ScenarioDiff {
  baseFinishDay: number; simulatedFinishDay: number; finishDeltaDays: number;
  baseBudget: number; simulatedBudget: number; budgetDelta: number;
  assignmentsBefore: number; assignmentsAfter: number;
  affectedTasks: string[];
  applied: string[];
}

export function computeScenarioDiff(base: ScenarioSnapshot, simulated: ScenarioSnapshot, applied: string[]): ScenarioDiff {
  const bf = finishDay(base), sf = finishDay(simulated);
  const affected = base.tasks
    .filter((t) => { const s = simulated.tasks.find((x) => x.id === t.id); return s && s.durationDays !== t.durationDays; })
    .map((t) => t.name);
  return {
    baseFinishDay: bf, simulatedFinishDay: sf, finishDeltaDays: sf - bf,
    baseBudget: base.budget ?? 0, simulatedBudget: simulated.budget ?? 0, budgetDelta: (simulated.budget ?? 0) - (base.budget ?? 0),
    assignmentsBefore: base.assignments.length, assignmentsAfter: simulated.assignments.length,
    affectedTasks: affected, applied,
  };
}

// ---- Rebase on current actuals ----
// Live data may drift between branch creation and merge. Instead of failing or
// blindly overwriting, duration overrides are REBASED: the override's DELTA
// relative to the branch snapshot is applied to the CURRENT duration. Assignment
// removals that already happened in production are skipped. The merge response
// reports every rebase/skip decision.

export interface RebaseDecision { taskId?: string; kind: string; note: string }

export function rebaseOverrides(
  snapshot: ScenarioSnapshot,
  overrides: ScenarioOverrides,
  current: { tasks: ScenarioTask[]; assignmentIds: Set<string> }
): { rebased: ScenarioOverrides; decisions: RebaseDecision[] } {
  const decisions: RebaseDecision[] = [];
  const durationChanges: Record<string, number> = {};
  if (overrides.durationChanges) {
    for (const [taskId, overrideDays] of Object.entries(overrides.durationChanges)) {
      const snap = snapshot.tasks.find((t) => t.id === taskId);
      const cur = current.tasks.find((t) => t.id === taskId);
      if (!cur) { decisions.push({ taskId, kind: "SKIPPED", note: "task no longer exists in production" }); continue; }
      const snapDays = snap?.durationDays ?? cur.durationDays;
      if (cur.durationDays === snapDays) { durationChanges[taskId] = overrideDays; decisions.push({ taskId, kind: "APPLIED", note: "no drift" }); continue; }
      const delta = overrideDays - snapDays;
      const rebased = Math.max(0.5, Math.round((cur.durationDays + delta) * 10) / 10);
      durationChanges[taskId] = rebased;
      decisions.push({ taskId, kind: "REBASED", note: "branch base " + snapDays + "d -> current " + cur.durationDays + "d; delta applied -> " + rebased + "d" });
    }
  }
  let removeAssignments = overrides.removeAssignments?.filter((aid) => {
    const exists = current.assignmentIds.has(aid);
    if (!exists) decisions.push({ kind: "SKIPPED", note: "assignment already removed in production" });
    return exists;
  });
  return { rebased: { ...overrides, durationChanges, removeAssignments }, decisions };
}
