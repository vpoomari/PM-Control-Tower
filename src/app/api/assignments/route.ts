// PM CONTROL TOWER — Resource Assignment API
// GET  /api/assignments?projectId|resourceId — list with project/resource/task context
// POST /api/assignments — allocate a resource to a project (+ optional task)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { round2 } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const resourceId = ctx.searchParams.get("resourceId")?.trim();
  const status = ctx.searchParams.get("status")?.trim();

  const assignments = await db.assignment.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(resourceId ? { resourceId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      project: { select: { id: true, code: true, name: true, status: true } },
      resource: { select: { id: true, name: true, employeeCode: true, department: true, resourceType: true } },
      task: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return ok({
    assignments,
    total: assignments.length,
    summary: {
      totalPlannedHours: round2(assignments.reduce((s, a) => s + a.plannedHours, 0)),
      totalActualHours: round2(assignments.reduce((s, a) => s + a.actualHours, 0)),
      avgAllocationPct: assignments.length ? round2(assignments.reduce((s, a) => s + a.allocationPercent, 0) / assignments.length) : 0,
    },
  });
}, { permission: "resource.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  resourceId: z.string().min(1),
  taskId: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  allocationPercent: z.coerce.number().min(1).max(300).default(100),
  plannedHours: z.coerce.number().min(0).default(0),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  status: z.enum(["ACTIVE", "PLANNED", "COMPLETED", "CANCELLED"]).default("ACTIVE"),
  billable: z.boolean().default(true),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");
  const resource = await db.resource.findUnique({ where: { id: body.resourceId }, select: { id: true, name: true, employeeCode: true, isActive: true } });
  if (!resource) throw new ApiError(404, "Resource not found");
  if (!resource.isActive) throw new ApiError(409, "Cannot assign an inactive resource");
  if (body.taskId) {
    const task = await db.task.findUnique({ where: { id: body.taskId }, select: { id: true, projectId: true, code: true } });
    if (!task) throw new ApiError(404, "Task not found");
    if (task.projectId !== body.projectId) throw new ApiError(409, "Task does not belong to the given project");
  }
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    throw new ApiError(400, "endDate must be on or after startDate");
  }

  const created = await db.assignment.create({
    data: {
      projectId: body.projectId,
      resourceId: body.resourceId,
      taskId: body.taskId ?? null,
      role: body.role ?? null,
      allocationPercent: body.allocationPercent,
      plannedHours: round2(body.plannedHours),
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      status: body.status,
      billable: body.billable,
    },
    include: {
      project: { select: { id: true, code: true, name: true } },
      resource: { select: { id: true, name: true, employeeCode: true } },
      task: { select: { id: true, code: true, name: true } },
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Assignment", entityId: created.id,
    entityName: `${resource.name} → ${project.code}`,
    after: { resourceId: resource.id, projectId: project.id, allocationPercent: created.allocationPercent, plannedHours: created.plannedHours, status: created.status },
    ipAddress: ctx.ip,
  });
  emitRealtime("resource:assigned", { assignmentId: created.id, resourceId: created.resourceId, projectId: created.projectId, allocationPercent: created.allocationPercent, resourceName: resource.name }, projectRoom(created.projectId));
  return ok({ assignment: created }, 201);
}, { permission: "resource.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
