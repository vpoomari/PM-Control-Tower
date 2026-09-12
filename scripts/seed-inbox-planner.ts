// PM CONTROL TOWER — Non-destructive demo top-up
// Ensures every active user has (a) open work-inbox items and (b) focus-planner
// entries anchored to the CURRENT week. Never deletes or overwrites anything —
// safe to run against a live sandbox database. Run: npx tsx scripts/seed-inbox-planner.ts

import { db } from "../src/lib/db";
import { startOfWeek, addDays } from "../src/lib/constants";

const mins = (start: string, end: string) =>
  Math.round(((new Date(`2026-01-01T${end}:00`)).getTime() - (new Date(`2026-01-01T${start}:00`)).getTime()) / 60000);

const INBOX_BY_ROLE: Record<string, { category: string; title: string; message: string; priority: string; sourceType: string; actionUrl: string }[]> = {
  default: [
    { category: "ACTION_REQUIRED", title: "Weekly status update pending", message: "Your weekly status update is due — confirm progress, blockers and next steps.", priority: "MEDIUM", sourceType: "REPORT", actionUrl: "#/inbox" },
    { category: "ALERTS", title: "Governance threshold watch", message: "One of your tracked governance checks is approaching its warning threshold.", priority: "MEDIUM", sourceType: "ALERT", actionUrl: "#/governance" },
    { category: "GOVERNANCE", title: "Period governance summary ready", message: "The latest governance cycle summary is available for review.", priority: "LOW", sourceType: "GOVERNANCE", actionUrl: "#/governance" },
  ],
  "ceo@pmct.io": [
    { category: "GOVERNANCE", title: "CPI below target on strategic projects", message: "Two flagship projects are tracking under the cost-performance governance threshold this period.", priority: "HIGH", sourceType: "GOVERNANCE", actionUrl: "#/governance" },
    { category: "ACTION_REQUIRED", title: "Quarterly portfolio review sign-off", message: "Executive sign-off is requested on the quarterly portfolio performance narrative before the board pack is issued.", priority: "HIGH", sourceType: "REPORT", actionUrl: "#/governance" },
  ],
  "pmo@pmct.io": [
    { category: "ACTION_REQUIRED", title: "PMO operating review due", message: "Consolidate schedule, cost and governance exceptions into the weekly PMO operating review.", priority: "MEDIUM", sourceType: "REPORT", actionUrl: "#/governance" },
  ],
  "finance@pmct.io": [
    { category: "ACTION_REQUIRED", title: "Budget variance review due Friday", message: "Cost variance on the regulated workstream needs a finance position before the period close.", priority: "MEDIUM", sourceType: "FINANCE", actionUrl: "#/financials" },
  ],
  "auditor@pmct.io": [
    { category: "ACTION_REQUIRED", title: "Control evidence sampling ready", message: "Q3 control evidence bundle is ready for sampling — gate evidence and change approvals included.", priority: "LOW", sourceType: "AUDIT", actionUrl: "#/inbox" },
  ],
  "liam@pmct.io": [
    { category: "ACTION_REQUIRED", title: "Submit your weekly timesheet", message: "Last week's timesheet is still in draft — submit it so planned vs actual stays accurate.", priority: "MEDIUM", sourceType: "TIMESHEET", actionUrl: "#/timesheets" },
  ],
  "ava@pmct.io": [
    { category: "ACTION_REQUIRED", title: "Submit your weekly timesheet", message: "Last week's timesheet is still in draft — submit it so planned vs actual stays accurate.", priority: "MEDIUM", sourceType: "TIMESHEET", actionUrl: "#/timesheets" },
  ],
};

const PLANNER_BY_ROLE: Record<string, { title: string; type: string; weekday: number; start: string; end: string; prio: string }[]> = {
  default: [
    { title: "Weekly planning block", type: "FOCUS", weekday: 0, start: "09:00", end: "10:30", prio: "MEDIUM" },
    { title: "Team sync", type: "MEETING", weekday: 2, start: "11:00", end: "12:00", prio: "MEDIUM" },
    { title: "Focus: delivery work", type: "FOCUS", weekday: 3, start: "14:00", end: "16:00", prio: "HIGH" },
  ],
  "ceo@pmct.io": [
    { title: "Executive dashboard review", type: "FOCUS", weekday: 0, start: "09:00", end: "10:00", prio: "MEDIUM" },
    { title: "Portfolio steering committee", type: "MEETING", weekday: 2, start: "14:00", end: "15:00", prio: "HIGH" },
  ],
  "finance@pmct.io": [
    { title: "Month-end cost accruals", type: "TASK", weekday: 4, start: "09:00", end: "12:00", prio: "MEDIUM" },
  ],
  "auditor@pmct.io": [
    { title: "Control evidence sampling", type: "TASK", weekday: 3, start: "09:00", end: "11:00", prio: "LOW" },
  ],
};

async function main() {
  console.log("◈ PM Control Tower — inbox/planner top-up (non-destructive)…");
  const users = await db.user.findMany({ select: { id: true, email: true, name: true } });
  const monday = startOfWeek(new Date());
  const weekEnd = addDays(monday, 6);
  let inboxAdded = 0;
  let plannerAdded = 0;

  for (const u of users) {
    const openInbox = await db.inboxItem.count({ where: { userId: u.id, status: "OPEN" } });
    if (openInbox === 0) {
      const items = INBOX_BY_ROLE[u.email] ?? INBOX_BY_ROLE.default;
      for (const it of items) {
        await db.inboxItem.create({ data: { userId: u.id, category: it.category, title: it.title, message: it.message, entityType: "WorkItem", priority: it.priority, actionUrl: it.actionUrl, sourceType: it.sourceType } });
        inboxAdded += 1;
      }
    }

    const weekEntries = await db.plannerEntry.count({ where: { userId: u.id, date: { gte: monday, lte: weekEnd } } });
    if (weekEntries === 0) {
      const blocks = PLANNER_BY_ROLE[u.email] ?? PLANNER_BY_ROLE.default;
      for (const b of blocks) {
        await db.plannerEntry.create({ data: { userId: u.id, title: b.title, entryType: b.type, date: addDays(monday, b.weekday), startTime: b.start, endTime: b.end, durationMins: mins(b.start, b.end), priority: b.prio, status: "PLANNED", estimatedHours: Math.round((mins(b.start, b.end) / 60) * 10) / 10 } });
        plannerAdded += 1;
      }
    }
  }

  console.log(`  ✓ Users: ${users.length} — inbox items added: ${inboxAdded}, planner blocks added: ${plannerAdded} (week of ${monday.toISOString().slice(0, 10)})`);
  await db.$disconnect();
}

main().catch((e) => { console.error("Top-up failed:", e.message); process.exit(1); });
