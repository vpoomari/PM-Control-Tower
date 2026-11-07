// PM CONTROL TOWER — agent runner: the orchestration loop.
//
//   kill switch → profile/cadence/budget gates → definition.run() (reads)
//     → narration (AI with honest heuristic fallback)
//     → [approval-gated action | auto-apply within limits]
//     → AlertEvent de-duplication (monitors) → AgentRun ledger → audit → realtime
//
// Enterprise guarantees:
//   - Global kill switch: FeatureFlag AGENT_RUNTIME (missing row = enabled).
//   - Per-agent activation: only ACTIVE AgentProfiles ever run.
//   - Cadence-aware sweep (HOURLY/DAILY/WEEKLY) with MANUAL excluded.
//   - Lifetime token budget per agent (0 = unlimited) checked BEFORE the run.
//   - Every run is persisted append-only on AgentRun, audited, and announced
//     over realtime as "agent:run". Failures are recorded, never thrown.

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { narrate } from "./narrate";
import { applyAction } from "./apply";
import { loadAgent, mergedConfig, isDue } from "./registry";
import type { AgentFinding, AgentRunResult, ProposedAction } from "./types";

export type RunStatus =
  | "SUCCESS" | "NO_FINDINGS" | "FAILED" | "PENDING_APPROVAL" | "APPLIED" | "REJECTED" | "SKIPPED";

export interface RunOptions {
  trigger?: "MANUAL" | "SCHEDULED";
  actorName?: string;
  actorUserId?: string | null;
  input?: string;
  /** Manual runs ignore the cadence due-check but never ignore activation. */
  ignoreCadence?: boolean;
}

export interface RunOutcome {
  runId: string | null;
  key: string;
  status: RunStatus;
  summary: string;
  findingCount: number;
  actionType: string | null;
  narrationSource: "AI" | "HEURISTIC";
  tokens: number;
  durationMs: number;
  error?: string;
}

const MAX_ALERTS_PER_RUN = 20;

/** Global kill switch — FeatureFlag row missing = enabled (fail open by design). */
export async function agentsRuntimeEnabled(): Promise<boolean> {
  try {
    const flag = await db.featureFlag.findUnique({ where: { key: "AGENT_RUNTIME" }, select: { enabled: true } });
    return flag ? flag.enabled : true;
  } catch {
    return false; // DB unavailable → do not run agents
  }
}

/** Cumulative tokens already burned by an agent (lifetime budget accounting). */
async function spentTokens(agentKey: string): Promise<number> {
  try {
    const agg = await db.agentRun.aggregate({
      where: { agentKey, status: { notIn: ["SKIPPED"] } },
      _sum: { tokens: true },
    });
    return agg._sum.tokens ?? 0;
  } catch {
    return 0;
  }
}

async function persistRun(data: {
  agentKey: string;
  trigger: string;
  status: RunStatus;
  summary: string;
  findings: AgentFinding[];
  actionType?: string | null;
  actionJson?: string | null;
  narrationSource: "AI" | "HEURISTIC";
  tokens: number;
  durationMs: number;
  actorUserId?: string | null;
  actorName?: string | null;
  errorMessage?: string | null;
}): Promise<string | null> {
  try {
    const run = await db.agentRun.create({
      data: {
        agentKey: data.agentKey,
        trigger: data.trigger,
        status: data.status,
        summary: data.summary.slice(0, 4000),
        findingsJson: JSON.stringify(data.findings.slice(0, 100)),
        actionType: data.actionType ?? null,
        actionJson: data.actionJson ?? null,
        narrationSource: data.narrationSource,
        tokens: Math.max(0, Math.round(data.tokens)),
        durationMs: Math.max(0, Math.round(data.durationMs)),
        actorUserId: data.actorUserId ?? null,
        actorName: data.actorName ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    });
    await db.agentProfile
      .update({ where: { key: data.agentKey }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } })
      .catch(() => undefined);
    return run.id;
  } catch (err) {
    console.error("[agents] failed to persist run", err);
    return null;
  }
}

async function finalizeRun(runId: string | null, data: { status: RunStatus; summary: string; errorMessage?: string | null }): Promise<void> {
  if (!runId) return;
  await db.agentRun
    .update({
      where: { id: runId },
      data: { status: data.status, summary: data.summary.slice(0, 4000), errorMessage: data.errorMessage ?? null },
    })
    .catch(() => undefined);
}

/** Raise de-duplicated AlertEvents for WARNING/CRITICAL monitor findings. */
async function raiseAlerts(agentKey: string, agentName: string, findings: AgentFinding[]): Promise<number> {
  const source = `AGENT:${agentKey}`;
  let raised = 0;
  for (const f of findings) {
    if (raised >= MAX_ALERTS_PER_RUN) break;
    if (f.severity !== "WARNING" && f.severity !== "CRITICAL") continue;
    try {
      const dupe = await db.alertEvent.findFirst({
        where: { source, status: "NEW", title: f.title },
        select: { id: true },
      });
      if (dupe) continue;
      await db.alertEvent.create({
        data: {
          projectId: f.projectId ?? null,
          alertType: "AGENT",
          severity: f.severity,
          title: f.title.slice(0, 200),
          message: (f.detail ?? `${agentName} finding`).slice(0, 1000),
          metricValue: typeof f.metricValue === "number" ? f.metricValue : null,
          status: "NEW",
          source,
        },
      });
      raised += 1;
    } catch {
      /* alert bookkeeping must never break a run */
    }
  }
  if (raised) emitRealtime("alert:created", { agent: agentKey, count: raised });
  return raised;
}

const worstSeverity = (findings: AgentFinding[]): "INFO" | "WARNING" | "CRITICAL" =>
  findings.some((f) => f.severity === "CRITICAL")
    ? "CRITICAL"
    : findings.some((f) => f.severity === "WARNING")
      ? "WARNING"
      : "INFO";

/**
 * Run one agent. NEVER throws — every failure mode becomes a FAILED/SKIPPED
 * outcome (and a ledger row when one could be written).
 */
export async function runAgent(key: string, opts: RunOptions = {}): Promise<RunOutcome> {
  const started = Date.now();
  const trigger = opts.trigger ?? "MANUAL";
  const actorName = opts.actorName ?? (trigger === "SCHEDULED" ? "system:scheduler" : "system");
  const base: RunOutcome = {
    runId: null, key, status: "FAILED", summary: "", findingCount: 0,
    actionType: null, narrationSource: "HEURISTIC", tokens: 0, durationMs: 0,
  };

  try {
    if (!(await agentsRuntimeEnabled())) {
      return { ...base, status: "SKIPPED", error: "Agent runtime is disabled (AGENT_RUNTIME kill switch)." };
    }

    const loaded = await loadAgent(key);
    if (!loaded) return { ...base, status: "FAILED", error: `Unknown agent "${key}".` };
    const { def, profile } = loaded;

    if (!profile || profile.status !== "ACTIVE") {
      return { ...base, status: "SKIPPED", error: "Agent is paused — activate it in Administration → Settings → AI Agents." };
    }

    const config = mergedConfig(def, profile.config);

    // Cadence gate (scheduled sweeps only; manual runs may force a run).
    if (trigger === "SCHEDULED" && !opts.ignoreCadence && !isDue(def, profile.config, profile.lastRunAt)) {
      return { ...base, status: "SKIPPED", error: "Not due yet for the configured cadence." };
    }

    // Lifetime token budget gate (0 = unlimited).
    if (profile.budgetTokens > 0) {
      const spent = await spentTokens(key);
      if (spent >= profile.budgetTokens) {
        const runId = await persistRun({
          agentKey: key, trigger, status: "SKIPPED",
          summary: `Token budget exhausted: ${spent} of ${profile.budgetTokens} used.`,
          findings: [], narrationSource: "HEURISTIC", tokens: 0,
          durationMs: Date.now() - started, actorUserId: opts.actorUserId ?? null, actorName,
          errorMessage: "Lifetime token budget exhausted — raise the budget in Administration → Settings → AI Agents.",
        });
        return { ...base, runId, status: "SKIPPED", summary: "Token budget exhausted.", error: "Lifetime token budget exhausted." };
      }
    }

    // 1) The definition reads live data (deterministic findings).
    let result: AgentRunResult;
    try {
      result = await def.run({ config, trigger, actorName, input: opts.input });
    } catch (err) {
      console.error(`[agents] ${key} run failed`, err);
      const runId = await persistRun({
        agentKey: key, trigger, status: "FAILED",
        summary: `${def.name} failed while reading platform data.`,
        findings: [], narrationSource: "HEURISTIC", tokens: 0,
        durationMs: Date.now() - started, actorUserId: opts.actorUserId ?? null, actorName,
        errorMessage: String(err instanceof Error ? err.message : err).slice(0, 500),
      });
      await writeAudit({
        userId: opts.actorUserId ?? null, userName: actorName, role: "AI_AGENT",
        action: "EXECUTE", entityType: "AgentRun", entityId: runId, entityName: def.name,
        after: { status: "FAILED" }, context: `agent:${key}`, severity: "WARNING",
      }).catch(() => undefined);
      emitRealtime("agent:run", { agentKey: key, agentName: def.name, runId, status: "FAILED", findings: 0 });
      return { ...base, runId, status: "FAILED", error: "Run failed while reading platform data." };
    }

    const findings: AgentFinding[] = Array.isArray(result.findings) ? result.findings : [];
    const action: ProposedAction | undefined = result.action;

    // 2) Narration — AI with honest heuristic fallback (never throws).
    const narration = await narrate(def, result);
    const durationMs = Date.now() - started;

    // 3) Status: approval gate vs autonomous apply (applied AFTER the ledger
    //    row exists so the audit/entity id points at the real run).
    let status: RunStatus = action
      ? def.requiresApproval ? "PENDING_APPROVAL" : "APPLIED"
      : findings.length ? "SUCCESS" : "NO_FINDINGS";
    let actionType: string | null = action?.type ?? null;
    let actionJson: string | null = action ? JSON.stringify({ type: action.type, label: action.label, payload: action.payload }) : null;
    let summaryText = narration.text;
    let error: string | undefined;

    const runId = await persistRun({
      agentKey: key, trigger, status, summary: summaryText, findings, actionType, actionJson,
      narrationSource: narration.source, tokens: narration.tokens,
      durationMs, actorUserId: opts.actorUserId ?? null, actorName,
    });

    if (action && !def.requiresApproval) {
      const applied = await applyAction(action, {
        runId: runId ?? "unknown", agentKey: key, agentName: def.name, actorName,
        actorUserId: opts.actorUserId ?? null,
      });
      summaryText = `${narration.text} → ${applied.detail}`;
      if (!applied.ok) {
        status = "FAILED";
        error = applied.detail;
      }
      await finalizeRun(runId, { status, summary: summaryText, errorMessage: error ?? null });
    }

    // 4) Monitors raise de-duplicated alerts for WARNING/CRITICAL findings.
    if (def.raiseAlerts && findings.length && status !== "FAILED") {
      await raiseAlerts(key, def.name, findings);
    }

    // 5) Audit + realtime announcement.
    await writeAudit({
      userId: opts.actorUserId ?? null, userName: actorName, role: "AI_AGENT",
      action: "EXECUTE", entityType: "AgentRun", entityId: runId, entityName: def.name,
      after: { status, findings: findings.length, actionType, narrationSource: narration.source, tokens: narration.tokens },
      context: `agent:${key}`,
      severity: status === "FAILED" ? "WARNING" : worstSeverity(findings) === "INFO" ? "INFO" : "WARNING",
    }).catch(() => undefined);

    emitRealtime("agent:run", { agentKey: key, agentName: def.name, runId, status, findings: findings.length });

    return {
      runId, key, status, summary: summaryText, findingCount: findings.length,
      actionType, narrationSource: narration.source, tokens: narration.tokens, durationMs, error,
    };
  } catch (err) {
    // Absolute backstop — runAgent must never crash a caller.
    console.error(`[agents] runAgent(${key}) unexpected failure`, err);
    return { ...base, status: "FAILED", error: "Unexpected agent failure — see server logs.", durationMs: Date.now() - started };
  }
}

export interface SweepSummary {
  scanned: number;
  due: number;
  ran: number;
  failed: number;
  outcomes: RunOutcome[];
}

/** Scheduled sweep: run every ACTIVE agent whose cadence is due. */
export async function sweepAgents(): Promise<SweepSummary> {
  const summary: SweepSummary = { scanned: 0, due: 0, ran: 0, failed: 0, outcomes: [] };
  try {
    if (!(await agentsRuntimeEnabled())) return summary;
    const profiles = await db.agentProfile.findMany({ where: { status: "ACTIVE" } });
    summary.scanned = profiles.length;
    for (const p of profiles) {
      const loaded = await loadAgent(p.key);
      if (!loaded || !loaded.profile) continue;
      if (!isDue(loaded.def, loaded.profile.config, loaded.profile.lastRunAt)) continue;
      summary.due += 1;
      const outcome = await runAgent(p.key, { trigger: "SCHEDULED", actorName: "system:scheduler" });
      summary.ran += 1;
      if (outcome.status === "FAILED") summary.failed += 1;
      summary.outcomes.push(outcome);
      // Small pacing gap so provider rate limits are respected across agents.
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (err) {
    console.error("[agents] sweep failed", err);
  }
  return summary;
}
