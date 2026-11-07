// PM CONTROL TOWER — TowerIntegration Hub: ingest pipeline (pure core).
// Implements the execution flow for webhooks / polling cycles / BI refreshes:
//   1. Identify the source tool + authenticate the payload (HMAC/JWT/OAuth/mTLS)
//   2. Extract the raw JSON/XML/CSV
//   3. Apply the tool's facade template → normalized records
//   4. Harmonize each record into the Unified Work Model (identity, status,
//      dates, priority)
//   5. Route anomalies / missing requireds / validation errors to the DLQ
//   6. Hand harmonized UWM payloads to the queue for WBS & CPM evaluation
// No I/O here — the service layer wraps this with the DB, breaker and audit.

import { hubTool, type HubIngressMode } from "./registry";
import { facadeFor } from "./facade";
import { harmonize, type HubDirectoryEntry, type UwmWorkItem } from "./uwm";
import { buildDlqEntry, routeToQueue, type DlqEntry, type QueueRoute } from "./dlq";
import { authenticateIngress, type MtlsPolicy } from "./security";

export interface PipelineInput {
  toolId: string;
  mode: HubIngressMode;
  /** Parsed JSON payload or raw text (CSV). */
  payload: unknown;
  /** Raw body exactly as received (for HMAC verification). */
  rawBody: string;
  headers: Record<string, string>;
  /** Connection auth material (from the HubConnection record). */
  auth: {
    kind: "HMAC" | "JWT" | "OAUTH2" | "MTLS" | "NONE";
    secret?: string | null;
    mtlsPolicy?: MtlsPolicy;
    clientCertCn?: string | null;
    clientCertPresent?: boolean;
  };
  /** Corporate directory for identity resolution. */
  directory?: HubDirectoryEntry[];
  nowMs?: number;
}

export interface PipelineOutcome {
  /** HARMONIZED — items handed to the queue; PARTIAL — some items harmonized, some DLQ'd; DLQ — all blocked; REJECTED — auth/tool failure; */
  outcome: "HARMONIZED" | "PARTIAL" | "DLQ" | "REJECTED";
  toolId: string;
  route: QueueRoute | null;
  /** UWM items ready for WBS/CPM evaluation. */
  items: UwmWorkItem[];
  /** Every anomaly worth monitoring (BLOCKING or WARN). */
  dlq: DlqEntry[];
  /** Counts for the Hub dashboard. */
  stats: { extracted: number; harmonized: number; dlqEntries: number; authFailures: number };
  reason: string | null;
}

/**
 * Run one payload through the full Hub pipeline. Never throws: every failure
 * mode becomes a visible, monitored outcome (REJECTED / DLQ), so no payload
 * is ever lost silently and no linkage breaks.
 */
export function runPipeline(input: PipelineInput): PipelineOutcome {
  const now = input.nowMs ?? Date.now();
  const empty = (outcome: PipelineOutcome["outcome"], reason: string, route: QueueRoute | null = null): PipelineOutcome => ({
    outcome, toolId: input.toolId, route, items: [], dlq: [], stats: { extracted: 0, harmonized: 0, dlqEntries: 0, authFailures: outcome === "REJECTED" && reason.startsWith("auth") ? 1 : 0 }, reason,
  });

  // --- Step 1: identify the source system -------------------------------
  const tool = hubTool(input.toolId);
  if (!tool) {
    // Unknown tool: still DLQ the payload so it is visible + replayable later.
    const entry = buildDlqEntry({
      toolId: input.toolId, mode: input.mode, anomalies: ["unknown_tool"],
      reason: `No registry entry for tool "${input.toolId}"`, rawPayload: input.payload, nowMs: now,
    });
    return { ...empty("DLQ", "unknown_tool"), dlq: [entry], stats: { extracted: 0, harmonized: 0, dlqEntries: 1, authFailures: 0 } };
  }

  // --- Step 1b: authenticate the payload --------------------------------
  const auth = authenticateIngress({
    kind: input.auth.kind, rawBody: input.rawBody, headers: input.headers,
    secret: input.auth.secret, nowMs: now,
    clientCertCn: input.auth.clientCertCn, clientCertPresent: input.auth.clientCertPresent,
    mtlsPolicy: input.auth.mtlsPolicy,
  });
  if (!auth.ok) {
    const entry = buildDlqEntry({
      toolId: input.toolId, mode: input.mode, anomalies: ["auth_failed"],
      reason: `Authentication failed: ${auth.reason ?? "unknown"}`, rawPayload: input.payload, nowMs: now,
    });
    // Auth failures are security events: DLQ (monitoring) + REJECTED (nothing processed).
    return {
      outcome: "REJECTED", toolId: input.toolId, route: routeToQueue(input.toolId, input.mode),
      items: [], dlq: [entry],
      stats: { extracted: 0, harmonized: 0, dlqEntries: 1, authFailures: 1 },
      reason: `auth_failed:${auth.reason ?? "unknown"}`,
    };
  }

  const route = routeToQueue(input.toolId, input.mode)!; // tool exists ⇒ route exists

  // --- Step 2+3: extract raw + apply the facade template ----------------
  let envelope;
  try {
    envelope = facadeFor(tool.facade)({ toolId: input.toolId, mode: input.mode, payload: input.payload });
  } catch (e) {
    const entry = buildDlqEntry({
      toolId: input.toolId, mode: input.mode, anomalies: ["payload_facade_error"],
      reason: `Facade ${tool.facade} failed: ${e instanceof Error ? e.message : String(e)}`,
      rawPayload: input.payload, nowMs: now,
    });
    return { ...empty("DLQ", "facade_error", route), dlq: [entry], stats: { extracted: 0, harmonized: 0, dlqEntries: 1, authFailures: 0 } };
  }

  // Envelope-level anomalies (empty batches, unparsable payloads) → DLQ.
  const dlq: DlqEntry[] = envelope.anomalies.map((a) =>
    buildDlqEntry({ toolId: input.toolId, mode: input.mode, anomalies: [a], reason: `Envelope anomaly: ${a}`, rawPayload: input.payload, nowMs: now }),
  );

  if (envelope.records.length === 0) {
    return {
      outcome: "DLQ", toolId: input.toolId, route, items: [], dlq,
      stats: { extracted: 0, harmonized: 0, dlqEntries: dlq.length, authFailures: 0 },
      reason: "no_records_extracted",
    };
  }

  // --- Step 4: harmonize each record into the UWM ------------------------
  const items: UwmWorkItem[] = [];
  for (const record of envelope.records) {
    const result = harmonize({
      source: input.toolId,
      sourceId: record.sourceId,
      title: record.title,
      status: record.status,
      priority: record.priority,
      assignee: record.assignee,
      startDate: record.startDate,
      dueDate: record.dueDate,
      updatedAt: record.updatedAt,
      url: record.url,
      extras: record.extras,
      directory: input.directory ?? [],
    });

    // --- Step 5: anomalies → Dead Letter Queue --------------------------
    if (result.anomalies.length > 0) {
      dlq.push(buildDlqEntry({
        toolId: input.toolId, mode: input.mode, anomalies: result.anomalies,
        reason: result.valid ? "Harmonized with warnings" : "Missing required UWM fields",
        rawPayload: record, item: result.valid ? result.item : null, nowMs: now,
      }));
    }

    // --- Step 6: valid items hand off to the engine queue ----------------
    if (result.valid) items.push(result.item);
  }

  const harmonized = items.length;
  const outcome: PipelineOutcome["outcome"] =
    harmonized === 0 ? "DLQ" : dlq.length > 0 ? "PARTIAL" : "HARMONIZED";

  return {
    outcome, toolId: input.toolId, route, items, dlq,
    stats: { extracted: envelope.records.length, harmonized, dlqEntries: dlq.length, authFailures: 0 },
    reason: null,
  };
}
