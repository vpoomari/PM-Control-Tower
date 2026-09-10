// PM CONTROL TOWER — Alert Event Update API
// PATCH /api/alerts/[id] — acknowledge / resolve / dismiss (governance.manage)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const patchSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const alert = await db.alertEvent.findUnique({ where: { id } });
  if (!alert) throw new ApiError(404, "Alert not found");

  const data = {
    status: body.status,
    ...(body.status === "ACKNOWLEDGED"
      ? { acknowledgedBy: session.name, acknowledgedAt: alert.acknowledgedAt ?? new Date() }
      : {}),
    ...(body.status === "RESOLVED"
      ? {
          resolvedAt: alert.resolvedAt ?? new Date(),
          acknowledgedBy: alert.acknowledgedBy ?? session.name,
          acknowledgedAt: alert.acknowledgedAt ?? new Date(),
        }
      : {}),
  };

  const updated = await db.alertEvent.update({ where: { id }, data });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "AlertEvent", entityId: id, entityName: alert.title,
    before: { status: alert.status }, after: { status: updated.status }, ipAddress: ctx.ip,
  });
  emitRealtime("governance:changed", { alertId: id, projectId: updated.projectId, status: updated.status }, updated.projectId ? projectRoom(updated.projectId) : undefined);
  return ok({ alert: updated });
}, { permission: "governance.manage", rateLimit: { limit: 300, windowMs: 60_000 } });
