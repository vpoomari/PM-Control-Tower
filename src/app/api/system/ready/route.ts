// PM CONTROL TOWER — Readiness probe (unauthenticated)
// GET /api/system/ready — database + realtime gateway dependency checks.
// Never leaks environment values — only reachability and counts.

import { withApi, ok } from "@/lib/api";
import { db } from "@/lib/db";

const REALTIME_HEALTH_URL = process.env.REALTIME_URL || "http://127.0.0.1:3003";

interface CheckResult {
  ok: boolean;
  detail?: string;
}

async function checkDatabase(): Promise<CheckResult & { counts?: Record<string, number> }> {
  try {
    const [users, projects, tasks] = await Promise.all([
      db.user.count(),
      db.project.count(),
      db.task.count(),
    ]);
    return { ok: true, counts: { users, projects, tasks } };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "database unreachable" };
  }
}

async function checkRealtime(): Promise<CheckResult> {
  try {
    const res = await fetch(`${REALTIME_HEALTH_URL}/health`, { signal: AbortSignal.timeout(1000) });
    return { ok: res.ok, detail: res.ok ? "realtime gateway reachable" : `gateway responded ${res.status}` };
  } catch {
    return { ok: false, detail: "realtime gateway not reachable" };
  }
}

export const GET = withApi(async () => {
  const [database, realtime] = await Promise.all([checkDatabase(), checkRealtime()]);
  const status = database.ok && realtime.ok ? "ready" : "degraded";
  return ok({
    status,
    service: "pm-control-tower-api",
    time: new Date().toISOString(),
    checks: { database, realtime },
  });
}, { auth: false, rateLimit: { limit: 600, windowMs: 60_000 } });
