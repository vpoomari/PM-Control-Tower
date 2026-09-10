// PM CONTROL TOWER — GET /api/reports/leadership/history/[id]
// Full stored payload of one report snapshot.

import { withApi, ok, ApiError } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withApi(async (ctx) => {
  const snap = await db.reportSnapshot.findUnique({ where: { id: ctx.params.id } });
  if (!snap) throw new ApiError(404, "Report snapshot not found");
  return ok({
    id: snap.id, scope: snap.scope, projectId: snap.projectId, projectCode: snap.projectCode,
    title: snap.title, version: snap.version, periodStart: snap.periodStart, periodEnd: snap.periodEnd,
    generatedByName: snap.generatedByName, createdAt: snap.createdAt,
    headline: snap.headlineJson ? JSON.parse(snap.headlineJson) : null,
    payload: snap.payloadJson ? JSON.parse(snap.payloadJson) : null,
  });
}, { permission: "reports.view", rateLimit: { limit: 200, windowMs: 60_000 } });
