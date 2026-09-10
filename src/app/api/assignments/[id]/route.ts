// PM CONTROL TOWER — Assignment Detail API
// GET    /api/assignments/[id]
// PATCH  /api/assignments/[id] — allocation / hours / dates / status / billable
// DELETE /api/assignments/[id]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { round2 } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const assignment = await db.assignment.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, code: true, name: true, status: true } },
      resource: { select: { id: true, name: true, employeeCode: true, department: true, capacityHoursPerWeek: true } },
      task: { select: { id: true, code: true, name: true } },
    },
  });
  if (!assignment) throw new ApiError(404, "Assignment not found");
  return ok({ assignment });
}, { permission: "resource.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const updateSchema = z.object({
  taskId: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  allocationPercent: z.coerce.number().min(1).max(300).optional(),
  plannedHours: z.coerce.number().min(0).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  status: z.enum(["ACTIVE", "PLANNED", "COMPLETED", "CANCELLED"]).optional(),
  billable: z.boolean().optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, updateSchema);

  const before = await db.assignment.findUnique({ where: { id }, include: { project: { select: { code: true } }, resource: { select: { name: true } } } });
  if (!before) throw new ApiError(404, "Assignment not found");
  if (body.taskId) {
    const task = await db.task.findUnique({ where: { id: body.taskId }, select: { id: true, projectId: true } });
    if (!task) throw new ApiError(404, "Task not found");
    if (task.projectId !== before.projectId) throw new ApiError(409, "Task does not belong to the assignment's project");
  }
  const startDate = body.startDate !== undefined ? body.startDate : before.startDate;
  const endDate = body.endDate !== undefined ? body.endDate : before.endDate;
  if (startDate && endDate && endDate < startDate) throw new ApiError(400, "endDate must be on or after startDate");

  const data = {
    ...(body.taskId !== undefined ? { taskId: body.taskId } : {}),
    ...(body.role !== undefined ? { role: body.role } : {}),
    ...(body.allocationPercent !== undefined ? { allocationPercent: body.allocationPercent } : {}),
    ...(body.plannedHours !== undefined ? { plannedHours: round2(body.plannedHours) } : {}),
    ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
    ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.billable !== undefined ? { billable: body.billable } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.assignment.update({
    where: { id },
    data,
    include: {
      project: { select: { id: true, code: true, name: true } },
      resource: { select: { id: true, name: true, employeeCode: true } },
      task: { select: { id: true, code: true, name: true } },
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Assignment", entityId: id,
    entityName: `${before.resource.name} → ${before.project.code}`,
    before, after: updated, ipAddress: ctx.ip,
  });
  emitRealtime("resource:assigned", { assignmentId: id, resourceId: updated.resourceId, projectId: updated.projectId, allocationPercent: updated.allocationPercent, status: updated.status, action: "UPDATED" }, projectRoom(updated.projectId));
  return ok({ assignment: updated });
}, { permission: "resource.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const assignment = await db.assignment.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true } }, resource: { select: { id: true, name: true } } },
  });
  if (!assignment) throw new ApiError(404, "Assignment not found");

  await db.assignment.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Assignment", entityId: id,
    entityName: `${assignment.resource.name} → ${assignment.project.code}`,
    before: assignment, ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("resource:assigned", { assignmentId: id, resourceId: assignment.resourceId, projectId: assignment.projectId, action: "REMOVED" }, projectRoom(assignment.projectId));
  return ok({ deleted: true, id });
}, { permission: "resource.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
