// PM CONTROL TOWER — PATCH /api/kpis/[id]
// Record a KPI / benefit measurement (audited).

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  currentValue: z.number().optional(),
  status: z.enum(["ON_TRACK", "AT_RISK", "ACHIEVED", "NOT_STARTED"]).optional(),
  actualBenefit: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const existing = await db.projectKpi.findUnique({ where: { id: ctx.params.id } });
  if (!existing) throw new ApiError(404, "KPI not found");
  const body = await parseBody(ctx.req, patchSchema);
  const kpi = await db.projectKpi.update({
    where: { id: ctx.params.id },
    data: {
      ...(body.currentValue !== undefined ? { currentValue: body.currentValue } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.actualBenefit !== undefined ? { actualBenefit: body.actualBenefit } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      measurementDate: new Date(),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "UPDATE", entityType: "ProjectKpi", entityId: kpi.id, entityName: kpi.name,
    before: { current: existing.currentValue, status: existing.status },
    after: { current: kpi.currentValue, status: kpi.status },
    context: "KPI measurement recorded",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(kpi);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
