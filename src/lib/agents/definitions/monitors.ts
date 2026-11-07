// PM CONTROL TOWER — AI agent definitions: PHASE 1 MONITORS (read-only).
// Six workers that only ever READ live platform data and report findings.
// They never write business records — the runner may raise de-duplicated
// AlertEvents for WARNING/CRITICAL findings, nothing else. The structural
// test enforces that this file stays completely write-free.

import {
  budgetRollup,
  dataQualityIssues,
  dependencyRipples,
  hotRisks,
  latestEvmPeriods,
  milestonesDue,
  overdueTasks,
  projectCount,
  resourceLoad,
} from "../data";
import { cfgNum, clip, iso, type AgentContext, type AgentDefinition, type AgentFinding } from "../types";

const DAY = 86_400_000;
const daysPast = (d: Date): number => Math.floor((Date.now() - d.getTime()) / DAY);
const daysUntil = (d: Date): number => Math.ceil((d.getTime() - Date.now()) / DAY);

// ---------------------------------------------------------------------------
// 1) DEADLINE SENTINEL — overdue tasks + milestones inside the look-ahead
// ---------------------------------------------------------------------------

const deadlineSentinel: AgentDefinition = {
  key: "deadline-sentinel",
  name: "Deadline Sentinel",
  family: "MONITOR",
  phase: 1,
  role: "PM",
  description:
    "Watches every open task and milestone for missed or imminent deadlines, and flags schedule slip before it compounds into a missed gate.",
  cadence: "DAILY",
  thresholds: [
    { key: "milestoneHorizonDays", label: "Milestone look-ahead (days)", min: 1, max: 60, step: 1 },
    { key: "criticalOverdueDays", label: "Critical after (days overdue)", min: 1, max: 90, step: 1 },
    { key: "maxFindings", label: "Max findings per run", min: 5, max: 100, step: 5 },
  ],
  defaults: { milestoneHorizonDays: 7, criticalOverdueDays: 7, maxFindings: 30 },
  requiresApproval: false,
  raiseAlerts: true,
  run: async (ctx: AgentContext) => {
    const horizon = cfgNum(ctx.config, "milestoneHorizonDays", 7);
    const critDays = cfgNum(ctx.config, "criticalOverdueDays", 7);
    const cap = cfgNum(ctx.config, "maxFindings", 30);

    const [tasks, milestones] = await Promise.all([overdueTasks(cap), milestonesDue(horizon, cap)]);
    const findings: AgentFinding[] = [];

    for (const t of tasks) {
      const late = t.endDate ? daysPast(t.endDate) : 0;
      findings.push({
        severity: late >= critDays ? "CRITICAL" : "WARNING",
        title: `${t.name} is ${late} day(s) overdue`,
        detail: `Due ${iso(t.endDate)} · ${t.project.code} · ${t.assignee?.name ?? "unassigned"} · ${Math.round(t.progress)}% complete`,
        projectId: t.projectId,
        ref: t.code,
        metricValue: late,
      });
    }

    for (const m of milestones) {
      const left = m.dueDate ? daysUntil(m.dueDate) : null;
      const missed = left !== null && left < 0;
      findings.push({
        severity: missed ? "CRITICAL" : left !== null && left <= 3 ? "WARNING" : "INFO",
        title: missed
          ? `Milestone ${m.name} missed by ${Math.abs(left)} day(s)`
          : `Milestone ${m.name} due in ${left} day(s)`,
        detail: `${m.project.code} · baseline ${iso(m.baselineDate)} · status ${m.status}${m.isCritical ? " · critical path" : ""}`,
        projectId: m.projectId,
        ref: m.code,
        metricValue: left ?? undefined,
      });
    }

    return {
      summary: `${tasks.length} overdue task(s) and ${milestones.length} milestone(s) inside a ${horizon}-day horizon.`,
      findings,
    };
  },
};

// ---------------------------------------------------------------------------
// 2) DEPENDENCY RIPPLE — cross-task impact of overdue predecessors
// ---------------------------------------------------------------------------

const dependencyRipple: AgentDefinition = {
  key: "dependency-ripple",
  name: "Dependency Ripple",
  family: "MONITOR",
  phase: 1,
  role: "PM",
  description:
    "Recalculates the downstream ripple of every late predecessor so owners are told what their delay is about to break — before it does.",
  cadence: "DAILY",
  thresholds: [
    { key: "criticalOverdueDays", label: "Critical after (days overdue)", min: 1, max: 60, step: 1 },
    { key: "maxFindings", label: "Max findings per run", min: 5, max: 100, step: 5 },
  ],
  defaults: { criticalOverdueDays: 5, maxFindings: 25 },
  requiresApproval: false,
  raiseAlerts: true,
  run: async (ctx: AgentContext) => {
    const critDays = cfgNum(ctx.config, "criticalOverdueDays", 5);
    const cap = cfgNum(ctx.config, "maxFindings", 25);
    const ripples = await dependencyRipples(cap);

    const findings: AgentFinding[] = ripples.map((r) => {
      const late = r.predecessor.endDate ? daysPast(r.predecessor.endDate) : 0;
      const crosses = r.predecessor.projectId !== r.successor.projectId;
      return {
        severity: late >= critDays || crosses ? "CRITICAL" : "WARNING",
        title: `Delay ripple: ${r.predecessor.name} → ${r.successor.name}`,
        detail:
          `Predecessor ${late} day(s) overdue (due ${iso(r.predecessor.endDate)}) · successor ${r.successor.code} at risk` +
          `${crosses ? " · crosses a project boundary" : ""} · ${r.depType} link${r.lagDays ? ` with ${r.lagDays}d lag` : ""}`,
        projectId: r.successor.projectId,
        ref: r.successor.code,
        metricValue: late,
      };
    });

    return {
      summary: `${ripples.length} open dependency link(s) currently fed by an overdue predecessor.`,
      findings,
    };
  },
};

// ---------------------------------------------------------------------------
// 3) EVM WATCHDOG — CPI/SPI drift + forecast-vs-budget overrun
// ---------------------------------------------------------------------------

const evmWatchdog: AgentDefinition = {
  key: "evm-watchdog",
  name: "EVM Watchdog",
  family: "MONITOR",
  phase: 1,
  role: "DM",
  description:
    "Monitors earned-value performance (CPI/SPI) and forecast-vs-budget drift, surfacing margin erosion while there is still room to recover.",
  cadence: "WEEKLY",
  thresholds: [
    { key: "cpiWarn", label: "CPI warning below", min: 0.5, max: 1, step: 0.01 },
    { key: "cpiCrit", label: "CPI critical below", min: 0.3, max: 1, step: 0.01 },
    { key: "spiWarn", label: "SPI warning below", min: 0.5, max: 1, step: 0.01 },
    { key: "budgetOverrunPct", label: "Forecast overrun warning (%)", min: 1, max: 50, step: 1 },
  ],
  defaults: { cpiWarn: 0.95, cpiCrit: 0.85, spiWarn: 0.95, budgetOverrunPct: 5 },
  requiresApproval: false,
  raiseAlerts: true,
  run: async (ctx: AgentContext) => {
    const cpiWarn = cfgNum(ctx.config, "cpiWarn", 0.95);
    const cpiCrit = cfgNum(ctx.config, "cpiCrit", 0.85);
    const spiWarn = cfgNum(ctx.config, "spiWarn", 0.95);
    const overrunPct = cfgNum(ctx.config, "budgetOverrunPct", 5);

    const [periods, budgets] = await Promise.all([latestEvmPeriods(), budgetRollup()]);
    const findings: AgentFinding[] = [];

    for (const p of periods) {
      if (p.cpi < cpiCrit || p.cpi < cpiWarn) {
        findings.push({
          severity: p.cpi < cpiCrit ? "CRITICAL" : "WARNING",
          title: `${p.project.code} cost performance drifting (CPI ${p.cpi.toFixed(2)})`,
          detail: `Status date ${iso(p.statusDate)} · EV ${p.ev.toFixed(0)} vs AC ${p.ac.toFixed(0)} · EAC ${p.eac.toFixed(0)} vs BAC ${p.bac.toFixed(0)} · VAC ${p.vac.toFixed(0)}`,
          projectId: p.projectId,
          ref: p.project.code,
          metricValue: p.cpi,
        });
      }
      if (p.spi < spiWarn) {
        findings.push({
          severity: p.spi < cpiCrit ? "CRITICAL" : "WARNING",
          title: `${p.project.code} schedule performance slipping (SPI ${p.spi.toFixed(2)})`,
          detail: `Status date ${iso(p.statusDate)} · PV ${p.pv.toFixed(0)} vs EV ${p.ev.toFixed(0)} · SV ${p.scheduleVariance.toFixed(0)} · ${Math.round(p.percentComplete)}% complete`,
          projectId: p.projectId,
          ref: p.project.code,
          metricValue: p.spi,
        });
      }
    }

    for (const b of budgets) {
      const base = b.current || b.baseline;
      if (base <= 0 || b.forecast <= 0) continue;
      const overrun = ((b.forecast - base) / base) * 100;
      if (overrun >= overrunPct) {
        findings.push({
          severity: overrun >= overrunPct * 2 ? "CRITICAL" : "WARNING",
          title: `${b.project.code} forecast exceeds budget by ${overrun.toFixed(1)}%`,
          detail: `Baseline ${b.baseline.toFixed(0)} · current ${b.current.toFixed(0)} · actual ${b.actual.toFixed(0)} · forecast ${b.forecast.toFixed(0)}`,
          projectId: b.project.id,
          ref: b.project.code,
          metricValue: Math.round(overrun * 10) / 10,
        });
      }
    }

    return {
      summary: `${periods.length} project(s) reporting EVM · ${budgets.length} budget roll-up(s) · ${findings.length} performance breach(es).`,
      findings,
    };
  },
};

// ---------------------------------------------------------------------------
// 4) CAPACITY SENTINEL — allocation stretch across the resource pool
// ---------------------------------------------------------------------------

const capacitySentinel: AgentDefinition = {
  key: "capacity-sentinel",
  name: "Capacity Sentinel",
  family: "MONITOR",
  phase: 1,
  role: "RM",
  description:
    "Tracks live allocation against capacity and flags people stretched past their limit, with the assignments that put them there.",
  cadence: "DAILY",
  thresholds: [
    { key: "stretchPct", label: "Stretch warning (% allocation)", min: 50, max: 200, step: 5 },
    { key: "criticalPct", label: "Critical (% allocation)", min: 50, max: 300, step: 5 },
  ],
  defaults: { stretchPct: 90, criticalPct: 110 },
  requiresApproval: false,
  raiseAlerts: true,
  run: async (ctx: AgentContext) => {
    const stretch = cfgNum(ctx.config, "stretchPct", 90);
    const critical = Math.max(cfgNum(ctx.config, "criticalPct", 110), stretch);
    const rows = await resourceLoad();

    const findings: AgentFinding[] = rows
      .filter((r) => r.totalAllocation >= stretch)
      .map((r) => ({
        severity: r.totalAllocation >= critical ? "CRITICAL" : "WARNING",
        title: `${r.name} is loaded to ${Math.round(r.totalAllocation)}%`,
        detail: `${r.assignments.length} active assignment(s) · ${r.skill ?? "skill not set"} · capacity ${r.capacity}h/week · availability ${r.availability}` +
          r.assignments.slice(0, 3).map((a) => ` · ${a.project.code} ${Math.round(a.allocationPercent)}%`).join(""),
        metricValue: Math.round(r.totalAllocation),
      }));

    return {
      summary: `${rows.length} resource(s) tracked · ${findings.length} at or above the ${stretch}% stretch threshold.`,
      findings,
    };
  },
};

// ---------------------------------------------------------------------------
// 5) EXECUTIVE BRIEFING — one digest of the portfolio's true state
// ---------------------------------------------------------------------------

const executiveBriefing: AgentDefinition = {
  key: "executive-briefing",
  name: "Executive Briefing",
  family: "MONITOR",
  phase: 1,
  role: "PMO",
  description:
    "Assembles the daily executive digest from live data: portfolio size, overdue work, imminent milestones, hot risks and EVM guardrail breaches.",
  cadence: "DAILY",
  thresholds: [
    { key: "milestoneHorizonDays", label: "Milestone look-ahead (days)", min: 1, max: 60, step: 1 },
    { key: "riskScore", label: "Hot risk score ≥", min: 4, max: 25, step: 1 },
    { key: "overdueWarning", label: "Overdue warning at (count)", min: 1, max: 200, step: 1 },
  ],
  defaults: { milestoneHorizonDays: 7, riskScore: 9, overdueWarning: 10 },
  requiresApproval: false,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const horizon = cfgNum(ctx.config, "milestoneHorizonDays", 7);
    const riskScore = cfgNum(ctx.config, "riskScore", 9);
    const overdueWarn = cfgNum(ctx.config, "overdueWarning", 10);

    const [projects, overdue, dueSoon, risks, periods] = await Promise.all([
      projectCount(),
      overdueTasks(500),
      milestonesDue(horizon, 200),
      hotRisks(riskScore, 50),
      latestEvmPeriods(),
    ]);

    const drifting = periods.filter((p) => p.cpi < 0.95 || p.spi < 0.95);
    const findings: AgentFinding[] = [
      {
        severity: "INFO",
        title: `${projects} project(s) in the portfolio`,
        detail: `${overdue.length} overdue task(s) · ${dueSoon.length} milestone(s) due within ${horizon} day(s) · ${risks.length} hot risk(s) ≥ score ${riskScore}`,
        metricValue: projects,
      },
    ];

    if (overdue.length) {
      findings.push({
        severity: overdue.length >= overdueWarn ? "WARNING" : "INFO",
        title: `${overdue.length} overdue task(s) portfolio-wide`,
        detail: clip(overdue.slice(0, 5).map((t) => `${t.project.code}: ${t.name}`).join(" | "), 300),
        metricValue: overdue.length,
      });
    }
    if (dueSoon.length) {
      findings.push({
        severity: "INFO",
        title: `${dueSoon.length} milestone(s) due within ${horizon} day(s)`,
        detail: clip(dueSoon.slice(0, 5).map((m) => `${m.project.code}: ${m.name} (${iso(m.dueDate)})`).join(" | "), 300),
        metricValue: dueSoon.length,
      });
    }
    if (risks.length) {
      findings.push({
        severity: "WARNING",
        title: `${risks.length} hot risk(s) need an owner decision`,
        detail: clip(risks.slice(0, 5).map((r) => `${r.project.code}: ${r.title} (score ${r.score})`).join(" | "), 300),
        metricValue: risks.length,
      });
    }
    findings.push({
      severity: drifting.length ? "WARNING" : "INFO",
      title: drifting.length
        ? `${drifting.length} project(s) below the 0.95 CPI/SPI guardrail`
        : "All reporting projects inside the 0.95 CPI/SPI guardrail",
      detail: clip(drifting.map((p) => `${p.project.code} (CPI ${p.cpi.toFixed(2)}/SPI ${p.spi.toFixed(2)})`).join(" | "), 300),
      metricValue: drifting.length,
    });

    return {
      summary: `Portfolio of ${projects}: ${overdue.length} overdue, ${dueSoon.length} milestones due, ${risks.length} hot risks, ${drifting.length} EVM drift(s).`,
      findings,
    };
  },
};

// ---------------------------------------------------------------------------
// 6) DATA QUALITY AUDITOR — linkage/field integrity before it corrupts reports
// ---------------------------------------------------------------------------

const dataQualityAuditor: AgentDefinition = {
  key: "data-quality-auditor",
  name: "Data Quality Auditor",
  family: "MONITOR",
  phase: 1,
  role: "PMO",
  description:
    "Audits structural integrity — duplicate codes, missing dates, ownerless risks, unassigned overdue work and thin gate evidence packs.",
  cadence: "DAILY",
  thresholds: [
    { key: "gateHorizonDays", label: "Gate look-ahead (days)", min: 1, max: 90, step: 1 },
  ],
  defaults: { gateHorizonDays: 14 },
  requiresApproval: false,
  raiseAlerts: true,
  run: async (ctx: AgentContext) => {
    const gateHorizon = cfgNum(ctx.config, "gateHorizonDays", 14);
    const issues = await dataQualityIssues(gateHorizon);
    const findings: AgentFinding[] = [];

    for (const d of issues.dupTasks) {
      findings.push({
        severity: "CRITICAL",
        title: `Duplicate task code ${d.code} used ${Number(d.n)} times`,
        detail: `Project ${d.projectId} has ${Number(d.n)} open tasks sharing the same code — exports and reports will collide.`,
        projectId: d.projectId,
        ref: d.code,
        metricValue: Number(d.n),
      });
    }
    if (issues.noDueMilestones > 0) {
      findings.push({
        severity: "WARNING",
        title: `${issues.noDueMilestones} milestone(s) without a due date`,
        detail: "Undated milestones cannot be scheduled or reported against.",
        metricValue: issues.noDueMilestones,
      });
    }
    if (issues.ownerlessRisks > 0) {
      findings.push({
        severity: "WARNING",
        title: `${issues.ownerlessRisks} open risk(s) with no owner`,
        detail: "Ownerless risks never get mitigated — assign an owner in RAID.",
        metricValue: issues.ownerlessRisks,
      });
    }
    if (issues.unassignedOverdue > 0) {
      findings.push({
        severity: "WARNING",
        title: `${issues.unassignedOverdue} overdue task(s) with no assignee`,
        detail: "Nobody is driving these — reassign or close them.",
        metricValue: issues.unassignedOverdue,
      });
    }
    for (const g of issues.gateSoon) {
      const gaps: string[] = [];
      if (!g.evidence?.trim()) gaps.push("evidence pack");
      if (!g.criteria?.trim()) gaps.push("criteria");
      if (!g.approverName?.trim()) gaps.push("approver");
      if (!gaps.length) continue;
      findings.push({
        severity: gaps.length >= 2 ? "CRITICAL" : "WARNING",
        title: `Gate ${g.code} (${g.name}) is missing ${gaps.join(", ")}`,
        detail: `${g.project.code} · planned ${iso(g.plannedDate)} · decision ${g.decisionStatus}`,
        projectId: g.projectId,
        ref: g.code,
        metricValue: gaps.length,
      });
    }

    return {
      summary:
        `${issues.dupTasks.length} duplicate code(s) · ${issues.noDueMilestones} undated milestone(s) · ` +
        `${issues.ownerlessRisks} ownerless risk(s) · ${issues.unassignedOverdue} unassigned overdue task(s) · ` +
        `${issues.gateSoon.length} gate(s) in the next ${gateHorizon} days.`,
      findings,
    };
  },
};

export const MONITORS: AgentDefinition[] = [
  deadlineSentinel,
  dependencyRipple,
  evmWatchdog,
  capacitySentinel,
  executiveBriefing,
  dataQualityAuditor,
];
