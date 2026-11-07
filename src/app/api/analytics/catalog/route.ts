// PM CONTROL TOWER — Analytics catalog API
// GET /api/analytics/catalog — module + report metadata for all 50 PMO reports
// (no computes, no data) — drives the PMO Analytics hub.

import { withApi, ok } from "@/lib/api";
import { catalog } from "@/lib/analytics/registry";

export const GET = withApi(async () => ok(catalog()), { permission: "reports.view" });
