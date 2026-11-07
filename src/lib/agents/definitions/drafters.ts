// PM CONTROL TOWER — AI agent definitions: PHASE 2 DRAFTERS (approval-gated).
// These agents READ live data and DRAFT a proposed action — they never write
// business records themselves. The runner stores the proposal on AgentRun as
// PENDING_APPROVAL; only an admin approval in Administration → Settings → AI
// Agents executes it through apply.ts (zod-validated, fully audited).

import {
  dataQualityIssues,
  hotRisks,
  latestEvmPeriods,
  milestonesDue,
  overdueTasks,
  projectsBrief,
  resourceLoad,
} from "../data";
import { cfgNum, clip, iso, type AgentContext, type AgentDefinition, type AgentFinding } from "../types";

const DAY = 86_400_000;
const daysUntil = (d: Date): number => Math.ceil((d.getTime() - Date.now()) / DAY);

/** First sentence/line of the request, clamped — the draft CR title. */
function draftTitle(input: string): string {
  const first = input.split(/[.!?\n]/).map((s) => s.trim()).find(Boolean) || input;
  return clip(first, 120);
}

/** Deterministic mitigation draft per risk category (never invented metrics). */
function draftMitigation(category: string, title: string): string {
  const head = `Drafted by Risk Brainstormer for "${title}":`;
  const options: Record<string, string> = {
    TECHNICAL: "1) Time-boxed spike to retire the uncertainty. 2) Fallback design reviewed with architecture. 3) Trigger: spike slips > 3 days → escalate.",
    SCHEDULE: "1) Re-sequence non-critical work to protect the date. 2) Add a contingency buffer to the successor task. 3) Trigger: slip grows > 5 days → raise a change request.",
    COST: "1) Re-baseline the affected budget lines. 2) Stage the spend behind a decision point. 3) Trigger: forecast overrun > 10% → escalate to the sponsor.",
    RESOURCE: "1) Rebalance allocation across the resource pool. 2) Cross-train a backup for the single point of failure. 3) Trigger: allocation > 100% for 2 weeks → request contractor capacity.",
    QUALITY: "1) Add an inspection/review step at the affected hand-off. 2) Define the acceptance threshold explicitly. 3) Trigger: defect rate doubles → pause the hand-off.",
    SCOPE: "1) Clarify the in/out boundary with the requester. 2) Park nice-to-haves on the backlog. 3) Trigger: scope grows again → change request.",
    COMPLIANCE: "1) Book a pre-assessment with the compliance owner. 2) Collect evidence early against the checklist. 3) Trigger: evidence incomplete 7 days pre-gate → escalate.",
  };
  return `${head} ${options[category] || options.TECHNICAL}`;
}

// ---------------------------------------------------------------------------
// 7) CR INTAKE — client request in the inbox → drafted change request
// ---------------------------------------------------------------------------

const crIntake: AgentDefinition = {
  key: "cr-intake",
  name: "CR Intake",
  family: "DRAFTING",
  phase: 2,
  role: "PM",
  description:
    "Reads a natural-language client request, identifies the affected project and drafts a structured change request with impact fields for approval.",
  cadence: "MANUAL",
  thresholds: [{ key: "maxDescription", label: "Max description length", min: 500, max: 8000, step: 500 }],
  defaults: { maxDescription: 4000 },
  requiresApproval: true,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const input = (ctx.input ?? "").trim();
    if (!input) {
      return {
        summary: "No request text supplied — nothing to draft.",
        findings: [{
          severity: "WARNING",
          title: "Provide the client request text",
          detail: "Run this agent with a short description of what the client asked for (and the project code or name).",
        }],
      };
    }

    const projects = await projectsBrief();
    const lower = input.toLowerCase();
    const project =
      projects.find((p) => lower.includes(p.code.toLowerCase())) ||
      projects.find((p) => lower.includes(p.name.toLowerCase()));

    if (!project) {
      return {
        summary: "Request captured, but no matching project was identified — no draft created.",
        findings: [{
          severity: "WARNING",
          title: "Project not identified",
          detail: projects.length
            ? `Mention a project code or name. Known projects: ${projects.slice(0, 8).map((p) => p.code).join(", ")}${projects.length > 8 ? "…" : ""}`
            : "No projects exist yet — create one before drafting change requests.",
        }],
      };
    }

    const title = draftTitle(input);
    const maxDesc = cfgNum(ctx.config, "maxDescription", 4000);
    const findings: AgentFinding[] = [{
      severity: "INFO",
      title: `Drafted change request for ${project.code}`,
      detail: clip(input, 400),
    }];

    return {
      summary: `Parsed a client request against ${project.code} (${project.name}) and drafted "${title}" for approval.`,
      findings,
      action: {
        type: "CHANGE_REQUEST_CREATE",
        label: `Create change request "${title}" on ${project.code}`,
        payload: {
          projectId: project.id,
          title,
          description: clip(input, maxDesc),
          category: "SCOPE",
          priority: "MEDIUM",
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 8) STATUS REPORTER — weekly status summary drafted from live data
// ---------------------------------------------------------------------------

const statusReporter: AgentDefinition = {
  key: "status-report",
  name: "Status Reporter",
  family: "DRAFTING",
  phase: 2,
  role: "PM",
  description:
    "Drafts the weekly status summary from live tasks, milestones, risks and EVM data — the PM reviews and publishes it with one approval.",
  cadence: "WEEKLY",
  thresholds: [
    { key: "milestoneHorizonDays", label: "Milestone look-ahead (days)", min: 1, max: 60, step: 1 },
    { key: "riskScore", label: "Hot risk score ≥", min: 4, max: 25, step: 1 },
  ],
  defaults: { milestoneHorizonDays: 7, riskScore: 9 },
  requiresApproval: true,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const horizon = cfgNum(ctx.config, "milestoneHorizonDays", 7);
    const riskScore = cfgNum(ctx.config, "riskScore", 9);

    const [overdue, dueSoon, risks, periods] = await Promise.all([
      overdueTasks(100),
      milestonesDue(horizon, 50),
      hotRisks(riskScore, 20),
      latestEvmPeriods(),
    ]);

    const findings: AgentFinding[] = [];
    const push = (severity: AgentFinding["severity"], title: string, detail: string, metricValue?: number) =>
      findings.push({ severity, title, detail: clip(detail, 300), metricValue });

    push("INFO", "Schedule", `${overdue.length} overdue task(s) · ${dueSoon.length} milestone(s) due within ${horizon} day(s).`, overdue.length);
    if (overdue.length) {
      push("WARNING", "Overdue work", overdue.slice(0, 6).map((t) => `${t.project.code}: ${t.name}`).join(" | "), overdue.length);
    }
    if (dueSoon.length) {
      push("INFO", "Upcoming milestones", dueSoon.slice(0, 6).map((m) => `${m.project.code}: ${m.name} (${iso(m.dueDate)})`).join(" | "), dueSoon.length);
    }
    push(risks.length ? "WARNING" : "INFO", "Risks", risks.length
      ? risks.slice(0, 6).map((r) => `${r.project.code}: ${r.title} (score ${r.score})`).join(" | ")
      : `No open risk at or above score ${riskScore}.`, risks.length);
    const drifting = periods.filter((p) => p.cpi < 0.95 || p.spi < 0.95);
    push(drifting.length ? "WARNING" : "INFO", "EVM", drifting.length
      ? drifting.map((p) => `${p.project.code} (CPI ${p.cpi.toFixed(2)}, SPI ${p.spi.toFixed(2)})`).join(" | ")
      : `${periods.length} project(s) reporting inside the 0.95 CPI/SPI guardrail.`, drifting.length);

    const worst = findings.some((f) => f.severity === "WARNING") ? "WARNING" : "INFO";
    const body = [
      `Weekly status report — ${iso(new Date())}`,
      "",
      ...findings.map((f) => `• ${f.title}: ${f.detail}`),
    ].join("\n");

    return {
      summary: `Drafted status: ${overdue.length} overdue, ${dueSoon.length} milestones due, ${risks.length} hot risks, ${drifting.length} EVM drift(s).`,
      findings,
      action: {
        type: "NOTIFY",
        label: "Publish this status summary to the PMO admin inbox",
        payload: {
          title: `Weekly status report — ${iso(new Date())}`,
          message: clip(body, 3500),
          severity: worst,
          roles: ["PMO_ADMIN"],
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 9) RISK BRAINSTORMER — mitigation drafts for hot risks that have none
// ---------------------------------------------------------------------------

const riskBrainstormer: AgentDefinition = {
  key: "risk-brainstormer",
  name: "Risk Brainstormer",
  family: "DRAFTING",
  phase: 2,
  role: "PM",
  description:
    "Reviews the hottest open risks and drafts concrete, category-aware mitigation options for the ones still missing a plan.",
  cadence: "WEEKLY",
  thresholds: [
    { key: "riskScore", label: "Hot risk score ≥", min: 4, max: 25, step: 1 },
    { key: "maxFindings", label: "Max risks per run", min: 5, max: 50, step: 5 },
  ],
  defaults: { riskScore: 9, maxFindings: 10 },
  requiresApproval: true,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const riskScore = cfgNum(ctx.config, "riskScore", 9);
    const cap = cfgNum(ctx.config, "maxFindings", 10);
    const risks = await hotRisks(riskScore, cap);

    const findings: AgentFinding[] = risks.map((r) => ({
      severity: r.score >= 16 ? "CRITICAL" : "WARNING",
      title: `${r.project.code}: ${r.title} (score ${r.score})`,
      detail: `${r.category} · strategy ${r.responseStrategy} · owner ${r.ownerName ?? "unassigned"} · mitigation ${r.mitigation ? "in place" : "MISSING"} · due ${iso(r.dueDate)}`,
      projectId: r.projectId,
      ref: r.code,
      metricValue: r.score,
    }));

    const missing = risks.find((r) => !r.mitigation?.trim());
    if (!missing) {
      return {
        summary: `${risks.length} hot risk(s) reviewed — every one already has a mitigation plan.`,
        findings,
      };
    }

    const mitigation = draftMitigation(missing.category, missing.title);
    return {
      summary: `${risks.length} hot risk(s) reviewed · ${risks.filter((r) => !r.mitigation?.trim()).length} without a plan · drafted one for ${missing.code}.`,
      findings,
      action: {
        type: "RISK_MITIGATION_UPDATE",
        label: `Attach a drafted mitigation to ${missing.code} (${missing.title})`,
        payload: { riskId: missing.id, code: missing.code, mitigation },
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 10) WORKLOAD BALANCER — proposed person→person rebalances
// ---------------------------------------------------------------------------

const workloadBalancer: AgentDefinition = {
  key: "workload-balancer",
  name: "Workload Balancer",
  family: "DRAFTING",
  phase: 2,
  role: "RM",
  description:
    "Detects stretched resources and proposes a concrete rebalance — which assignment moves, how much, and to whom — for RM/PM approval.",
  cadence: "DAILY",
  thresholds: [
    { key: "stretchPct", label: "Stretch warning (% allocation)", min: 50, max: 200, step: 5 },
    { key: "targetPct", label: "Candidate under (% allocation)", min: 20, max: 100, step: 5 },
    { key: "maxMovePct", label: "Max move per proposal (%)", min: 5, max: 50, step: 5 },
  ],
  defaults: { stretchPct: 90, targetPct: 60, maxMovePct: 20 },
  requiresApproval: true,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const stretch = cfgNum(ctx.config, "stretchPct", 90);
    const target = cfgNum(ctx.config, "targetPct", 60);
    const maxMove = cfgNum(ctx.config, "maxMovePct", 20);

    const rows = await resourceLoad();
    const stretched = rows.filter((r) => r.totalAllocation >= stretch);
    const candidates = rows.filter(
      (r) => r.totalAllocation < target && r.availability !== "UNAVAILABLE" && r.availability !== "LEAVE"
    );

    const findings: AgentFinding[] = stretched.map((r) => ({
      severity: r.totalAllocation >= stretch + 20 ? "CRITICAL" : "WARNING",
      title: `${r.name} at ${Math.round(r.totalAllocation)}% allocation`,
      detail: `${r.assignments.length} active assignment(s) · skill ${r.skill ?? "not set"} · availability ${r.availability}` +
        r.assignments.slice(0, 3).map((a) => ` · ${a.project.code} ${Math.round(a.allocationPercent)}%`).join(""),
      metricValue: Math.round(r.totalAllocation),
    }));

    const source = stretched[0];
    const dest = candidates[0];
    const assignment = source?.assignments.slice().sort((a, b) => b.allocationPercent - a.allocationPercent)[0];
    if (!source || !dest || !assignment) {
      return {
        summary: stretched.length
          ? `${stretched.length} stretched resource(s) found, but no eligible under-loaded candidate to rebalance toward.`
          : `Nobody is at or above the ${stretch}% stretch threshold — no rebalance needed.`,
        findings,
      };
    }

    const over = source.totalAllocation - stretch;
    const move = Math.max(5, Math.min(maxMove, Math.round(over) || 5));
    return {
      summary: `Proposed moving ${move}% of ${assignment.project.code} work from ${source.name} (${Math.round(source.totalAllocation)}%) to ${dest.name} (${Math.round(dest.totalAllocation)}%).`,
      findings,
      action: {
        type: "ASSIGNMENT_REASSIGN",
        label: `Move ${move}% of ${assignment.project.code} work from ${source.name} to ${dest.name}`,
        payload: { assignmentId: assignment.id, toResourceId: dest.resourceId, movePercent: move },
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 11) GATE READINESS — evidence-pack completeness before each stage gate
// ---------------------------------------------------------------------------

const gateReadiness: AgentDefinition = {
  key: "gate-readiness",
  name: "Gate Readiness",
  family: "DRAFTING",
  phase: 2,
  role: "DM",
  description:
    "Checks every upcoming stage gate for missing evidence, criteria and approvers. Flags gaps only — it can never pass a gate itself.",
  cadence: "DAILY",
  thresholds: [{ key: "gateHorizonDays", label: "Gate look-ahead (days)", min: 1, max: 90, step: 1 }],
  defaults: { gateHorizonDays: 14 },
  requiresApproval: true,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const horizon = cfgNum(ctx.config, "gateHorizonDays", 14);
    const { gateSoon } = await dataQualityIssues(horizon);

    if (!gateSoon.length) {
      return {
        summary: `No stage gate is due in the next ${horizon} day(s).`,
        findings: [{ severity: "INFO", title: "No gates in the window", detail: `Nothing planned before ${iso(new Date(Date.now() + horizon * DAY))}.` }],
      };
    }

    const findings: AgentFinding[] = [];
    for (const g of gateSoon) {
      const gaps: string[] = [];
      if (!g.evidence?.trim()) gaps.push("evidence pack");
      if (!g.criteria?.trim()) gaps.push("criteria");
      if (!g.approverName?.trim()) gaps.push("approver");
      const left = g.plannedDate ? daysUntil(g.plannedDate) : null;
      findings.push({
        severity: gaps.length >= 2 ? "CRITICAL" : gaps.length ? "WARNING" : "INFO",
        title: gaps.length
          ? `Gate ${g.code} (${g.name}) missing ${gaps.join(", ")}`
          : `Gate ${g.code} (${g.name}) ready for review`,
        detail: `${g.project.code} · planned ${iso(g.plannedDate)}${left !== null ? ` (${left} day(s) away)` : ""} · decision ${g.decisionStatus}`,
        projectId: g.projectId,
        ref: g.code,
        metricValue: gaps.length,
      });
    }

    const withGaps = findings.filter((f) => f.severity !== "INFO");
    if (!withGaps.length) {
      return { summary: `${gateSoon.length} upcoming gate(s) — all evidence packs complete.`, findings };
    }

    const worst = findings.some((f) => f.severity === "CRITICAL") ? "CRITICAL" : "WARNING";
    return {
      summary: `${withGaps.length} of ${gateSoon.length} upcoming gate(s) have readiness gaps.`,
      findings,
      action: {
        type: "NOTIFY",
        label: `Notify PMO admins about ${withGaps.length} gate readiness gap(s)`,
        payload: {
          title: `Gate readiness: ${withGaps.length} gap(s) before upcoming gates`,
          message: clip(withGaps.map((f) => `• ${f.title} — ${f.detail}`).join("\n"), 3500),
          severity: worst,
          roles: ["PMO_ADMIN"],
        },
      },
    };
  },
};

export const DRAFTERS: AgentDefinition[] = [
  crIntake,
  statusReporter,
  riskBrainstormer,
  workloadBalancer,
  gateReadiness,
];
