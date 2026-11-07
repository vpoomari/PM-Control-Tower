// PM CONTROL TOWER — TowerIntegration Hub: queue routing + Dead Letter Queue.
// Pure decision functions: each source category routes to its processing
// queue; anomalies (missing requireds, unparsable payloads, auth failures)
// are captured as Dead Letter entries for monitoring and replay — nothing is
// ever silently dropped.

import { hubTool, queueForCategory, type HubCategory, type HubIngressMode } from "./registry";
import type { UwmWorkItem } from "./uwm";

// ---------------------------------------------------------------------------
// Queue routing — source category → processing queue (+ priority lane).
// ---------------------------------------------------------------------------

export interface QueueRoute {
  queue: string;
  category: HubCategory;
  /** Higher priority lanes process first: 0 = realtime webhook, 1 = BI refresh, 2 = poll, 3 = upload. */
  lane: number;
}

const LANE_BY_MODE: Record<HubIngressMode, number> = {
  WEBHOOK: 0, BI_REFRESH: 1, POLL: 2, CSV_UPLOAD: 3,
};

export function routeToQueue(toolId: string, mode: HubIngressMode): QueueRoute | null {
  const tool = hubTool(toolId);
  if (!tool) return null; // unknown tool → caller DLQs it
  return { queue: queueForCategory(tool.category), category: tool.category, lane: LANE_BY_MODE[mode] ?? 2 };
}

// ---------------------------------------------------------------------------
// Dead Letter Queue — anomaly capture, classification and replay decisions.
// ---------------------------------------------------------------------------

export type DlqSeverity = "BLOCKING" | "WARN";

export interface DlqEntry {
  toolId: string;
  mode: HubIngressMode;
  queue: string | null;
  severity: DlqSeverity;
  /** Machine-readable anomaly codes, e.g. missing_required:sourceId. */
  anomalies: string[];
  reason: string;
  /** Raw payload (truncated) for inspection + replay. */
  payloadPreview: string;
  /** UWM item when harmonization partially succeeded (WARN entries keep it). */
  item: UwmWorkItem | null;
  at: string;
}

const PAYLOAD_PREVIEW_MAX = 4_000;

/** Classify a set of anomalies: required-field failures block, vocabulary misses warn. */
export function classifyAnomalies(anomalies: string[]): DlqSeverity {
  const blocking = anomalies.some((a) =>
    a.startsWith("missing_required:") ||
    a.startsWith("payload_") ||
    a === "unknown_tool" ||
    a === "auth_failed",
  );
  return blocking ? "BLOCKING" : "WARN";
}

export interface BuildDlqInput {
  toolId: string;
  mode: HubIngressMode;
  anomalies: string[];
  reason: string;
  rawPayload: unknown;
  item?: UwmWorkItem | null;
  nowMs?: number;
}

/** Build a DLQ entry (payload truncated for storage). */
export function buildDlqEntry(input: BuildDlqInput): DlqEntry {
  const tool = hubTool(input.toolId);
  return {
    toolId: input.toolId,
    mode: input.mode,
    queue: tool ? queueForCategory(tool.category) : null,
    severity: classifyAnomalies(input.anomalies),
    anomalies: input.anomalies,
    reason: input.reason,
    payloadPreview: truncatePayload(input.rawPayload),
    item: input.item ?? null,
    at: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}

export function truncatePayload(payload: unknown): string {
  let text: string;
  if (typeof payload === "string") text = payload;
  else {
    try { text = JSON.stringify(payload); } catch { text = String(payload); }
  }
  if (text.length <= PAYLOAD_PREVIEW_MAX) return text;
  return `${text.slice(0, PAYLOAD_PREVIEW_MAX)}…[+${text.length - PAYLOAD_PREVIEW_MAX} chars]`;
}

/** Replay decision: BLOCKING entries are replayable once the cause is fixed. */
export function canReplay(entry: Pick<DlqEntry, "severity" | "anomalies">): boolean {
  // Auth failures are not replayable from the DLQ — the connection must be fixed.
  if (entry.anomalies.includes("auth_failed")) return false;
  // Unknown tools are not replayable until the registry knows the tool.
  if (entry.anomalies.includes("unknown_tool")) return false;
  return true;
}
