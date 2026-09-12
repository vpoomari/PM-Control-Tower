// PM CONTROL TOWER — Project Tasks API
// GET  /api/projects/[id]/tasks — list with WBS code, assignee, critical + CPM fields
// POST /api/projects/[id]/tasks — create task (auto code T-<wbsCode>-<n>) → reschedule + rollup

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rescheduleProject, rollupWbsActuals } from "@/lib/engines/rollup";
import { TASK_STATUS, PRIORITY, round2 } from "@/lib/constants";

const taskCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().optional().nullable(),
  wbsId: z.string().optional().nullable(),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  criticality: z.string().optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  durationDays: z.coerce.number().min(0).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
  plannedHours: z.coerce.number().min(0).optional(),
  plannedCost: z.coerce.number().min(0).optional(),
  assigneeId: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const status = ctx.searchParams.get("status");
  const wbsId = ctx.searchParams.get("wbsId");
  const assigneeId = ctx.searchParams.get("assigneeId");
  const q = ctx.searchParams.get("q")?.trim();

  const tasks = await db.task.findMany({
    where: {
      projectId: id,
      ...(status ? { status } : {}),
      ...(wbsId ? { wbsId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    orderBy: [{ code: "asc" }],
    include: {
      wbs: { select: { id: true, code: true, name: true } },
      assignee: { select: { id: true, name: true, avatarColor: true } },
    },
  });

  return ok({ projectId: id, items: tasks, total: tasks.length });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true, status: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, taskCreateSchema);

  // Automation: Historical Bias Injection — pre-fill duration from the Say/Do
  // calibration engine (confident project-scope factor only; never silent: the
  // adjustment is recorded in the task notes and returned as advisory).
  let biasAdvisory: string | null = null;
  try {
    if (body.durationDays && body.durationDays > 0) {
      const factor = await db.calibrationFactor.findFirst({ where: { scopeType: "project", scopeId: id, sampleSize: { gte: 5 }, factor: { gt: 1.15 } }, orderBy: { computedAt: "desc" } });
      if (factor) {
        const adjusted = Math.max(0.5, Math.round(body.durationDays * factor.factor * 10) / 10);
        biasAdvisory = "Duration pre-filled " + body.durationDays + "d -> " + adjusted + "d (historical " + factor.factor + "x variance on this project, " + factor.sampleSize + " samples)";
        body.description = (body.description ? body.description + " " : "") + "[" + biasAdvisory + "]";
        body.durationDays = adjusted;
      }
    }
  } catch { /* calibration not ready — never block task creation */ }

  let wbsCode: string | null = null;
  if (body.wbsId) {
    const node = await db.wBSNode.findFirst({ where: { id: body.wbsId, projectId: id }, select: { id: true, code: true, nodeType: true } });
    if (!node) throw new ApiError(400, "WBS node not found in this project");
    if (node.nodeType === "SUMMARY") throw new ApiError(400, "Tasks can only be attached to WORK_PACKAGE nodes");
    wbsCode = node.code;
  }
  if (body.assigneeId) {
    const user = await db.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } });
    if (!user) throw new ApiError(400, "Assignee user not found");
  }

  // Auto code: T-<wbsCode>-<n> when WBS-linked, else T-GEN-<n>
  const codePrefix = `T-${wbsCode ?? "GEN"}-`;
  const siblings = await db.task.findMany({
    where: { projectId: id, code: { startsWith: codePrefix } },
    select: { code: true },
  });
  let maxSeq = 0;
  for (const t of siblings) {
    const n = Number(t.code.slice(codePrefix.length));
    if (Number.isFinite(n) && Number.isInteger(n) && n > maxSeq) maxSeq = n;
  }
  const code = `${codePrefix}${maxSeq + 1}`;

  const task = await db.task.create({
    data: {
      projectId: id,
      wbsId: body.wbsId ?? null,
      code,
      name: body.name,
      description: body.description ?? null,
      status: body.status ?? "NOT_STARTED",
      priority: body.priority ?? "MEDIUM",
      criticality: body.criticality ?? "MEDIUM",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      durationDays: body.durationDays ?? 1,
      progress: body.progress ?? 0,
      plannedHours: body.plannedHours ?? 0,
      plannedCost: body.plannedCost ?? 0,
      remainingHours: body.plannedHours ? round2(body.plannedHours * (1 - (body.progress ?? 0) / 100)) : 0,
      assigneeId: body.assigneeId ?? null,
    },
    include: {
      wbs: { select: { id: true, code: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  await rescheduleProject(id);
  await rollupWbsActuals(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Task", entityId: task.id, entityName: `${task.code} ${task.name}`,
    after: task, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("task:changed", { projectId: id, action: "created", taskId: task.id, code: task.code }, projectRoom(id));

  return ok(task, 201);
}, { permission: "wbs.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
