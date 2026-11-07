// PM CONTROL TOWER — Prioritized Task Dashboard & e-mail engine: pure logic.
//
// Everything in this module is side-effect free (constants only — no Prisma,
// no network) so the four widget conditions and both cron decisions are unit
// testable in isolation (tests/engines/priorities.test.ts).
//
// Widget conditions (spec):
//   Overdue (Last 7 Days) : due date in [today-7, today) AND status active
//   Due Today             : due date on the current system date
//   Upcoming (Next 7 Days): due date in [tomorrow, day+7] inclusive
//   Action Not Taken      : stalled items — awaiting approval, unassigned,
//                           blocked, unread (see dashboard.ts for the DB side)
//
// E-mail rules (spec):
//   Due Today trigger   : exactly one e-mail per task per reached due date
//                         (idempotent via Task.dueTodayEmailedAt)
//   Overdue escalation  : one e-mail per task per calendar day, every day,
//                         until status ∈ {COMPLETED, CANCELLED, ON_HOLD}
//                         (idempotent per day via Task.overdueEmailedAt)
//
// Date note: windowing runs in JS on purpose — the FLOW workbook import stored
// dates as ISO-8601 TEXT while Prisma writes epoch-ms INTEGER, so SQL range
// predicates silently drop imported rows on SQLite (same convention as
// notificationData.bucketTask).

import { DAY_MS, TASK_DASHBOARD_ROLES, TASK_TERMINAL_STATUS } from "../constants";

// ---------------------------------------------------------------------------
// Date primitives
// ---------------------------------------------------------------------------

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole-calendar-day index (UTC-noon trick avoids DST drift). */
function dayIndex(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Days from `from`'s calendar day to `to`'s calendar day (positive = to is later). */
export function calendarDaysBetween(from: Date, to: Date): number {
  return dayIndex(to) - dayIndex(from);
}

export function sameCalendarDay(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return dayIndex(a) === dayIndex(b);
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/** Terminal = the lifecycle ended: no widget, no reminder, no escalation. */
export function isTerminalStatus(status: string | null | undefined): boolean {
  return (TASK_TERMINAL_STATUS as readonly string[]).includes((status ?? "").toUpperCase());
}

/** "Active" for the dashboard = the work still lives (not terminal). */
export function isActiveTask(status: string | null | undefined): boolean {
  return !!status && !isTerminalStatus(status);
}

/** True for the PMO Administrator and Project Manager role codes. */
export function isTaskDashboardRole(roles: readonly string[] | null | undefined): boolean {
  if (!roles?.length) return false;
  const wanted = TASK_DASHBOARD_ROLES as readonly string[];
  return roles.some((r) => wanted.includes(r));
}

// ---------------------------------------------------------------------------
// The four date/status conditions
// ---------------------------------------------------------------------------

export type TaskWindowKey = "OVERDUE_7D" | "DUE_TODAY" | "UPCOMING_7D";

/**
 * Classify a due date against today's three date windows.
 *   OVERDUE_7D : [today-7d, today)  — the past 7 days, today excluded
 *   DUE_TODAY  : [today, tomorrow)  — the current system date (any time of day)
 *   UPCOMING_7D: [tomorrow, day+8)  — tomorrow through day+7 inclusive
 * Returns null for older overdue items and anything beyond the 7-day horizon
 * (older overdue items are still escalated by the e-mail engine).
 */
export function classifyDue(endDate: Date | null | undefined, now: Date): TaskWindowKey | null {
  if (!endDate) return null;
  const due = endDate.getTime();
  const today = startOfDay(now).getTime();
  const tomorrow = today + DAY_MS;
  if (due >= today && due < tomorrow) return "DUE_TODAY";
  if (due >= today - 7 * DAY_MS && due < today) return "OVERDUE_7D";
  if (due >= tomorrow && due < tomorrow + 7 * DAY_MS) return "UPCOMING_7D";
  return null;
}

export interface Windowed<T> {
  overdue: T[];
  dueToday: T[];
  upcoming: T[];
}

/** Split task rows into the three widgets; terminal-status rows are dropped. */
export function splitIntoWindows<T extends { endDate: Date | null; status: string }>(
  rows: readonly T[],
  now: Date
): Windowed<T> {
  const out: Windowed<T> = { overdue: [], dueToday: [], upcoming: [] };
  for (const row of rows) {
    if (!isActiveTask(row.status)) continue;
    const key = classifyDue(row.endDate, now);
    if (key === "OVERDUE_7D") out.overdue.push(row);
    else if (key === "DUE_TODAY") out.dueToday.push(row);
    else if (key === "UPCOMING_7D") out.upcoming.push(row);
  }
  // Oldest first: worst lateness at the top, soonest deadline next.
  out.overdue.sort((a, b) => (a.endDate!.getTime()) - (b.endDate!.getTime()));
  out.dueToday.sort((a, b) => (a.endDate!.getTime()) - (b.endDate!.getTime()));
  out.upcoming.sort((a, b) => (a.endDate!.getTime()) - (b.endDate!.getTime()));
  return out;
}

/** Positive = days late (overdue), negative = days until due, 0 = due today. */
export function dayDelta(endDate: Date, now: Date): number {
  return calendarDaysBetween(endDate, now);
}

// ---------------------------------------------------------------------------
// E-mail engine decisions (idempotency)
// ---------------------------------------------------------------------------

/**
 * Due-today trigger: fire only when the task's due date is the current system
 * date and this run hasn't already e-mailed for that day. Because the stamp is
 * compared per calendar day, a re-run (or the hourly local worker) can never
 * duplicate today's e-mail; if the due date is later moved to a new day, the
 * trigger legitimately fires again on the new due date.
 */
export function dueTodayEligible(
  endDate: Date | null | undefined,
  stampedAt: Date | null | undefined,
  now: Date
): boolean {
  if (!endDate) return false;
  if (classifyDue(endDate, now) !== "DUE_TODAY") return false;
  return !sameCalendarDay(stampedAt, now);
}

/**
 * Overdue escalation: fires while the due date has passed and the status is
 * not terminal — exactly once per calendar day (stamp from an earlier day is
 * refreshed). Stops forever on COMPLETED / CANCELLED / ON_HOLD.
 */
export function overdueEligible(
  endDate: Date | null | undefined,
  status: string,
  stampedAt: Date | null | undefined,
  now: Date
): boolean {
  if (!endDate) return false;
  if (!isActiveTask(status)) return false;
  if (endDate.getTime() >= startOfDay(now).getTime()) return false;
  return !sameCalendarDay(stampedAt, now);
}

// ---------------------------------------------------------------------------
// Recipient resolution (assignee → project owner → skip)
// ---------------------------------------------------------------------------

export interface RecipientRow {
  assigneeEmail?: string | null;
  ownerEmail?: string | null;
}

function address(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length >= 5 && v.includes("@") && !/\s/.test(v) ? v.toLowerCase() : null;
}

/**
 * "The assigned PMO/PM" — the task assignee first, the owning project's
 * manager as fallback, null when neither resolves (reported as skipped).
 */
export function resolveRecipient(row: RecipientRow): string | null {
  return address(row.assigneeEmail) ?? address(row.ownerEmail);
}

export interface RecipientGroups<T> {
  groups: { recipient: string; tasks: T[] }[];
  skipped: T[];
}

/** Bucket alert rows per e-mail address; rows without a recipient are skipped. */
export function groupByRecipient<T extends RecipientRow>(rows: readonly T[]): RecipientGroups<T> {
  const map = new Map<string, T[]>();
  const skipped: T[] = [];
  for (const row of rows) {
    const recipient = resolveRecipient(row);
    if (!recipient) {
      skipped.push(row);
      continue;
    }
    const bucket = map.get(recipient);
    if (bucket) bucket.push(row);
    else map.set(recipient, [row]);
  }
  const groups = [...map.entries()]
    .map(([recipient, tasks]) => ({ recipient, tasks }))
    .sort((a, b) => a.recipient.localeCompare(b.recipient));
  return { groups, skipped };
}

// ---------------------------------------------------------------------------
// Candidate selection (pure filters over already-fetched rows)
// ---------------------------------------------------------------------------

export interface DueTodayRow extends RecipientRow {
  endDate: Date | null;
  dueTodayEmailedAt: Date | null;
}

export interface OverdueRow extends RecipientRow {
  endDate: Date | null;
  status: string;
  overdueEmailedAt: Date | null;
}

export function selectDueTodayCandidates<T extends DueTodayRow>(rows: readonly T[], now: Date): T[] {
  return rows.filter((r) => dueTodayEligible(r.endDate, r.dueTodayEmailedAt, now));
}

export function selectOverdueCandidates<T extends OverdueRow>(rows: readonly T[], now: Date): T[] {
  return rows.filter((r) => overdueEligible(r.endDate, r.status, r.overdueEmailedAt, now));
}
