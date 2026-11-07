// PM CONTROL TOWER — Resource Load & Leveling engine
// Day-resolution over-allocation detection and float-safe leveling prescriptions.
// Pure functions — no DB — so the Logic-Bricks tests can run headlessly.

import { CalendarConfig, isWorkingDay } from "./calendars";

const DAY_MS = 86_400_000;
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export interface LevResourceInput { id: string; name: string; capacityHoursPerWeek: number }
export interface LevTaskInput {
  id: string; code: string; name: string; durationDays: number;
  startDate?: Date | string | null; endDate?: Date | string | null;
  earliestStart?: Date | string | null; earliestFinish?: Date | string | null;
  totalFloat: number; isCritical: boolean;
}
export interface LevAssignmentInput {
  id: string; resourceId: string; taskId: string | null;
  startDate?: Date | string | null; endDate?: Date | string | null;
  allocationPercent: number; plannedHours: number;
}

export interface Capacities { [resourceId: string]: number }

export interface OverAllocHit { day: string; dayNum: number; resourceId: string; hours: number; capacity: number; taskIds: string[] }
export interface ResourceLoadSeries { resourceId: string; days: { day: string; hours: number; capacity: number }[] }

/** Per-epoch-day allocation hours per resource, working days only.
 * Allocation sources: assignment date range (preferred), else its task date range. */
export function computeDailyLoad(tasks: LevTaskInput[], assignments: LevAssignmentInput[], resources: LevResourceInput[], cal: CalendarConfig): { series: ResourceLoadSeries[]; over: OverAllocHit[] } {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const resById = new Map(resources.map((r) => [r.id, r]));
  const load = new Map<string, Map<number, { hours: number; taskIds: Set<string> }>>(); // resId -> day -> hours

  for (const a of assignments) {
    const t = a.taskId ? taskById.get(a.taskId) : undefined;
    if (!resById.has(a.resourceId)) continue;
    const start = a.startDate ?? t?.startDate ?? t?.earliestStart ?? null;
    const finish = a.endDate ?? t?.endDate ?? t?.earliestFinish ?? null;
    if (!start || !finish) continue;
    let s = iso(start); let f = iso(finish);
    if (s > f) [s, f] = [f, s];
    // Working-day span of the assignment
    const spanStart = new Date(s + "T00:00:00.000Z").getTime();
    const spanEnd = new Date(f + "T00:00:00.000Z").getTime();
    if (spanEnd < spanStart) continue;
    let workDays = 0;
    for (let d = spanStart; d <= spanEnd; d += DAY_MS) if (isWorkingDay(new Date(d), cal)) workDays += 1;
    if (workDays <= 0) continue;
    const daily = (a.plannedHours > 0 ? a.plannedHours : 0) / workDays;
    if (daily <= 0) continue;
    for (let d = spanStart; d <= spanEnd; d += DAY_MS) {
      const dn = Math.floor(d / DAY_MS);
      if (!isWorkingDay(new Date(d), cal)) continue;
      const perRes = load.get(a.resourceId) ?? new Map();
      const cell = perRes.get(dn) ?? { hours: 0, taskIds: new Set<string>() };
      cell.hours += daily;
      if (t) cell.taskIds.add(t.id);
      perRes.set(dn, cell);
      load.set(a.resourceId, perRes);
    }
  }

  const series: ResourceLoadSeries[] = [];
  const over: OverAllocHit[] = [];
  for (const [resourceId, perDay] of load) {
    const res = resById.get(resourceId)!;
    const capacityPerDay = Math.max(0.5, (res.capacityHoursPerWeek || 40) / 5); // spread weekly capacity over 5 anchor days
    const days = [...perDay.entries()].sort((a, b) => a[0] - b[0]).map(([dn, cell]) => {
      const dayIso = new Date(dn * DAY_MS).toISOString().slice(0, 10);
      const hit: OverAllocHit | null = cell.hours > capacityPerDay + 0.001
        ? { day: dayIso, dayNum: dn, resourceId, hours: Math.round(cell.hours * 100) / 100, capacity: capacityPerDay, taskIds: [...cell.taskIds] }
        : null;
      if (hit) over.push(hit);
      return { day: dayIso, hours: Math.round(cell.hours * 100) / 100, capacity: capacityPerDay };
    });
    series.push({ resourceId, days });
  }
  over.sort((a, b) => a.dayNum - b.dayNum || a.resourceId.localeCompare(b.resourceId));
  return { series, over };
}

export interface LevelAction { taskId: string; code: string; shiftDays: number; floatBefore: number; reason: string }

/**
 * Prescribe float-safe shifts: for each over-allocated day cluster, the *later*
 * task on that resource slides right by as few working days as its float allows.
 * Critical tasks never move; float budget is honored.
 */
export function prescribeLeveling(over: OverAllocHit[], tasks: LevTaskInput[], assignments: LevAssignmentInput[]): LevelAction[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const actions = new Map<string, LevelAction>();
  for (const hit of over) {
    const involving = /* unique tasks on this hit */ [...new Set(hit.taskIds)]
      .map((id) => taskById.get(id))
      .filter((t): t is LevTaskInput => !!t)
      .filter((t) => !t.isCritical && t.totalFloat > 0);
    if (!involving.length) continue;
    // Pick the task that starts LAST that day → natural candidate to push right
    const cands = [...involving].sort((a, b) => (new Date(b.startDate ?? b.earliestStart ?? 0).getTime()) - (new Date(a.startDate ?? a.earliestStart ?? 0).getTime()));
    for (const t of cands) {
      const deficit = hit.hours - hit.capacity;
      const perTaskHours = deficit / Math.max(1, hit.taskIds.length);
      // How many working days must this task slide so it no longer sits on the hot day?
      const shift = Math.min(t.totalFloat, Math.max(1, Math.ceil(perTaskHours / Math.max(1, t.durationDays) / Math.max(0.25, 1))));
      const action = actions.get(t.id) ?? { taskId: t.id, code: t.code, shiftDays: 0, floatBefore: t.totalFloat, reason: "" };
      action.shiftDays = shift;
      action.reason = `Over ${hit.day}: ${hit.hours}h vs ${hit.capacity}h capacity`;
      actions.set(t.id, action);
      break; // one task per hot day is enough to clear it
    }
  }
  return [...actions.values()];
}
