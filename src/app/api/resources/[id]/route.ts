// PM CONTROL TOWER — Resource Detail API
// GET    /api/resources/[id] — profile + assignments + last 8 timesheets + capacity profile
// PATCH  /api/resources/[id] — update register fields
// DELETE /api/resources/[id] — guarded (409 when assignments exist)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const resource = await db.resource.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { project: { select: { id: true, code: true, name: true, status: true } }, task: { select: { id: true, code: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      timesheets: {
        orderBy: { weekStart: "desc" },
        take: 8,
        include: { _count: { select: { entries: true } }, approver: { select: { name: true } } },
      },
    },
  });
  if (!resource) throw new ApiError(404, "Resource not found");

  const dailyCapacity = round2(resource.capacityHoursPerWeek / 5);
  return ok({
    resource: {
      ...resource,
      weeklyCapacityProfile: {
        weeklyHours: resource.capacityHoursPerWeek,
        dailyHours: dailyCapacity,
        workingDays: 5,
        overtimeThreshold: round2(resource.capacityHoursPerWeek * 1.1),
      },
    },
    assignments: resource.assignments.map((a) => ({ ...a })),
    timesheets: resource.timesheets.map((t) => ({
      id: t.id, weekStart: t.weekStart, weekEnd: t.weekEnd, status: t.status,
      totalHours: t.totalHours, billableHours: t.billableHours, overtimeHours: t.overtimeHours,
      entriesCount: t._count.entries, approverName: t.approver?.name ?? null,
      submittedAt: t.submittedAt, approvedAt: t.approvedAt,
    })),
  });
}, { permission: "resource.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  resourceType: z.enum(["EMPLOYEE", "CONTRACTOR", "CONSULTANT", "VENDOR"]).optional(),
  seniority: z.enum(["JUNIOR", "MID", "SENIOR", "PRINCIPAL"]).optional(),
  primarySkill: z.string().optional().nullable(),
  skills: z.string().optional().nullable(),
  capacityHoursPerWeek: z.coerce.number().min(1).max(80).optional(),
  costRate: z.coerce.number().min(0).optional(),
  billableRate: z.coerce.number().min(0).optional(),
  currency: z.string().min(3).max(3).optional(),
  availabilityStatus: z.enum(["AVAILABLE", "ALLOCATED", "ON_LEAVE", "UNAVAILABLE"]).optional(),
  location: z.string().optional().nullable(),
  managerName: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, updateSchema);

  const before = await db.resource.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Resource not found");
  if (body.userId) {
    const linked = await db.resource.findFirst({ where: { userId: body.userId, id: { not: id } }, select: { id: true } });
    if (linked) throw new ApiError(409, "User already linked to another resource record");
  }

  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.email !== undefined ? { email: body.email.toLowerCase() } : {}),
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.department !== undefined ? { department: body.department } : {}),
    ...(body.resourceType !== undefined ? { resourceType: body.resourceType } : {}),
    ...(body.seniority !== undefined ? { seniority: body.seniority } : {}),
    ...(body.primarySkill !== undefined ? { primarySkill: body.primarySkill } : {}),
    ...(body.skills !== undefined ? { skills: body.skills } : {}),
    ...(body.capacityHoursPerWeek !== undefined ? { capacityHoursPerWeek: body.capacityHoursPerWeek } : {}),
    ...(body.costRate !== undefined ? { costRate: round2(body.costRate) } : {}),
    ...(body.billableRate !== undefined ? { billableRate: round2(body.billableRate) } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.availabilityStatus !== undefined ? { availabilityStatus: body.availabilityStatus } : {}),
    ...(body.location !== undefined ? { location: body.location } : {}),
    ...(body.managerName !== undefined ? { managerName: body.managerName } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    ...(body.userId !== undefined ? { userId: body.userId } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.resource.update({ where: { id }, data });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Resource", entityId: id, entityName: updated.name,
    before, after: updated, ipAddress: ctx.ip,
  });
  return ok({ resource: updated });
}, { permission: "resource.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const resource = await db.resource.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true, timesheets: true } } },
  });
  if (!resource) throw new ApiError(404, "Resource not found");
  if (resource._count.assignments > 0 || resource._count.timesheets > 0) {
    throw new ApiError(409, `Resource has ${resource._count.assignments} assignment(s) and ${resource._count.timesheets} timesheet(s) — deactivate instead of deleting`);
  }

  await db.resource.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Resource", entityId: id, entityName: resource.name,
    before: resource, ipAddress: ctx.ip, severity: "WARNING",
  });
  return ok({ deleted: true, id });
}, { permission: "resource.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
