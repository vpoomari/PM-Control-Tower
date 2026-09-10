// PM CONTROL TOWER — Project Baselines API
// GET  /api/projects/[id]/baselines — list (newest version first)
// POST /api/projects/[id]/baselines — snapshot current schedule + cost as DRAFT baseline

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { toJson, round2 } from "@/lib/constants";

const baselineCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, baselineStart: true, baselineFinish: true, baselineBudget: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const baselines = await db.baseline.findMany({
    where: { projectId: id },
    orderBy: { version: "desc" },
  });
  const active = baselines.find((b) => b.status === "ACTIVE") ?? null;

  return ok({ projectId: id, items: baselines, total: baselines.length, activeBaselineId: active?.id ?? null, projectBaseline: { start: project.baselineStart, finish: project.baselineFinish, budget: project.baselineBudget } });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, include: { tasks: { orderBy: { code: "asc" } } } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, baselineCreateSchema);

  // Baseline hours from WBS leaf nodes
  const wbsNodes = await db.wBSNode.findMany({ where: { projectId: id }, select: { id: true, parentId: true, plannedHours: true } });
  const parentIds = new Set(wbsNodes.map((n) => n.parentId));
  const leafHours = wbsNodes.filter((n) => !parentIds.has(n.id)).reduce((s, n) => s + n.plannedHours, 0);

  const last = await db.baseline.findFirst({ where: { projectId: id }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;

  const snapshot = {
    capturedAt: new Date().toISOString(),
    tasks: project.tasks.map((t) => ({
      id: t.id, code: t.code, name: t.name,
      start: t.startDate?.toISOString() ?? null,
      end: t.endDate?.toISOString() ?? null,
      duration: t.durationDays,
      progress: t.progress,
      hours: t.plannedHours,
    })),
  };

  const baseline = await db.baseline.create({
    data: {
      projectId: id,
      version,
      name: body.name ?? `Baseline v${version}`,
      description: body.description ?? null,
      status: "DRAFT",
      baselineStart: project.startDate,
      baselineFinish: project.endDate,
      baselineHours: round2(leafHours),
      baselineCost: round2(project.currentBudget || project.baselineBudget || 0),
      snapshotJson: toJson(snapshot),
      createdBy: ctx.session?.id ?? null,
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Baseline", entityId: baseline.id, entityName: baseline.name,
    after: { version, status: baseline.status, baselineHours: baseline.baselineHours, baselineCost: baseline.baselineCost, taskCount: project.tasks.length },
    ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("baseline:changed", { projectId: id, action: "created", baselineId: baseline.id, version }, projectRoom(id));

  return ok(baseline, 201);
}, { permission: "baseline.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
