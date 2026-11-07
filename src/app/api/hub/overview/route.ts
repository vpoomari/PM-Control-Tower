// PM CONTROL TOWER — TowerIntegration Hub API
// GET /api/hub/overview — full Hub state: 55-tool catalog by category queue,
// connection + breaker status, event ledger, Dead Letter Queue. Bootstraps the
// 55 connection rows on first read (idempotent).

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { ensureConnections, getOverview } from "@/lib/hub/hub-service";

export const GET = withApi(async () => {
  await ensureConnections();
  const overview = await getOverview();
  return ok(overview);
}, { permission: "integration.view", rateLimit: { limit: 120, windowMs: 60_000 } });
