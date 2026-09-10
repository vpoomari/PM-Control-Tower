// PM CONTROL TOWER — Dependency Item API
// PATCH  /api/projects/[id]/dependencies/[depId] — change type/lag → reschedule
// DELETE /api/projects/[id]/dependencies/[depId] — remove → reschedule

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rescheduleProject } from "@/lib/engines/rollup";
import { DEP_TYPES } from "@/lib/constants";

const dependencyUpdateSchema = z.object({
  depType: z.enum(DEP_TYPES).optional(),
  lagDays: z.coerce.number().optional(),
  isExternal: z.boolean().optional(),
  externalRef: z.string().optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const { id, depId } = ctx.params;
  const before = await db.dependency.findFirst({
    where: { id: depId, projectId: id },
    include: {
      predecessor: { select: { id: true, code: true, name: true } },
      successor: { select: { id: true, code: true, name: true } },
    },
  });
  if (!before) throw new ApiError(404, "Dependency not found in this project");

  const body = await parseBody(ctx.req, dependencyUpdateSchema);
  const dependency = await db.dependency.update({ where: { id: depId }, data: body });

  const schedule = await rescheduleProject(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Dependency", entityId: depId,
    entityName: `${before.predecessor.code} → ${before.successor.code} (${before.depType} → ${dependency.depType})`,
    before, after: dependency, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("dependency:changed", { projectId: id, action: "updated", dependencyId: depId, criticalCount: schedule.criticalCount }, projectRoom(id));

  return ok(dependency);
}, { permission: "schedule.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id, depId } = ctx.params;
  const dependency = await db.dependency.findFirst({
    where: { id: depId, projectId: id },
    include: {
      predecessor: { select: { id: true, code: true, name: true } },
      successor: { select: { id: true, code: true, name: true } },
    },
  });
  if (!dependency) throw new ApiError(404, "Dependency not found in this project");

  await db.dependency.delete({ where: { id: depId } });
  const schedule = await rescheduleProject(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Dependency", entityId: depId,
    entityName: `${dependency.predecessor.code} → ${dependency.successor.code} (${dependency.depType})`,
    before: dependency, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("dependency:changed", { projectId: id, action: "deleted", dependencyId: depId, criticalCount: schedule.criticalCount }, projectRoom(id));

  return ok({ deleted: true, id: depId, criticalCount: schedule.criticalCount });
}, { permission: "schedule.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
