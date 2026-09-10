// PM CONTROL TOWER — Resource Register API
// GET  /api/resources — register with computed utilization (weekly-equivalent load vs capacity)
// POST /api/resources — create resource (unique employeeCode)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { round2, safeDiv } from "@/lib/constants";

const WEEK_MS = 7 * 86_400_000;

export const GET = withApi(async (ctx) => {
  const q = ctx.searchParams.get("q")?.trim();
  const dept = ctx.searchParams.get("dept")?.trim();
  const type = ctx.searchParams.get("type")?.trim();

  const [resources, allDepts] = await Promise.all([
    db.resource.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { email: { contains: q } },
                { employeeCode: { contains: q } },
                { title: { contains: q } },
                { primarySkill: { contains: q } },
              ],
            }
          : {}),
        ...(dept ? { department: dept } : {}),
        ...(type ? { resourceType: type } : {}),
      },
      include: {
        assignments: { where: { status: "ACTIVE" }, select: { projectId: true, plannedHours: true, startDate: true, endDate: true, createdAt: true } },
        _count: { select: { assignments: true, timesheets: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.resource.findMany({ select: { department: true }, distinct: ["department"] }),
  ]);

  const resourcesOut = resources.map((r) => {
    // Weekly-equivalent load: spread each active assignment's plannedHours across its window
    let assignedWeeklyHours = 0;
    for (const a of r.assignments) {
      const start = a.startDate?.getTime() ?? a.createdAt.getTime();
      const end = a.endDate?.getTime() ?? start + 12 * WEEK_MS;
      const weeks = Math.max(1, Math.ceil((end - start) / WEEK_MS));
      assignedWeeklyHours += (a.plannedHours || 0) / weeks;
    }
    assignedWeeklyHours = round2(assignedWeeklyHours);
    const utilizationPct = round2(safeDiv(assignedWeeklyHours, r.capacityHoursPerWeek || 40, 0) * 100);
    return {
      id: r.id,
      employeeCode: r.employeeCode,
      name: r.name,
      email: r.email,
      title: r.title,
      department: r.department,
      resourceType: r.resourceType,
      seniority: r.seniority,
      primarySkill: r.primarySkill,
      skills: r.skills,
      capacityHoursPerWeek: r.capacityHoursPerWeek,
      costRate: r.costRate,
      billableRate: r.billableRate,
      currency: r.currency,
      availabilityStatus: r.availabilityStatus,
      location: r.location,
      managerName: r.managerName,
      isActive: r.isActive,
      userId: r.userId,
      activeAssignments: r.assignments.length,
      projectCount: new Set(r.assignments.map((a) => a.projectId)).size,
      totalTimesheets: r._count.timesheets,
      assignedWeeklyHours,
      utilizationPct,
      overallocated: assignedWeeklyHours > (r.capacityHoursPerWeek || 40),
    };
  });

  return ok({
    resources: resourcesOut,
    total: resourcesOut.length,
    departments: allDepts.map((d) => d.department).filter((d): d is string => Boolean(d)),
    summary: {
      totalCapacityWeekly: round2(resourcesOut.reduce((s, r) => s + (r.isActive ? r.capacityHoursPerWeek : 0), 0)),
      totalAllocatedWeekly: round2(resourcesOut.reduce((s, r) => s + (r.isActive ? r.assignedWeeklyHours : 0), 0)),
      overallocatedCount: resourcesOut.filter((r) => r.overallocated).length,
    },
  });
}, { permission: "resource.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  employeeCode: z.string().min(2).max(32),
  name: z.string().min(2),
  email: z.string().email(),
  title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  resourceType: z.enum(["EMPLOYEE", "CONTRACTOR", "CONSULTANT", "VENDOR"]).default("EMPLOYEE"),
  seniority: z.enum(["JUNIOR", "MID", "SENIOR", "PRINCIPAL"]).default("MID"),
  primarySkill: z.string().optional().nullable(),
  skills: z.string().optional().nullable(),
  capacityHoursPerWeek: z.coerce.number().min(1).max(80).default(40),
  costRate: z.coerce.number().min(0).default(0),
  billableRate: z.coerce.number().min(0).default(0),
  currency: z.string().min(3).max(3).default("USD"),
  availabilityStatus: z.enum(["AVAILABLE", "ALLOCATED", "ON_LEAVE", "UNAVAILABLE"]).default("AVAILABLE"),
  location: z.string().optional().nullable(),
  managerName: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const dupCode = await db.resource.findUnique({ where: { employeeCode: body.employeeCode }, select: { id: true } });
  if (dupCode) throw new ApiError(409, `Employee code ${body.employeeCode} already exists`);
  if (body.userId) {
    const linked = await db.resource.findFirst({ where: { userId: body.userId }, select: { id: true } });
    if (linked) throw new ApiError(409, "User already linked to another resource record");
  }

  // Auto-link: if the resource email matches an existing user account and no explicit
  // userId was supplied, bind the profile so personal time capture works immediately.
  let effectiveUserId = body.userId ?? null;
  if (!effectiveUserId) {
    const matchedUser = await db.user.findUnique({ where: { email: body.email.toLowerCase() }, select: { id: true } });
    if (matchedUser) {
      const alreadyLinked = await db.resource.findFirst({ where: { userId: matchedUser.id }, select: { id: true } });
      if (!alreadyLinked) effectiveUserId = matchedUser.id;
    }
  }

  const created = await db.resource.create({
    data: {
      employeeCode: body.employeeCode,
      name: body.name,
      email: body.email.toLowerCase(),
      title: body.title ?? null,
      department: body.department ?? null,
      resourceType: body.resourceType,
      seniority: body.seniority,
      primarySkill: body.primarySkill ?? null,
      skills: body.skills ?? null,
      capacityHoursPerWeek: body.capacityHoursPerWeek,
      costRate: round2(body.costRate),
      billableRate: round2(body.billableRate),
      currency: body.currency,
      availabilityStatus: body.availabilityStatus,
      location: body.location ?? null,
      managerName: body.managerName ?? null,
      userId: effectiveUserId,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Resource", entityId: created.id, entityName: created.name,
    after: { employeeCode: created.employeeCode, resourceType: created.resourceType, capacityHoursPerWeek: created.capacityHoursPerWeek, costRate: created.costRate },
    ipAddress: ctx.ip,
  });
  return ok({ resource: created }, 201);
}, { permission: "resource.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
