// PM CONTROL TOWER — Program Detail API
// GET    /api/programs/[id] — program + projects (RAG/health/progress/budget) + KPIs
// PATCH  /api/programs/[id] — update program
// DELETE /api/programs/[id] — delete (blocked when projects exist)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { round2 } from "@/lib/constants";

const programUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().optional().nullable(),
  portfolioId: z.string().optional(),
  ownerId: z.string().optional().nullable(),
  status: z.string().trim().min(2).optional(),
  budget: z.coerce.number().min(0).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const program = await db.program.findUnique({
    where: { id },
    include: {
      portfolio: { select: { id: true, code: true, name: true } },
    },
  });
  if (!program) throw new ApiError(404, "Program not found");

  const owner = program.ownerId
    ? await db.user.findUnique({ where: { id: program.ownerId }, select: { id: true, name: true, email: true, avatarColor: true } })
    : null;

  const projects = await db.project.findMany({
    where: { programId: id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, name: true, status: true, priority: true, phase: true, progress: true, healthScore: true, ragStatus: true, currentBudget: true, baselineBudget: true, actualCost: true, forecastCost: true, startDate: true, endDate: true, updatedAt: true },
  });

  const totals = projects.reduce(
    (acc, p) => ({
      currentBudget: acc.currentBudget + p.currentBudget,
      actualCost: acc.actualCost + p.actualCost,
      forecastCost: acc.forecastCost + p.forecastCost,
      health: acc.health + p.healthScore,
    }),
    { currentBudget: 0, actualCost: 0, forecastCost: 0, health: 0 }
  );

  const kpis = {
    projectCount: projects.length,
    activeProjects: projects.filter((p) => p.status === "ACTIVE").length,
    budget: program.budget,
    currentBudget: round2(totals.currentBudget),
    actualCost: round2(totals.actualCost),
    forecastCost: round2(totals.forecastCost),
    budgetUtilizationPct: program.budget > 0 ? round2((totals.actualCost / program.budget) * 100) : 0,
    avgHealthScore: projects.length ? round2(totals.health / projects.length) : 100,
    avgProgress: projects.length ? round2(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0,
    ragDistribution: {
      GREEN: projects.filter((p) => p.ragStatus === "GREEN").length,
      AMBER: projects.filter((p) => p.ragStatus === "AMBER").length,
      RED: projects.filter((p) => p.ragStatus === "RED").length,
    },
  };

  return ok({ program, owner, projects, kpis });
}, { permission: "program.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const { id } = ctx.params;
  const before = await db.program.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Program not found");

  const body = await parseBody(ctx.req, programUpdateSchema);
  if (body.portfolioId && body.portfolioId !== before.portfolioId) {
    const portfolio = await db.portfolio.findUnique({ where: { id: body.portfolioId }, select: { id: true } });
    if (!portfolio) throw new ApiError(400, "Target portfolio not found");
  }
  if (body.ownerId) {
    const owner = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
    if (!owner) throw new ApiError(400, "Owner user not found");
  }

  const program = await db.program.update({ where: { id }, data: body });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Program", entityId: id, entityName: program.name,
    before, after: program, ipAddress: ctx.ip,
  });
  emitRealtime("project:updated", { entity: "program", action: "updated", id });

  return ok(program);
}, { permission: "program.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id } = ctx.params;
  const program = await db.program.findUnique({ where: { id } });
  if (!program) throw new ApiError(404, "Program not found");

  const projectCount = await db.project.count({ where: { programId: id } });
  if (projectCount > 0) {
    throw new ApiError(409, `Program has ${projectCount} project(s). Reassign or delete them first.`);
  }

  await db.program.delete({ where: { id } });
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Program", entityId: id, entityName: program.name,
    before: program, ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("project:updated", { entity: "program", action: "deleted", id, portfolioId: program.portfolioId });

  return ok({ deleted: true, id });
}, { permission: "program.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
