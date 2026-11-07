// PM CONTROL TOWER — Schedule Doctor
// Audit-only diagnostics over the live plan. Pure functions — no DB. Each finding
// carries unique severity weights so the API can compute a Schedule Health Index.

import { CalendarConfig, isWorkingDay } from "./calendars";

export interface DocTask {
  id: string; code: string; name: string; durationDays: number;
  status: string; progress: number; plannedHours: number;
  assigneeId: string | null; wbsId: string | null;
  constraintType: string | null; constraintDate: Date | string | null;
  deadline: Date | string | null;
  startDate: Date | string | null; endDate: Date | string | null;
  earliestStart: Date | string | null; earliestFinish: Date | string | null;
  totalFloat: number; freeFloat: number; isCritical: boolean; isSummary: boolean;
  /** From a fresh computeCPM pass over live data (0 = none). */
  violationDays?: number;
}
export interface DocDep { predecessorId: string; successorId: string }
export interface DocFinding { code: string; severity: "RED" | "AMBER" | "INFO"; items: { taskId: string; code: string; name: string; detail?: string }[] }
export interface DoctorResult { findings: DocFinding[]; healthIndex: number; checkedAt: string }

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function runDoctor(tasks: DocTask[], deps: DocDep[], cal: CalendarConfig | null, statusDate: Date | string | null): DoctorResult {
  const leaves = tasks.filter((t) => !t.isSummary);
  const preds = new Map<string, Set<string>>();
  const succs = new Map<string, Set<string>>();
  for (const t of leaves) { preds.set(t.id, new Set()); succs.set(t.id, new Set()); }
  for (const d of deps) {
    preds.get(d.successorId)?.add(d.predecessorId);
    succs.get(d.predecessorId)?.add(d.successorId);
  }
  const f = (code: string, severity: DocFinding["severity"], pick: (t: DocTask) => string | false): DocFinding => {
    const items: DocFinding["items"] = [];
    for (const t of leaves) {
      const detail = pick(t);
      if (detail !== false) items.push({ taskId: t.id, code: t.code, name: t.name, detail });
    }
    return { code, severity, items };
  };

  const findings: DocFinding[] = [
    f("UNRESOLVABLE_CONSTRAINT", "RED", (t) => ((t.violationDays ?? 0) > 0 && t.constraintType && t.constraintType !== "ASAP"
      ? `${t.constraintType} conflicts with the task network (${t.violationDays}d unresolvable)` : false)),
    f("DEADLINE_BREACH", "RED", (t) => (t.deadline && t.earliestFinish && new Date(t.earliestFinish) > new Date(t.deadline)
      ? `earliest finish ${iso(t.earliestFinish)} passes deadline ${iso(t.deadline)}` : false)),
    f("NO_CONNECTION", "AMBER", (t) => ((preds.get(t.id)!.size === 0 && succs.get(t.id)!.size === 0)
      ? "isolated: no predecessor, no successor" : false)),
    f("ZERO_DURATION", "AMBER", (t) => (t.durationDays <= 0 ? "zero-length leaf" : false)),
    f("FLOAT_POOR", "AMBER", (t) => (!t.isCritical && t.totalFloat > 0 && t.totalFloat < 5 ? `${t.totalFloat}d float — erosion risk` : false)),
    f("UNASSIGNED_EFFORT", "AMBER", (t) => (t.plannedHours > 0 && !t.assigneeId ? `${t.plannedHours}h with no assignee` : false)),
    f("PAST_DUE", "RED", (t) => {
      const sd = statusDate ? new Date(statusDate) : null;
      if (!sd || !t.endDate) return false;
      return new Date(t.endDate) < sd && t.progress < 100 ? `ended ${iso(t.endDate)} before status date ${iso(sd)} at ${t.progress}%` : false;
    }),
    f("NONWORKING_START", "INFO", (t) => (cal && t.startDate && !isWorkingDay(t.startDate, cal)
      ? `planner start ${iso(t.startDate)} is not a working day` : false)),
    f("FLOAT_SUSPECT", "INFO", (t) => (t.totalFloat > 200 ? `${Math.round(t.totalFloat)}d float — likely disconnected tail` : false)),
  ].filter((x) => x.items.length > 0);

  // Schedule Health Index (unique PMCT signature): start at 100, weight findings.
  const weights: Record<string, number> = {
    UNRESOLVABLE_CONSTRAINT: 14, DEADLINE_BREACH: 10, PAST_DUE: 8, NO_CONNECTION: 4,
    ZERO_DURATION: 3, FLOAT_POOR: 2, UNASSIGNED_EFFORT: 2, NONWORKING_START: 1, FLOAT_SUSPECT: 1,
  };
  let score = 100;
  for (const fd of findings) score -= Math.min(30, (weights[fd.code] ?? 2) * Math.min(6, fd.items.length) / 2);
  return { findings, healthIndex: Math.max(0, Math.round(score)), checkedAt: new Date().toISOString() };
}
