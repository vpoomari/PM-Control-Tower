// PM CONTROL TOWER — Project Health API
// GET  /api/health?projectId — health snapshots (latest 24 asc) + current project health row
// POST /api/health — force a manual health recalculation (MANUAL trigger)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { recalcProjectHealth } from "@/lib/engines/health";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();

  if (projectId) {
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ApiError(404, "Project not found");
    const snapsDesc = await db.projectHealthSnapshot.findMany({
      where: { projectId },
      orderBy: { capturedAt: "desc" },
      take: 24,
    });
    const latest = snapsDesc[0] ?? null;
    return ok({
      project: {
        id: project.id, code: project.code, name: project.name, status: project.status,
        healthScore: project.healthScore, ragStatus: project.ragStatus, progress: project.progress,
        forecastCost: project.forecastCost, actualCost: project.actualCost,
      },
      latest,
      snapshots: snapsDesc.slice().reverse(), // asc
    });
  }

  const snapsDesc = await db.projectHealthSnapshot.findMany({
    orderBy: { capturedAt: "desc" },
    take: 24,
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  const projects = await db.project.findMany({
    select: { id: true, code: true, name: true, status: true, healthScore: true, ragStatus: true, progress: true },
    orderBy: { code: "asc" },
  });
  return ok({
    projects,
    snapshots: snapsDesc.slice().reverse(),
  });
}, { permission: "evm.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const postSchema = z.object({ projectId: z.string().min(1) });

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, postSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, healthScore: true, ragStatus: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const before = { healthScore: project.healthScore, ragStatus: project.ragStatus };
  const result = await recalcProjectHealth(project.id, "MANUAL");

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "EXECUTE", entityType: "ProjectHealth", entityId: project.id, entityName: project.code,
    before, after: result, ipAddress: ctx.ip,
  });
  emitRealtime("project:health", { projectId: project.id, score: result.score, rag: result.rag, triggeredBy: "MANUAL" }, projectRoom(project.id));
  return ok({ health: result, previous: before, changed: before.ragStatus !== result.rag || before.healthScore !== result.score });
}, { permission: "evm.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
