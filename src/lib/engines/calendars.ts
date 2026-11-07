// PM CONTROL TOWER — Working-time calendar engine
// MS-Project-grade scheduling math: workdays only (Mon=1..Sun=7), per-day hours,
// holiday exceptions. Pure functions — no DB. Default = 7-day calendar so existing
// projects keep their historic pure-epoch behavior when no calendar row exists.

import { dayNum } from "../constants";

export interface CalendarConfig {
  /** ISO day numbers that are working days, Mon=1 .. Sun=7. Default all 7. */
  workingDays: number[];
  /** Contracted working hours in an ordinary working day. */
  hoursPerDay: number;
  /** ISO dates ("2026-12-25") that are non-working exceptions. */
  holidays: string[];
  name?: string;
}

export const DEFAULT_CALENDAR: CalendarConfig = {
  workingDays: [1, 2, 3, 4, 5, 6, 0],
  hoursPerDay: 8,
  holidays: [],
  name: "Continuous (7-day)",
};

const DAY_MS = 86_400_000;

function parse(json: string | null | undefined): number[] {
  try {
    const arr = JSON.parse(json ?? "[]");
    return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  } catch { return []; }
}

/** Build a validated config from stored columns; falls back to 7-day when nothing stored. */
export function configFrom(workingDaysJson: string | null | undefined, hoursPerDay: number | null, holidaysJson: string | null | undefined, name?: string | null): CalendarConfig {
  const wd = parse(workingDaysJson);
  let hol: string[] = [];
  try {
    const arr = JSON.parse(holidaysJson ?? "[]");
    if (Array.isArray(arr)) hol = arr.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)));
  } catch { /* ignore */ }
  if (!wd.length) return { ...DEFAULT_CALENDAR, hoursPerDay: hoursPerDay ?? DEFAULT_CALENDAR.hoursPerDay, name: name ?? DEFAULT_CALENDAR.name };
  return { workingDays: wd, hoursPerDay: hoursPerDay && hoursPerDay > 0 ? hoursPerDay : DEFAULT_CALENDAR.hoursPerDay, holidays: hol, name: name ?? "Custom" };
}

export function isWorkingDay(d: Date | string, cal: CalendarConfig): boolean {
  const dt = new Date(d);
  const dow = dt.getUTCDay();
  if (!cal.workingDays.includes(dow)) return false;
  const iso = dt.toISOString().slice(0, 10);
  return !cal.holidays.includes(iso);
}

/** Next working day at-or-after `d` (UTC midnight). */
export function nextWorkingDay(d: Date | string, cal: CalendarConfig): Date {
  let cur = new Date(new Date(d).getTime() - (new Date(d).getUTCHours() || new Date(d).getUTCMinutes() || new Date(d).getUTCSeconds() ? 0 : 0));
  cur = new Date(Date.UTC(dt_0(cur).getUTCFullYear(), dt_0(cur).getUTCMonth(), dt_0(cur).getUTCDate()));
  let guard = 0;
  while (!isWorkingDay(cur, cal) && guard++ < 400) cur = new Date(cur.getTime() + DAY_MS);
  return cur;
}
function dt_0(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

/** Add `n` working days (negative allowed); day 0 = snap to at-or-after start. */
export function addWorkingDays(d: Date | string, n: number, cal: CalendarConfig): Date {
  if (!Number.isFinite(n) || n === 0) return nextWorkingDay(d, cal);
  let cur = nextWorkingDay(d, cal);
  let left = Math.abs(Math.round(n));
  const step = n > 0 ? DAY_MS : -DAY_MS;
  let guard = 0;
  while (left > 0 && guard++ < 400_000) {
    cur = new Date(cur.getTime() + step);
    if (isWorkingDay(cur, cal)) left -= 1;
  }
  return cur;
}

/** Number of working days in [start, finish] inclusive (0 if either side missing). */
export function countWorkingDays(start: Date | string | null, finish: Date | string | null, cal: CalendarConfig): number {
  if (!start || !finish) return 0;
  let a = nextWorkingDay(start, cal).getTime();
  const b = nextWorkingDay(finish, cal).getTime();
  let n = 0;
  let guard = 0;
  while (a <= b && guard++ < 400_000) {
    if (isWorkingDay(new Date(a), cal)) n += 1;
    a += DAY_MS;
  }
  return n;
}

/**
 * Window-indexed working-day map for CPM: converts between epoch day numbers and
 * a compact "working index" (0 = first working day at/after anchor). Only working
 * days occupy index space (weekends/holidays compress); anything beyond the window
 * falls back to linear epoch-day math so nothing is lost.
 */
export class WorkingIndex {
  readonly anchor: number;
  private readonly day: number[]; // epoch day per COMPACT working index
  constructor(anchor: Date | string, horizonDays: number, cal: CalendarConfig) {
    this.anchor = dayNum(anchor);
    const start = dayNum(nextWorkingDay(anchor, cal));
    this.day = [];
    for (let i = 0; i < Math.max(1, horizonDays); i += 1) {
      const dd = start + i;
      const dt = new Date(dd * DAY_MS);
      if (cal.workingDays.includes(dt.getUTCDay()) && !cal.holidays.includes(dt.toISOString().slice(0, 10))) this.day.push(dd);
    }
  }
  /** First working index whose working day is at-or-after epoch day `dn`. */
  toIndex(dn: number): number {
    if (!this.day.length) return Math.max(0, dn - this.anchor);
    const first = this.day[0];
    const last = this.day[this.day.length - 1];
    if (dn <= first) return 0;
    if (dn > last) return this.day.length - 1 + (dn - last);
    // a day inside the window that is working has an exact index; non-working days
    // snap forward to the next working day
    let lo = 0, hi = this.day.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.day[mid] >= dn) hi = mid; else lo = mid + 1;
    }
    return lo;
  }
  /** Epoch day number for working index `idx`. */
  toDay(idx: number): number {
    if (!this.day.length) return this.anchor + Math.max(0, idx);
    if (idx <= 0) return this.day[0];
    if (idx >= this.day.length) return this.day[this.day.length - 1] + (idx - this.day.length + 1);
    return this.day[idx];
  }
  get length(): number { return this.day.length; }
  isWorking(idx: number): boolean { return idx >= 0 && idx < this.day.length; }
}
