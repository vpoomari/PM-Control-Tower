// PM CONTROL TOWER — Budget Lines API
// GET  /api/financials/budget-lines?projectId — list budget lines
// POST /api/financials/budget-lines — create a budget line

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { round2, BUDGET_CATEGORIES } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const category = ctx.searchParams.get("category")?.trim();
  const lines = await db.budgetLine.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(category ? { category } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: [{ projectId: "asc" }, { category: "asc" }, { name: "asc" }],
    take: 500,
  });
  return ok({
    budgetLines: lines,
    total: lines.length,
    totals: {
      baselineAmount: round2(lines.reduce((s, b) => s + b.baselineAmount, 0)),
      currentAmount: round2(lines.reduce((s, b) => s + b.currentAmount, 0)),
      actualAmount: round2(lines.reduce((s, b) => s + b.actualAmount, 0)),
      forecastAmount: round2(lines.reduce((s, b) => s + b.forecastAmount, 0)),
    },
  });
}, { permission: "financial.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  category: z.enum(BUDGET_CATEGORIES).default("LABOR"),
  name: z.string().min(2),
  baselineAmount: z.coerce.number().min(0).default(0),
  currentAmount: z.coerce.number().min(0).default(0),
  actualAmount: z.coerce.number().min(0).default(0),
  forecastAmount: z.coerce.number().min(0).default(0),
  period: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const created = await db.budgetLine.create({
    data: {
      projectId: body.projectId,
      category: body.category,
      name: body.name,
      baselineAmount: round2(body.baselineAmount),
      currentAmount: round2(body.currentAmount),
      actualAmount: round2(body.actualAmount),
      forecastAmount: round2(body.forecastAmount),
      period: body.period ?? null,
      notes: body.notes ?? null,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "BudgetLine", entityId: created.id, entityName: `${project.code} / ${created.name}`,
    after: { category: created.category, baselineAmount: created.baselineAmount, currentAmount: created.currentAmount, forecastAmount: created.forecastAmount },
    ipAddress: ctx.ip,
  });
  emitRealtime("actuals:changed", { projectId: body.projectId, budgetLineId: created.id, category: created.category, action: "BUDGET_LINE_CREATED" }, `project:${body.projectId}`);
  return ok({ budgetLine: created }, 201);
}, { permission: "financial.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
