// PM CONTROL TOWER — GET /api/reports/leadership/status-report?projectId=
// Executive Project Status Report (spec §3): summary, 7-dimension status,
// progress, upcoming, concerns, leadership actions, what changed.

import { withApi, ok, ApiError } from "@/lib/api";
import { buildProjectStatusReport } from "@/lib/engines/leadership";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "projectId query parameter is required");
  const report = await buildProjectStatusReport(projectId);
  if (!report) throw new ApiError(404, "Project not found");
  return ok(report);
}, { permission: "reports.view", rateLimit: { limit: 120, windowMs: 60_000 } });
