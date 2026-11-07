// PM CONTROL TOWER — Analytics Engine: Planning & Initiation module (PLAN pillar).
// 8 reports: strategic alignment, feasibility & ROI, capacity demand, baseline
// definition, stakeholder mapping, vendor readiness, initial risk, phase-gate.

import { round2 } from "../../constants";
import { AnalyticsContext } from "../context";
import { RawPayload, BRAND, SERIES_COLORS } from "../types";
import { heatBand, ratePct, riskExposure, variancePct } from "../formulas";

const band = (v: string | null | undefined): string => {
  const s = (v ?? "").toUpperCase();
  return s === "HIGH" || s === "MEDIUM" ? s : "LOW";
};

// 1. STRATEGIC PORTFOLIO ALIGNMENT — projects linked to strategic objectives.
export function strategicAlignment(ctx: AnalyticsContext): RawPayload {
  const objectives = ctx.strategicObjectives;
  const byObj = new Map<string, { n: number; budget: number; health: number }>();
  for (const o of objectives) byObj.set(o.id, { n: 0, budget: 0, health: 0 });
  let linked = 0, linkedBudget = 0, healthSum = 0;
  for (const p of ctx.projects) {
    const id = p.strategicObjectiveId;
    if (id && byObj.has(id)) {
      linked += 1; linkedBudget += p.currentBudget; healthSum += p.healthScore;
      const b = byObj.get(id)!; b.n += 1; b.budget += p.currentBudget; b.health += p.healthScore;
    }
  }
  const total = ctx.projects.length;
  const names = new Map(objectives.map((o) => [o.id, o.name]));
  const slices: { label: string; value: number; color: string }[] = objectives
    .map((o, i) => ({ label: o.name, value: byObj.get(o.id)!.n, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    .filter((s) => s.value > 0);
  if (total - linked > 0) slices.push({ label: "Unaligned", value: total - linked, color: BRAND.slate });
  const rows = objectives.map((o) => {
    const b = byObj.get(o.id)!;
    return { objective: o.name, projects: b.n, budget: b.budget, avgHealth: b.n ? round2(b.health / b.n) : 0 };
  });
  const unlinkedProjects = ctx.projects.filter((p) => !p.strategicObjectiveId || !names.has(p.strategicObjectiveId));
  if (unlinkedProjects.length) {
    rows.push({ objective: "Unaligned", projects: unlinkedProjects.length, budget: unlinkedProjects.reduce((s, p) => s + p.currentBudget, 0), avgHealth: 0 });
  }
  return {
    kpis: [
      { label: "Alignment coverage", value: ratePct(linked, total), format: "pct", tone: linked === total ? "good" : total === 0 ? "default" : "warn", sub: `${linked} of ${total} projects linked` },
      { label: "Aligned budget", value: linkedBudget, format: "money", sub: "current budget on linked projects" },
      { label: "Avg health (linked)", value: linked ? round2(healthSum / linked) : 0, format: "number", tone: "info" },
      { label: "Unaligned projects", value: total - linked, format: "count", tone: total - linked > 0 ? "warn" : "good" },
    ],
    charts: slices.length
      ? [{ kind: "donut", title: "Projects per objective", slices, centerLabel: "Projects" }]
      : [],
    tables: rows.length
      ? [{ title: "Objective coverage", columns: [
          { key: "objective", header: "Strategic objective" },
          { key: "projects", header: "Projects", format: "count", align: "right" },
          { key: "budget", header: "Budget", format: "money", align: "right" },
          { key: "avgHealth", header: "Avg health", format: "number", align: "right" },
        ], rows }]
      : [],
    notes: ["Alignment = project.strategicObjectiveId → StrategicObjective; portfolio text objectives counted separately."],
    emptyHints: objectives.length === 0
      ? ["No Strategic Objectives captured yet — add them under Admin → Strategy, then link each project's strategy field. Portfolio.strategicObjective text is shown on the Portfolio page."]
      : undefined,
  };
}

// 2. FEASIBILITY & ROI — business cases, NPV/IRR/payback/recommendation.
export function feasibilityRoi(ctx: AnalyticsContext): RawPayload {
  const parsed = ctx.businessCases.map((bc) => {
    let m: Record<string, unknown> = {};
    try { m = JSON.parse(bc.computedJson || "{}") as Record<string, unknown>; } catch { m = {}; }
    const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
    return {
      case: bc.name, status: bc.status, recommendation: bc.recommendation || "—",
      npv: num("npv"), irr: num("irr"), payback: num("payback"),
      approved: bc.approvedAmount,
    };
  });
  const withNpv = parsed.filter((p) => p.npv !== null) as { npv: number }[];
  const avgNpv = withNpv.length ? round2(withNpv.reduce((s, p) => s + p.npv, 0) / withNpv.length) : 0;
  const withIrr = parsed.filter((p) => p.irr !== null) as { irr: number }[];
  const avgIrr = withIrr.length ? round2(withIrr.reduce((s, p) => s + p.irr, 0) / withIrr.length) : 0;
  const positive = withNpv.filter((p) => p.npv > 0).length;
  const recs = new Map<string, number>();
  for (const p of parsed) recs.set(p.recommendation, (recs.get(p.recommendation) ?? 0) + 1);
  const sliceColors = [BRAND.emerald, BRAND.orange, BRAND.coral, BRAND.blue, BRAND.purple];
  return {
    kpis: [
      { label: "Business cases", value: parsed.length, format: "count" },
      { label: "Avg NPV", value: avgNpv, format: "money", tone: avgNpv > 0 ? "good" : parsed.length ? "warn" : "default" },
      { label: "Avg IRR", value: avgIrr, format: "pct", tone: avgIrr > 0 ? "good" : "default" },
      { label: "Positive NPV share", value: ratePct(positive, withNpv.length), format: "pct", tone: "info" },
    ],
    charts: recs.size
      ? [{ kind: "donut", title: "Recommendations", slices: [...recs.entries()].map(([label, value], i) => ({ label, value, color: sliceColors[i % sliceColors.length] })), centerLabel: "Cases" }]
      : [],
    tables: parsed.length
      ? [{ title: "Case economics", columns: [
          { key: "case", header: "Business case" },
          { key: "status", header: "Status" },
          { key: "recommendation", header: "Recommendation" },
          { key: "npv", header: "NPV", format: "money", align: "right" },
          { key: "irr", header: "IRR", format: "pct", align: "right" },
          { key: "payback", header: "Payback (yrs)", format: "number", align: "right" },
        ], rows: parsed as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["NPV/IRR/payback recomputed by the finance engine from each case's cash-flow items (BusinessCase.computedJson)."],
    emptyHints: parsed.length === 0
      ? ["No Business Cases captured yet — create one under Plan → Business Cases; NPV/IRR/payback compute automatically from CapEx/OpEx/benefit items."]
      : undefined,
  };
}

// 3. RESOURCE CAPACITY DEMAND — remaining planned hours vs weekly capacity pool.
export function capacityDemand(ctx: AnalyticsContext): RawPayload {
  const weekly = ctx.resources.reduce((s, r) => s + r.capacityHoursPerWeek, 0);
  const byProject = ctx.projects.map((p) => {
    const tasks = ctx.tasks.filter((t) => t.projectId === p.id && t.status !== "CANCELLED" && t.status !== "COMPLETED");
    const remaining = tasks.reduce((s, t) => s + Math.max(0, t.plannedHours * (1 - t.progress / 100)), 0);
    return { project: p.name, remaining: round2(remaining) };
  }).filter((r) => r.remaining > 0).sort((a, b) => b.remaining - a.remaining);
  const demand = byProject.reduce((s, r) => s + r.remaining, 0);
  const weeks = weekly > 0 ? round2(demand / weekly) : 0;
  return {
    kpis: [
      { label: "Remaining demand", value: round2(demand), format: "hours", sub: "open-task planned hours left" },
      { label: "Weekly capacity", value: weekly, format: "hours", sub: `${ctx.resources.length} active resources` },
      { label: "Absorb weeks", value: weeks, format: "days", tone: weeks > 12 ? "warn" : "default", sub: "at current capacity" },
      { label: "Peak project demand", value: byProject[0]?.remaining ?? 0, format: "hours", tone: "info", sub: byProject[0]?.project ?? "—" },
    ],
    charts: byProject.length
      ? [{ kind: "bar", title: "Remaining demand by project", series: [{ label: "Remaining hours", color: BRAND.blue }], groups: byProject.slice(0, 12).map((r) => ({ label: r.project, values: [r.remaining] })), format: "hours" }]
      : [],
    tables: [],
    notes: ["Demand = Σ plannedHours × (1 − progress) on open tasks; capacity = Σ resource weekly capacity."],
    emptyHints: ctx.resources.length === 0
      ? ["No Resources captured yet — add the team under Resource Hub to compute capacity."]
      : !byProject.length
        ? ["No open tasks with planned hours — planned hours arrive with the schedule import."]
        : undefined,
  };
}

// 4. PROJECT BASELINE DEFINITION — baseline coverage + schedule/cost drift.
export function baselineDefinition(ctx: AnalyticsContext): RawPayload {
  const byProject = new Map(ctx.baselines.map((b) => [b.projectId, b]));
  const covered = ctx.projects.filter((p) => byProject.has(p.id));
  const drifts = covered.map((p) => {
    const b = byProject.get(p.id)!;
    const days = p.endDate && b.baselineFinish
      ? Math.round((new Date(p.endDate).getTime() - new Date(b.baselineFinish).getTime()) / 86_400_000)
      : null;
    return { project: p.name, version: b.version, baselineFinish: b.baselineFinish ? new Date(b.baselineFinish).toISOString().slice(0, 10) : "—", currentFinish: p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : "—", driftDays: days, costDrift: variancePct(p.currentBudget, b.baselineCost) };
  });
  const withDrift = drifts.filter((d) => d.driftDays !== null) as { driftDays: number }[];
  const avgDrift = withDrift.length ? round2(withDrift.reduce((s, d) => s + Math.abs(d.driftDays), 0) / withDrift.length) : 0;
  return {
    kpis: [
      { label: "Baselines captured", value: ctx.baselines.length, format: "count" },
      { label: "Project coverage", value: ratePct(covered.length, ctx.projects.length), format: "pct", tone: covered.length === ctx.projects.length && ctx.projects.length > 0 ? "good" : "warn" },
      { label: "Avg schedule drift", value: avgDrift, format: "days", tone: avgDrift > 14 ? "bad" : avgDrift > 0 ? "warn" : "good", sub: "absolute days vs baseline finish" },
      { label: "Max cost drift", value: drifts.length ? Math.max(...drifts.map((d) => Math.abs(d.costDrift))) : 0, format: "pct", tone: "info" },
    ],
    charts: drifts.length
      ? [{ kind: "bar", title: "Schedule drift vs baseline (days)", series: [{ label: "Drift days", color: BRAND.orange }], groups: drifts.map((d) => ({ label: d.project, values: [d.driftDays ?? 0] })), format: "days" }]
      : [],
    tables: drifts.length
      ? [{ title: "Baseline drift", columns: [
          { key: "project", header: "Project" },
          { key: "version", header: "Version", format: "count", align: "right" },
          { key: "baselineFinish", header: "Baseline finish" },
          { key: "currentFinish", header: "Current finish" },
          { key: "driftDays", header: "Drift", format: "days", align: "right" },
          { key: "costDrift", header: "Cost drift", format: "pct", align: "right" },
        ], rows: drifts as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Drift = current endDate/budget − baseline finish/cost of the project's latest Baseline version."],
    emptyHints: ctx.baselines.length === 0
      ? ["No Baselines captured yet — snapshot a baseline from the Schedule page to enable drift reporting."]
      : undefined,
  };
}

// 5. STAKEHOLDER MAPPING — influence × interest matrix + engagement levels.
export function stakeholderMapping(ctx: AnalyticsContext): RawPayload {
  const matrix: Record<string, number> = {};
  const engagement = new Map<string, number>();
  const orgs = new Set<string>();
  for (const s of ctx.stakeholders) {
    const cell = `${band(s.influence)}-${band(s.interest)}`;
    matrix[cell] = (matrix[cell] ?? 0) + 1;
    engagement.set(s.engagement || "UNKNOWN", (engagement.get(s.engagement || "UNKNOWN") ?? 0) + 1);
    if (s.organization) orgs.add(s.organization);
  }
  const key = ctx.stakeholders.filter((s) => band(s.influence) === "HIGH" && band(s.interest) === "HIGH").length;
  const engaged = ctx.stakeholders.filter((s) => ["ENGAGED", "MANAGE_CLOSELY", "SUPPORTIVE", "PARTNER"].includes((s.engagement || "").toUpperCase())).length;
  const rows = ["HIGH-HIGH", "HIGH-MEDIUM", "HIGH-LOW", "MEDIUM-HIGH", "MEDIUM-MEDIUM", "MEDIUM-LOW", "LOW-HIGH", "LOW-MEDIUM", "LOW-LOW"].map((cell) => {
    const [influence, interest] = cell.split("-");
    return { influence, interest, count: matrix[cell] ?? 0 };
  }).filter((r) => r.count > 0);
  return {
    kpis: [
      { label: "Stakeholders", value: ctx.stakeholders.length, format: "count" },
      { label: "Manage closely (H×H)", value: key, format: "count", tone: key > 0 ? "info" : "default" },
      { label: "Engaged", value: ratePct(engaged, ctx.stakeholders.length), format: "pct", tone: "info" },
      { label: "Organizations", value: orgs.size, format: "count" },
    ],
    charts: engagement.size
      ? [{ kind: "donut", title: "Engagement levels", slices: [...engagement.entries()].map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })), centerLabel: "People" }]
      : [],
    tables: rows.length
      ? [{ title: "Influence × interest matrix", columns: [
          { key: "influence", header: "Influence" },
          { key: "interest", header: "Interest" },
          { key: "count", header: "Stakeholders", format: "count", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Mendelow mapping: influence/interest banded HIGH/MEDIUM/LOW; engagement shown per Stakeholder record."],
    emptyHints: ctx.stakeholders.length === 0
      ? ["No Stakeholders captured yet — add them from a project workspace (Stakeholders tab) to build the mapping."]
      : undefined,
  };
}

// 6. VENDOR & PROCUREMENT READINESS — vendor pool status, ratings, budget linkage.
export function vendorReadiness(ctx: AnalyticsContext): RawPayload {
  const status = new Map<string, number>();
  let ratingSum = 0, contractValue = 0;
  for (const v of ctx.vendors) {
    status.set(v.status || "UNKNOWN", (status.get(v.status || "UNKNOWN") ?? 0) + 1);
    ratingSum += v.rating; contractValue += v.contractValue;
  }
  const linkedLines = ctx.budgetLines.filter((l) => l.vendorId);
  const withVendor = new Set(linkedLines.map((l) => l.vendorId));
  const vendorIds = new Set(ctx.vendors.map((v) => v.id));
  const orphan = [...withVendor].filter((id) => !vendorIds.has(id!)).length;
  return {
    kpis: [
      { label: "Vendors", value: ctx.vendors.length, format: "count" },
      { label: "Avg rating", value: ctx.vendors.length ? round2(ratingSum / ctx.vendors.length) : 0, format: "number", tone: "info", sub: "out of 5" },
      { label: "Contracted value", value: contractValue, format: "money" },
      { label: "Budget lines with vendor", value: linkedLines.length, format: "count", tone: orphan > 0 ? "warn" : "good", sub: orphan > 0 ? `${orphan} vendor ids unresolvable` : "all resolve to a vendor" },
    ],
    charts: status.size
      ? [{ kind: "donut", title: "Vendor status", slices: [...status.entries()].map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })), centerLabel: "Vendors" }]
      : [],
    tables: ctx.vendors.length
      ? [{ title: "Vendor pool", columns: [
          { key: "name", header: "Vendor" },
          { key: "type", header: "Type" },
          { key: "status", header: "Status" },
          { key: "rating", header: "Rating", format: "number", align: "right" },
          { key: "contract", header: "Contract", format: "money", align: "right" },
        ], rows: ctx.vendors.map((v) => ({ name: v.name, type: v.vendorType ?? "—", status: v.status, rating: v.rating, contract: v.contractValue })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Readiness = vendor pool status + rating + budget lines already linked to a vendor."],
    emptyHints: ctx.vendors.length === 0
      ? ["No Vendors captured yet — register suppliers under Resource Hub → Vendors; link budget lines to vendors for spend analytics."]
      : undefined,
  };
}

// 7. INITIAL RISK ASSESSMENT — open risk profile, categories, heat bands.
export function initialRisk(ctx: AnalyticsContext): RawPayload {
  const exposure = riskExposure(ctx.risks);
  const byCategory = new Map<string, number>();
  const bands = new Map<string, number>();
  for (const r of ctx.risks) {
    if (r.status === "CLOSED") continue;
    byCategory.set(r.category || "OTHER", (byCategory.get(r.category || "OTHER") ?? 0) + 1);
    const b = heatBand(r.score || r.probability * r.impact);
    bands.set(b, (bands.get(b) ?? 0) + 1);
  }
  const bandColors: Record<string, string> = { LOW: BRAND.emerald, MEDIUM: BRAND.yellow, HIGH: BRAND.orange, SEVERE: BRAND.coral };
  return {
    kpis: [
      { label: "Open risks", value: exposure.open, format: "count", tone: exposure.open > 15 ? "warn" : "default" },
      { label: "Gross exposure", value: exposure.gross, format: "number", sub: "Σ probability × impact score" },
      { label: "Severe (score ≥ 15)", value: bands.get("SEVERE") ?? 0, format: "count", tone: (bands.get("SEVERE") ?? 0) > 0 ? "bad" : "good" },
      { label: "Avg score", value: exposure.open ? round2(exposure.gross / exposure.open) : 0, format: "number", tone: "info" },
    ],
    charts: [
      byCategory.size ? { kind: "donut", title: "Open risks by category", slices: [...byCategory.entries()].map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })), centerLabel: "Risks" } : null,
      bands.size ? { kind: "bar", title: "Heat band distribution", series: [{ label: "Risks", color: BRAND.blue }], groups: ["LOW", "MEDIUM", "HIGH", "SEVERE"].filter((b) => bands.has(b)).map((b) => ({ label: b, values: [bands.get(b)!], sublabel: bandColors[b] })), format: "count" } : null,
    ].filter(Boolean) as RawPayload["charts"],
    tables: [],
    notes: ["Heat band: LOW <4 ≤ MEDIUM <8 ≤ HIGH <15 ≤ SEVERE (probability × impact)."],
  };
}

// 8. PHASE-GATE TIMELINE — stage gates planned/decided + milestone pressure.
export function phaseGateTimeline(ctx: AnalyticsContext): RawPayload {
  const nowMs = ctx.now.getTime();
  const pending = ctx.stageGates.filter((g) => g.decisionStatus === "PENDING");
  const overdue = pending.filter((g) => g.plannedDate && new Date(g.plannedDate).getTime() < nowMs);
  const decided = ctx.stageGates.length - pending.length;
  const upcomingMilestones = ctx.milestones
    .filter((m) => m.status !== "COMPLETED" && m.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const decisions = new Map<string, number>();
  for (const g of ctx.stageGates) decisions.set(g.decisionStatus, (decisions.get(g.decisionStatus) ?? 0) + 1);
  return {
    kpis: [
      { label: "Stage gates", value: ctx.stageGates.length, format: "count" },
      { label: "Decided", value: decided, format: "count", tone: "good" },
      { label: "Overdue decisions", value: overdue.length, format: "count", tone: overdue.length > 0 ? "bad" : "good" },
      { label: "Upcoming milestones", value: upcomingMilestones.length, format: "count", tone: "info", sub: "open with a due date" },
    ],
    charts: decisions.size
      ? [{ kind: "donut", title: "Gate decisions", slices: [...decisions.entries()].map(([label, value], i) => ({ label, value, color: [BRAND.emerald, BRAND.yellow, BRAND.coral, BRAND.blue, BRAND.slate][i % 5] })), centerLabel: "Gates" }]
      : [],
    tables: ctx.stageGates.length
      ? [{ title: "Gate timeline", columns: [
          { key: "gate", header: "Gate" },
          { key: "planned", header: "Planned" },
          { key: "decision", header: "Decision" },
          { key: "decidedOn", header: "Decided on" },
          { key: "late", header: "Status", align: "right" },
        ], rows: ctx.stageGates.slice().sort((a, b) => a.sequence - b.sequence).map((g) => ({
          gate: g.name, planned: g.plannedDate ? new Date(g.plannedDate).toISOString().slice(0, 10) : "—",
          decision: g.decisionStatus,
          decidedOn: g.decisionDate ? new Date(g.decisionDate).toISOString().slice(0, 10) : "—",
          late: g.decisionStatus === "PENDING" && g.plannedDate && new Date(g.plannedDate).getTime() < nowMs ? "OVERDUE" : "ON TRACK",
        })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Overdue = PENDING decision with plannedDate in the past. Milestones listed by nearest due date."],
    emptyHints: ctx.stageGates.length === 0
      ? ["No Stage Gates captured yet — define phase gates in a project workspace (Governance tab) to track the PMLC timeline."]
      : undefined,
  };
}
