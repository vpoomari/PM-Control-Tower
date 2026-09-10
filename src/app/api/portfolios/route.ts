// PM CONTROL TOWER — Portfolio API
// GET  /api/portfolios — list portfolios with program/project counts + roll-up financial sums
// POST /api/portfolios — create portfolio

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { round2 } from "@/lib/constants";

const portfolioCreateSchema = z.object({
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2).max(120),
  description: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  status: z.string().trim().min(2).optional(),
  strategicObjective: z.string().optional().nullable(),
  budgetTarget: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

const projectSummarySelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  healthScore: true,
  ragStatus: true,
  progress: true,
  currentBudget: true,
  actualCost: true,
  forecastCost: true,
} as const;

export const GET = withApi(async () => {
  const portfolios = await db.portfolio.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      programs: { select: { id: true, code: true, name: true, status: true, healthScore: true, ragStatus: true }, orderBy: { createdAt: "asc" } },
      projects: { select: projectSummarySelect, orderBy: { updatedAt: "desc" } },
    },
  });

  const ownerIds = [...new Set(portfolios.map((p) => p.ownerId).filter((x): x is string => Boolean(x)))];
  const owners = ownerIds.length
    ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const ownerById = new Map(owners.map((u) => [u.id, u]));

  const data = portfolios.map((p) => {
    const sums = p.projects.reduce(
      (acc, pr) => ({
        currentBudget: acc.currentBudget + pr.currentBudget,
        actualCost: acc.actualCost + pr.actualCost,
        forecastCost: acc.forecastCost + pr.forecastCost,
        health: acc.health + pr.healthScore,
      }),
      { currentBudget: 0, actualCost: 0, forecastCost: 0, health: 0 }
    );
    const projectCount = p.projects.length;
    return {
      ...p,
      owner: p.ownerId ? ownerById.get(p.ownerId) ?? null : null,
      programCount: p.programs.length,
      projectCount,
      totals: {
        currentBudget: round2(sums.currentBudget),
        actualCost: round2(sums.actualCost),
        forecastCost: round2(sums.forecastCost),
      },
      avgHealthScore: projectCount ? round2(sums.health / projectCount) : 100,
      ragDistribution: {
        GREEN: p.projects.filter((x) => x.ragStatus === "GREEN").length,
        AMBER: p.projects.filter((x) => x.ragStatus === "AMBER").length,
        RED: p.projects.filter((x) => x.ragStatus === "RED").length,
      },
    };
  });

  return ok(data);
}, { permission: "portfolio.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, portfolioCreateSchema);
  const code = body.code.toUpperCase();
  const exists = await db.portfolio.findUnique({ where: { code }, select: { id: true } });
  if (exists) throw new ApiError(409, `Portfolio code ${code} already exists`);
  if (body.ownerId) {
    const owner = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
    if (!owner) throw new ApiError(400, "Owner user not found");
  }
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    throw new ApiError(400, "endDate must be on or after startDate");
  }

  const portfolio = await db.portfolio.create({
    data: {
      code,
      name: body.name,
      description: body.description ?? null,
      ownerId: body.ownerId ?? null,
      status: body.status ?? "ACTIVE",
      strategicObjective: body.strategicObjective ?? null,
      budgetTarget: body.budgetTarget ?? 0,
      currency: body.currency ?? "USD",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Portfolio", entityId: portfolio.id, entityName: portfolio.name,
    after: portfolio, ipAddress: ctx.ip,
  });
  emitRealtime("project:updated", { entity: "portfolio", action: "created", id: portfolio.id, code: portfolio.code });

  return ok(portfolio, 201);
}, { permission: "portfolio.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
