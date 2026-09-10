// PM CONTROL TOWER — Stakeholder Register API
// GET  /api/stakeholders?projectId — stakeholder list with influence/interest grid data
// POST /api/stakeholders — register a stakeholder

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
const ENGAGEMENTS = ["CHAMPION", "SUPPORTIVE", "NEUTRAL", "RESISTANT", "BLOCKER"] as const;

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const stakeholders = await db.stakeholder.findMany({
    where: projectId ? { projectId } : {},
    orderBy: [{ influence: "desc" }, { name: "asc" }],
    take: 200,
  });

  // Stakeholder carries projectId without a FK relation — resolve project context separately
  const stakeholderProjectIds = [...new Set(stakeholders.map((s) => s.projectId).filter((p): p is string => Boolean(p)))];
  const stakeholderProjects = stakeholderProjectIds.length
    ? await db.project.findMany({ where: { id: { in: stakeholderProjectIds } }, select: { id: true, code: true, name: true } })
    : [];
  const projectById = new Map(stakeholderProjects.map((p) => [p.id, p]));

  return ok({
    stakeholders: stakeholders.map((s) => ({
      ...s,
      project: s.projectId ? projectById.get(s.projectId) ?? null : null,
    })),
    total: stakeholders.length,
    summary: {
      champions: stakeholders.filter((s) => s.engagement === "CHAMPION").length,
      blockers: stakeholders.filter((s) => s.engagement === "BLOCKER" || s.engagement === "RESISTANT").length,
      highInfluence: stakeholders.filter((s) => s.influence === "HIGH").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().optional().nullable(),
  portfolioId: z.string().optional().nullable(),
  name: z.string().min(2),
  role: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  influence: z.enum(LEVELS).default("MEDIUM"),
  interest: z.enum(LEVELS).default("MEDIUM"),
  engagement: z.enum(ENGAGEMENTS).default("NEUTRAL"),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  strategy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  if (!body.projectId && !body.portfolioId) {
    throw new ApiError(400, "Provide projectId or portfolioId for the stakeholder");
  }
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true } });
    if (!project) throw new ApiError(404, "Project not found");
  }
  if (body.portfolioId) {
    const portfolio = await db.portfolio.findUnique({ where: { id: body.portfolioId }, select: { id: true } });
    if (!portfolio) throw new ApiError(404, "Portfolio not found");
  }

  const created = await db.stakeholder.create({
    data: {
      projectId: body.projectId ?? null,
      portfolioId: body.portfolioId ?? null,
      name: body.name,
      role: body.role ?? null,
      organization: body.organization ?? null,
      influence: body.influence,
      interest: body.interest,
      engagement: body.engagement,
      email: body.email ?? null,
      phone: body.phone ?? null,
      strategy: body.strategy ?? null,
      notes: body.notes ?? null,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Stakeholder", entityId: created.id, entityName: created.name,
    after: { influence: created.influence, interest: created.interest, engagement: created.engagement, projectId: created.projectId },
    ipAddress: ctx.ip,
  });
  if (created.projectId) {
    emitRealtime("project:updated", { projectId: created.projectId, stakeholderId: created.id, action: "STAKEHOLDER_ADDED" }, projectRoom(created.projectId));
  }
  return ok({ stakeholder: created }, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
