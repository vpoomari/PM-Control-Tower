// PM CONTROL TOWER — Integrity system config (freshness thresholds + grace window)
// GET  /api/integrity/config — current thresholds and grace window
// POST /api/integrity/config — update (integrity.manage)

import { z } from "zod";
import { withApi, ok, parseBody } from "@/lib/api";
import { getFreshnessConfig, updateFreshnessConfig } from "@/lib/services/integrity";

export const GET = withApi(async () => ok(await getFreshnessConfig()), { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, z.object({
    freshnessWarn: z.number().min(0.1).max(5).optional(),
    freshnessDegrade: z.number().min(0.2).max(10).optional(),
    freshnessCritical: z.number().min(0.5).max(20).optional(),
    freshnessGraceHours: z.number().int().min(0).max(336).optional(),
  }));
  return ok(await updateFreshnessConfig(body));
}, { permission: "integrity.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
