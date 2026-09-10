// PM CONTROL TOWER — Project API
// GET  /api/projects — filterable, paginated project list (q, status, rag, programId, portfolioId, ownerId, take, skip)
// POST /api/projects — create project (code unique; programId → derive portfolioId)

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { PROJECT_STATUS, PRIORITY } from "@/lib/constants";

const projectCreateSchema = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(160),
  description: z.string().optional().nullable(),
  programId: z.string().optional().nullable(),
  portfolioId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  sponsorId: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  phase: z.string().optional(),
  methodology: z.string().optional(),
  riskLevel: z.string().optional(),
  currency: z.string().trim().length(3).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  baselineStart: z.coerce.date().optional().nullable(),
  baselineFinish: z.coerce.date().optional().nullable(),
  currentBudget: z.coerce.number().min(0).optional(),
  baselineBudget: z.coerce.number().min(0).optional(),
  charter: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  successCriteria: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const sp = ctx.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status");
  const rag = sp.get("rag");
  const programId = sp.get("programId");
  const portfolioId = sp.get("portfolioId");
  const ownerId = sp.get("ownerId");

  const takeRaw = Number(sp.get("take") ?? 100);
  const skipRaw = Number(sp.get("skip") ?? 0);
  const take = Math.min(500, Math.max(1, Number.isFinite(takeRaw) ? Math.floor(takeRaw) : 100));
  const skip = Math.max(0, Number.isFinite(skipRaw) ? Math.floor(skipRaw) : 0);

  const where: Prisma.ProjectWhereInput = {
    AND: [
      q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {},
      status ? { status } : {},
      rag ? { ragStatus: rag } : {},
      programId ? { programId } : {},
      portfolioId ? { OR: [{ portfolioId }, { program: { portfolioId } }] } : {},
      ownerId ? { ownerId } : {},
    ],
  };

  const [items, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      include: {
        program: { select: { id: true, code: true, name: true, portfolio: { select: { id: true, code: true, name: true } } } },
        portfolio: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, name: true, avatarColor: true } },
      },
    }),
    db.project.count({ where }),
  ]);

  return ok({ items, total, take, skip });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, projectCreateSchema);
  const code = body.code.toUpperCase();
  const exists = await db.project.findUnique({ where: { code }, select: { id: true } });
  if (exists) throw new ApiError(409, `Project code ${code} already exists`);

  // Derive portfolio from program when a program is attached
  let portfolioId = body.portfolioId ?? null;
  if (body.programId) {
    const program = await db.program.findUnique({ where: { id: body.programId }, select: { id: true, portfolioId: true } });
    if (!program) throw new ApiError(400, "Program not found");
    portfolioId = program.portfolioId;
  } else if (portfolioId) {
    const portfolio = await db.portfolio.findUnique({ where: { id: portfolioId }, select: { id: true } });
    if (!portfolio) throw new ApiError(400, "Portfolio not found");
  }
  for (const uid of [body.ownerId, body.managerId, body.sponsorId]) {
    if (uid) {
      const u = await db.user.findUnique({ where: { id: uid }, select: { id: true } });
      if (!u) throw new ApiError(400, "Referenced user not found");
    }
  }

  const project = await db.project.create({
    data: {
      code,
      name: body.name,
      description: body.description ?? null,
      programId: body.programId ?? null,
      portfolioId,
      ownerId: body.ownerId ?? null,
      managerId: body.managerId ?? null,
      sponsorId: body.sponsorId ?? null,
      status: body.status ?? "DRAFT",
      priority: body.priority ?? "MEDIUM",
      phase: body.phase ?? "INITIATION",
      methodology: body.methodology ?? "HYBRID",
      riskLevel: body.riskLevel ?? "MEDIUM",
      currency: body.currency ?? "USD",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      baselineStart: body.baselineStart ?? body.startDate ?? null,
      baselineFinish: body.baselineFinish ?? body.endDate ?? null,
      currentBudget: body.currentBudget ?? 0,
      baselineBudget: body.baselineBudget ?? body.currentBudget ?? 0,
      charter: body.charter ?? null,
      objectives: body.objectives ?? null,
      successCriteria: body.successCriteria ?? null,
    },
    include: {
      program: { select: { id: true, code: true, name: true } },
      portfolio: { select: { id: true, code: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Project", entityId: project.id, entityName: project.name,
    after: project, ipAddress: ctx.ip,
  });
  emitRealtime("project:created", { projectId: project.id, code: project.code, name: project.name }, projectRoom(project.id));

  return ok(project, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
