// PM CONTROL TOWER — PATCH / DELETE /api/reports/schedules/[id]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]).optional(),
  recipients: z.string().max(1000).nullable().optional(),
  name: z.string().min(2).max(120).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const existing = await db.reportSchedule.findUnique({ where: { id: ctx.params.id } });
  if (!existing) throw new ApiError(404, "Schedule not found");
  const body = await parseBody(ctx.req, patchSchema);
  const schedule = await db.reportSchedule.update({ where: { id: ctx.params.id }, data: body });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "CONFIGURE", entityType: "ReportSchedule", entityId: schedule.id, entityName: schedule.name,
    before: { isActive: existing.isActive, frequency: existing.frequency },
    after: { isActive: schedule.isActive, frequency: schedule.frequency },
    context: "Report schedule updated",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(schedule);
}, { permission: "project.manage", rateLimit: { limit: 60, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const existing = await db.reportSchedule.findUnique({ where: { id: ctx.params.id } });
  if (!existing) throw new ApiError(404, "Schedule not found");
  await db.reportSchedule.delete({ where: { id: ctx.params.id } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "DELETE", entityType: "ReportSchedule", entityId: existing.id, entityName: existing.name,
    before: { name: existing.name, frequency: existing.frequency },
    context: "Report schedule deleted",
    severity: "WARNING", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok({ deleted: true });
}, { permission: "project.manage", rateLimit: { limit: 40, windowMs: 60_000 } });
