// PM CONTROL TOWER — TowerIntegration Hub: Dead Letter Queue.
// GET  /api/hub/dlq — pending entries (severity, anomalies, replayability)
// POST /api/hub/dlq/clear — dismiss resolved/pending entries (audited)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { dlqView } from "@/lib/hub/hub-service";

export const GET = withApi(async (ctx) => {
  const status = ctx.searchParams.get("status") ?? "PENDING";
  const take = Math.min(Number(ctx.searchParams.get("limit") ?? 100), 500);
  const rows = await db.hubDeadLetter.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take,
  });
  return ok({ entries: rows.map(dlqView), total: rows.length });
}, { permission: "integration.view", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, z.object({ ids: z.array(z.string()).min(1).max(200) }));
  const result = await db.hubDeadLetter.updateMany({
    where: { id: { in: body.ids }, status: "PENDING" },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "HubDeadLetter", entityName: `${result.count} entries`,
    after: { dismissed: result.count }, ipAddress: ctx.ip,
  });
  return ok({ dismissed: result.count });
}, { permission: "integration.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
