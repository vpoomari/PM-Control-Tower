// PM CONTROL TOWER — Task Detail API
// GET    /api/projects/[id]/tasks/[taskId] — detail with timesheet rollup + both dependency directions
// PATCH  /api/projects/[id]/tasks/[taskId] — update; schedule-affecting changes → reschedule + health recalc
// DELETE /api/projects/[id]/tasks/[taskId] — delete (removes connected dependencies) → reschedule

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rescheduleProject, rollupWbsActuals } from "@/lib/engines/rollup";
import { recalcProjectHealth } from "@/lib/engines/health";
import { fireAutomations } from "@/lib/engines/automations";
import { TASK_STATUS, PRIORITY, round2 } from "@/lib/constants";

const taskUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  criticality: z.string().optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  durationDays: z.coerce.number().min(0).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
  plannedHours: z.coerce.number().min(0).optional(),
  actualHours: z.coerce.number().min(0).optional(),
  remainingHours: z.coerce.number().min(0).optional(),
  plannedCost: z.coerce.number().min(0).optional(),
  actualCost: z.coerce.number().min(0).optional(),
  assigneeId: z.string().nullable().optional(),
  wbsId: z.string().nullable().optional(),
  constraintType: z.enum(["ASAP", "ALAP", "MSO", "SNET", "SNLT", "FNET", "FNLT"]).optional(),
  constraintDate: z.coerce.date().optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id, taskId } = ctx.params;
  const task = await db.task.findFirst({
    where: { id: taskId, projectId: id },
    include: {
      wbs: { select: { id: true, code: true, name: true } },
      assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
    },
  });
  if (!task) throw new ApiError(404, "Task not found in this project");

  const [entryAgg, preds, succs] = await Promise.all([
    db.timesheetEntry.aggregate({ where: { taskId }, _count: { _all: true }, _sum: { hours: true, billableHours: true } }),
    db.dependency.findMany({
      where: { successorId: taskId },
      include: { predecessor: { select: { id: true, code: true, name: true, status: true, progress: true } } },
    }),
    db.dependency.findMany({
      where: { predecessorId: taskId },
      include: { successor: { select: { id: true, code: true, name: true, status: true, progress: true } } },
    }),
  ]);

  return ok({
    task,
    timesheet: { entryCount: entryAgg._count._all, totalHours: round2(entryAgg._sum.hours ?? 0), billableHours: round2(entryAgg._sum.billableHours ?? 0) },
    predecessors: preds.map((d) => ({ dependencyId: d.id, depType: d.depType, lagDays: d.lagDays, task: d.predecessor })),
    successors: succs.map((d) => ({ dependencyId: d.id, depType: d.depType, lagDays: d.lagDays, task: d.successor })),
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const { id, taskId } = ctx.params;
  const before = await db.task.findFirst({ where: { id: taskId, projectId: id } });
  if (!before) throw new ApiError(404, "Task not found in this project");

  const body = await parseBody(ctx.req, taskUpdateSchema);
  if (body.assigneeId) {
    const user = await db.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } });
    if (!user) throw new ApiError(400, "Assignee user not found");
  }
  if (body.wbsId) {
    const node = await db.wBSNode.findFirst({ where: { id: body.wbsId, projectId: id }, select: { id: true } });
    if (!node) throw new ApiError(400, "WBS node not found in this project");
  }

  const task = await db.task.update({ where: { id: taskId }, data: body, include: { assignee: { select: { id: true, name: true } } } });

  // Schedule-affecting change? progress / dates / duration / status / dependencies fields
  const scheduleChanged =
    (body.progress !== undefined && body.progress !== before.progress) ||
    (body.startDate !== undefined && body.startDate?.getTime() !== before.startDate?.getTime()) ||
    (body.endDate !== undefined && body.endDate?.getTime() !== before.endDate?.getTime()) ||
    (body.durationDays !== undefined && body.durationDays !== before.durationDays) ||
    (body.status !== undefined && body.status !== before.status) ||
    (body.constraintType !== undefined && body.constraintType !== before.constraintType) ||
    (body.constraintDate !== undefined && body.constraintDate?.getTime() !== before.constraintDate?.getTime()) ||
    (body.deadline !== undefined && body.deadline?.getTime() !== before.deadline?.getTime());

  const wbsRelevant =
    (body.plannedHours !== undefined && body.plannedHours !== before.plannedHours) ||
    (body.actualHours !== undefined && body.actualHours !== before.actualHours) ||
    (body.plannedCost !== undefined && body.plannedCost !== before.plannedCost) ||
    (body.actualCost !== undefined && body.actualCost !== before.actualCost) ||
    (body.wbsId !== undefined && body.wbsId !== before.wbsId) ||
    scheduleChanged;

  const statusChanged = body.status !== undefined && body.status !== before.status;

  if (scheduleChanged) {
    // Cascade (bug fix): WBS roll-up must ALSO run on reschedules — wbsRelevant
    // includes scheduleChanged, so the old `else if` skipped rollups on every
    // progress/status/date edit, leaving WBS nodes stale.
    await rescheduleProject(id);
    await rollupWbsActuals(id);
    await recalcProjectHealth(id, "TASK_UPDATE");
  } else if (wbsRelevant) {
    await rollupWbsActuals(id);
  }

  // Cross-entity automations: status movement → STATUS_CHANGED; date/progress/
  // duration movement → SCHEDULE_CHANGED. Fire-and-forget (never block the edit).
  if (statusChanged) {
    fireAutomations("STATUS_CHANGED", {
      entityType: "Task", entityId: taskId, projectId: id,
      code: task.code, name: task.name, status: task.status, previousStatus: before.status,
      progress: task.progress, criticality: task.criticality,
    });
  }
  // SCHEDULE_CHANGED is emitted centrally by rescheduleProject above (single source).

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Task", entityId: taskId, entityName: `${task.code} ${task.name}`,
    before, after: task, ipAddress: ctx.ip, context: `Project ${id}${scheduleChanged ? " (rescheduled)" : ""}`,
  });
  emitRealtime("task:changed", { projectId: id, action: "updated", taskId, code: task.code, status: task.status, progress: task.progress }, projectRoom(id));
  if (scheduleChanged) emitRealtime("schedule:changed", { projectId: id, taskId, source: "TASK_UPDATE" }, projectRoom(id));

  return ok(task);
}, { permission: "wbs.manage", rateLimit: { limit: 240, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id, taskId } = ctx.params;
  const task = await db.task.findFirst({ where: { id: taskId, projectId: id } });
  if (!task) throw new ApiError(404, "Task not found in this project");

  // Remove connected dependencies first (explicit; also cascade-protected at FK level)
  const deps = await db.dependency.deleteMany({
    where: { projectId: id, OR: [{ predecessorId: taskId }, { successorId: taskId }] },
  });
  await db.task.delete({ where: { id: taskId } });

  await rescheduleProject(id);
  await rollupWbsActuals(id);
  await recalcProjectHealth(id, "TASK_DELETE"); // parity with PATCH — deletions move health too
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Task", entityId: taskId, entityName: `${task.code} ${task.name}`,
    before: { task, removedDependencies: deps.count }, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("task:changed", { projectId: id, action: "deleted", taskId, code: task.code }, projectRoom(id));

  return ok({ deleted: true, id: taskId, removedDependencies: deps.count });
}, { permission: "wbs.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
