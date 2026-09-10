// PM CONTROL TOWER — Timesheet API
// GET  /api/timesheets?scope=mine|team|all&status&weekStart&resourceId — role-aware listing
// POST /api/timesheets — create-or-update a DRAFT timesheet (entries replaced wholesale)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { recomputeTimesheetTotals } from "@/lib/engines/timesheet";
import { startOfWeek, addDays, round2, TS_STATUS } from "@/lib/constants";

const EDITABLE_STATUSES = ["DRAFT", "REJECTED"];

const entrySchema = z.object({
  entryDate: z.coerce.date(),
  projectId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  wbsId: z.string().optional().nullable(),
  activity: z.string().optional().nullable(),
  startTime: z.string().max(5).optional().nullable(),
  endTime: z.string().max(5).optional().nullable(),
  breakMinutes: z.coerce.number().min(0).max(600).default(0),
  hours: z.coerce.number().min(0).max(24),
  regularHours: z.coerce.number().min(0).optional(),
  overtimeHours: z.coerce.number().min(0).max(24).optional(),
  billable: z.boolean().default(true),
  entryType: z.enum(["WORK", "LEAVE", "HOLIDAY", "TRAINING", "ADMIN"]).default("WORK"),
  comments: z.string().optional().nullable(),
});

const postSchema = z.object({
  resourceId: z.string().optional(),
  weekStart: z.coerce.date(),
  comments: z.string().optional().nullable(),
  entries: z.array(entrySchema).min(1),
});

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const scope = ctx.searchParams.get("scope") || "mine";
  const status = ctx.searchParams.get("status");
  const weekStartParam = ctx.searchParams.get("weekStart");
  const resourceIdParam = ctx.searchParams.get("resourceId");
  const canApprove = hasPermission(session, "timesheet.approve");

  if ((scope === "team" || scope === "all") && !canApprove) {
    throw new ApiError(403, "Permission denied: timesheet.approve is required for team/all scopes");
  }

  const myResources = await db.resource.findMany({ where: { userId: session.id }, select: { id: true, name: true } });
  const myResourceIds = myResources.map((r) => r.id);

  const scopeWhere = scope === "mine"
    ? (myResourceIds.length ? { resourceId: { in: myResourceIds } } : {})
    : scope === "team"
      ? (myResourceIds.length ? { resourceId: { notIn: myResourceIds } } : {})
      : {};

  if (status && !TS_STATUS.includes(status as (typeof TS_STATUS)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${TS_STATUS.join(", ")}`);
  }

  const timesheets = await db.timesheet.findMany({
    where: {
      AND: [
        scopeWhere,
        ...(status ? [{ status }] : []),
        ...(weekStartParam ? [{ weekStart: startOfWeek(weekStartParam) }] : []),
        ...(resourceIdParam ? [{ resourceId: resourceIdParam }] : []),
      ],
    },
    include: {
      resource: { select: { id: true, name: true, employeeCode: true, department: true } },
      approver: { select: { id: true, name: true } },
      _count: { select: { entries: true } },
    },
    orderBy: [{ weekStart: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const statusCounts = await db.timesheet.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<string, number> = {};
  for (const c of statusCounts) counts[c.status] = c._count._all;

  return ok({
    scope,
    timesheets: timesheets.map((t) => ({
      id: t.id,
      resourceId: t.resourceId,
      resource: t.resource,
      userId: t.userId,
      weekStart: t.weekStart,
      weekEnd: t.weekEnd,
      status: t.status,
      totalHours: t.totalHours,
      regularHours: t.regularHours,
      overtimeHours: t.overtimeHours,
      billableHours: t.billableHours,
      nonBillableHours: t.nonBillableHours,
      leaveHours: t.leaveHours,
      holidayHours: t.holidayHours,
      comments: t.comments,
      rejectionReason: t.rejectionReason,
      submittedAt: t.submittedAt,
      approvedAt: t.approvedAt,
      lockedAt: t.lockedAt,
      approverName: t.approver?.name ?? null,
      entriesCount: t._count.entries,
      isOwn: myResourceIds.includes(t.resourceId),
      canEdit: EDITABLE_STATUSES.includes(t.status) && (myResourceIds.includes(t.resourceId) || canApprove),
    })),
    total: timesheets.length,
    statusCounts: counts,
  });
}, { permission: ["timesheet.own", "timesheet.approve"], rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, postSchema);
  const canApprove = hasPermission(session, "timesheet.approve");

  // Resolve target resource: explicit resourceId requires ownership or approver rights;
  // otherwise the session's own resource record is used.
  let resource;
  if (body.resourceId) {
    resource = await db.resource.findUnique({ where: { id: body.resourceId } });
    if (!resource) throw new ApiError(404, "Resource not found");
    if (resource.userId !== session.id && !canApprove && !hasPermission(session, "resource.manage")) {
      throw new ApiError(403, "You can only file timesheets for your own resource record");
    }
  } else {
    resource = await db.resource.findFirst({ where: { userId: session.id } });
    if (!resource) throw new ApiError(403, "No resource record linked to your account — ask PMO to link one or pass resourceId");
  }

  // Validate entries: projects/tasks/WBS references must be real and consistent
  const projectIds = new Set<string>();
  for (const e of body.entries) {
    if (e.projectId) projectIds.add(e.projectId);
  }
  const projects = projectIds.size
    ? await db.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true } })
    : [];
  const knownProjects = new Set(projects.map((p) => p.id));
  const unknown = [...projectIds].filter((pid) => !knownProjects.has(pid));
  if (unknown.length) throw new ApiError(400, `Unknown projectId(s): ${unknown.join(", ")}`);

  const taskIds = body.entries.map((e) => e.taskId).filter((t): t is string => Boolean(t));
  const tasks = taskIds.length ? await db.task.findMany({ where: { id: { in: [...new Set(taskIds)] } }, select: { id: true, projectId: true } }) : [];
  const taskProject = new Map(tasks.map((t) => [t.id, t.projectId]));
  for (const tId of taskIds) {
    if (!taskProject.has(tId)) throw new ApiError(400, `Unknown taskId: ${tId}`);
  }
  const wbsIds = body.entries.map((e) => e.wbsId).filter((w): w is string => Boolean(w));
  const wbsNodes = wbsIds.length ? await db.wBSNode.findMany({ where: { id: { in: [...new Set(wbsIds)] } }, select: { id: true, projectId: true } }) : [];
  const wbsProject = new Map(wbsNodes.map((w) => [w.id, w.projectId]));
  for (const wId of wbsIds) {
    if (!wbsProject.has(wId)) throw new ApiError(400, `Unknown wbsId: ${wId}`);
  }
  for (const e of body.entries) {
    if (e.projectId && e.taskId && taskProject.get(e.taskId) !== e.projectId) {
      throw new ApiError(409, `Task ${e.taskId} does not belong to project ${e.projectId}`);
    }
    if (e.projectId && e.wbsId && wbsProject.get(e.wbsId) !== e.projectId) {
      throw new ApiError(409, `WBS node ${e.wbsId} does not belong to project ${e.projectId}`);
    }
  }

  const ws = startOfWeek(body.weekStart);
  const existing = await db.timesheet.findUnique({
    where: { resourceId_weekStart: { resourceId: resource.id, weekStart: ws } },
    include: { entries: true },
  });
  if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
    throw new ApiError(409, `Timesheet for week ${ws.toISOString().slice(0, 10)} is ${existing.status} — only DRAFT/REJECTED timesheets can be edited`);
  }

  let tsId: string;
  const wasRejected = existing?.status === "REJECTED";
  if (existing) {
    await db.timesheetEntry.deleteMany({ where: { timesheetId: existing.id } });
    await db.timesheet.update({
      where: { id: existing.id },
      data: { weekEnd: addDays(ws, 6), status: "DRAFT", rejectionReason: null, comments: body.comments !== undefined ? body.comments : existing.comments },
    });
    tsId = existing.id;
  } else {
    const created = await db.timesheet.create({
      data: { resourceId: resource.id, userId: session.id, weekStart: ws, weekEnd: addDays(ws, 6), status: "DRAFT", comments: body.comments ?? null },
    });
    tsId = created.id;
  }

  await db.timesheetEntry.createMany({
    data: body.entries.map((e) => {
      const overtime = e.overtimeHours ?? 0;
      return {
        timesheetId: tsId,
        entryDate: e.entryDate,
        projectId: e.projectId ?? null,
        wbsId: e.wbsId ?? null,
        taskId: e.taskId ?? null,
        activity: e.activity ?? null,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        breakMinutes: e.breakMinutes,
        hours: e.hours,
        regularHours: e.regularHours ?? round2(Math.max(0, e.hours - overtime)),
        overtimeHours: overtime,
        billableHours: e.billable ? e.hours : 0,
        nonBillableHours: e.billable ? 0 : e.hours,
        entryType: e.entryType,
        billable: e.billable,
        comments: e.comments ?? null,
      };
    }),
  });

  const totals = await recomputeTimesheetTotals(tsId);
  const updated = await db.timesheet.update({
    where: { id: tsId },
    data: totals,
    include: { entries: true, resource: { select: { id: true, name: true, employeeCode: true } } },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: existing ? "UPDATE" : "CREATE", entityType: "Timesheet", entityId: tsId,
    entityName: `${resource.name} — week of ${ws.toISOString().slice(0, 10)}`,
    before: existing ? { status: existing.status, totalHours: existing.totalHours, entries: existing.entries.length } : null,
    after: { status: updated.status, totalHours: updated.totalHours, entries: updated.entries.length, ...(wasRejected ? { resubmittedAsDraft: true } : {}) },
    ipAddress: ctx.ip,
  });
  return ok({ timesheet: updated }, existing ? 200 : 201);
}, { permission: "timesheet.own", rateLimit: { limit: 120, windowMs: 60_000 } });
