// PM CONTROL TOWER — Analytics Engine: Resource & Capacity module (EXECUTE pillar).
// 8 reports: billable utilization, allocation, non-billable time, skills gap,
// team velocity, timesheet variance, contractor vs FTE burn, leave impact.

import { round2 } from "../../constants";
import { AnalyticsContext } from "../context";
import { RawPayload, BRAND, SERIES_COLORS } from "../types";
import { ratePct, skillGap, utilizationPct } from "../formulas";

function distinctWeeks(ts: AnalyticsContext["timesheets"]): number {
  return new Set(ts.map((t) => new Date(t.weekStart).toISOString().slice(0, 10))).size || 1;
}

function resourceLabel(ctx: AnalyticsContext, id: string): string {
  const r = ctx.resources.find((x) => x.id === id);
  return r ? `${r.name} (${r.employeeCode})` : id;
}

// 9. BILLABLE UTILIZATION — billable hours / capacity, per resource + trend.
export function billableUtilization(ctx: AnalyticsContext): RawPayload {
  const weeks = distinctWeeks(ctx.timesheets);
  const byResource = ctx.resources.map((r) => {
    const mine = ctx.timesheets.filter((t) => t.resourceId === r.id);
    const billable = mine.reduce((s, t) => s + t.billableHours, 0);
    const capacity = r.capacityHoursPerWeek * weeks;
    return { resource: r.name, billable, capacity, pct: utilizationPct(billable, capacity) };
  });
  const totalBillable = byResource.reduce((s, r) => s + r.billable, 0);
  const totalCapacity = byResource.reduce((s, r) => s + r.capacity, 0);
  const over = byResource.filter((r) => r.pct > 100).length;
  const under = byResource.filter((r) => r.pct < 60).length;
  return {
    kpis: [
      { label: "Billable utilization", value: utilizationPct(totalBillable, totalCapacity), format: "pct", tone: totalBillable === 0 ? "default" : "info", sub: `${weeks} week(s) of timesheets` },
      { label: "Billable hours", value: round2(totalBillable), format: "hours" },
      { label: "Over capacity", value: over, format: "count", tone: over > 0 ? "warn" : "good" },
      { label: "Under 60%", value: under, format: "count", tone: under > 0 ? "warn" : "good" },
    ],
    charts: byResource.length && totalCapacity > 0
      ? [{ kind: "bar", title: "Utilization by resource", series: [{ label: "Billable %", color: BRAND.blue }], groups: byResource.map((r) => ({ label: r.resource, values: [r.pct], sublabel: `${r.billable}h / ${r.capacity}h` })), format: "pct", yMax: 120 }]
      : [],
    tables: [],
    notes: ["Utilization = Σ billableHours ÷ (capacityHoursPerWeek × weeks with timesheets)."],
    emptyHints: ctx.timesheets.length === 0
      ? ["No Timesheets submitted yet — resources log time in Time Tracking; utilization appears after the first approved week."]
      : undefined,
  };
}

// 10. RESOURCE ALLOCATION — assignment allocation vs 100%, over-allocation hot spots.
export function resourceAllocation(ctx: AnalyticsContext): RawPayload {
  const byResource = new Map<string, { pct: number; projects: Set<string>; planned: number; actual: number }>();
  for (const a of ctx.assignments) {
    if (a.status === "REMOVED" || a.status === "CANCELLED") continue;
    const cur = byResource.get(a.resourceId) ?? { pct: 0, projects: new Set<string>(), planned: 0, actual: 0 };
    cur.pct += a.allocationPercent; cur.projects.add(a.projectId); cur.planned += a.plannedHours; cur.actual += a.actualHours;
    byResource.set(a.resourceId, cur);
  }
  const rows = [...byResource.entries()].map(([id, v]) => ({
    resource: resourceLabel(ctx, id), allocation: round2(v.pct), projects: v.projects.size,
    planned: v.planned, actual: v.actual, state: v.pct > 100 ? "OVER" : v.pct === 0 ? "IDLE" : v.pct >= 100 ? "FULL" : "AVAILABLE",
  })).sort((a, b) => b.allocation - a.allocation);
  const over = rows.filter((r) => r.allocation > 100).length;
  const idle = ctx.resources.filter((r) => !byResource.has(r.id)).length;
  const avg = rows.length ? round2(rows.reduce((s, r) => s + r.allocation, 0) / rows.length) : 0;
  return {
    kpis: [
      { label: "Avg allocation", value: avg, format: "pct", tone: avg > 100 ? "warn" : "good" },
      { label: "Over-allocated", value: over, format: "count", tone: over > 0 ? "bad" : "good" },
      { label: "Unassigned resources", value: idle, format: "count", tone: idle > 0 ? "warn" : "good" },
      { label: "Active assignments", value: rows.length, format: "count", tone: "info" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Allocation by resource", series: [{ label: "Allocation %", color: BRAND.purple }], groups: rows.map((r) => ({ label: r.resource, values: [r.allocation] })), format: "pct", yMax: 150 }]
      : [],
    tables: rows.length
      ? [{ title: "Allocation detail", columns: [
          { key: "resource", header: "Resource" },
          { key: "allocation", header: "Allocation", format: "pct", align: "right" },
          { key: "projects", header: "Projects", format: "count", align: "right" },
          { key: "planned", header: "Planned h", format: "hours", align: "right" },
          { key: "actual", header: "Actual h", format: "hours", align: "right" },
          { key: "state", header: "State" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Allocation = Σ assignment.allocationPercent per resource; OVER when total exceeds 100%."],
    emptyHints: ctx.assignments.length === 0
      ? ["No Assignments captured yet — assign resources to projects/tasks in Resource Hub to see allocation."]
      : undefined,
  };
}

// 11. NON-BILLABLE TIME — non-billable + leave + overtime shares of logged time.
export function nonBillableTime(ctx: AnalyticsContext): RawPayload {
  const billable = ctx.timesheets.reduce((s, t) => s + t.billableHours, 0);
  const nonBillable = ctx.timesheets.reduce((s, t) => s + t.nonBillableHours, 0);
  const leave = ctx.timesheets.reduce((s, t) => s + t.leaveHours, 0);
  const overtime = ctx.timesheets.reduce((s, t) => s + t.overtimeHours, 0);
  const holiday = ctx.timesheets.reduce((s, t) => s + t.holidayHours, 0);
  const total = billable + nonBillable + leave + holiday;
  const byWeek = new Map<string, number>();
  for (const t of ctx.timesheets) {
    const k = new Date(t.weekStart).toISOString().slice(0, 10);
    byWeek.set(k, (byWeek.get(k) ?? 0) + t.nonBillableHours);
  }
  const weeks = [...byWeek.entries()].sort().map(([label, value]) => ({ label, value: round2(value) }));
  return {
    kpis: [
      { label: "Non-billable share", value: ratePct(nonBillable, total), format: "pct", tone: "info" },
      { label: "Non-billable hours", value: round2(nonBillable), format: "hours" },
      { label: "Overtime hours", value: round2(overtime), format: "hours", tone: overtime > 0 ? "warn" : "good" },
      { label: "Leave hours", value: round2(leave), format: "hours" },
    ],
    charts: total > 0
      ? [{ kind: "donut", title: "Logged time split", centerLabel: "Hours", slices: [
          { label: "Billable", value: round2(billable), color: BRAND.blue },
          { label: "Non-billable", value: round2(nonBillable), color: BRAND.purple },
          { label: "Leave", value: round2(leave), color: BRAND.emerald },
          { label: "Holiday", value: round2(holiday), color: BRAND.yellow },
        ].filter((s) => s.value > 0) },
        ...(weeks.length > 1 ? [{ kind: "area" as const, title: "Non-billable hours by week", points: weeks, color: BRAND.purple, format: "hours" as const }] : []),
      ]
      : [],
    tables: [],
    notes: ["Shares computed from submitted timesheet totals; overtime tracked separately (included in billable/non-billable splits by the tracker)."],
    emptyHints: ctx.timesheets.length === 0
      ? ["No Timesheets submitted yet — time entry in Time Tracking feeds this report."]
      : undefined,
  };
}

// 12. SKILLS GAP MATRIX — demand roles vs skill supply coverage.
export function skillsGap(ctx: AnalyticsContext): RawPayload {
  const demandMap = new Map<string, number>();
  for (const a of ctx.assignments) {
    const role = a.role || "UNSPECIFIED";
    demandMap.set(role, (demandMap.get(role) ?? 0) + 1);
  }
  const supplyMap = new Map<string, number>();
  for (const r of ctx.resources) {
    const parts = [r.primarySkill ?? "", ...(r.skills ? r.skills.split(/[;,]/) : [])].map((s) => s.trim()).filter(Boolean);
    for (const p of parts) supplyMap.set(p, (supplyMap.get(p) ?? 0) + 1);
  }
  const gaps = skillGap(
    [...demandMap.entries()].map(([role, headcount]) => ({ role, headcount })),
    [...supplyMap.entries()].map(([name, headcount]) => ({ name, headcount })),
  );
  const gapCount = gaps.filter((g) => g.gap > 0).length;
  const coveredPct = ratePct(gaps.filter((g) => g.gap === 0).length, gaps.length);
  return {
    kpis: [
      { label: "Roles demanded", value: gaps.length, format: "count" },
      { label: "Roles with gap", value: gapCount, format: "count", tone: gapCount > 0 ? "warn" : "good" },
      { label: "Coverage", value: coveredPct, format: "pct", tone: "info" },
      { label: "Skills in pool", value: supplyMap.size, format: "count" },
    ],
    charts: gaps.length
      ? [{ kind: "bar", title: "Demand vs covered (headcount)", series: [
          { label: "Demand", color: BRAND.coral },
          { label: "Covered", color: BRAND.emerald },
        ], groups: gaps.map((g) => ({ label: g.role, values: [g.demand, g.covered] })), format: "count" }]
      : [],
    tables: gaps.length
      ? [{ title: "Gap detail", columns: [
          { key: "role", header: "Role" },
          { key: "demand", header: "Demand", format: "count", align: "right" },
          { key: "covered", header: "Covered", format: "count", align: "right" },
          { key: "gap", header: "Gap", format: "count", align: "right" },
        ], rows: gaps as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Coverage is a loose text match between assignment roles and resource skills (primarySkill + skills list)."],
    emptyHints: ctx.assignments.length === 0 || supplyMap.size === 0
      ? ["Needs Resources (with skills/primarySkill) and Assignments (with roles) — capture both in Resource Hub."]
      : undefined,
  };
}

// 13. CROSS-FUNCTIONAL TEAM VELOCITY — sprint committed vs completed points.
export function teamVelocity(ctx: AnalyticsContext): RawPayload {
  const rows = ctx.sprints.map((s) => {
    const tasks = ctx.tasks.filter((t) => t.sprintId === s.id);
    const completed = tasks.filter((t) => t.status === "COMPLETED").reduce((sum, t) => sum + (t.storyPoints || 0), 0);
    const total = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0) || s.committedPoints;
    return { sprint: s.name, committed: s.committedPoints || total, completed, pct: ratePct(completed, total || s.committedPoints) };
  }).sort((a, b) => a.sprint.localeCompare(b.sprint));
  const withPoints = rows.filter((r) => r.committed > 0);
  const avg = withPoints.length ? round2(withPoints.reduce((s, r) => s + r.completed, 0) / withPoints.length) : 0;
  const last = withPoints[withPoints.length - 1];
  return {
    kpis: [
      { label: "Avg velocity", value: avg, format: "number", sub: "completed points / sprint" },
      { label: "Last sprint", value: last?.completed ?? 0, format: "number", tone: "info", sub: last?.sprint ?? "—" },
      { label: "Completion rate", value: ratePct(rows.reduce((s, r) => s + r.completed, 0), rows.reduce((s, r) => s + r.committed, 0)), format: "pct", tone: "info" },
      { label: "Sprints", value: rows.length, format: "count" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Committed vs completed points", series: [
          { label: "Committed", color: BRAND.slate },
          { label: "Completed", color: BRAND.emerald },
        ], groups: rows.map((r) => ({ label: r.sprint, values: [r.committed, r.completed] })), format: "number" }]
      : [],
    tables: [],
    notes: ["Completed points from sprint tasks with status COMPLETED; committed from Sprint.committedPoints."],
    emptyHints: ctx.sprints.length === 0
      ? ["No Sprints captured yet — sprint data arrives from the Agile board (sprint start creates the Sprint record)."]
      : undefined,
  };
}

// 14. TIMESHEET VARIANCE — assignment planned hours vs timesheet actuals + approval lag.
export function timesheetVariance(ctx: AnalyticsContext): RawPayload {
  const actualByResource = new Map<string, number>();
  for (const t of ctx.timesheets) actualByResource.set(t.resourceId, (actualByResource.get(t.resourceId) ?? 0) + t.totalHours);
  const plannedByResource = new Map<string, number>();
  for (const a of ctx.assignments) plannedByResource.set(a.resourceId, (plannedByResource.get(a.resourceId) ?? 0) + a.plannedHours);
  const ids = new Set([...actualByResource.keys(), ...plannedByResource.keys()]);
  const rows = [...ids].map((id) => {
    const planned = plannedByResource.get(id) ?? 0;
    const actual = actualByResource.get(id) ?? 0;
    return { resource: resourceLabel(ctx, id), planned, actual, variance: ratePct(actual - planned, planned || actual || 1) };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const lags = ctx.timesheets.filter((t) => t.submittedAt && t.approvedAt)
    .map((t) => (new Date(t.approvedAt!).getTime() - new Date(t.submittedAt!).getTime()) / 86_400_000);
  const avgLag = lags.length ? round2(lags.reduce((s, d) => s + d, 0) / lags.length) : 0;
  const pending = ctx.timesheets.filter((t) => !["APPROVED", "LOCKED"].includes(t.status)).length;
  return {
    kpis: [
      { label: "Approval lag", value: avgLag, format: "days", tone: avgLag > 5 ? "warn" : "good", sub: "submit → approve" },
      { label: "Pending timesheets", value: pending, format: "count", tone: pending > 0 ? "warn" : "good" },
      { label: "Planned hours", value: rows.reduce((s, r) => s + r.planned, 0), format: "hours" },
      { label: "Logged hours", value: rows.reduce((s, r) => s + r.actual, 0), format: "hours" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Planned vs logged hours", series: [
          { label: "Planned", color: BRAND.slate },
          { label: "Logged", color: BRAND.cyan },
        ], groups: rows.map((r) => ({ label: r.resource, values: [r.planned, r.actual] })), format: "hours" }]
      : [],
    tables: [],
    notes: ["Variance = (logged − planned) ÷ planned per resource, combining assignment plan and timesheet totals."],
    emptyHints: ctx.timesheets.length === 0 || ctx.assignments.length === 0
      ? ["Needs both Timesheets and Assignments — log time in Time Tracking, plan hours via Resource Hub assignments."]
      : undefined,
  };
}

// 15. CONTRACTOR VS FTE BURN RATE — hours and cost split by resource type.
export function contractorFteBurn(ctx: AnalyticsContext): RawPayload {
  const byResource = ctx.resources.map((r) => {
    const hours = ctx.timesheets.filter((t) => t.resourceId === r.id).reduce((s, t) => s + t.totalHours, 0);
    return { type: r.resourceType === "CONTRACTOR" ? "CONTRACTOR" : "FTE", hours, cost: round2(hours * (r.costRate || 0)) };
  });
  const fte = byResource.filter((r) => r.type === "FTE");
  const con = byResource.filter((r) => r.type === "CONTRACTOR");
  const sum = (arr: { cost: number }[]) => arr.reduce((s, r) => s + r.cost, 0);
  const sumH = (arr: { hours: number }[]) => arr.reduce((s, r) => s + r.hours, 0);
  const total = sum(byResource);
  return {
    kpis: [
      { label: "FTE burn", value: sum(fte), format: "money", sub: `${sumH(fte)}h` },
      { label: "Contractor burn", value: sum(con), format: "money", sub: `${sumH(con)}h` },
      { label: "Contractor share", value: ratePct(sum(con), total), format: "pct", tone: "info", sub: "of timed cost" },
      { label: "Blended rate", value: total > 0 && sumH(byResource) > 0 ? round2(total / sumH(byResource)) : 0, format: "money", sub: "per hour" },
    ],
    charts: total > 0 || sumH(byResource) > 0
      ? [{ kind: "donut", title: "Burn split by type", centerLabel: "Cost", slices: [
          { label: "FTE", value: sum(fte), color: BRAND.blue },
          { label: "Contractor", value: sum(con), color: BRAND.orange },
        ].filter((s) => s.value > 0) }]
      : [],
    tables: [],
    notes: ["Burn = logged hours × resource cost rate; FTE = all non-CONTRACTOR resource types."],
    emptyHints: total === 0 && sumH(byResource) === 0
      ? ["No logged hours yet — cost rates are on Resource records; burn appears once timesheets are submitted. Set cost rates in Resource Hub for costing."]
      : undefined,
  };
}

// 16. LEAVE & ABSENCE IMPACT — leave hours trend + coverage risk on heavily-loaded resources.
export function leaveImpact(ctx: AnalyticsContext): RawPayload {
  const byWeek = new Map<string, number>();
  for (const t of ctx.timesheets) {
    if (!t.leaveHours) continue;
    const k = new Date(t.weekStart).toISOString().slice(0, 10);
    byWeek.set(k, (byWeek.get(k) ?? 0) + t.leaveHours);
  }
  const weeks = [...byWeek.entries()].sort().map(([label, value]) => ({ label, value: round2(value) }));
  const allocation = new Map<string, number>();
  for (const a of ctx.assignments) allocation.set(a.resourceId, (allocation.get(a.resourceId) ?? 0) + a.allocationPercent);
  const atRisk = ctx.resources.filter((r) => {
    const leave = ctx.timesheets.filter((t) => t.resourceId === r.id).reduce((s, t) => s + t.leaveHours, 0);
    return leave > 0 && (allocation.get(r.id) ?? 0) >= 80;
  });
  const totalLeave = weeks.reduce((s, w) => s + w.value, 0);
  const coverageGap = round2(atRisk.reduce((s, r) => s + (allocation.get(r.id) ?? 0) * (ctx.timesheets.filter((t) => t.resourceId === r.id).reduce((x, t) => x + t.leaveHours, 0) / (r.capacityHoursPerWeek || 40)) * 0.01 * 40, 0));
  return {
    kpis: [
      { label: "Leave hours", value: totalLeave, format: "hours" },
      { label: "Weeks affected", value: weeks.length, format: "count" },
      { label: "Resources on leave + loaded", value: atRisk.length, format: "count", tone: atRisk.length > 0 ? "warn" : "good", sub: "≥80% allocation with leave" },
      { label: "Coverage gap (hrs)", value: coverageGap, format: "hours", tone: coverageGap > 0 ? "warn" : "good" },
    ],
    charts: weeks.length
      ? [{ kind: "area", title: "Leave hours by week", points: weeks, color: BRAND.emerald, format: "hours" }]
      : [],
    tables: atRisk.length
      ? [{ title: "Coverage risks", columns: [
          { key: "resource", header: "Resource" },
          { key: "allocation", header: "Allocation", format: "pct", align: "right" },
          { key: "leave", header: "Leave h", format: "hours", align: "right" },
        ], rows: atRisk.map((r) => ({
          resource: r.name, allocation: allocation.get(r.id) ?? 0,
          leave: round2(ctx.timesheets.filter((t) => t.resourceId === r.id).reduce((s, t) => s + t.leaveHours, 0)),
        })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Coverage gap estimates hours at risk = allocation × leave share of capacity for loaded resources."],
    emptyHints: totalLeave === 0
      ? ["No leave hours recorded yet — leave is logged on timesheets (leaveHours); record absence during time entry."]
      : undefined,
  };
}
