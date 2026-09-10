// PM CONTROL TOWER — Integration disable
// POST /api/integrations/[id]/disable — deactivate the link (honest DISCONNECTED state)

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const integration = await db.integration.findUnique({ where: { id } });
  if (!integration) throw new ApiError(404, "Integration not found");
  const updated = await db.integration.update({ where: { id }, data: { status: "DISCONNECTED" } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "Integration", entityId: id, entityName: updated.name,
    before: { status: integration.status }, after: { status: updated.status },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    context: "Integration disabled",
  });
  emitRealtime("integration:changed", { integrationId: id, status: updated.status });
  return ok(updated);
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
