// PM CONTROL TOWER — Integration enable/disable
// POST /api/integrations/[id]/enable — requires credentials configured (authStatus CONFIGURED)

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const integration = await db.integration.findUnique({ where: { id } });
  if (!integration) throw new ApiError(404, "Integration not found");
  if (integration.authStatus !== "CONFIGURED") {
    throw new ApiError(409, "Cannot enable: no credentials configured. Register a credential first — integrations are never enabled without real credentials.");
  }
  const updated = await db.integration.update({ where: { id }, data: { status: "ACTIVE" } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "ACTIVATE", entityType: "Integration", entityId: id, entityName: updated.name,
    before: { status: integration.status }, after: { status: updated.status },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  emitRealtime("integration:changed", { integrationId: id, status: updated.status });
  return ok(updated);
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
