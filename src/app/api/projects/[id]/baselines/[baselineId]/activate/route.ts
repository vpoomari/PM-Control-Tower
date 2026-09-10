// PM CONTROL TOWER — Baseline Activation API
// POST /api/projects/[id]/baselines/[baselineId]/activate
// Sets this baseline ACTIVE, supersedes all others, and stamps project baseline fields.

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

export const POST = withApi(async (ctx) => {
  const { id, baselineId } = ctx.params;
  const baseline = await db.baseline.findFirst({ where: { id: baselineId, projectId: id } });
  if (!baseline) throw new ApiError(404, "Baseline not found in this project");
  if (baseline.status === "ACTIVE") throw new ApiError(409, "Baseline is already active");

  const beforeProject = await db.project.findUnique({ where: { id }, select: { baselineStart: true, baselineFinish: true, baselineBudget: true } });

  const [, activated] = await db.$transaction([
    db.baseline.updateMany({ where: { projectId: id, status: "ACTIVE" }, data: { status: "SUPERSEDED" } }),
    db.baseline.update({ where: { id: baselineId }, data: { status: "ACTIVE", activatedAt: new Date() } }),
    db.project.update({
      where: { id },
      data: {
        baselineStart: baseline.baselineStart,
        baselineFinish: baseline.baselineFinish,
        baselineBudget: baseline.baselineCost,
      },
    }),
  ]);

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "ACTIVATE", entityType: "Baseline", entityId: baselineId, entityName: baseline.name,
    before: { projectBaseline: beforeProject, previousActiveStatus: baseline.status },
    after: { status: "ACTIVE", activatedAt: activated.activatedAt, version: baseline.version },
    ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("baseline:changed", { projectId: id, action: "activated", baselineId, version: baseline.version }, projectRoom(id));
  emitRealtime("project:updated", { projectId: id, entity: "baseline", action: "activated" }, projectRoom(id));

  return ok({ activated: true, baselineId, version: baseline.version, activatedAt: activated.activatedAt });
}, { permission: "baseline.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
