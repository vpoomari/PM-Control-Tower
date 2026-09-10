// PM CONTROL TOWER — Financials API
// GET /api/financials?projectId — project financial summary (budget lines by category, labor
//   actualization from timesheets, margin-vs-budget variance) or portfolio-wide roll-up.

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { round2, safeDiv, BUDGET_CATEGORIES } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();

  if (projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { budgetLines: { orderBy: [{ category: "asc" }, { name: "asc" }] } },
    });
    if (!project) throw new ApiError(404, "Project not found");

    // Labor cost from timesheet aggregation — only approved/locked actuals count
    const entries = await db.timesheetEntry.findMany({
      where: { projectId, timesheet: { status: { in: ["APPROVED", "LOCKED"] } } },
      include: { timesheet: { include: { resource: { select: { name: true, costRate: true } } } } },
    });
    const laborHours = round2(entries.reduce((s, e) => s + e.hours, 0));
    const laborCost = round2(entries.reduce((s, e) => s + e.hours * (e.timesheet.resource.costRate || 0), 0));

    const byCategory = new Map<string, { baseline: number; current: number; actual: number; forecast: number; lines: number }>();
    for (const bl of project.budgetLines) {
      const agg = byCategory.get(bl.category) || { baseline: 0, current: 0, actual: 0, forecast: 0, lines: 0 };
      agg.baseline += bl.baselineAmount;
      agg.current += bl.currentAmount;
      agg.actual += bl.actualAmount;
      agg.forecast += bl.forecastAmount;
      agg.lines += 1;
      byCategory.set(bl.category, agg);
    }
    const categories = [...byCategory.entries()].map(([category, v]) => ({
      category,
      lineCount: v.lines,
      baselineAmount: round2(v.baseline),
      currentAmount: round2(v.current),
      actualAmount: round2(v.actual),
      forecastAmount: round2(v.forecast),
      variancePct: round2(safeDiv(v.forecast - v.current, v.current, 0) * 100),
    }));

    const totals = {
      baselineAmount: round2(project.budgetLines.reduce((s, b) => s + b.baselineAmount, 0)),
      currentAmount: round2(project.budgetLines.reduce((s, b) => s + b.currentAmount, 0)),
      actualAmount: round2(project.budgetLines.reduce((s, b) => s + b.actualAmount, 0)),
      forecastAmount: round2(project.budgetLines.reduce((s, b) => s + b.forecastAmount, 0)),
    };

    const budget = project.currentBudget || project.baselineBudget || totals.currentAmount || 0;
    return ok({
      project: {
        id: project.id, code: project.code, name: project.name, currency: project.currency,
        baselineBudget: project.baselineBudget, currentBudget: project.currentBudget,
        actualCost: project.actualCost, forecastCost: project.forecastCost,
      },
      budget,
      totals,
      categories,
      labor: {
        hours: laborHours,
        cost: laborCost,
        costShareOfBudgetPct: round2(safeDiv(laborCost, budget, 0) * 100),
        entriesCounted: entries.length,
      },
      variance: {
        actualVsBudgetPct: round2(safeDiv(project.actualCost - budget, budget, 0) * 100),
        forecastVsBudgetPct: round2(safeDiv(project.forecastCost - budget, budget, 0) * 100),
        marginVsBudgetPct: round2(safeDiv(budget - project.forecastCost, budget, 0) * 100),
      },
    });
  }

  // Portfolio-wide roll-up
  const projects = await db.project.findMany({ include: { budgetLines: true }, orderBy: { code: "asc" } });
  const rows = projects.map((p) => {
    const budget = p.currentBudget || p.baselineBudget || 0;
    const categoryBreakdown: Record<string, number> = {};
    for (const bl of p.budgetLines) {
      categoryBreakdown[bl.category] = round2((categoryBreakdown[bl.category] || 0) + bl.actualAmount);
    }
    return {
      id: p.id, code: p.code, name: p.name, status: p.status, currency: p.currency,
      baselineBudget: p.baselineBudget, budget,
      actual: round2(p.actualCost), forecast: round2(p.forecastCost),
      variancePct: round2(safeDiv(p.forecastCost - budget, budget, 0) * 100),
      actualVariancePct: round2(safeDiv(p.actualCost - budget, budget, 0) * 100),
      categoryBreakdown,
    };
  });

  const totalBudget = round2(rows.reduce((s, r) => s + r.budget, 0));
  const totals = {
    budget: totalBudget,
    baselineBudget: round2(rows.reduce((s, r) => s + r.baselineBudget, 0)),
    actual: round2(rows.reduce((s, r) => s + r.actual, 0)),
    forecast: round2(rows.reduce((s, r) => s + r.forecast, 0)),
  };
  totals.budget = totalBudget;

  return ok({
    projects: rows,
    totals: {
      ...totals,
      actualVariancePct: round2(safeDiv(totals.actual - totalBudget, totalBudget, 0) * 100),
      forecastVariancePct: round2(safeDiv(totals.forecast - totalBudget, totalBudget, 0) * 100),
      marginVsBudgetPct: round2(safeDiv(totalBudget - totals.forecast, totalBudget, 0) * 100),
    },
    categories: [...BUDGET_CATEGORIES],
  });
}, { permission: "financial.view", rateLimit: { limit: 300, windowMs: 60_000 } });
