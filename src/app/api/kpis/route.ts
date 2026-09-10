// PM CONTROL TOWER — Business KPI / Benefits register
// GET  /api/kpis — KPI + benefit rows
// POST /api/kpis — add a strategic KPI (audited)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  projectId: z.string().optional(),
  name: z.string().min(2).max(160),
  category: z.enum(["KPI", "BENEFIT"]).default("KPI"),
  unit: z.string().max(24).default("%"),
  targetValue: z.number(),
  currentValue: z.number().default(0),
  expectedBenefit: z.string().max(1000).optional(),
  status: z.enum(["ON_TRACK", "AT_RISK", "ACHIEVED", "NOT_STARTED"]).default("ON_TRACK"),
});

export const GET = withApi(async () => {
  const kpis = await db.projectKpi.findMany({ orderBy: { code: "asc" }, take: 300 });
  return ok({ kpis });
}, { permission: "reports.view", rateLimit: { limit: 200, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);
  const count = await db.projectKpi.count();
  const kpi = await db.projectKpi.create({
    data: {
      projectId: body.projectId ?? null,
      code: `KPI-${String(count + 1).padStart(3, "0")}`,
      name: body.name, category: body.category, unit: body.unit,
      targetValue: body.targetValue, currentValue: body.currentValue,
      expectedBenefit: body.expectedBenefit ?? null,
      status: body.status, measurementDate: new Date(),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "CREATE", entityType: "ProjectKpi", entityId: kpi.id, entityName: kpi.name,
    after: { code: kpi.code, target: body.targetValue, unit: body.unit },
    context: "Strategic KPI added",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(kpi, 201);
}, { permission: "project.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
