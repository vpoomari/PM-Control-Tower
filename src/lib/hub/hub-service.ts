// PM CONTROL TOWER — TowerIntegration Hub: service layer.
// Wraps the pure pipeline with persistence: connection lifecycle, circuit
// breaker state, the append-only HubEvent ledger, Dead Letter Queue rows and
// the handoff contract into the PM Control Tower WBS/CPM engine. Egress calls
// (poll cycles) run through the breaker + exponential backoff.

import { db } from "@/lib/db";
import { emitRealtime } from "@/lib/realtime";
import { writeAudit } from "@/lib/audit";
import {
  HUB_QUEUES, HUB_TOOLS, hubTool, hubCatalog,
  type HubCategory, type HubIngressMode,
} from "./registry";
import { runPipeline, type PipelineOutcome } from "./pipeline";
import { decryptSecret, encryptSecret } from "@/lib/ai/key-vault";
import {
  breakerAllow, breakerClosed, breakerFailure, breakerSuccess, breakerTick,
  backoffDelay, DEFAULT_BACKOFF, DEFAULT_BREAKER,
  type BreakerSnapshot,
} from "./breaker";
import { computeCPM, type CpmTaskInput, type CpmDepInput } from "@/lib/engines/cpm";
import type { HubDirectoryEntry, UwmWorkItem } from "./uwm";
import { canReplay, classifyAnomalies, type DlqEntry } from "./dlq";

// ---------------------------------------------------------------------------
// Directory — corporate email/SSO identities for identity resolution.
// ---------------------------------------------------------------------------

export async function loadDirectory(): Promise<HubDirectoryEntry[]> {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true } });
  // External-id maps come from IdentityProvider rows when present; the core
  // directory always carries email + display name (the UWM target identity).
  return users.map((u) => ({
    email: u.email,
    name: u.name ?? undefined,
    externalIds: {},
  }));
}

// ---------------------------------------------------------------------------
// Connection bootstrap — one row per registry tool (idempotent).
// ---------------------------------------------------------------------------

export async function ensureConnections(userId?: string | null): Promise<void> {
  for (const tool of HUB_TOOLS) {
    const existing = await db.hubConnection.findUnique({ where: { toolId: tool.id } });
    if (existing) continue;
    // Link to a seeded Integration row when the name matches (nothing de-linked).
    const integration = tool.linkedIntegration
      ? await db.integration.findFirst({ where: { name: tool.linkedIntegration } })
      : null;
    await db.hubConnection.create({
      data: {
        toolId: tool.id,
        name: tool.name,
        category: tool.category,
        status: "PAUSED",
        authKind: tool.auth[0] === "BASIC" ? "NONE" : tool.auth[0] === "API_KEY" ? "NONE" : tool.auth[0],
        ingressMode: tool.ingress[0],
        integrationId: integration?.id ?? null,
        configJson: JSON.stringify({ pollMinutes: tool.pollMinutes, hint: tool.hint }),
        createdBy: userId ?? null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Connection view-models
// ---------------------------------------------------------------------------

interface ConnectionRow {
  id: string; toolId: string; name: string; category: string; status: string;
  authKind: string; authStatus: string; ingressMode: string; breakerState: string;
  breakerJson: string | null; ingestedCount: number; harmonizedCount: number;
  dlqCount: number; lastIngestAt: Date | null; lastError: string | null;
  integrationId: string | null; secretEnc: string | null; configJson: string | null;
}

function breakerSnapshotOf(row: Pick<ConnectionRow, "breakerJson" | "breakerState">): BreakerSnapshot {
  if (row.breakerJson) {
    try { return JSON.parse(row.breakerJson) as BreakerSnapshot; } catch { /* fall through */ }
  }
  return { ...breakerClosed(), state: (row.breakerState as BreakerSnapshot["state"]) ?? "CLOSED" };
}

export interface ConnectionView {
  toolId: string; name: string; vendor: string; category: HubCategory;
  queue: string; facade: string; auth: string[]; ingress: string[];
  hint: string; linkedIntegration: string | null; namedInDirective: boolean;
  pollMinutes: number;
  status: string; authKind: string; authStatus: string; ingressMode: string;
  breaker: { state: string; consecutiveFailures: number; retryAtMs: number; trips: number; lastError: string | null; allowNow: boolean };
  counters: { ingested: number; harmonized: number; dlq: number };
  lastIngestAt: string | null; hasSecret: boolean;
}

export function connectionView(row: ConnectionRow, nowMs = Date.now()): ConnectionView {
  const tool = hubTool(row.toolId);
  const snap = breakerSnapshotOf(row);
  const ticked = breakerTick(snap, nowMs);
  return {
    toolId: row.toolId, name: row.name, vendor: tool?.vendor ?? "—",
    category: (tool?.category ?? "DATA_SPREADSHEET_SPECIALIZED") as HubCategory,
    queue: tool ? HUB_QUEUES.find((q) => q.category === tool.category)?.id ?? "" : "",
    facade: tool?.facade ?? "generic",
    auth: tool?.auth ?? [], ingress: tool?.ingress ?? [],
    hint: tool?.hint ?? "", linkedIntegration: row.integrationId,
    namedInDirective: tool?.namedInDirective ?? false,
    pollMinutes: tool?.pollMinutes ?? 0,
    status: row.status, authKind: row.authKind, authStatus: row.authStatus,
    ingressMode: row.ingressMode,
    breaker: {
      state: ticked.state, consecutiveFailures: ticked.consecutiveFailures,
      retryAtMs: ticked.retryAtMs, trips: ticked.trips, lastError: ticked.lastError,
      allowNow: breakerAllow(ticked, nowMs),
    },
    counters: { ingested: row.ingestedCount, harmonized: row.harmonizedCount, dlq: row.dlqCount },
    lastIngestAt: row.lastIngestAt?.toISOString() ?? null,
    hasSecret: Boolean(row.secretEnc),
  };
}

// ---------------------------------------------------------------------------
// Ingest — one payload through breaker → pipeline → ledger → DLQ → engine.
// ---------------------------------------------------------------------------

export interface IngestResult extends PipelineOutcome {
  connectionId: string;
  eventId: string;
  durationMs: number;
  handoff?: EngineHandoff | null;
}

export async function ingestPayload(opts: {
  toolId: string;
  mode: HubIngressMode;
  payload: unknown;
  rawBody: string;
  headers: Record<string, string>;
  clientCertCn?: string | null;
  clientCertPresent?: boolean;
  nowMs?: number;
}): Promise<IngestResult> {
  const now = opts.nowMs ?? Date.now();
  const connection = await db.hubConnection.findUnique({ where: { toolId: opts.toolId } });
  if (!connection) throw new Error(`No Hub connection for tool "${opts.toolId}"`);

  // ---- Circuit breaker gate (applies to delivery attempts) --------------
  const snap = breakerTick(breakerSnapshotOf(connection), now);
  if (!breakerAllow(snap, now)) {
    const waitMs = snap.retryAtMs - now;
    const entry = buildPersistedDlq({
      connectionId: connection.id, toolId: opts.toolId, mode: opts.mode,
      anomalies: ["breaker_open"], reason: `Circuit breaker OPEN — retry in ${Math.ceil(waitMs / 1000)}s`,
      rawPayload: opts.payload, nowMs: now,
    });
    await db.hubDeadLetter.create({ data: entry });
    await bumpCounters(connection.id, { dlq: 1, lastIngestAt: new Date(now), lastError: entry.reason });
    await writeAudit({
      userId: null, userName: "TowerIntegration Hub", role: "SYSTEM",
      action: "REJECT", entityType: "HubConnection", entityId: connection.id, entityName: connection.name,
      after: { reason: entry.reason, breakerState: snap.state }, severity: "WARNING",
    });
    emitRealtime("integration:changed", { tool: opts.toolId, breaker: snap.state });
    return {
      connectionId: connection.id, eventId: "", durationMs: 0,
      outcome: "REJECTED", toolId: opts.toolId, route: null, items: [], dlq: [],
      stats: { extracted: 0, harmonized: 0, dlqEntries: 1, authFailures: 0 },
      reason: "breaker_open",
    };
  }

  // ---- Decrypt connection auth material ---------------------------------
  let secret: string | null = null;
  if (connection.secretEnc) {
    try { secret = decryptSecret(connection.secretEnc); } catch { secret = null; }
  }

  // ---- Run the pure pipeline -------------------------------------------
  const directory = await loadDirectory();
  const started = Date.now();
  const outcome = runPipeline({
    toolId: opts.toolId, mode: opts.mode, payload: opts.payload,
    rawBody: opts.rawBody, headers: opts.headers,
    auth: {
      kind: connection.authKind as "HMAC" | "JWT" | "OAUTH2" | "MTLS" | "NONE",
      secret,
      clientCertCn: opts.clientCertCn ?? null,
      clientCertPresent: opts.clientCertPresent ?? false,
    },
    directory, nowMs: now,
  });
  const durationMs = Date.now() - started;

  // ---- Breaker bookkeeping ---------------------------------------------
  let nextSnap = snap;
  if (outcome.stats.authFailures > 0 || outcome.outcome === "REJECTED") {
    const res = breakerFailure(snap, now, outcome.reason ?? "rejected", DEFAULT_BREAKER);
    nextSnap = res.snapshot;
    if (res.opened) {
      await writeAudit({
        userId: null, userName: "TowerIntegration Hub", role: "SYSTEM",
        action: "CONFIGURE", entityType: "HubConnection", entityId: connection.id, entityName: connection.name,
        after: { breaker: "OPEN", reason: outcome.reason }, severity: "WARNING",
      });
    }
  } else {
    const res = breakerSuccess(snap, DEFAULT_BREAKER);
    nextSnap = res.snapshot;
  }

  // ---- Persist the event ledger ----------------------------------------
  const event = await db.hubEvent.create({
    data: {
      connectionId: connection.id, toolId: opts.toolId, mode: opts.mode,
      outcome: outcome.outcome, queue: outcome.route?.queue ?? null,
      lane: outcome.route?.lane ?? 2,
      extracted: outcome.stats.extracted, harmonized: outcome.stats.harmonized,
      dlqEntries: outcome.dlq.length, durationMs,
      reason: outcome.reason,
      payloadPreview: truncate(opts.rawBody, 4_000),
      createdAt: new Date(now),
    },
  });

  // ---- Persist DLQ entries ----------------------------------------------
  for (const entry of outcome.dlq) {
    await db.hubDeadLetter.create({ data: buildPersistedDlq({
      connectionId: connection.id, toolId: opts.toolId, mode: opts.mode,
      anomalies: entry.anomalies, reason: entry.reason,
      rawPayload: entry.item ?? entry.payloadPreview, item: entry.item, nowMs: now,
    }) });
  }

  // ---- Update connection + breaker ---------------------------------------
  await db.hubConnection.update({
    where: { id: connection.id },
    data: {
      ingestedCount: { increment: outcome.stats.harmonized },
      harmonizedCount: { increment: outcome.stats.harmonized },
      dlqCount: { increment: outcome.dlq.length },
      lastIngestAt: new Date(now),
      lastError: outcome.reason,
      status: nextSnap.state === "OPEN" ? "ERROR" : outcome.stats.harmonized > 0 ? "ACTIVE" : connection.status,
      breakerState: nextSnap.state,
      breakerJson: JSON.stringify(nextSnap),
      authStatus: outcome.stats.authFailures > 0 ? "INVALID" : connection.authKind === "NONE" ? connection.authStatus : "VALID",
    },
  });

  // ---- Handoff: harmonized UWM → WBS/CPM engine --------------------------
  const handoff = handoffToEngine(connection.integrationId, outcome.items);

  emitRealtime("integration:changed", { tool: opts.toolId, outcome: outcome.outcome });
  emitRealtime("hub:changed", { tool: opts.toolId, outcome: outcome.outcome, dlq: outcome.dlq.length });

  return { ...outcome, connectionId: connection.id, eventId: event.id, durationMs, ...(handoff ? { handoff } : {}) };
}

/** Persist one DLQ row (shared by the breaker gate and the pipeline). */

function buildPersistedDlq(input: {
  connectionId: string; toolId: string; mode: HubIngressMode;
  anomalies: string[]; reason: string; rawPayload: unknown;
  item?: UwmWorkItem | null; nowMs: number;
}) {
  return {
    connectionId: input.connectionId, toolId: input.toolId, queue: null,
    severity: classifyAnomalies(input.anomalies),
    reason: input.reason,
    anomalies: JSON.stringify(input.anomalies),
    payloadPreview: truncate(typeof input.rawPayload === "string" ? input.rawPayload : JSON.stringify(input.rawPayload ?? null), 4_000),
    itemJson: input.item ? JSON.stringify(input.item) : null,
    createdAt: new Date(input.nowMs),
  };
}

async function bumpCounters(connectionId: string, delta: { dlq?: number; lastIngestAt?: Date; lastError?: string | null }) {
  await db.hubConnection.update({
    where: { id: connectionId },
    data: {
      ...(delta.dlq ? { dlqCount: { increment: delta.dlq } } : {}),
      ...(delta.lastIngestAt ? { lastIngestAt: delta.lastIngestAt } : {}),
      ...(delta.lastError !== undefined ? { lastError: delta.lastError } : {}),
    },
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Engine handoff — harmonized UWM → WBS/CPM evaluation.
// ---------------------------------------------------------------------------

export interface EngineHandoff {
  evaluated: number;
  cpmTasks: number;
  criticalPath: number;
  blocked: number;
  completionPct: number;
}

/**
 * Hand harmonized UWM payloads to the PM Control Tower engine: items are
 * mapped onto CpmTaskInput and evaluated with the platform's CPM engine so
 * schedule impact (critical path, float, deadline breaches) is computed from
 * external data. Read-only against the engine — the plan itself is not mutated
 * (the existing Integration sync path owns task writes).
 */
export function handoffToEngine(_scope: string | null, items: UwmWorkItem[]): EngineHandoff | null {
  if (items.length === 0) return null;

  const tasks: CpmTaskInput[] = items.map((item, i) => ({
    id: `${item.source}:${item.sourceId}`,
    name: item.title,
    durationDays: 1,
    startDate: item.startDateUtc ?? item.updatedAtUtc,
    isSummary: false,
    seedDay: null,
    endSeedDay: null,
    deadlineDay: null,
  }));

  // Sequential chain only when the vendor exposed explicit links; otherwise a
  // flat set (each task independent) — CPM handles disconnected tasks.
  const deps: CpmDepInput[] = [];
  const result = computeCPM(tasks, deps, null);

  let critical = 0;
  for (const r of result.values()) if (r.critical) critical++;

  const done = items.filter((i) => i.status === "COMPLETED").length;
  const blocked = items.filter((i) => i.status === "BLOCKED").length;

  return {
    evaluated: items.length,
    cpmTasks: tasks.length,
    criticalPath: critical,
    blocked,
    completionPct: items.length ? Math.round((done / items.length) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Egress: poll cycle for a tool (breaker + exponential backoff on failures).
// ---------------------------------------------------------------------------

export interface PollResult {
  toolId: string;
  ok: boolean;
  httpStatus?: number;
  attempts: number;
  delays: number[];
  detail: string;
}

/**
 * Execute one polling cycle against the vendor API: authenticate → extract →
 * facade → pipeline. Retries transient failures with exponential backoff;
 * the breaker opens after the configured threshold so a dead vendor stops
 * hammering the network.
 */
export async function pollTool(toolId: string, opts: { nowMs?: number; maxAttempts?: number } = {}): Promise<PollResult> {
  const now = opts.nowMs ?? Date.now();
  const tool = hubTool(toolId);
  if (!tool) return { toolId, ok: false, attempts: 0, delays: [], detail: "unknown_tool" };

  const connection = await db.hubConnection.findUnique({ where: { toolId } });
  if (!connection) return { toolId, ok: false, attempts: 0, delays: [], detail: "no_connection" };

  const snap = breakerTick(breakerSnapshotOf(connection), now);
  if (!breakerAllow(snap, now)) {
    return { toolId, ok: false, attempts: 0, delays: [], detail: `breaker_open:${snap.state}` };
  }

  let cfg: { baseUrl?: string } = {};
  try { cfg = JSON.parse(connection.configJson ?? "{}"); } catch { cfg = {}; }

  const maxAttempts = opts.maxAttempts ?? 3;
  const delays: number[] = [];
  let attempts = 0;
  let lastDetail = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    try {
      const res = await fetch(`${cfg.baseUrl ?? "https://example.invalid"}/hub-poll`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(connection.authKind === "JWT" && connection.secretEnc ? { authorization: `Bearer ${decryptSecret(connection.secretEnc)}` } : {}) },
        body: JSON.stringify({ toolId, at: new Date(now).toISOString() }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const res2 = breakerSuccess(snap, DEFAULT_BREAKER);
        await db.hubConnection.update({
          where: { id: connection.id },
          data: { breakerState: res2.snapshot.state, breakerJson: JSON.stringify(res2.snapshot), lastError: null, lastIngestAt: new Date(now), status: "ACTIVE" },
        });
        return { toolId, ok: true, httpStatus: res.status, attempts, delays, detail: "poll_ok" };
      }
      lastDetail = `http_${res.status}`;
      if (res.status < 500 && res.status !== 429) break; // terminal (4xx) — do not retry
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : "poll_error";
    }
    if (attempt < maxAttempts) {
      const delay = backoffDelay(attempt, DEFAULT_BACKOFF);
      delays.push(delay);
      await new Promise((r) => setTimeout(r, Math.min(delay, 2_000)));
    }
  }

  const res = breakerFailure(snap, now, lastDetail, DEFAULT_BREAKER);
  await db.hubConnection.update({
    where: { id: connection.id },
    data: {
      breakerState: res.snapshot.state, breakerJson: JSON.stringify(res.snapshot),
      lastError: lastDetail, status: res.snapshot.state === "OPEN" ? "ERROR" : connection.status,
    },
  });
  emitRealtime("integration:changed", { tool: toolId, breaker: res.snapshot.state });
  return { toolId, ok: false, attempts, delays, detail: lastDetail };
}

// ---------------------------------------------------------------------------
// DLQ operations
// ---------------------------------------------------------------------------

export interface DlqView {
  id: string; toolId: string; queue: string | null; severity: string;
  reason: string; anomalies: string[]; status: string; replayCount: number;
  payloadPreview: string | null; createdAt: string;
}

export function dlqView(row: {
  id: string; toolId: string; queue: string | null; severity: string; reason: string;
  anomalies: string; status: string; replayCount: number; payloadPreview: string | null; createdAt: Date;
}): DlqView {
  let anomalies: string[] = [];
  try { anomalies = JSON.parse(row.anomalies); } catch { anomalies = [row.anomalies]; }
  return {
    id: row.id, toolId: row.toolId, queue: row.queue, severity: row.severity,
    reason: row.reason, anomalies, status: row.status, replayCount: row.replayCount,
    payloadPreview: row.payloadPreview, createdAt: row.createdAt.toISOString(),
  };
}

/** Replay a DLQ entry through the pipeline once the cause is fixed. */
export async function replayDlq(id: string): Promise<{ replayed: boolean; detail: string; outcome?: PipelineOutcome }> {
  const row = await db.hubDeadLetter.findUnique({ where: { id } });
  if (!row) return { replayed: false, detail: "not_found" };
  if (!canReplay({ severity: row.severity as "BLOCKING" | "WARN", anomalies: safeParse(row.anomalies) })) {
    return { replayed: false, detail: "not_replayable" };
  }
  let payload: unknown = row.payloadPreview;
  try { payload = JSON.parse(row.payloadPreview ?? "null"); } catch { /* raw text */ }

  const connection = await db.hubConnection.findUnique({ where: { id: row.connectionId } });
  let secret: string | null = null;
  if (connection?.secretEnc) { try { secret = decryptSecret(connection.secretEnc); } catch { secret = null; } }

  const outcome = runPipeline({
    toolId: row.toolId, mode: (connection?.ingressMode ?? "WEBHOOK") as HubIngressMode,
    payload, rawBody: row.payloadPreview ?? "", headers: {},
    auth: { kind: (connection?.authKind as "HMAC" | "JWT" | "OAUTH2" | "MTLS" | "NONE") ?? "NONE", secret },
    directory: [],
  });

  await db.hubDeadLetter.update({
    where: { id },
    data: {
      replayCount: { increment: 1 },
      status: outcome.dlq.length === 0 ? "REPLAYED" : row.status,
      resolvedAt: outcome.dlq.length === 0 ? new Date() : null,
    },
  });
  if (outcome.dlq.length === 0) {
    await db.hubConnection.update({ where: { id: row.connectionId }, data: { dlqCount: { decrement: 1 } } });
  }
  return { replayed: true, detail: outcome.outcome, outcome };
}

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : [String(s)]; }
  catch { return [s]; }
}

// ---------------------------------------------------------------------------
// Overview — everything the Hub screen shows.
// ---------------------------------------------------------------------------

export interface HubOverview {
  totals: { tools: number; active: number; paused: number; degraded: number; harmonized: number; dlqPending: number; events: number };
  categories: { category: HubCategory; queue: string; label: string; description: string; tools: ConnectionView[] }[];
  queues: { id: string; label: string; description: string; depth: number }[];
  recentEvents: { id: string; toolId: string; mode: string; outcome: string; harmonized: number; dlqEntries: number; durationMs: number; createdAt: string }[];
  dlq: DlqView[];
  breakerSummary: { closed: number; open: number; halfOpen: number };
  catalog: ReturnType<typeof hubCatalog>;
}

export async function getOverview(): Promise<HubOverview> {
  const [connections, events, dlqRows] = await Promise.all([
    db.hubConnection.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], take: 200 }),
    db.hubEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    db.hubDeadLetter.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const now = Date.now();
  const views = connections.map((c) => connectionView(c as unknown as ConnectionRow, now));

  const byCategory = new Map<HubCategory, ConnectionView[]>();
  for (const v of views) {
    const list = byCategory.get(v.category) ?? [];
    list.push(v);
    byCategory.set(v.category, list);
  }

  const pendingDlq = dlqRows.length;
  const eventCount = await db.hubEvent.count();

  return {
    totals: {
      tools: HUB_TOOLS.length,
      active: views.filter((v) => v.status === "ACTIVE").length,
      paused: views.filter((v) => v.status === "PAUSED").length,
      degraded: views.filter((v) => v.status === "DEGRADED" || v.status === "ERROR").length,
      harmonized: views.reduce((n, v) => n + v.counters.harmonized, 0),
      dlqPending: pendingDlq,
      events: eventCount,
    },
    categories: HUB_QUEUES.map((q) => ({
      category: q.category, queue: q.id, label: q.label, description: q.description,
      tools: byCategory.get(q.category) ?? [],
    })),
    queues: HUB_QUEUES.map((q) => ({
      id: q.id, label: q.label, description: q.description,
      depth: views.filter((v) => v.category === q.category).reduce((n, v) => n + v.counters.ingested, 0),
    })),
    recentEvents: events.map((e) => ({
      id: e.id, toolId: e.toolId, mode: e.mode, outcome: e.outcome,
      harmonized: e.harmonized, dlqEntries: e.dlqEntries, durationMs: e.durationMs,
      createdAt: e.createdAt.toISOString(),
    })),
    dlq: dlqRows.map(dlqView),
    breakerSummary: {
      closed: views.filter((v) => v.breaker.state === "CLOSED").length,
      open: views.filter((v) => v.breaker.state === "OPEN").length,
      halfOpen: views.filter((v) => v.breaker.state === "HALF_OPEN").length,
    },
    catalog: hubCatalog(),
  };
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export async function setConnectionAuth(input: {
  connectionId: string; authKind: string; secret?: string | null; ingressMode?: string;
  baseUrl?: string | null; userId: string; userName: string; role: string; ip?: string;
}): Promise<void> {
  const row = await db.hubConnection.findUnique({ where: { id: input.connectionId } });
  if (!row) throw new Error("connection_not_found");
  const secretEnc = input.secret ? encryptSecret(input.secret) : row.secretEnc;
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.configJson ?? "{}"); } catch { config = {}; }
  if (input.baseUrl !== undefined) config.baseUrl = input.baseUrl;
  await db.hubConnection.update({
    where: { id: row.id },
    data: {
      authKind: input.authKind,
      secretEnc,
      authStatus: input.secret ? "VALID" : row.authStatus,
      ...(input.ingressMode ? { ingressMode: input.ingressMode } : {}),
      configJson: JSON.stringify(config),
      status: row.status === "PAUSED" ? "ACTIVE" : row.status,
    },
  });
  await writeAudit({
    userId: input.userId, userName: input.userName, role: input.role,
    action: "CONFIGURE", entityType: "HubConnection", entityId: row.id, entityName: row.name,
    after: { authKind: input.authKind, secretSet: Boolean(input.secret), ingressMode: input.ingressMode ?? row.ingressMode },
    ipAddress: input.ip,
  });
  emitRealtime("hub:changed", { tool: row.toolId, auth: input.authKind });
}
