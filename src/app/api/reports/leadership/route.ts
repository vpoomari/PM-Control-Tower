// PM CONTROL TOWER — GET /api/reports/leadership
// Full Leadership Intelligence bundle: control tower, portfolio, exceptions,
// insights, what-changed, 30/60/90 outlook, all sub-reports. Single source of truth.

import { withApi, ok } from "@/lib/api";
import { buildLeadershipBundle } from "@/lib/engines/leadership";

export const GET = withApi(async () => {
  const bundle = await buildLeadershipBundle();
  return ok(bundle);
}, { permission: "reports.view", rateLimit: { limit: 120, windowMs: 60_000 } });
