// PM CONTROL TOWER — Alert Events API
// GET /api/alerts?status&severity&projectId — governance/EVM alert feed

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { SEVERITY } from "@/lib/constants";

const ALERT_STATUSES = ["NEW", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"];

export const GET = withApi(async (ctx) => {
  const status = ctx.searchParams.get("status")?.trim();
  const severity = ctx.searchParams.get("severity")?.trim();
  const projectId = ctx.searchParams.get("projectId")?.trim();

  if (status && !ALERT_STATUSES.includes(status)) {
    throw new ApiError(400, `Invalid status. Use one of: ${ALERT_STATUSES.join(", ")}`);
  }
  if (severity && !SEVERITY.includes(severity as (typeof SEVERITY)[number])) {
    throw new ApiError(400, `Invalid severity. Use one of: ${SEVERITY.join(", ")}`);
  }

  const alerts = await db.alertEvent.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(projectId ? { projectId } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok({
    alerts,
    total: alerts.length,
    summary: {
      new: alerts.filter((a) => a.status === "NEW").length,
      critical: alerts.filter((a) => a.severity === "CRITICAL" && a.status === "NEW").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });
