// PM CONTROL TOWER — GET /api/reports/leadership/history
// Retained report snapshots (spec §29): date, period, scope, generator, version,
// headline metrics. Compare this week vs last week vs last month.

import { withApi, ok } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  const take = Math.min(Number(ctx.searchParams.get("take") ?? 50), 200);
  const snapshots = await db.reportSnapshot.findMany({
    where: projectId ? { OR: [{ projectId }, { scope: "PORTFOLIO" }] } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, scope: true, projectId: true, projectCode: true, title: true,
      periodStart: true, periodEnd: true, version: true,
      generatedByName: true, headlineJson: true, createdAt: true,
    },
  });
  return ok({
    snapshots: snapshots.map((s) => ({ ...s, headline: s.headlineJson ? JSON.parse(s.headlineJson) : null, headlineJson: undefined })),
  });
}, { permission: "reports.view", rateLimit: { limit: 200, windowMs: 60_000 } });
