// PM CONTROL TOWER — Planning Lab: Resource Leveling API
// GET  /api/projects/[id]/tools/leveling — day-level resource load (calendar-aware),
//        over-allocation hits and float-safe leveling prescriptions.
// POST /api/projects/[id]/tools/leveling — apply prescriptions: slides selected
//        tasks right by N working days (calendar math) and anchors the new start
//        as an SNET constraint so the CPM respects the leveled position.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { scheduleInputs, rescheduleProject } from "@/lib/engines/rollup";
import { computeDailyLoad, prescribeLeveling, LevTaskInput, LevAssignmentInput, LevResourceInput } from "@/lib/engines/leveling";
import { addWorkingDays } from "@/lib/engines/calendars";

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const inputs = await scheduleInputs(id);
  if (!inputs || !inputs.project) throw new ApiError(404, "Project not found (or has no schedulable tasks)");
  const { project, cal } = inputs;

  const tasks: LevTaskInput[] = project.tasks.filter((t) => !t.isSummary).map((t) => ({
    id: t.id, code: t.code, name: t.name, durationDays: t.durationDays,
    startDate: t.startDate, endDate: t.endDate,
    earliestStart: t.earliestStart, earliestFinish: t.earliestFinish,
    totalFloat: t.totalFloat, isCritical: t.isCritical,
  }));

  const assignments = await db.assignment.findMany({
    where: { projectId: id, taskId: { not: null }, status: "ACTIVE" },
    select: { id: true, resourceId: true, taskId: true, startDate: true, endDate: true, allocationPercent: true, plannedHours: true },
  });
  const resourceIds = [...new Set(assignments.map((a) => a.resourceId))];
  const resources = resourceIds.length
    ? await db.resource.findMany({ where: { id: { in: resourceIds } }, select: { id: true, name: true, employeeCode: true, capacityHoursPerWeek: true } })
    : [];

  const levAssignments: LevAssignmentInput[] = assignments.map((a) => ({
    id: a.id, resourceId: a.resourceId, taskId: a.taskId,
    startDate: a.startDate, endDate: a.endDate,
    allocationPercent: a.allocationPercent, plannedHours: a.plannedHours,
  }));
  const levResources: LevResourceInput[] = resources.map((r) => ({ id: r.id, name: r.name, capacityHoursPerWeek: r.capacityHoursPerWeek }));

  const { series, over } = computeDailyLoad(tasks, levAssignments, levResources, cal);
  const prescriptions = prescribeLeveling(over, tasks, levAssignments);

  const taskById = new Map(project.tasks.map((t) => [t.id, t]));
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const workloadDays = series.reduce((s, r) => Math.max(s, r.days.length), 0);

  return ok({
    projectId: id,
    calendarName: cal.name,
    summary: {
      resourcesLoaded: resources.length,
      overallocatedDays: over.length,
      overloadedResources: [...new Set(over.map((h) => h.resourceId))].length,
      prescriptions: prescriptions.length,
      workloadDays,
    },
    resources: resources.map((r) => ({ id: r.id, name: r.name, employeeCode: r.employeeCode, capacityHoursPerWeek: r.capacityHoursPerWeek })),
    series: series.map((s) => ({
      ...s,
      resourceName: resourceById.get(s.resourceId)?.name ?? s.resourceId,
      over: over.filter((h) => h.resourceId === s.resourceId),
    })),
    over: over.map((h) => ({
      ...h,
      resourceName: resourceById.get(h.resourceId)?.name ?? h.resourceId,
      taskNames: h.taskIds.map((tid) => taskById.get(tid)?.code ?? tid),
    })),
    prescriptions: prescriptions.map((p) => {
      const t = taskById.get(p.taskId);
      return {
        ...p,
        taskName: t?.name,
        currentStart: (t?.startDate ?? t?.earliestStart)?.toISOString?.() ?? null,
      };
    }),
  });
}, { permission: "project.view", rateLimit: { limit: 120, windowMs: 60_000 } });

const applySchema = z.object({
  actions: z.array(z.object({
    taskId: z.string().min(1),
    shiftDays: z.number().int().min(-365).max(365),
  })).min(1).max(50),
});

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const inputs = await scheduleInputs(id);
  if (!inputs || !inputs.project) throw new ApiError(404, "Project not found (or has no schedulable tasks)");
  const { cal } = inputs;
  const body = await parseBody(ctx.req, applySchema);
  const taskIds = body.actions.map((a) => a.taskId);
  const targets = inputs.project.tasks.filter((t) => taskIds.includes(t.id) && !t.isSummary);
  if (!targets.length) throw new ApiError(404, "No matching schedulable tasks");

  const applied: { taskId: string; code: string; newStart: string; newFinish: string; anchoredConstraint: string }[] = [];
  for (const action of body.actions) {
    const t = targets.find((x) => x.id === action.taskId);
    if (!t) continue;
    if (t.progress >= 100 || t.status === "COMPLETED") continue; // never move finished work
    const baseStart = t.startDate ?? t.earliestStart;
    if (!baseStart) continue;
    const newStart = addWorkingDays(baseStart, action.shiftDays, cal);
    const dur = t.durationDays > 0 ? t.durationDays : 1;
    const newFinish = addWorkingDays(newStart, dur - 1, cal);
    await db.task.update({
      where: { id: t.id },
      data: {
        startDate: newStart,
        endDate: newFinish,
        // Anchor the leveled position so CPM respects it (skip when the user already fixed the start)
        constraintType: t.constraintType === "MSO" ? "MSO" : "SNET",
        constraintDate: newStart,
      },
    });
    applied.push({ taskId: t.id, code: t.code, newStart: newStart.toISOString(), newFinish: newFinish.toISOString(), anchoredConstraint: "SNET" });
  }
  if (!applied.length) throw new ApiError(400, "Nothing to level (targets already finished or undated)");

  const reschedule = await rescheduleProject(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Schedule", entityId: id, entityName: `Leveling — ${inputs.project.code}`,
    after: { applied }, ipAddress: ctx.ip, context: "Resource leveling applied",
  });
  emitRealtime("schedule:changed", { projectId: id, source: "LEVELING", moved: applied.length }, projectRoom(id));
  return ok({ projectId: id, applied, reschedule });
}, { permission: "schedule.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
