// PM CONTROL TOWER — Daily e-mail reminder unit tests (deterministic).
// Covers the pure bucketing helpers in notificationData (task flags, due /
// overdue windows, person + e-mail keying) and the HTML template contract in
// emailTemplates (escaping, section gating, honest counts, subject line).
// No DB queries, no network, no e-mail is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startOfDay, endOfDay, bucketTask, isDueOrOverdue, isOverdue,
  personKey, isEmailLike,
} from "../../src/lib/notificationData";
import { buildReminderEmail, escapeHtml } from "../../src/lib/emailTemplates";
import type { OwnerReminders } from "../../src/lib/notificationData";

const NOW = new Date("2026-10-26T09:30:00.000Z"); // Monday

// ---------- date windows ----------
test("reminders: today window spans local midnight → 23:59:59.999", () => {
  const s = startOfDay(NOW);
  const e = endOfDay(NOW);
  assert.equal(s.getHours(), 0);
  assert.equal(s.getMinutes(), 0);
  assert.equal(e.getHours(), 23);
  assert.equal(e.getMinutes(), 59);
  assert.ok(s.getTime() < NOW.getTime() && NOW.getTime() < e.getTime());
});

// ---------- task bucketing ----------
test("reminders: a task ending before today is OVERDUE", () => {
  const due = new Date("2026-10-25T12:00:00.000Z");
  assert.equal(bucketTask(new Date("2026-10-20T00:00:00.000Z"), due, NOW), "OVERDUE");
});

test("reminders: a task ending today is ENDING_TODAY (even if already late in the day)", () => {
  const start = new Date("2026-10-20T00:00:00.000Z");
  const end = new Date("2026-10-26T17:00:00.000Z"); // later today
  assert.equal(bucketTask(start, end, NOW), "ENDING_TODAY");
});

test("reminders: a task starting today with a future end is STARTING_TODAY", () => {
  const start = new Date("2026-10-26T08:00:00.000Z");
  const end = new Date("2026-11-06T17:00:00.000Z");
  assert.equal(bucketTask(start, end, NOW), "STARTING_TODAY");
});

test("reminders: a task with no relevant dates produces no reminder", () => {
  assert.equal(bucketTask(new Date("2026-11-01T00:00:00.000Z"), null, NOW), null);
  assert.equal(bucketTask(null, null, NOW), null);
});

test("reminders: null due dates are neither due nor overdue", () => {
  assert.equal(isDueOrOverdue(null, NOW), false);
  assert.equal(isOverdue(null, NOW), false);
});

test("reminders: due = end of today, overdue = before today started", () => {
  const endOfToday = endOfDay(NOW);
  const startOfToday = startOfDay(NOW);
  assert.equal(isDueOrOverdue(endOfToday, NOW), true, "due today counts");
  assert.equal(isDueOrOverdue(startOfToday, NOW), true, "due at midnight counts");
  assert.equal(isOverdue(endOfToday, NOW), false, "due today is not overdue yet");
  assert.equal(isOverdue(startOfToday, NOW), false, "midnight today is not overdue");
  assert.equal(isOverdue(new Date(startOfToday.getTime() - 1), NOW), true);
});

// ---------- person / e-mail keying ----------
test("reminders: person keys are trimmed and case-insensitive", () => {
  assert.equal(personKey("  Jane Doe "), personKey("jane doe"));
  assert.equal(personKey(undefined), "");
  assert.equal(personKey(null), "");
});

test("reminders: e-mail sanity rejects empty, whitespace and local-only values", () => {
  assert.equal(isEmailLike("jane.doe@czarnikow.com"), true);
  assert.equal(isEmailLike("jane doe@czarnikow.com"), false, "spaces are invalid");
  assert.equal(isEmailLike("jane"), false, "no @");
  assert.equal(isEmailLike("jane@"), false, "no domain dot");
  assert.equal(isEmailLike(""), false);
  assert.equal(isEmailLike(null), false);
});

// ---------- template ----------
const OWNER: OwnerReminders = {
  email: "jane.doe@czarnikow.com",
  name: "Jane <script>Doe</script>",
  tasks: [
    { flag: "OVERDUE", code: "T-12", name: "Baseline & save plan", project: "PRJ-CZR-FLOW — FLOW", due: "2026-10-24T17:00:00.000Z", status: "IN_PROGRESS", priority: "HIGH" },
    { flag: "ENDING_TODAY", code: "T-08", name: "Kickoff deck", project: "PRJ-CZR-FLOW — FLOW", due: "2026-10-26T17:00:00.000Z", status: "IN_PROGRESS", priority: "MEDIUM" },
  ],
  raid: [
    { kind: "RISK", code: "R-03", title: "Resource contention", project: "PRJ-CZR-FLOW — FLOW", due: "2026-10-20T17:00:00.000Z", overdue: true, status: "OPEN", severity: "HIGH" },
    { kind: "DECISION", code: "D-01", title: "Approve budget uplift", project: null, due: null, overdue: false, status: "ACTIVE", severity: "CRITICAL" },
  ],
  evm: [
    { kind: "EVM_BEHIND", project: "PRJ-CZR-FLOW — FLOW", detail: "Latest status period is below threshold (SPI 0.90 / CPI 0.90).", spi: 0.81, cpi: 0.94 },
    { kind: "STATUS_UPDATE", project: "PRJ-CZR-OPS — OPS", detail: "No status update since 2026-10-10 — weekly progress update due.", spi: null, cpi: null },
  ],
};

test("template: subject carries the real item count and date", () => {
  const { subject } = buildReminderEmail(OWNER, NOW);
  assert.match(subject, /^Control Tower daily reminder — 6 items need your attention \(2026-10-26\)$/);
});

test("template: escaping neutralises markup in every interpolated field", () => {
  const { html, subject } = buildReminderEmail(OWNER, NOW);
  assert.ok(!html.includes("<script>"), "no raw <script> survives");
  assert.ok(!subject.includes("<script>"), "subject is plain text");
  assert.ok(html.includes("Jane &lt;script&gt;Doe&lt;/script&gt;"), "owner name is escaped");
  assert.ok(escapeHtml(`&<>"'`) === "&amp;&lt;&gt;&quot;&#39;");
});

test("template: only sections with items render, and counts are honest", () => {
  const { html } = buildReminderEmail(OWNER, NOW);
  assert.ok(html.includes(">Tasks<"), "tasks section present");
  assert.ok(html.includes(">RAID<"), "raid section present");
  assert.ok(html.includes(">EVM &amp; status<"), "evm section present");
  // Count badges: 2 tasks, 2 raid, 2 alerts (section badges) + 6 total (header)
  assert.ok(html.includes(">2</span>"));
  assert.ok(html.includes(">6<br>"), "total badge matches the 6 real items");

  const empty: OwnerReminders = { ...OWNER, tasks: [], raid: [], evm: [] };
  const solo = buildReminderEmail(empty, NOW);
  assert.ok(!solo.html.includes(">Tasks<"), "empty owner sees no tasks section");
  assert.match(solo.subject, /0 items need your attention/);
  assert.equal(solo.preview, "No open items");

  // Singular grammar for a single item (the cron only ever mails non-empty owners)
  const single = buildReminderEmail({ ...OWNER, raid: [], evm: [], tasks: OWNER.tasks.slice(0, 1) }, NOW);
  assert.match(single.subject, /1 item needs your attention/);
});

test("template: due dates render as plain dates, overdue flags shown", () => {
  const { html } = buildReminderEmail(OWNER, NOW);
  assert.ok(html.includes("2026-10-24"), "overdue task due date shown");
  assert.ok(/\(\d+d late\)/.test(html), "overdue RAID item shows lateness");
});

test("template: outgoing message is table-based with inline styles only", () => {
  const { html } = buildReminderEmail(OWNER, NOW);
  assert.ok(html.includes("<!DOCTYPE html>"));
  assert.ok(!html.includes("<style"), "email clients strip <style> — inline styles only");
  assert.ok(html.includes("role=\"presentation\""), "layout tables are hidden from a11y trees");
});
