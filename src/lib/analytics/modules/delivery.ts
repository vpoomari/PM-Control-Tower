// PM CONTROL TOWER — Analytics Engine: Execution & Delivery module (MONITOR pillar).
// 12 reports: EVM summary, SPI, on-time delivery, sprint burndown, critical path,
// scope creep, dependencies, epic delivery, cycle time (roadmap), blocker aging,
// milestone variance, SLA compliance.

import { round2, dayNum } from "../../constants";
import { AnalyticsContext } from "../context";
import { RawPayload, BRAND, SERIES_COLORS } from "../types";
import { agingBucket, AGING_BUCKETS, bucketize, burndownSeries, onTimeStats, ratePct, slipDays } from "../formulas";
import { projectEvm, evmTotals } from "../evm";

const dateStr = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

// 17. EVM SUMMARY — BAC/PV/EV/AC + CPI/SPI/CV/SV portfolio and per project.
export function evmSummary(ctx: AnalyticsContext): RawPayload {
  const rows = projectEvm(ctx);
  const tot = evmTotals(rows);
  const cpi = tot.ac > 0 ? round2(tot.ev / tot.ac) : 1;
  const spi = tot.pv > 0 ? round2(tot.ev / tot.pv) : 1;
  const calculated = rows.filter((r) => r.source === "CALCULATED").length;
  return {
    kpis: [
      { label: "BAC", value: tot.bac, format: "money", sub: "budget at completion" },
      { label: "EV", value: tot.ev, format: "money", sub: `PV ${tot.pv.toFixed(0)} · AC ${tot.ac.toFixed(0)}` },
      { label: "CPI", value: cpi, format: "ratio", tone: cpi >= 1 ? "good" : cpi >= 0.9 ? "warn" : "bad" },
      { label: "SPI", value: spi, format: "ratio", tone: spi >= 1 ? "good" : spi >= 0.9 ? "warn" : "bad" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "PV / EV / AC by project", series: [
          { label: "PV", color: BRAND.slate },
          { label: "EV", color: BRAND.cyan },
          { label: "AC", color: BRAND.magenta },
        ], groups: rows.map((r) => ({ label: r.name, values: [r.pv, r.ev, r.ac] })), format: "money" }]
      : [],
    tables: rows.length
      ? [{ title: "EVM by project", columns: [
          { key: "project", header: "Project" },
          { key: "bac", header: "BAC", format: "money", align: "right" },
          { key: "pv", header: "PV", format: "money", align: "right" },
          { key: "ev", header: "EV", format: "money", align: "right" },
          { key: "ac", header: "AC", format: "money", align: "right" },
          { key: "cpi", header: "CPI", format: "ratio", align: "right" },
          { key: "spi", header: "SPI", format: "ratio", align: "right" },
          { key: "source", header: "Source" },
        ], rows: rows.map((r) => ({ project: r.name, bac: r.bac, pv: r.pv, ev: r.ev, ac: r.ac, cpi: r.cpi, spi: r.spi, source: r.source })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: [
      "EV = Σ plannedCost × progress; PV/AC from task plan/actuals unless a stored EvmPeriod exists.",
      calculated > 0 ? `${calculated} project(s) computed live from tasks (no stored EVM periods yet).` : "From stored monthly EVM periods.",
    ],
  };
}

// 18. SPI DASHBOARD — schedule performance gauge, trend, and band distribution.
export function spiDashboard(ctx: AnalyticsContext): RawPayload {
  const rows = projectEvm(ctx);
  const tot = evmTotals(rows);
  const spi = tot.pv > 0 ? round2(tot.ev / tot.pv) : 1;
  const trend = ctx.evmPeriods.length
    ? (() => {
        const byProject = new Map<string, number[]>();
        for (const p of ctx.evmPeriods) {
          const arr = byProject.get(p.projectId) ?? [];
          arr.push(p.spi); byProject.set(p.projectId, arr);
        }
        return ctx.evmPeriods.map((p) => ({ label: dateStr(p.statusDate).slice(0, 7), value: p.spi }));
      })()
    : ctx.healthSnapshots.map((h) => ({ label: dateStr(h.capturedAt).slice(0, 7), value: h.spi })).filter((p) => p.value > 0);
  const bands = bucketize(rows.map((r) => r.spi), [
    { label: "< 0.90", min: 0, max: 0.9 },
    { label: "0.90–1.00", min: 0.9, max: 1 },
    { label: "≥ 1.00", min: 1 },
  ]);
  const lateTasks = ctx.tasks.filter((t) => t.status !== "COMPLETED" && t.endDate && new Date(t.endDate).getTime() < ctx.now.getTime()).length;
  return {
    kpis: [
      { label: "Portfolio SPI", value: spi, format: "ratio", tone: spi >= 1 ? "good" : spi >= 0.9 ? "warn" : "bad" },
      { label: "SV", value: tot.scheduleVariance, format: "money", tone: tot.scheduleVariance >= 0 ? "good" : "warn", sub: "EV − PV" },
      { label: "Overdue tasks", value: lateTasks, format: "count", tone: lateTasks > 0 ? "warn" : "good" },
      { label: "Projects behind", value: rows.filter((r) => r.spi < 1).length, format: "count", tone: "info" },
    ],
    charts: [
      { kind: "gauge", title: "Portfolio SPI", value: spi, max: 1.3, goodAt: 1, format: "ratio", sublabel: spi >= 1 ? "On schedule" : "Behind schedule" },
      trend.length > 1 ? { kind: "area", title: "SPI trend", points: trend, color: BRAND.cyan, format: "ratio" } : null,
      Object.values(bands).some((v) => v > 0)
        ? { kind: "bar", title: "SPI distribution", series: [{ label: "Projects", color: BRAND.blue }], groups: Object.entries(bands).map(([label, value]) => ({ label, values: [value] })), format: "count" }
        : null,
    ].filter(Boolean) as RawPayload["charts"],
    tables: [],
    notes: ["SPI = EV ÷ PV. Trend from stored EVM periods, falling back to health snapshots."],
  };
}

// 19. OTD TRACKING — milestones + deliverables on-time percentage.
export function otdTracking(ctx: AnalyticsContext): RawPayload {
  const ms = onTimeStats(ctx.milestones.map((m) => ({ due: m.dueDate, actual: m.completedAt })));
  const dl = onTimeStats(ctx.deliverables.map((d) => ({ due: d.dueDate, actual: d.deliveredAt })));
  const pct = ratePct(ms.onTime + dl.onTime, ms.due + dl.due);
  const lateItems = [
    ...ctx.milestones.filter((m) => m.completedAt && m.dueDate && new Date(m.completedAt) > new Date(m.dueDate)).map((m) => ({ item: m.name, kind: "Milestone", due: dateStr(m.dueDate), actual: dateStr(m.completedAt), late: slipDays(m.dueDate, m.completedAt) })),
    ...ctx.deliverables.filter((d) => d.deliveredAt && d.dueDate && new Date(d.deliveredAt) > new Date(d.dueDate)).map((d) => ({ item: d.name, kind: "Deliverable", due: dateStr(d.dueDate), actual: dateStr(d.deliveredAt), late: slipDays(d.dueDate, d.deliveredAt) })),
  ].sort((a, b) => (b.late ?? 0) - (a.late ?? 0));
  return {
    kpis: [
      { label: "On-time delivery", value: pct, format: "pct", tone: pct >= 90 ? "good" : pct >= 70 ? "warn" : ms.due + dl.due === 0 ? "default" : "bad" },
      { label: "Delivered on time", value: ms.onTime + dl.onTime, format: "count" },
      { label: "Late deliveries", value: ms.late + dl.late, format: "count", tone: ms.late + dl.late > 0 ? "warn" : "good" },
      { label: "Still open", value: ms.total - ms.due + (dl.total - dl.due), format: "count", tone: "info" },
    ],
    charts: ms.due + dl.due > 0
      ? [{ kind: "donut", title: "Delivery outcomes", centerLabel: "Delivered", slices: [
          { label: "On time", value: ms.onTime + dl.onTime, color: BRAND.emerald },
          { label: "Late", value: ms.late + dl.late, color: BRAND.coral },
        ].filter((s) => s.value > 0) }]
      : [],
    tables: lateItems.length
      ? [{ title: "Late deliveries", columns: [
          { key: "item", header: "Item" },
          { key: "kind", header: "Type" },
          { key: "due", header: "Due" },
          { key: "actual", header: "Actual" },
          { key: "late", header: "Days late", format: "days", align: "right" },
        ], rows: lateItems.slice(0, 20) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["On time = actual date ≤ due date. Open items excluded from the rate."],
    emptyHints: ctx.milestones.length === 0 && ctx.deliverables.length === 0
      ? ["No Milestones or Deliverables captured yet — milestones come with the schedule; deliverables are added in Delivery tracking."]
      : undefined,
  };
}

// 20. SPRINT BURNDOWN / BURNUP — active sprint remaining points vs ideal.
export function sprintBurndown(ctx: AnalyticsContext): RawPayload {
  const active = ctx.sprints.find((s) => s.status === "ACTIVE") ?? ctx.sprints.filter((s) => s.status !== "COMPLETED").slice(-1)[0];
  if (!active || !active.startDate) {
    return {
      kpis: [{ label: "Active sprint", value: 0, format: "count", sub: "none in progress" }],
      charts: [], tables: [],
      notes: [],
      emptyHints: ["No active Sprint with a start date — start a sprint on the Agile board to see burndown."],
    };
  }
  const tasks = ctx.tasks.filter((t) => t.sprintId === active.id);
  const total = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0) || active.committedPoints;
  const start = dayNum(active.startDate);
  const end = active.endDate ? dayNum(active.endDate) : start + 13;
  const today = Math.min(dayNum(ctx.now), end);
  const steps: number[] = [];
  const labels: string[] = [];
  const nDays = Math.max(1, Math.min(today - start + 1, 30));
  for (let d = 0; d < nDays; d++) {
    const day = start + d;
    // Scheduled remaining: points on tasks whose planned end is after this day.
    const remaining = tasks.filter((t) => !t.endDate || dayNum(t.endDate) > day).reduce((s, t) => s + (t.storyPoints || 0), 0);
    steps.push(remaining);
    labels.push(`D+${d}`);
  }
  const done = tasks.filter((t) => t.status === "COMPLETED").reduce((s, t) => s + (t.storyPoints || 0), 0);
  const actualRemaining = Math.max(0, total - done);
  const ideal = burndownSeries(total, new Array(nDays).fill(total / Math.max(1, nDays)));
  return {
    kpis: [
      { label: "Sprint", value: active.name, format: "number", tone: "info" },
      { label: "Points remaining", value: actualRemaining, format: "number", tone: actualRemaining === 0 ? "good" : "warn" },
      { label: "Completed points", value: done, format: "number" },
      { label: "Scope (points)", value: total, format: "number" },
    ],
    charts: nDays > 1
      ? [{ kind: "bar", title: "Remaining points by day", series: [
          { label: "Scheduled remaining", color: BRAND.cyan },
          { label: "Ideal burn", color: BRAND.slate },
        ], groups: labels.map((label, i) => ({ label, values: [steps[i], ideal[i]] })), format: "number" }]
      : [],
    tables: [],
    notes: ["Scheduled remaining from task end-date distribution; ideal is a linear burn of the sprint scope."],
  };
}

// 21. CRITICAL PATH DELAY — critical tasks with negative float or overdue finish.
export function criticalPathDelay(ctx: AnalyticsContext): RawPayload {
  const critical = ctx.tasks.filter((t) => t.isCritical || t.criticality === "CRITICAL");
  const negative = critical.filter((t) => t.totalFloat < 0);
  const overdue = critical.filter((t) => t.status !== "COMPLETED" && t.endDate && new Date(t.endDate).getTime() < ctx.now.getTime());
  const worst = negative.slice().sort((a, b) => a.totalFloat - b.totalFloat)[0];
  const worstFinish = critical.filter((t) => t.earliestFinish && t.endDate)
    .map((t) => ({ task: t.name, delay: slipDays(t.endDate, t.earliestFinish) ?? 0 }))
    .sort((a, b) => b.delay - a.delay)[0];
  const rows = [...new Map([...negative, ...overdue].map((t) => [t.id, t])).values()]
    .sort((a, b) => a.totalFloat - b.totalFloat).slice(0, 15)
    .map((t) => ({ task: t.name, code: t.code, float: t.totalFloat, finish: dateStr(t.endDate), status: t.status }));
  return {
    kpis: [
      { label: "Critical tasks", value: critical.length, format: "count" },
      { label: "Negative float", value: negative.length, format: "count", tone: negative.length > 0 ? "bad" : "good" },
      { label: "Worst float", value: negative.length ? worst!.totalFloat : 0, format: "days", tone: "bad", sub: worst ? worst.name : "none" },
      { label: "Overdue critical", value: overdue.length, format: "count", tone: overdue.length > 0 ? "warn" : "good" },
    ],
    charts: critical.length
      ? [{ kind: "bar", title: "Total float of at-risk critical tasks (days)", series: [{ label: "Float", color: BRAND.coral }], groups: rows.slice(0, 10).map((r) => ({ label: r.code, values: [r.float] })), format: "days" }]
      : [],
    tables: rows.length
      ? [{ title: "At-risk critical tasks", columns: [
          { key: "code", header: "WBS" },
          { key: "task", header: "Task" },
          { key: "float", header: "Float", format: "days", align: "right" },
          { key: "finish", header: "Finish" },
          { key: "status", header: "Status" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Float from the CPM engine (task.totalFloat). Critical = isCritical or CRITICAL criticality.",
      worstFinish && worstFinish.delay > 0 ? `Largest earliest-finish slip: ${worstFinish.task} (+${worstFinish.delay}d).` : ""].filter(Boolean),
  };
}

// 22. SCOPE CREEP & CHANGE REQUESTS — CR volume, impact hours/cost, creep index.
export function scopeCreep(ctx: AnalyticsContext): RawPayload {
  const byStatus = new Map<string, number>();
  for (const c of ctx.changeRequests) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  const approved = ctx.changeRequests.filter((c) => ["APPROVED", "IMPLEMENTED", "CLOSED"].includes(c.status));
  const hours = approved.reduce((s, c) => s + c.impactHours, 0);
  const cost = approved.reduce((s, c) => s + c.impactCost, 0);
  const baselineHours = ctx.baselines.reduce((s, b) => s + b.baselineHours, 0);
  const creepIndex = ratePct(hours, baselineHours);
  return {
    kpis: [
      { label: "Change requests", value: ctx.changeRequests.length, format: "count" },
      { label: "Approved impact (h)", value: round2(hours), format: "hours" },
      { label: "Approved impact ($)", value: cost, format: "money" },
      { label: "Creep index", value: creepIndex, format: "pct", tone: creepIndex > 10 ? "bad" : creepIndex > 5 ? "warn" : "good", sub: "approved hours ÷ baseline hours" },
    ],
    charts: byStatus.size
      ? [{ kind: "donut", title: "CRs by status", centerLabel: "CRs", slices: [...byStatus.entries()].map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })) }]
      : [],
    tables: ctx.changeRequests.length
      ? [{ title: "Change requests", columns: [
          { key: "code", header: "CR" },
          { key: "title", header: "Title" },
          { key: "status", header: "Status" },
          { key: "hours", header: "Hours", format: "hours", align: "right" },
          { key: "cost", header: "Cost", format: "money", align: "right" },
          { key: "days", header: "Schedule (d)", format: "days", align: "right" },
        ], rows: ctx.changeRequests.map((c) => ({ code: c.code, title: c.title, status: c.status, hours: c.impactHours, cost: c.impactCost, days: c.scheduleImpactDays })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Creep index = approved CR hours ÷ baseline hours; shows how much scope has been added after baseline."],
    emptyHints: ctx.changeRequests.length === 0
      ? ["No Change Requests captured yet — raise CRs from a project workspace (Change Control) when scope shifts."]
      : undefined,
  };
}

// 23. CROSS-PROJECT DEPENDENCY — internal/external links, blocked successors.
export function dependencyMatrix(ctx: AnalyticsContext): RawPayload {
  const external = ctx.dependencies.filter((d) => d.isExternal);
  const taskById = new Map(ctx.tasks.map((t) => [t.id, t]));
  const blocked = ctx.dependencies.filter((d) => taskById.get(d.successorId)?.status === "BLOCKED");
  const crossProject = ctx.dependencies.filter((d) => {
    const a = taskById.get(d.predecessorId), b = taskById.get(d.successorId);
    return a && b && a.projectId !== b.projectId;
  });
  return {
    kpis: [
      { label: "Dependencies", value: ctx.dependencies.length, format: "count" },
      { label: "External", value: external.length, format: "count", tone: external.length > 0 ? "warn" : "good", sub: "outside the plan" },
      { label: "Cross-project", value: crossProject.length, format: "count", tone: "info" },
      { label: "Blocked successors", value: blocked.length, format: "count", tone: blocked.length > 0 ? "bad" : "good" },
    ],
    charts: ctx.dependencies.length
      ? [{ kind: "donut", title: "Dependency mix", centerLabel: "Links", slices: [
          { label: "Internal", value: ctx.dependencies.length - external.length, color: BRAND.blue },
          { label: "External", value: external.length, color: BRAND.orange },
        ].filter((s) => s.value > 0) }]
      : [],
    tables: external.length
      ? [{ title: "External dependencies", columns: [
          { key: "predecessor", header: "Predecessor" },
          { key: "successor", header: "Successor" },
          { key: "ref", header: "External ref" },
          { key: "succStatus", header: "Successor status" },
        ], rows: external.slice(0, 20).map((d) => ({
          predecessor: taskById.get(d.predecessorId)?.name ?? d.predecessorId,
          successor: taskById.get(d.successorId)?.name ?? d.successorId,
          ref: d.externalRef ?? "—",
          succStatus: taskById.get(d.successorId)?.status ?? "—",
        })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Blocked successors = successor task currently BLOCKED; external = dependency flagged outside this plan."],
    emptyHints: ctx.dependencies.length === 0
      ? ["No Dependencies captured yet — links are created in Schedule (task links) or arrive with the plan import."]
      : undefined,
  };
}

// 24. AGILE EPIC / FEATURE DELIVERY — epic progress from rolled-up task status.
export function epicDelivery(ctx: AnalyticsContext): RawPayload {
  const rows = ctx.epics.map((e) => {
    const tasks = ctx.tasks.filter((t) => t.epicId === e.id);
    const done = tasks.filter((t) => t.status === "COMPLETED").length;
    const overdue = tasks.filter((t) => t.status !== "COMPLETED" && t.endDate && new Date(t.endDate).getTime() < ctx.now.getTime()).length;
    return { epic: `${e.code} ${e.name}`, tasks: tasks.length, done, overdue, pct: ratePct(done, tasks.length) };
  }).sort((a, b) => a.pct - b.pct);
  const doneEpics = rows.filter((r) => r.tasks > 0 && r.done === r.tasks).length;
  return {
    kpis: [
      { label: "Epics", value: rows.length, format: "count" },
      { label: "Delivered epics", value: doneEpics, format: "count", tone: "good" },
      { label: "Avg progress", value: rows.length ? round2(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0, format: "pct", tone: "info" },
      { label: "Epics with overdue work", value: rows.filter((r) => r.overdue > 0).length, format: "count", tone: "warn" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Epic completion", series: [{ label: "Complete %", color: BRAND.purple }], groups: rows.map((r) => ({ label: r.epic, values: [r.pct] })), format: "pct" }]
      : [],
    tables: [],
    notes: ["Epic progress = completed tasks ÷ linked tasks (task.epicId)."],
    emptyHints: ctx.epics.length === 0
      ? ["No Epics captured yet — epics are created on the Agile board; link tasks to epics for roll-up."]
      : undefined,
  };
}

// 25. TASK COMPLETION CYCLE TIME — ROADMAP (needs TaskStatusHistory).
export const cycleTimeRoadmapNote =
  "True cycle time needs TaskStatusHistory (status transition timestamps), which is not captured yet. " +
  "Planned: cycle time = COMPLETED − IN_PROGRESS first transition per task, percentiled by WBS level and skill. " +
  "Schema extension documented in docs/ANALYTICS-ENGINE.md (additive model, db-push safe).";

// 26. BLOCKER AGING — open issues by age bucket and severity.
export function blockerAging(ctx: AnalyticsContext): RawPayload {
  const open = ctx.issues.filter((i) => !["RESOLVED", "CLOSED"].includes(i.status));
  const ages = open.map((i) => Math.max(0, dayNum(ctx.now) - dayNum(i.raisedAt)));
  const buckets = bucketize(ages, AGING_BUCKETS.map((b) => ({
    label: b,
    min: b === "0-7" ? 0 : b === "8-14" ? 8 : b === "15-30" ? 15 : b === "31-60" ? 31 : 61,
    max: b === "0-7" ? 8 : b === "8-14" ? 15 : b === "15-30" ? 31 : b === "31-60" ? 61 : undefined,
  })));
  const sev = new Map<string, number>();
  for (const i of open) sev.set(i.severity || "—", (sev.get(i.severity || "—") ?? 0) + 1);
  const overdue = open.filter((i) => i.dueDate && new Date(i.dueDate).getTime() < ctx.now.getTime()).length;
  const oldest = ages.length ? Math.max(...ages) : 0;
  return {
    kpis: [
      { label: "Open blockers", value: open.length, format: "count", tone: open.length > 5 ? "warn" : "default" },
      { label: "Oldest open", value: oldest, format: "days", tone: oldest > 30 ? "bad" : oldest > 14 ? "warn" : "good" },
      { label: "Past due", value: overdue, format: "count", tone: overdue > 0 ? "bad" : "good" },
      { label: "Avg age", value: ages.length ? round2(ages.reduce((s, a) => s + a, 0) / ages.length) : 0, format: "days", tone: "info" },
    ],
    charts: [
      Object.values(buckets).some((v) => v > 0)
        ? { kind: "bar", title: "Open issues by age", series: [{ label: "Issues", color: BRAND.coral }], groups: Object.entries(buckets).map(([label, value]) => ({ label, values: [value] })), format: "count" }
        : null,
      sev.size ? { kind: "donut", title: "By severity", centerLabel: "Issues", slices: [...sev.entries()].map(([label, value], i) => ({ label, value, color: [BRAND.coral, BRAND.orange, BRAND.yellow, BRAND.slate][i % 4] })) } : null,
    ].filter(Boolean) as RawPayload["charts"],
    tables: open.length
      ? [{ title: "Open issues", columns: [
          { key: "code", header: "Issue" },
          { key: "title", header: "Title" },
          { key: "severity", header: "Severity" },
          { key: "age", header: "Age", format: "days", align: "right" },
          { key: "due", header: "Due" },
        ], rows: open.map((i) => ({
          code: i.code, title: i.title, severity: i.severity,
          age: Math.max(0, dayNum(ctx.now) - dayNum(i.raisedAt)), due: dateStr(i.dueDate),
        })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Age = days since raisedAt for issues not yet resolved/closed."],
    emptyHints: ctx.issues.length === 0
      ? ["No Issues captured yet — blockers are raised in a project workspace (Issues tab)."]
      : undefined,
  };
}

// 27. MILESTONE VARIANCE — completed milestone slip + upcoming pressure.
export function milestoneVariance(ctx: AnalyticsContext): RawPayload {
  const completed = ctx.milestones.filter((m) => m.completedAt);
  const variances = completed.map((m) => ({ name: m.name, against: dateStr(m.baselineDate ?? m.dueDate), actual: dateStr(m.completedAt), days: slipDays(m.baselineDate ?? m.dueDate, m.completedAt) }));
  const withVar = variances.filter((v) => v.days !== null) as { days: number }[];
  const avg = withVar.length ? round2(withVar.reduce((s, v) => s + v.days, 0) / withVar.length) : 0;
  const late = withVar.filter((v) => v.days > 0).length;
  const in30 = ctx.now.getTime() + 30 * 86_400_000;
  const upcoming = ctx.milestones.filter((m) => m.status !== "COMPLETED" && m.dueDate && new Date(m.dueDate).getTime() <= in30).length;
  return {
    kpis: [
      { label: "Milestones", value: ctx.milestones.length, format: "count" },
      { label: "Avg variance", value: avg, format: "days", tone: avg > 7 ? "bad" : avg > 0 ? "warn" : "good", sub: "actual − baseline/due" },
      { label: "Late completions", value: late, format: "count", tone: late > 0 ? "warn" : "good" },
      { label: "Due in 30 days", value: upcoming, format: "count", tone: "info" },
    ],
    charts: variances.length
      ? [{ kind: "bar", title: "Completion variance (days)", series: [{ label: "Variance", color: BRAND.orange }], groups: variances.map((v) => ({ label: v.name, values: [v.days ?? 0] })), format: "days" }]
      : [],
    tables: ctx.milestones.length
      ? [{ title: "Milestones", columns: [
          { key: "name", header: "Milestone" },
          { key: "against", header: "Baseline/Due" },
          { key: "actual", header: "Actual" },
          { key: "days", header: "Variance", format: "days", align: "right" },
        ], rows: variances as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Variance = completedAt − (baselineDate || dueDate). Positive = late."],
    emptyHints: ctx.milestones.length === 0
      ? ["No Milestones captured yet — milestones arrive with the schedule import or are added in Plan."]
      : undefined,
  };
}

// 28. SLA COMPLIANCE — issues resolved by due date + RFI response times.
export function slaCompliance(ctx: AnalyticsContext): RawPayload {
  const resolved = ctx.issues.filter((i) => i.resolvedAt);
  const met = resolved.filter((i) => !i.dueDate || new Date(i.resolvedAt!) <= new Date(i.dueDate)).length;
  const breached = resolved.length - met;
  const openPastDue = ctx.issues.filter((i) => !i.resolvedAt && i.dueDate && new Date(i.dueDate).getTime() < ctx.now.getTime()).length;
  const rfiSlaDays = (p: string) => (p === "CRITICAL" ? 1 : p === "HIGH" ? 3 : p === "MEDIUM" ? 5 : 10);
  const rfisAnswered = ctx.rfis.filter((r) => r.dateAnswered);
  const rfiMet = rfisAnswered.filter((r) => (dayNum(r.dateAnswered!) - dayNum(r.dateOpened)) <= rfiSlaDays(r.priority)).length;
  const totalMet = met + rfiMet, totalDone = resolved.length + rfisAnswered.length;
  return {
    kpis: [
      { label: "SLA compliance", value: ratePct(totalMet, totalDone), format: "pct", tone: totalMet === totalDone && totalDone > 0 ? "good" : totalDone === 0 ? "default" : "warn" },
      { label: "Breaches", value: breached + (rfisAnswered.length - rfiMet), format: "count", tone: "warn" },
      { label: "Open past due", value: openPastDue, format: "count", tone: openPastDue > 0 ? "bad" : "good" },
      { label: "Avg RFI response", value: rfisAnswered.length ? round2(rfisAnswered.reduce((s, r) => s + (dayNum(r.dateAnswered!) - dayNum(r.dateOpened)), 0) / rfisAnswered.length) : 0, format: "days", tone: "info" },
    ],
    charts: totalDone > 0
      ? [{ kind: "donut", title: "SLA outcomes", centerLabel: "Closed", slices: [
          { label: "Within SLA", value: totalMet, color: BRAND.emerald },
          { label: "Breached", value: totalDone - totalMet, color: BRAND.coral },
        ].filter((s) => s.value > 0) }]
      : [],
    tables: [],
    notes: ["Issue SLA = resolved by dueDate. RFI SLA by priority: CRITICAL 1d, HIGH 3d, MEDIUM 5d, LOW 10d (documented policy default)."],
    emptyHints: totalDone === 0
      ? ["No resolved Issues or answered RFIs yet — SLA compliance computes once items are closed with dates."]
      : undefined,
  };
}
