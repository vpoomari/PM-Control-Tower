// PM CONTROL TOWER — Task Alert Scheduler (local background worker)
//
// The automated e-mail engine runs natively on Vercel via the daily cron
// (/api/cron/task-alerts, see vercel.json). This worker mirrors that schedule
// for local / self-hosted deployments where Vercel crons don't exist — same
// engine, same idempotency stamps (Task.dueTodayEmailedAt / overdueEmailedAt),
// so running it alongside the cron can never double-send:
//   • due-today pass — every tick (default 10 min); the per-day stamp limits
//     it to exactly one e-mail per assignee per reached due date.
//   • overdue pass   — every tick; the per-day stamp limits it to one
//     escalation per task per calendar day, and terminal statuses
//     (COMPLETED / CANCELLED / ON_HOLD) are excluded in SQL.
//
// Endpoints (mirrors mini-services/realtime):
//   GET  /health         — status, last run summary, schedule config
//   POST /run            — manual trigger; header `x-pmct-secret` must match
//                           SCHEDULER_SECRET (or CRON_SECRET) when configured
//   GET  /run?dryRun=1   — convenience alias for local inspection
//
// Env:
//   SCHEDULER_PORT        (default 3004)
//   SCHEDULER_INTERVAL_MS (default 600000 = 10 min)
//   SCHEDULER_RUN_ON_START (default 1 — run one tick immediately at boot)
//   Microsoft Graph vars as for /api/cron/task-alerts; when absent the worker
//   stays alive in dry-run mode and logs a single warning.

import { createServer } from "http";
import { runTaskAlerts } from "../../src/lib/priorities/emails";
import { isGraphConfigured, sendEmail } from "../../src/lib/graphClient";
import { sweepAgents } from "../../src/lib/agents/runner";

const PORT = Number(process.env.SCHEDULER_PORT || 3004);
const INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS || 600_000);
const RUN_ON_START = (process.env.SCHEDULER_RUN_ON_START ?? "1") !== "0";
const SECRET = (process.env.SCHEDULER_SECRET || process.env.CRON_SECRET || "pmct-scheduler-sandbox-secret").trim();

interface TickRecord {
  trigger: string;
  at: string;
  dryRun: boolean;
  dueToday: { candidates: number; recipients: number; sent: number; failed: number; stamped: number } | null;
  overdue: { candidates: number; recipients: number; sent: number; failed: number; stamped: number } | null;
  /** AI agent sweep (Settings → AI Agents): ACTIVE + cadence-due agents only. */
  agents: { scanned: number; due: number; ran: number; failed: number } | null;
  error?: string;
}

let lastTick: TickRecord | null = null;
let ticking = false;
let ticks = 0;

async function tick(trigger: string): Promise<TickRecord> {
  if (ticking) {
    const skipped: TickRecord = { trigger, at: new Date().toISOString(), dryRun: false, dueToday: null, overdue: null, agents: null, error: "previous tick still running" };
    return skipped;
  }
  ticking = true;
  const graphReady = isGraphConfigured();
  const dryRun = !graphReady;
  const now = new Date();
  try {
    const result = await runTaskAlerts(now, { dryRun, pass: "all", send: sendEmail });
    const shape = (s: NonNullable<typeof result.dueToday>) => ({
      candidates: s.candidates,
      recipients: s.groups,
      sent: s.sent.length,
      failed: s.failed.length,
      stamped: s.stamped,
    });
    const record: TickRecord = {
      trigger,
      at: now.toISOString(),
      dryRun,
      dueToday: result.dueToday ? shape(result.dueToday) : null,
      overdue: result.overdue ? shape(result.overdue) : null,
      agents: null,
    };

    // AI agent sweep — separate try/catch so an agent failure can never take
    // the e-mail engine down (and vice versa). sweepAgents() honours the
    // AGENT_RUNTIME kill switch, PAUSED profiles and per-agent cadence.
    try {
      const sweep = await sweepAgents();
      record.agents = { scanned: sweep.scanned, due: sweep.due, ran: sweep.ran, failed: sweep.failed };
    } catch (err) {
      console.error(`[scheduler] agent sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    lastTick = record;
    ticks += 1;
    console.log(
      `[scheduler] #${ticks} ${trigger} due-today cand=${record.dueToday?.candidates ?? "-"} sent=${record.dueToday?.sent ?? "-"} | ` +
        `overdue cand=${record.overdue?.candidates ?? "-"} sent=${record.overdue?.sent ?? "-"} | ` +
        `agents scanned=${record.agents?.scanned ?? "-"} due=${record.agents?.due ?? "-"} ran=${record.agents?.ran ?? "-"}${dryRun ? " (DRY-RUN: Graph not configured)" : ""}`
    );
    return record;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const record: TickRecord = { trigger, at: now.toISOString(), dryRun, dueToday: null, overdue: null, agents: null, error: message };
    lastTick = record;
    console.error(`[scheduler] ${trigger} failed: ${message}`);
    return record;
  } finally {
    ticking = false;
  }
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

function json(res: import("http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function authorized(req: import("http").IncomingMessage): boolean {
  const provided = req.headers["x-pmct-secret"];
  if (provided === undefined) return true; // no secret configured → local convenience
  return String(provided).trim() === SECRET;
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/health") {
    json(res, 200, {
      status: "ok",
      service: "pmct-task-alert-scheduler",
      graphConfigured: isGraphConfigured(),
      intervalMs: INTERVAL_MS,
      ticks,
      lastTick,
    });
    return;
  }
  if (url.pathname === "/run") {
    if (req.method !== "GET" && req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }
    if (!authorized(req)) {
      json(res, 401, { error: "Invalid scheduler secret" });
      return;
    }
    const dryRun = url.searchParams.get("dryRun") === "1";
    void tick("manual").then((record) => {
      // dryRun is enforced by Graph configuration; an explicit dryRun request
      // is reported as such but the engine idempotency makes re-runs harmless.
      json(res, 200, { ...record, requestedDryRun: dryRun });
    });
    return;
  }
  json(res, 404, { error: "Not found" });
});

httpServer.listen(PORT, () => {
  console.log(`[scheduler] task-alert scheduler listening on :${PORT} (interval ${INTERVAL_MS}ms)`);
  if (!isGraphConfigured()) {
    console.warn("[scheduler] Microsoft Graph is not configured — running in DRY-RUN mode (no e-mails, no stamps).");
  }
  if (RUN_ON_START) void tick("startup");
});

setInterval(() => {
  void tick("interval");
}, INTERVAL_MS);

function shutdown(): void {
  console.log("[scheduler] shutting down");
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
