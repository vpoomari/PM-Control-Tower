// PM CONTROL TOWER — Prioritized Task Dashboard & task-alert engine unit tests.
//
// Covers the four widget conditions (spec):
//   Overdue (last 7 days) : due ∈ [today-7, today) AND status active
//   Due Today             : due date == current system date
//   Upcoming (next 7 days): due ∈ [tomorrow, day+7]
//   Action Not Taken      : stalled (recipient/role helpers here; DB facets in
//                           dashboard.ts — the predicates are exercised below)
// and both e-mail rules (spec):
//   due-today trigger  — exactly one e-mail per reached due date
//   overdue escalation — daily until COMPLETED / CANCELLED / ON_HOLD
// plus recipient fallback and the e-mail templates.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calendarDaysBetween,
  classifyDue,
  dueTodayEligible,
  groupByRecipient,
  isActiveTask,
  isTaskDashboardRole,
  isTerminalStatus,
  overdueEligible,
  resolveRecipient,
  sameCalendarDay,
  selectDueTodayCandidates,
  selectOverdueCandidates,
  splitIntoWindows,
} from "../../src/lib/priorities/windows";
import { buildDueTodayEmail, buildOverdueEmail, itemFrom } from "../../src/lib/priorities/templates";

// Fixed "now": Sunday 2026-11-02, 09:30 local — all windows measure from here.
const NOW = new Date(2026, 10, 2, 9, 30);
/** Date `offset` days from NOW at `h:m` local time. */
function at(offset: number, h = 0, m = 0): Date {
  return new Date(2026, 10, 2 + offset, h, m);
}

// ---------------------------------------------------------------------------
// Widget condition 1 — Overdue (last 7 days)
// ---------------------------------------------------------------------------

test("overdue: yesterday counts, boundary of exactly 7 days ago counts", () => {
  assert.equal(classifyDue(at(-1, 23, 59), NOW), "OVERDUE_7D");
  assert.equal(classifyDue(at(-7, 0, 0), NOW), "OVERDUE_7D", "today-7 00:00 is inside the window");
  assert.equal(classifyDue(at(-7, 18, 0), NOW), "OVERDUE_7D");
});

test("overdue: 8+ days late falls outside the 7-day widget (but escalation still covers it)", () => {
  assert.equal(classifyDue(at(-8), NOW), null);
  assert.equal(classifyDue(at(-90), NOW), null);
  assert.equal(overdueEligible(at(-90), "IN_PROGRESS", null, NOW), true, "engine escalates any age");
});

test("overdue: status must be active — terminal statuses never enter a widget", () => {
  assert.equal(isActiveTask("IN_PROGRESS"), true);
  assert.equal(isActiveTask("NOT_STARTED"), true);
  assert.equal(isActiveTask("BLOCKED"), true);
  for (const terminal of ["COMPLETED", "CANCELLED", "ON_HOLD"]) {
    assert.equal(isTerminalStatus(terminal), true, `${terminal} is terminal`);
    assert.equal(isActiveTask(terminal), false, `${terminal} is not active`);
    const out = splitIntoWindows([{ endDate: at(-1), status: terminal }], NOW);
    assert.equal(out.overdue.length + out.dueToday.length + out.upcoming.length, 0, `${terminal} never enters a widget`);
  }
});

// ---------------------------------------------------------------------------
// Widget condition 2 — Due Today
// ---------------------------------------------------------------------------

test("due today: matches the current system date at any hour of the day", () => {
  assert.equal(classifyDue(at(0, 0, 0), NOW), "DUE_TODAY");
  assert.equal(classifyDue(at(0, 9, 30), NOW), "DUE_TODAY");
  assert.equal(classifyDue(at(0, 23, 59), NOW), "DUE_TODAY");
});

test("due today: yesterday and tomorrow are not today", () => {
  assert.equal(classifyDue(at(-1, 12, 0), NOW), "OVERDUE_7D");
  assert.equal(classifyDue(at(1, 0, 0), NOW), "UPCOMING_7D");
  assert.equal(classifyDue(null, NOW), null, "no due date → no window");
});

// ---------------------------------------------------------------------------
// Widget condition 3 — Upcoming (next 7 days)
// ---------------------------------------------------------------------------

test("upcoming: tomorrow through day+7 inclusive", () => {
  assert.equal(classifyDue(at(1, 0, 0), NOW), "UPCOMING_7D");
  assert.equal(classifyDue(at(3, 12, 0), NOW), "UPCOMING_7D");
  assert.equal(classifyDue(at(7, 23, 59), NOW), "UPCOMING_7D", "day+7 end of day still counts");
});

test("upcoming: day+8 is beyond the horizon", () => {
  assert.equal(classifyDue(at(8, 0, 0), NOW), null);
});

// ---------------------------------------------------------------------------
// splitIntoWindows — the dashboard's bucketing
// ---------------------------------------------------------------------------

test("windows: splits, drops terminal rows, and sorts worst-first", () => {
  const rows = [
    { id: "a", status: "IN_PROGRESS", endDate: at(-2) },   // overdue
    { id: "b", status: "NOT_STARTED", endDate: at(-6) },   // overdue, later
    { id: "c", status: "BLOCKED", endDate: at(0, 17) },    // due today
    { id: "d", status: "IN_PROGRESS", endDate: at(2) },    // upcoming
    { id: "e", status: "COMPLETED", endDate: at(-1) },     // terminal → dropped
    { id: "f", status: "ON_HOLD", endDate: at(-3) },       // terminal → dropped
    { id: "g", status: "CANCELLED", endDate: at(0) },      // terminal → dropped
    { id: "h", status: "IN_PROGRESS", endDate: at(30) },   // outside windows
  ];
  const out = splitIntoWindows(rows, NOW);
  assert.deepEqual(out.overdue.map((r) => r.id), ["b", "a"], "oldest overdue first");
  assert.deepEqual(out.dueToday.map((r) => r.id), ["c"]);
  assert.deepEqual(out.upcoming.map((r) => r.id), ["d"]);
});

// ---------------------------------------------------------------------------
// E-mail rule 1 — Due Today trigger (single send per reached due date)
// ---------------------------------------------------------------------------

test("due-today trigger: fires once when the due date arrives", () => {
  assert.equal(dueTodayEligible(at(0, 0, 0), null, NOW), true, "first run of the due day");
  assert.equal(dueTodayEligible(at(0, 17, 0), null, NOW), true);
});

test("due-today trigger: same-day stamp suppresses repeats, earlier-day stamp re-arms", () => {
  assert.equal(dueTodayEligible(at(0), at(0, 7, 0), NOW), false, "already mailed today");
  assert.equal(dueTodayEligible(at(0), at(-3, 7, 0), NOW), true, "due date moved to a new day");
  assert.equal(dueTodayEligible(at(1), null, NOW), false, "not due yet");
  assert.equal(dueTodayEligible(null, null, NOW), false, "no due date");
});

// ---------------------------------------------------------------------------
// E-mail rule 2 — Overdue daily escalation (until Completed/Cancelled/On Hold)
// ---------------------------------------------------------------------------

test("overdue escalation: fires daily while active — yesterday's stamp does not block today", () => {
  assert.equal(overdueEligible(at(-1), "IN_PROGRESS", null, NOW), true, "first escalation");
  assert.equal(overdueEligible(at(-1), "IN_PROGRESS", at(-1, 9, 0), NOW), true, "next day fires again");
  assert.equal(overdueEligible(at(-1), "IN_PROGRESS", at(0, 7, 0), NOW), false, "same day is idempotent");
});

test("overdue escalation: stops forever on Completed, Cancelled or On Hold", () => {
  for (const status of ["COMPLETED", "CANCELLED", "ON_HOLD"]) {
    assert.equal(overdueEligible(at(-2), status, null, NOW), false, `${status} stops the escalation`);
    assert.equal(overdueEligible(at(-2), status, at(-1), NOW), false, `${status} keeps it stopped`);
  }
  assert.equal(overdueEligible(at(-2), "BLOCKED", null, NOW), true, "blocked still escalates");
});

test("overdue escalation: not overdue yet, or missing due date → never fires", () => {
  assert.equal(overdueEligible(at(0, 9, 30), "IN_PROGRESS", null, NOW), false, "due today is not overdue");
  assert.equal(overdueEligible(at(3), "IN_PROGRESS", null, NOW), false, "future due date");
  assert.equal(overdueEligible(null, "IN_PROGRESS", null, NOW), false);
});

test("candidate selectors apply the rules over fetched rows", () => {
  const rowsDue = [
    { endDate: at(0), dueTodayEmailedAt: null, assigneeEmail: "a@x.io", ownerEmail: null },
    { endDate: at(0), dueTodayEmailedAt: at(0, 7), assigneeEmail: "b@x.io", ownerEmail: null },
    { endDate: at(1), dueTodayEmailedAt: null, assigneeEmail: "c@x.io", ownerEmail: null },
  ];
  assert.equal(selectDueTodayCandidates(rowsDue, NOW).length, 1);

  const rowsOverdue = [
    { endDate: at(-1), status: "IN_PROGRESS", overdueEmailedAt: null, assigneeEmail: "a@x.io", ownerEmail: null },
    { endDate: at(-1), status: "IN_PROGRESS", overdueEmailedAt: at(0, 7), assigneeEmail: "b@x.io", ownerEmail: null },
    { endDate: at(-4), status: "COMPLETED", overdueEmailedAt: null, assigneeEmail: "c@x.io", ownerEmail: null },
    { endDate: at(-4), status: "CANCELLED", overdueEmailedAt: null, assigneeEmail: "d@x.io", ownerEmail: null },
    { endDate: at(-4), status: "ON_HOLD", overdueEmailedAt: null, assigneeEmail: "e@x.io", ownerEmail: null },
  ];
  assert.equal(selectOverdueCandidates(rowsOverdue, NOW).length, 1);
});

// ---------------------------------------------------------------------------
// Recipient resolution — assigned PMO/PM → project owner → skipped
// ---------------------------------------------------------------------------

test("recipient: assignee wins, inactive/absent assignee falls back to the owner", () => {
  assert.equal(resolveRecipient({ assigneeEmail: "pm@x.io", ownerEmail: "owner@x.io" }), "pm@x.io");
  assert.equal(resolveRecipient({ assigneeEmail: null, ownerEmail: "Owner@X.io " }), "owner@x.io", "trimmed + lowercased");
  assert.equal(resolveRecipient({ assigneeEmail: null, ownerEmail: null }), null);
  assert.equal(resolveRecipient({ assigneeEmail: "not-an-email", ownerEmail: null }), null, "garbage is skipped");
  assert.equal(resolveRecipient({ assigneeEmail: "has space@x.io", ownerEmail: null }), null);
});

test("recipient: grouping buckets rows per address and reports unroutable rows", () => {
  const rows = [
    { assigneeEmail: "a@x.io", ownerEmail: null, id: 1 },
    { assigneeEmail: "a@x.io", ownerEmail: null, id: 2 },
    { assigneeEmail: null, ownerEmail: "b@x.io", id: 3 },
    { assigneeEmail: null, ownerEmail: null, id: 4 },
  ];
  const { groups, skipped } = groupByRecipient(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { recipient: "a@x.io", tasks: [rows[0], rows[1]] });
  assert.deepEqual(groups[1], { recipient: "b@x.io", tasks: [rows[2]] });
  assert.deepEqual(skipped.map((r) => r.id), [4]);
});

// ---------------------------------------------------------------------------
// Role routing — PMO / PM land on the dashboard
// ---------------------------------------------------------------------------

test("dashboard roles: PMO_ADMIN and PROJECT_MANAGER route, others do not", () => {
  assert.equal(isTaskDashboardRole(["PMO_ADMIN"]), true);
  assert.equal(isTaskDashboardRole(["PROJECT_MANAGER"]), true);
  assert.equal(isTaskDashboardRole(["EXECUTIVE", "PROJECT_MANAGER"]), true);
  assert.equal(isTaskDashboardRole(["TEAM_MEMBER"]), false);
  assert.equal(isTaskDashboardRole(["EXECUTIVE"]), false);
  assert.equal(isTaskDashboardRole([]), false);
  assert.equal(isTaskDashboardRole(null), false);
});

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

test("calendar day math: whole-day deltas, calendar-day stamp equality", () => {
  assert.equal(calendarDaysBetween(at(-7), NOW), 7);
  assert.equal(calendarDaysBetween(at(3), NOW), -3);
  assert.equal(calendarDaysBetween(at(0, 23, 59), NOW), 0, "same calendar day → 0");
  assert.equal(sameCalendarDay(null, NOW), false);
  assert.equal(sameCalendarDay(at(0, 7, 0), NOW), true);
  assert.equal(sameCalendarDay(at(1, 7, 0), NOW), false);
  assert.equal(sameCalendarDay(at(-1, 7, 0), NOW), false);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test("template: due-today subject carries the real count and date", () => {
  const items = [
    itemFrom({ code: "T-1", name: "Deploy", projectName: "Apollo", endDate: at(0, 17) }, NOW),
    itemFrom({ code: "T-2", name: "Review", projectName: "Apollo", endDate: at(0, 17) }, NOW),
  ];
  const email = buildDueTodayEmail("pm@x.io", "Sarah Chen", items, NOW);
  assert.match(email.subject, /^Due today: 2 tasks need your attention \(\d{4}-\d{2}-\d{2}\)$/);
  assert.ok(email.html.includes("Tasks due today"));
  assert.ok(email.html.includes("Hi Sarah Chen,"), "greeting uses the recipient name");
  assert.ok(email.html.includes("T-1") && email.html.includes("Deploy"));
  assert.ok(email.preview.includes("T-1"));
});

test("template: overdue subject/body state the daily-escalation contract and lateness", () => {
  const items = [
    itemFrom({ code: "T-9", name: "Handover", projectName: "Orion", endDate: at(-3) }, NOW),
    itemFrom({ code: "T-4", name: "Signoff", projectName: "Orion", endDate: at(-1) }, NOW),
  ];
  const email = buildOverdueEmail("pm@x.io", null, items, NOW);
  assert.match(email.subject, /^OVERDUE: 2 tasks past due — daily escalation \(\d{4}-\d{2}-\d{2}\)$/);
  assert.ok(email.html.includes("3d late"), "worst lateness shown first");
  assert.ok(email.html.includes("Completed, Cancelled or On Hold"), "documents the stop rule");
  assert.ok(email.html.includes("Hi Pm,"), "greeting falls back to the address local part");
});

test("template: escaping neutralises markup and long lists are capped honestly", () => {
  const nasty = itemFrom(
    { code: "T-<x>", name: `<script>alert("x")</script>`, projectName: `A & B <"proj">`, endDate: at(0) },
    NOW
  );
  const email = buildDueTodayEmail("pm@x.io", `<img src=x>`, [nasty], NOW);
  assert.ok(!email.html.includes("<script>alert"), "task name escaped");
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(email.html.includes("A &amp; B &lt;&quot;proj&quot;&gt;"), "project name fully escaped");
  assert.ok(!email.html.includes("<img src=x>"), "recipient name escaped");

  const many = Array.from({ length: 60 }, (_, i) =>
    itemFrom({ code: `T-${i}`, name: `Task ${i}`, projectName: "P", endDate: at(0) }, NOW)
  );
  const capped = buildDueTodayEmail("pm@x.io", "Sam", many, NOW);
  assert.ok(capped.html.includes("…and 10 more"), "beyond 50 rows the overflow is reported");
});
