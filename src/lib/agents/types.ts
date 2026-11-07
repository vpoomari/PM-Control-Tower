// PM CONTROL TOWER — AI agent runtime: shared types.
// An agent = a guarded worker that reads live platform data, reports findings
// through an append-only ledger (AgentRun) and, for drafting/autonomous agents,
// proposes an action that either waits for human approval or executes within
// hard limits. Definitions live in catalog.ts; orchestration in runner.ts.

/** Phase 1 = read-only monitor · 2 = approval-gated drafter · 3 = autonomous (limited). */
export type AgentPhase = 1 | 2 | 3;
export type AgentFamily = "MONITOR" | "DRAFTING" | "AUTONOMOUS";
export type AgentRole = "PM" | "RM" | "DM" | "PMO";
export type AgentCadence = "MANUAL" | "HOURLY" | "DAILY" | "WEEKLY";
export type AgentTrigger = "MANUAL" | "SCHEDULED";
export type FindingSeverity = "INFO" | "WARNING" | "CRITICAL";

/** One concrete observation produced by an agent — always backed by live data. */
export interface AgentFinding {
  severity: FindingSeverity;
  title: string;
  detail?: string;
  projectId?: string;
  /** Business reference shown in the UI, e.g. "TASK-142" or a milestone code. */
  ref?: string;
  metricValue?: number;
}

/** A proposed write. Never executed directly — goes through apply.ts. */
export interface ProposedAction {
  /** Handler key in apply.ts — validated there with zod before any write. */
  type: string;
  /** Human-readable description shown on the approval card. */
  label: string;
  payload: Record<string, unknown>;
}

/** What a runner returns. Deterministic — the AI only narrates it. */
export interface AgentRunResult {
  /** Deterministic summary (always present; used as fallback narration). */
  summary: string;
  findings: AgentFinding[];
  action?: ProposedAction;
}

export type AgentConfigValue = number | string | boolean;
export interface AgentConfig { [key: string]: AgentConfigValue }

export interface AgentContext {
  /** Merged config: catalogue defaults + organisation overrides (AgentProfile). */
  config: AgentConfig;
  trigger: AgentTrigger;
  /** Display name for audit/ledger ("Jane Doe" or "system:scheduler"). */
  actorName: string;
  /** Optional free-text input for manual runs (natural-language agents). */
  input?: string;
}

/** Editable numeric threshold rendered in Administration → Settings → AI Agents. */
export interface AgentThreshold {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface AgentDefinition {
  key: string;
  name: string;
  family: AgentFamily;
  phase: AgentPhase;
  role: AgentRole;
  description: string;
  /** Default schedule cadence (org can override per profile). */
  cadence: AgentCadence;
  /** Thresholds the organisation may tune; values live in AgentProfile.configJson. */
  thresholds: AgentThreshold[];
  defaults: AgentConfig;
  /** True → the proposed action waits for an admin approval in Settings. */
  requiresApproval: boolean;
  /** Monitors: raise de-duplicated AlertEvents for WARNING/CRITICAL findings. */
  raiseAlerts?: boolean;
  run: (ctx: AgentContext) => Promise<AgentRunResult>;
}

/** Outcome of an approval (apply.ts) — detail is shown in the run history. */
export interface ApplyResult {
  ok: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Small helpers shared by every definition (config access + date formatting)
// ---------------------------------------------------------------------------

/** Read a numeric config value with a safe fallback (never NaN). */
export function cfgNum(config: AgentConfig, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Read a string config value with a safe fallback. */
export function cfgStr(config: AgentConfig, key: string, fallback: string): string {
  const v = config[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

/** ISO date for findings/details ("" when absent). */
export function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

/** Clip free text to a hard cap (findings payloads stay small). */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
