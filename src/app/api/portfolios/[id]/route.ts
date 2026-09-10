// PM CONTROL TOWER — Portfolio Detail API
// GET    /api/portfolios/[id] — portfolio + programs (each with project summaries) + KPIs
// PATCH  /api/portfolios/[id] — update portfolio
// DELETE /api/portfolios/[id] — delete (blocked when programs/projects exist)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { round2 } from "@/lib/constants";

const portfolioUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  status: z.string().trim().min(2).optional(),
  strategicObjective: z.string().optional().nullable(),
  budgetTarget: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const portfolio = await db.portfolio.findUnique({ where: { id } });
  if (!portfolio) throw new ApiError(404, "Portfolio not found");

  // Programs with their projects + direct (program-less) projects of this portfolio
  const [owner, programs, directProjects] = await Promise.all([
    portfolio.ownerId
      ? db.user.findUnique({ where: { id: portfolio.ownerId }, select: { id: true, name: true, email: true, title: true, avatarColor: true } })
      : Promise.resolve(null),
    db.program.findMany({
      where: { portfolioId: id },
      orderBy: { createdAt: "asc" },
      include: {
        projects: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, code: true, name: true, status: true, priority: true, progress: true, healthScore: true, ragStatus: true, currentBudget: true, actualCost: true, forecastCost: true, startDate: true, endDate: true },
        },
      },
    }),
    db.project.findMany({
      where: { portfolioId: id, programId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, name: true, status: true, priority: true, progress: true, healthScore: true, ragStatus: true, currentBudget: true, actualCost: true, forecastCost: true, startDate: true, endDate: true },
    }),
  ]);

  const allProjects = [...directProjects, ...programs.flatMap((pg) => pg.projects)];

  const totals = allProjects.reduce(
    (acc, p) => ({
      currentBudget: acc.currentBudget + p.currentBudget,
      actualCost: acc.actualCost + p.actualCost,
      forecastCost: acc.forecastCost + p.forecastCost,
      health: acc.health + p.healthScore,
    }),
    { currentBudget: 0, actualCost: 0, forecastCost: 0, health: 0 }
  );

  const ragDistribution = {
    GREEN: allProjects.filter((p) => p.ragStatus === "GREEN").length,
    AMBER: allProjects.filter((p) => p.ragStatus === "AMBER").length,
    RED: allProjects.filter((p) => p.ragStatus === "RED").length,
  };

  const kpis = {
    programCount: programs.length,
    projectCount: allProjects.length,
    activeProjects: allProjects.filter((p) => p.status === "ACTIVE").length,
    budgetTarget: portfolio.budgetTarget,
    currentBudget: round2(totals.currentBudget),
    actualCost: round2(totals.actualCost),
    forecastCost: round2(totals.forecastCost),
    budgetUtilizationPct: portfolio.budgetTarget > 0 ? round2((totals.actualCost / portfolio.budgetTarget) * 100) : 0,
    forecastVsTargetPct: portfolio.budgetTarget > 0 ? round2((totals.forecastCost / portfolio.budgetTarget) * 100) : 0,
    avgHealthScore: allProjects.length ? round2(totals.health / allProjects.length) : 100,
    ragDistribution,
  };

  return ok({ portfolio, owner, programs, directProjects, kpis });
}, { permission: "portfolio.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const { id } = ctx.params;
  const before = await db.portfolio.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Portfolio not found");

  const body = await parseBody(ctx.req, portfolioUpdateSchema);
  if (body.ownerId) {
    const owner = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
    if (!owner) throw new ApiError(400, "Owner user not found");
  }
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    throw new ApiError(400, "endDate must be on or after startDate");
  }

  const portfolio = await db.portfolio.update({ where: { id }, data: body });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Portfolio", entityId: id, entityName: portfolio.name,
    before, after: portfolio, ipAddress: ctx.ip,
  });
  emitRealtime("project:updated", { entity: "portfolio", action: "updated", id });

  return ok(portfolio);
}, { permission: "portfolio.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id } = ctx.params;
  const portfolio = await db.portfolio.findUnique({ where: { id } });
  if (!portfolio) throw new ApiError(404, "Portfolio not found");

  const [programCount, projectCount] = await Promise.all([
    db.program.count({ where: { portfolioId: id } }),
    db.project.count({ where: { portfolioId: id } }),
  ]);
  if (programCount > 0 || projectCount > 0) {
    throw new ApiError(409, `Portfolio has ${programCount} program(s) and ${projectCount} direct project(s). Remove or reassign them first.`);
  }

  await db.portfolio.delete({ where: { id } });
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Portfolio", entityId: id, entityName: portfolio.name,
    before: portfolio, ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("project:updated", { entity: "portfolio", action: "deleted", id });

  return ok({ deleted: true, id });
}, { permission: "portfolio.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
