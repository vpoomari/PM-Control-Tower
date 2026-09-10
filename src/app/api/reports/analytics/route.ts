// PM CONTROL TOWER — Analytics & trends
// GET /api/reports/analytics — health timeline per project, EVM history, timesheet weeks,
// RAID creation trend, task throughput (completed per month).

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { startOfWeek, round2 } from "@/lib/constants";

interface MonthBucket { month: string; count: number }

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export const GET = withApi(async () => {
  const now = new Date();
  const eightWeeksAgo = startOfWeek(new Date(now.getTime() - 8 * 7 * 86_400_000));
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setUTCDate(1);

  const [snapshots, evmPeriods, timesheets, risks, issues, completedTasks, projects] = await Promise.all([
    db.projectHealthSnapshot.findMany({
      orderBy: { capturedAt: "asc" },
      select: { projectId: true, capturedAt: true, healthScore: true, ragStatus: true, cpi: true, spi: true },
    }),
    db.evmPeriod.findMany({
      orderBy: { statusDate: "asc" },
      select: { projectId: true, statusDate: true, cpi: true, spi: true },
    }),
    db.timesheet.findMany({
      where: { weekStart: { gte: eightWeeksAgo }, status: { in: ["APPROVED", "LOCKED", "UNDER_REVIEW", "SUBMITTED"] } },
      select: { weekStart: true, status: true, totalHours: true, billableHours: true },
    }),
    db.risk.findMany({ where: { identifiedAt: { gte: sixMonthsAgo } }, select: { identifiedAt: true } }),
    db.issue.findMany({ where: { raisedAt: { gte: sixMonthsAgo } }, select: { raisedAt: true } }),
    db.task.findMany({
      where: { status: "COMPLETED", updatedAt: { gte: sixMonthsAgo } },
      select: { updatedAt: true },
    }),
    db.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  // ---- Health snapshot timeline: last 12 snapshots per project ----
  const byProject = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const arr = byProject.get(s.projectId);
    if (arr) arr.push(s);
    else byProject.set(s.projectId, [s]);
  }
  const healthTimeline = projects.map((p) => {
    const snaps = byProject.get(p.id) ?? [];
    return { projectId: p.id, projectCode: p.code, projectName: p.name, snapshots: snaps.slice(-12) };
  });

  // ---- EVM CPI/SPI history per project ----
  const evmByProject = new Map<string, typeof evmPeriods>();
  for (const e of evmPeriods) {
    const arr = evmByProject.get(e.projectId);
    if (arr) arr.push(e);
    else evmByProject.set(e.projectId, [e]);
  }
  const evmHistory = projects.map((p) => {
    const periods = evmByProject.get(p.id) ?? [];
    return { projectId: p.id, projectCode: p.code, periods: periods.slice(-12) };
  });

  // ---- Timesheet hours by week (last 8 weeks) ----
  const weekMap = new Map<string, { totalHours: number; billableHours: number; timesheets: number }>();
  for (let i = 0; i < 8; i++) {
    const w = startOfWeek(new Date(eightWeeksAgo.getTime() + i * 7 * 86_400_000));
    weekMap.set(w.toISOString().slice(0, 10), { totalHours: 0, billableHours: 0, timesheets: 0 });
  }
  for (const ts of timesheets) {
    const key = startOfWeek(ts.weekStart).toISOString().slice(0, 10);
    const bucket = weekMap.get(key);
    if (bucket) {
      bucket.totalHours = round2(bucket.totalHours + ts.totalHours);
      bucket.billableHours = round2(bucket.billableHours + ts.billableHours);
      bucket.timesheets += 1;
    }
  }
  const timesheetWeeks = [...weekMap.entries()].map(([weekStart, v]) => ({ weekStart, ...v }));

  // ---- RAID creation trend by month (last 6) ----
  const months = lastNMonths(6);
  const riskByMonth = new Map<string, number>(months.map((m) => [m, 0]));
  const issueByMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const r of risks) {
    const k = monthKey(r.identifiedAt);
    if (riskByMonth.has(k)) riskByMonth.set(k, (riskByMonth.get(k) ?? 0) + 1);
  }
  for (const i of issues) {
    const k = monthKey(i.raisedAt);
    if (issueByMonth.has(k)) issueByMonth.set(k, (issueByMonth.get(k) ?? 0) + 1);
  }
  const raidTrend: { month: string; risks: number; issues: number }[] = months.map((m) => ({ month: m, risks: riskByMonth.get(m) ?? 0, issues: issueByMonth.get(m) ?? 0 }));

  // ---- Throughput: tasks completed per month (last 6, by last-update proxy) ----
  const throughputByMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const t of completedTasks) {
    const k = monthKey(t.updatedAt);
    if (throughputByMonth.has(k)) throughputByMonth.set(k, (throughputByMonth.get(k) ?? 0) + 1);
  }
  const throughput: MonthBucket[] = months.map((m) => ({ month: m, count: throughputByMonth.get(m) ?? 0 }));

  return ok({
    generatedAt: now.toISOString(),
    healthTimeline,
    evmHistory,
    timesheetWeeks,
    raidTrend,
    throughput,
  });
}, { permission: "reports.view", rateLimit: { limit: 300, windowMs: 60_000 } });
