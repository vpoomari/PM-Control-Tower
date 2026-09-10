// PM CONTROL TOWER — Project Schedule API (CPM)
// GET  /api/projects/[id]/schedule — tasks with CPM fields + critical path summary + dependencies
// POST /api/projects/[id]/schedule — { action: "reschedule" } → recompute CPM, return summary

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rescheduleProject } from "@/lib/engines/rollup";
import { dayNum } from "@/lib/constants";

async function loadSchedule(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, startDate: true, endDate: true } });
  if (!project) throw new ApiError(404, "Project not found");
  const [tasks, dependencies] = await Promise.all([
    db.task.findMany({
      where: { projectId },
      orderBy: [{ code: "asc" }],
      include: { wbs: { select: { id: true, code: true, name: true } }, assignee: { select: { id: true, name: true } } },
    }),
    db.dependency.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        predecessor: { select: { id: true, code: true, name: true } },
        successor: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);
  const criticalTasks = tasks
    .filter((t) => t.isCritical && !t.isSummary)
    .map((t) => ({ id: t.id, code: t.code, name: t.name, startDate: t.startDate, endDate: t.endDate, durationDays: t.durationDays }));
  const totalDuration = project.startDate && project.endDate ? Math.max(0, dayNum(project.endDate) - dayNum(project.startDate)) : null;
  const summary = {
    taskCount: tasks.length,
    leafTaskCount: tasks.filter((t) => !t.isSummary).length,
    dependencyCount: dependencies.length,
    criticalCount: criticalTasks.length,
    projectStart: project.startDate,
    projectFinish: project.endDate,
    totalDuration,
    criticalTasks,
  };
  return { project, tasks, dependencies, summary };
}

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const { tasks, dependencies, summary } = await loadSchedule(id);
  return ok({ projectId: id, summary, tasks, dependencies });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, z.object({ action: z.literal("reschedule") }));

  const result = await rescheduleProject(id);
  const { summary } = await loadSchedule(id);

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "EXECUTE", entityType: "Project", entityId: id, entityName: "Reschedule (CPM)",
    after: { criticalCount: result.criticalCount, projectFinish: result.projectFinish?.toISOString() ?? null },
    ipAddress: ctx.ip, context: `Schedule recalculation for project ${id}`,
  });
  emitRealtime("schedule:changed", { projectId: id, source: "MANUAL_RESCHEDULE", criticalCount: result.criticalCount }, projectRoom(id));

  return ok({ projectId: id, rescheduled: true, criticalCount: result.criticalCount, projectFinish: result.projectFinish, summary });
}, { permission: "schedule.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
