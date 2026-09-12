// PM CONTROL TOWER — Say/Do Calibration API
// GET  /api/integrity/calibration — stored factors (advisory insights)
// POST /api/integrity/calibration — recompute from completed task history (manage)

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { recomputeCalibration } from "@/lib/services/integrity";

export const GET = withApi(async () => {
  const factors = await db.calibrationFactor.findMany({ orderBy: { computedAt: "desc" } });
  return ok({
    factors,
    advisory: "Advisory only — organizational learning, never individual blame. Factors are suggestions, never silent overrides.",
  });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async () => {
  const factors = await recomputeCalibration();
  return ok({ recomputed: factors.length, factors });
}, { permission: "integrity.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
