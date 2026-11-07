// PM CONTROL TOWER — AI agent definitions: PHASE 3 AUTONOMOUS (hard limits).
// These three execute their proposed action WITHOUT an approval gate — but
// only inside per-agent limits defined by the catalogue (max entries, capped
// recipients, wrapped engines). They cannot delete anything, cannot touch
// governance rules themselves, and every execution still lands in AgentRun +
// the audit ledger. Orgs that want a human in the loop can pause them in
// Administration → Settings → AI Agents.

import { evaluateGovernance } from "@/lib/engines/governance";
import { knowledgeSources, projectsBrief } from "../data";
import { cfgNum, clip, iso, type AgentContext, type AgentDefinition, type AgentFinding } from "../types";

// ---------------------------------------------------------------------------
// 12) IMPORT/EXPORT AGENT — NL request → validated export plan (or guidance)
// ---------------------------------------------------------------------------

const importExportAgent: AgentDefinition = {
  key: "import-export-agent",
  name: "Import/Export Agent",
  family: "AUTONOMOUS",
  phase: 3,
  role: "PMO",
  description:
    "Turns a natural-language request into a concrete export plan (entities, format, filters) delivered to the PMO inbox — or points imports at the validated import wizard. It never writes imported rows itself.",
  cadence: "MANUAL",
  thresholds: [{ key: "maxEntities", label: "Max entities per plan", min: 1, max: 10, step: 1 }],
  defaults: { maxEntities: 5 },
  requiresApproval: false,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const input = (ctx.input ?? "").trim();
    if (!input) {
      return {
        summary: "No request supplied — nothing planned.",
        findings: [{
          severity: "WARNING",
          title: "Describe what you want to export or import",
          detail: "Example: “export all open risks and overdue tasks for PRJ-001 to CSV”.",
        }],
      };
    }

    const maxEntities = cfgNum(ctx.config, "maxEntities", 5);
    const wantExport = /\bexport|download|csv|excel|spreadsheet\b/i.test(input);
    const wantImport = /\bimport|upload|ingest|bulk load\b/i.test(input);

    const ENTITY_PATTERNS: Array<[string, RegExp]> = [
      ["projects", /\bprojects?\b/i],
      ["tasks", /\btasks?\b|work packages?\b/i],
      ["risks", /\brisks?\b|\braid\b/i],
      ["resources", /\bresources?\b|people\b|team\b/i],
      ["budgets", /\bbudgets?\b|costs?\b|financials?\b/i],
      ["milestones", /\bmilestones?\b/i],
      ["change requests", /\bchange requests?\b|\bcriteria\b/i],
      ["gates", /\bgates?\b|stage gates?\b/i],
      ["timesheets", /\btimesheets?\b|hours\b/i],
      ["requirements", /\brequirements?\b/i],
    ];
    const entities = ENTITY_PATTERNS.filter(([, re]) => re.test(input)).map(([name]) => name).slice(0, maxEntities);

    const projects = await projectsBrief();
    const lower = input.toLowerCase();
    const project =
      projects.find((p) => lower.includes(p.code.toLowerCase())) ||
      projects.find((p) => lower.includes(p.name.toLowerCase()));

    const findings: AgentFinding[] = [];
    findings.push({
      severity: "INFO",
      title: wantImport ? "Import request detected" : wantExport ? "Export request detected" : "Ambiguous request",
      detail: clip(input, 300),
    });
    findings.push({
      severity: "INFO",
      title: entities.length ? `Entities in scope: ${entities.join(", ")}` : "No specific entity named",
      detail: project ? `Scoped to ${project.code} (${project.name}).` : "Portfolio-wide (no project code or name mentioned).",
      projectId: project?.id,
      ref: project?.code,
      metricValue: entities.length,
    });

    if (wantImport && !wantExport) {
      findings.push({
        severity: "WARNING",
        title: "Imports stay in the human-validated wizard",
        detail: "Open Data → Import: validate → dry-run → apply. This agent prepares the request but never writes imported rows.",
      });
      return {
        summary: "Import request acknowledged — routed to the validated import wizard (validate → dry-run → apply).",
        findings,
      };
    }

    if (!wantExport) {
      return {
        summary: "Request was neither a clear export nor a clear import — no plan produced.",
        findings,
      };
    }

    const plan = [
      `EXPORT PLAN — ${iso(new Date())}`,
      `Request: ${clip(input, 300)}`,
      `Scope: ${project ? `${project.code} (${project.name})` : "portfolio-wide"}`,
      `Entities: ${entities.join(", ") || "projects (default)"}`,
      "Format: CSV (UTF-8, header row)",
      "Delivery: inbox item with column map; execute from the relevant list view export button.",
    ].join("\n");

    return {
      summary: `Planned a CSV export of ${entities.length || 1} entit(y/ies) ${project ? `for ${project.code}` : "portfolio-wide"}.`,
      findings,
      action: {
        type: "EXPORT_PLAN",
        label: `Deliver export plan: ${entities.join(", ") || "projects"}${project ? ` (${project.code})` : ""}`,
        payload: { request: clip(input, 1000), entities, projectId: project?.id ?? null, format: "CSV" },
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 13) GOVERNANCE ROUTER — wraps evaluateGovernance() and routes breaches
// ---------------------------------------------------------------------------

const governanceRouter: AgentDefinition = {
  key: "governance-router",
  name: "Governance Router",
  family: "AUTONOMOUS",
  phase: 3,
  role: "DM",
  description:
    "Runs the platform's governance engine, then routes every new breach to the PMO inbox with the rule, metric and threshold attached. Acts only on admin-authored rules.",
  cadence: "DAILY",
  thresholds: [{ key: "maxFindings", label: "Max breaches reported", min: 5, max: 100, step: 5 }],
  defaults: { maxFindings: 30 },
  requiresApproval: false,
  raiseAlerts: false, // the governance engine raises its own de-duplicated alerts
  run: async (ctx: AgentContext) => {
    const cap = cfgNum(ctx.config, "maxFindings", 30);
    const result = await evaluateGovernance();
    const breaches = result.breaches.slice(0, cap);

    const findings: AgentFinding[] = breaches.map((b) => ({
      severity: (b.severity === "CRITICAL" || b.severity === "WARNING" || b.severity === "INFO")
        ? b.severity
        : "WARNING",
      title: `${b.ruleName}: ${b.metric} = ${b.value} breached threshold ${b.threshold}`,
      detail: `Project ${b.projectId} · rule ${b.ruleId} · routed to project owner, manager and PMO admins.`,
      projectId: b.projectId,
      ref: b.ruleName,
      metricValue: b.value,
    }));

    const summary =
      `Evaluated ${result.evaluated} metric check(s) across active governance rules — ${result.breaches.length} breach(es).`;
    if (!breaches.length) return { summary, findings };

    const worst = breaches.some((b) => b.severity === "CRITICAL") ? "CRITICAL" : "WARNING";
    return {
      summary,
      findings,
      action: {
        type: "NOTIFY",
        label: `Route ${breaches.length} governance breach(es) to PMO admins`,
        payload: {
          title: `Governance routing: ${breaches.length} breach(es)`,
          message: clip(breaches.map((b) => `• ${b.ruleName}: ${b.metric} = ${b.value} (threshold ${b.threshold})`).join("\n"), 3500),
          severity: worst,
          roles: ["PMO_ADMIN"],
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 14) KNOWLEDGE CURATOR — distils fresh decisions/lessons into AI memory
// ---------------------------------------------------------------------------

const knowledgeCurator: AgentDefinition = {
  key: "knowledge-curator",
  name: "Knowledge Curator",
  family: "AUTONOMOUS",
  phase: 3,
  role: "PMO",
  description:
    "Distils the week's decisions and closed risks into short, deduplicated knowledge entries that feed every AI feature. Suggest-only: it only ever adds, never edits or deletes.",
  cadence: "WEEKLY",
  thresholds: [
    { key: "lookbackDays", label: "Look-back window (days)", min: 1, max: 60, step: 1 },
    { key: "maxEntries", label: "Max entries per run", min: 1, max: 10, step: 1 },
  ],
  defaults: { lookbackDays: 7, maxEntries: 3 },
  requiresApproval: false,
  raiseAlerts: false,
  run: async (ctx: AgentContext) => {
    const lookback = cfgNum(ctx.config, "lookbackDays", 7);
    const cap = cfgNum(ctx.config, "maxEntries", 3);
    const { decisions, closedRisks } = await knowledgeSources(lookback);

    const entries: Array<{ kind: string; content: string; source: string }> = [];
    for (const d of decisions.slice(0, cap)) {
      entries.push({
        kind: "PATTERN",
        content: clip(`Decision: ${d.title}${d.decision ? ` — ${d.decision}` : ""}`, 400),
        source: "AGENT:knowledge-curator",
      });
    }
    for (const r of closedRisks.slice(0, Math.max(0, cap - entries.length))) {
      entries.push({
        kind: "PATTERN",
        content: clip(`Lesson: risk "${r.title}" (${r.category}) closed as ${r.status}${r.mitigation ? ` — worked: ${r.mitigation}` : ""}`, 400),
        source: "AGENT:knowledge-curator",
      });
    }

    const findings: AgentFinding[] = [
      {
        severity: "INFO",
        title: `Scanned ${decisions.length} decision(s) and ${closedRisks.length} closed risk(s) from the last ${lookback} day(s)`,
        detail: `Distilled to ${entries.length} knowledge entr(y/ies) (cap ${cap} per run).`,
        metricValue: entries.length,
      },
      ...entries.map((e) => ({
        severity: "INFO" as const,
        title: clip(e.content, 120),
        detail: "Will be added to AI memory (deduplicated; nothing is ever deleted).",
      })),
    ];

    const summary = `Scanned ${decisions.length} decision(s) + ${closedRisks.length} closed risk(s) → ${entries.length} knowledge entr(y/ies).`;
    if (!entries.length) return { summary, findings };

    return {
      summary,
      findings,
      action: {
        type: "KNOWLEDGE_PUBLISH",
        label: `Publish ${entries.length} knowledge entr(y/ies) to AI memory`,
        payload: { entries },
      },
    };
  },
};

export const AUTONOMOUS: AgentDefinition[] = [
  importExportAgent,
  governanceRouter,
  knowledgeCurator,
];
