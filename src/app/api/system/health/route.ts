// PM CONTROL TOWER — Liveness probe (unauthenticated)
// GET /api/system/health — process is up

import { withApi, ok } from "@/lib/api";

export const GET = withApi(async () => {
  return ok({ status: "ok", service: "pm-control-tower-api", time: new Date().toISOString() });
}, { auth: false, rateLimit: { limit: 600, windowMs: 60_000 } });
