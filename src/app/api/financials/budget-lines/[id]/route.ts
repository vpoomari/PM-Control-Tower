// PM CONTROL TOWER — Budget Line Detail API
// PATCH  /api/financials/budget-lines/[id] — amounts / name / category
// DELETE /api/financials/budget-lines/[id]
// (Project-level recalcs run through the health/EVM engines on the next actuals event.)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { round2, BUDGET_CATEGORIES } from "@/lib/constants";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  category: z.enum(BUDGET_CATEGORIES).optional(),
  baselineAmount: z.coerce.number().min(0).optional(),
  currentAmount: z.coerce.number().min(0).optional(),
  actualAmount: z.coerce.number().min(0).optional(),
  forecastAmount: z.coerce.number().min(0).optional(),
  period: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const line = await db.budgetLine.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  if (!line) throw new ApiError(404, "Budget line not found");
  return ok({ budgetLine: line });
}, { permission: "financial.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.budgetLine.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Budget line not found");

  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.category !== undefined ? { category: body.category } : {}),
    ...(body.baselineAmount !== undefined ? { baselineAmount: round2(body.baselineAmount) } : {}),
    ...(body.currentAmount !== undefined ? { currentAmount: round2(body.currentAmount) } : {}),
    ...(body.actualAmount !== undefined ? { actualAmount: round2(body.actualAmount) } : {}),
    ...(body.forecastAmount !== undefined ? { forecastAmount: round2(body.forecastAmount) } : {}),
    ...(body.period !== undefined ? { period: body.period } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.budgetLine.update({ where: { id }, data });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "BudgetLine", entityId: id, entityName: updated.name,
    before, after: updated, ipAddress: ctx.ip,
  });
  emitRealtime("actuals:changed", { projectId: updated.projectId, budgetLineId: updated.id, action: "BUDGET_LINE_UPDATED" }, `project:${updated.projectId}`);
  return ok({ budgetLine: updated });
}, { permission: "financial.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const line = await db.budgetLine.findUnique({ where: { id } });
  if (!line) throw new ApiError(404, "Budget line not found");

  await db.budgetLine.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "BudgetLine", entityId: id, entityName: line.name,
    before: line, ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("actuals:changed", { projectId: line.projectId, budgetLineId: id, action: "BUDGET_LINE_DELETED" }, `project:${line.projectId}`);
  return ok({ deleted: true, id });
}, { permission: "financial.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
