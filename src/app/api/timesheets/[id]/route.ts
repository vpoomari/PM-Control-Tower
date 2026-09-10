// PM CONTROL TOWER — Timesheet Detail API
// GET    /api/timesheets/[id] — full detail with entries (task/wbs/project context)
// PATCH  /api/timesheets/[id] — replace entries (DRAFT/REJECTED only)
// DELETE /api/timesheets/[id] — discard draft (DRAFT/REJECTED only)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { recomputeTimesheetTotals } from "@/lib/engines/timesheet";
import { startOfWeek, addDays, round2 } from "@/lib/constants";

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

const patchSchema = z.object({
  comments: z.string().optional().nullable(),
  entries: z.array(entrySchema).min(1),
});

async function loadTimesheet(id: string) {
  const ts = await db.timesheet.findUnique({
    where: { id },
    include: { resource: true, approver: { select: { id: true, name: true } }, entries: true },
  });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  return ts;
}

function assertCanAccess(ts: { userId: string | null; resource: { userId: string | null } }, session: { id: string } | null, canApprove: boolean) {
  if (!session) throw new ApiError(401, "Authentication required");
  const isOwn = ts.resource.userId === session.id || ts.userId === session.id;
  if (!isOwn && !canApprove) throw new ApiError(403, "You can only access your own timesheets");
}

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const canApprove = hasPermission(session, "timesheet.approve");
  const ts = await loadTimesheet(id);
  assertCanAccess(ts, session, canApprove);

  const wbsIds = [...new Set(ts.entries.map((e) => e.wbsId).filter((w): w is string => Boolean(w)))];
  const wbsNodes = wbsIds.length ? await db.wBSNode.findMany({ where: { id: { in: wbsIds } }, select: { id: true, code: true, name: true } }) : [];
  const wbsById = new Map(wbsNodes.map((w) => [w.id, w]));
  const entryProjectIds = [...new Set(ts.entries.map((e) => e.projectId).filter((p): p is string => Boolean(p)))];
  const entryProjects = entryProjectIds.length ? await db.project.findMany({ where: { id: { in: entryProjectIds } }, select: { id: true, code: true, name: true } }) : [];
  const projectById = new Map(entryProjects.map((p) => [p.id, p]));
  const entryTaskIds = [...new Set(ts.entries.map((e) => e.taskId).filter((t): t is string => Boolean(t)))];
  const entryTasks = entryTaskIds.length ? await db.task.findMany({ where: { id: { in: entryTaskIds } }, select: { id: true, code: true, name: true } }) : [];
  const taskById = new Map(entryTasks.map((t) => [t.id, t]));

  return ok({
    timesheet: {
      ...ts,
      approverName: ts.approver?.name ?? null,
      canEdit: EDITABLE_STATUSES.includes(ts.status) && (ts.resource.userId === session.id || ts.userId === session.id || canApprove),
      canSubmit: EDITABLE_STATUSES.includes(ts.status) && ts.entries.length > 0,
    },
    entries: ts.entries
      .slice()
      .sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime())
      .map((e) => ({
        ...e,
        project: e.projectId ? projectById.get(e.projectId) ?? null : null,
        task: e.taskId ? taskById.get(e.taskId) ?? null : null,
        wbsCode: e.wbsId ? wbsById.get(e.wbsId)?.code ?? null : null,
        wbsName: e.wbsId ? wbsById.get(e.wbsId)?.name ?? null : null,
      })),
  });
}, { permission: "timesheet.own", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const canApprove = hasPermission(session, "timesheet.approve");
  const ts = await loadTimesheet(id);
  assertCanAccess(ts, session, canApprove);
  if (!EDITABLE_STATUSES.includes(ts.status)) {
    throw new ApiError(409, `Timesheet is ${ts.status} — only DRAFT/REJECTED timesheets can be edited`);
  }

  const body = await parseBody(ctx.req, patchSchema);

  // Validate references (same rules as POST)
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

  const before = { status: ts.status, totalHours: ts.totalHours, entries: ts.entries.length };
  const ws = startOfWeek(ts.weekStart);
  await db.timesheetEntry.deleteMany({ where: { timesheetId: id } });
  await db.timesheet.update({
    where: { id },
    data: { weekEnd: addDays(ws, 6), status: "DRAFT", rejectionReason: null, comments: body.comments !== undefined ? body.comments : ts.comments },
  });

  await db.timesheetEntry.createMany({
    data: body.entries.map((e) => {
      const overtime = e.overtimeHours ?? 0;
      return {
        timesheetId: id,
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

  const totals = await recomputeTimesheetTotals(id);
  const updated = await db.timesheet.update({
    where: { id },
    data: totals,
    include: { entries: true, resource: { select: { id: true, name: true, employeeCode: true } } },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Timesheet", entityId: id,
    entityName: `${ts.resource.name} — week of ${ts.weekStart.toISOString().slice(0, 10)}`,
    before, after: { status: updated.status, totalHours: updated.totalHours, entries: updated.entries.length },
    ipAddress: ctx.ip,
  });
  return ok({ timesheet: updated });
}, { permission: "timesheet.own", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const canApprove = hasPermission(session, "timesheet.approve");
  const ts = await loadTimesheet(id);
  assertCanAccess(ts, session, canApprove);
  if (!EDITABLE_STATUSES.includes(ts.status)) {
    throw new ApiError(409, `Timesheet is ${ts.status} — only DRAFT/REJECTED timesheets can be deleted`);
  }

  await db.timesheet.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Timesheet", entityId: id,
    entityName: `${ts.resource.name} — week of ${ts.weekStart.toISOString().slice(0, 10)}`,
    before: { status: ts.status, totalHours: ts.totalHours, entries: ts.entries.length },
    ipAddress: ctx.ip, severity: "WARNING",
  });
  return ok({ deleted: true, id });
}, { permission: "timesheet.own", rateLimit: { limit: 60, windowMs: 60_000 } });
