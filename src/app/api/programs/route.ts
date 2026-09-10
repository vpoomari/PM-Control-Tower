// PM CONTROL TOWER — Program API
// GET  /api/programs?portfolioId= — list programs with project counts/sums
// POST /api/programs — create program

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { round2 } from "@/lib/constants";

const programCreateSchema = z.object({
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2).max(120),
  description: z.string().optional().nullable(),
  portfolioId: z.string().min(1),
  ownerId: z.string().optional().nullable(),
  status: z.string().trim().min(2).optional(),
  budget: z.coerce.number().min(0).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const portfolioId = ctx.searchParams.get("portfolioId");
  const programs = await db.program.findMany({
    where: portfolioId ? { portfolioId } : undefined,
    orderBy: { createdAt: "asc" },
    include: {
      portfolio: { select: { id: true, code: true, name: true } },
      projects: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, code: true, name: true, status: true, healthScore: true, ragStatus: true, progress: true, currentBudget: true, actualCost: true, forecastCost: true },
      },
    },
  });

  const ownerIds = [...new Set(programs.map((p) => p.ownerId).filter((x): x is string => Boolean(x)))];
  const owners = ownerIds.length
    ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const ownerById = new Map(owners.map((u) => [u.id, u]));

  const data = programs.map((pg) => {
    const sums = pg.projects.reduce(
      (acc, p) => ({
        currentBudget: acc.currentBudget + p.currentBudget,
        actualCost: acc.actualCost + p.actualCost,
        forecastCost: acc.forecastCost + p.forecastCost,
        health: acc.health + p.healthScore,
      }),
      { currentBudget: 0, actualCost: 0, forecastCost: 0, health: 0 }
    );
    return {
      ...pg,
      owner: pg.ownerId ? ownerById.get(pg.ownerId) ?? null : null,
      projectCount: pg.projects.length,
      totals: {
        currentBudget: round2(sums.currentBudget),
        actualCost: round2(sums.actualCost),
        forecastCost: round2(sums.forecastCost),
      },
      avgHealthScore: pg.projects.length ? round2(sums.health / pg.projects.length) : 100,
      ragDistribution: {
        GREEN: pg.projects.filter((x) => x.ragStatus === "GREEN").length,
        AMBER: pg.projects.filter((x) => x.ragStatus === "AMBER").length,
        RED: pg.projects.filter((x) => x.ragStatus === "RED").length,
      },
    };
  });

  return ok(data);
}, { permission: "program.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, programCreateSchema);
  const code = body.code.toUpperCase();
  const exists = await db.program.findUnique({ where: { code }, select: { id: true } });
  if (exists) throw new ApiError(409, `Program code ${code} already exists`);
  const portfolio = await db.portfolio.findUnique({ where: { id: body.portfolioId }, select: { id: true, name: true } });
  if (!portfolio) throw new ApiError(400, "Portfolio not found");
  if (body.ownerId) {
    const owner = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
    if (!owner) throw new ApiError(400, "Owner user not found");
  }
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    throw new ApiError(400, "endDate must be on or after startDate");
  }

  const program = await db.program.create({
    data: {
      code,
      name: body.name,
      description: body.description ?? null,
      portfolioId: body.portfolioId,
      ownerId: body.ownerId ?? null,
      status: body.status ?? "ACTIVE",
      budget: body.budget ?? 0,
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Program", entityId: program.id, entityName: program.name,
    after: program, ipAddress: ctx.ip,
  });
  emitRealtime("project:updated", { entity: "program", action: "created", id: program.id, portfolioId: body.portfolioId });

  return ok(program, 201);
}, { permission: "program.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
