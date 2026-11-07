// PM CONTROL TOWER — Vercel Cron: scheduled AI agent sweep.
//
// GET /api/cron/agents
//   Protected by the CRON_SECRET bearer token (same discipline as
//   /api/cron/task-alerts): session auth is disabled because a cron has no
//   session — the secret check is the only gate and fails closed.
//
//   Runs sweepAgents(): every ACTIVE AgentProfile whose cadence (HOURLY /
//   DAILY / WEEKLY) is due gets exactly one run. MANUAL agents never fire
//   from the sweep; PAUSED agents never fire at all; the AGENT_RUNTIME kill
//   switch stops everything.
//
//   Query params:
//     dryRun=1 — report which agents WOULD run, execute nothing.
//
// Response: { scanned, due, ran, failed, outcomes[] } (capped).

import { withApi, ok, ApiError } from "@/lib/api";
import { sweepAgents, agentsRuntimeEnabled } from "@/lib/agents/runner";
import { ensureProfiles } from "@/lib/agents/registry";

/** Simple constant-time-ish comparison for the cron secret. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const GET = withApi(
  async ({ req, searchParams }) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      throw new ApiError(
        503,
        "CRON_SECRET is not configured — set it in the environment before enabling the agent cron."
      );
    }
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || !secretMatches(token, secret)) {
      throw new ApiError(401, "Unauthorized: missing or invalid cron secret.");
    }

    const dryRun = searchParams.get("dryRun") === "1";
    const enabled = await agentsRuntimeEnabled();

    if (dryRun) {
      await ensureProfiles();
      const { db } = await import("@/lib/db");
      const { loadAgent, isDue } = await import("@/lib/agents/registry");
      const profiles = await db.agentProfile.findMany({ where: { status: "ACTIVE" } });
      const due: string[] = [];
      for (const p of profiles) {
        const loaded = await loadAgent(p.key);
        if (loaded?.profile && isDue(loaded.def, loaded.profile.config, loaded.profile.lastRunAt)) due.push(p.key);
      }
      return ok({ dryRun: true, runtimeEnabled: enabled, scanned: profiles.length, due, ran: 0, failed: 0 });
    }

    const summary = await sweepAgents();
    return ok({
      dryRun: false,
      scanned: summary.scanned,
      due: summary.due,
      ran: summary.ran,
      failed: summary.failed,
      outcomes: summary.outcomes.slice(0, 30).map((o) => ({
        key: o.key, status: o.status, findings: o.findingCount, runId: o.runId, error: o.error ?? null,
      })),
    });
  },
  { auth: false, rateLimit: { limit: 30, windowMs: 60_000 } }
);
