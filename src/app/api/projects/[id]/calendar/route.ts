// PM CONTROL TOWER — Project Working-Time Calendar API
// GET  /api/projects/[id]/calendar — config + next-90-day working map preview
// PUT  /api/projects/[id]/calendar — upsert (PMO/calendar managed) + reschedule + realtime

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rescheduleProject } from "@/lib/engines/rollup";
import { configFrom, isWorkingDay, DEFAULT_CALENDAR } from "@/lib/engines/calendars";

const DAY_MS = 86_400_000;

const putSchema = z.object({
  calendarName: z.string().trim().min(1).max(80).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  hoursPerDay: z.number().min(0.5).max(24).optional(),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(365).optional(),
});

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, calendar: true, startDate: true } });
  if (!project) throw new ApiError(404, "Project not found");
  const cal = project.calendar
    ? configFrom(project.calendar.workingDays, project.calendar.hoursPerDay, project.calendar.holidays, project.calendar.calendarName)
    : DEFAULT_CALENDAR;
  // 90-day preview from project start (or today): which dates count as working
  const origin = project.startDate ?? new Date();
  const originDay = Math.floor(new Date(origin).getTime() / DAY_MS);
  const days = Array.from({ length: 90 }, (_, i) => {
    const d = new Date((originDay + i) * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    return { date: iso, dow: DOW[d.getUTCDay()], working: isWorkingDay(d, cal) };
  });
  return ok({
    projectId: id,
    configured: !!project.calendar,
    calendar: { calendarName: cal.name, workingDays: cal.workingDays, hoursPerDay: cal.hoursPerDay, holidays: cal.holidays, dowLabels: DOW },
    preview: days,
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PUT = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, calendar: true } });
  if (!project) throw new ApiError(404, "Project not found");
  const body = await parseBody(ctx.req, putSchema);
  const data = {
    projectId: id,
    calendarName: body.calendarName ?? project.calendar?.calendarName ?? "Standard",
    workingDays: JSON.stringify(body.workingDays ?? [1, 2, 3, 4, 5]),
    hoursPerDay: body.hoursPerDay ?? project.calendar?.hoursPerDay ?? 8,
    holidays: JSON.stringify(body.holidays ?? []),
  };
  const saved = await db.projectCalendar.upsert({ where: { projectId: id }, create: data, update: data });
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "ProjectCalendar", entityId: id, entityName: `${project.code} calendar`,
    after: data, ipAddress: ctx.ip, context: "Working-time calendar edit",
  });
  const reschedule = await rescheduleProject(id);
  emitRealtime("calendar:changed", { projectId: id, by: ctx.session?.name, criticalCount: reschedule.criticalCount }, projectRoom(id));
  return ok({ projectId: id, calendar: saved, reschedule });
}, { permission: "schedule.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
