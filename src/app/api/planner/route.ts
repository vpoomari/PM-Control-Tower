// PM CONTROL TOWER — Focus Planner API
// GET  /api/planner?from&to — personal planner entries for a date range (default: current week)
// POST /api/planner — create a planner entry referencing real tasks/projects/meetings

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { startOfWeek, addDays, round2 } from "@/lib/constants";

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const fromParam = parseDateParam(ctx.searchParams.get("from"));
  const toParam = parseDateParam(ctx.searchParams.get("to"));
  const from = fromParam ?? startOfWeek(new Date());
  const to = toParam ?? addDays(from, 6);
  const toEnd = new Date(to);
  if (toEnd.getHours() === 0 && toEnd.getMinutes() === 0) toEnd.setUTCHours(23, 59, 59, 999);

  const entries = await db.plannerEntry.findMany({
    where: { userId: session.id, date: { gte: from, lte: toEnd } },
    include: {
      task: { select: { id: true, code: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
  });

  const stats = {
    total: entries.length,
    plannedHours: round2(entries.reduce((s, e) => s + e.estimatedHours, 0)),
    byStatus: entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {}),
    byType: entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.entryType] = (acc[e.entryType] || 0) + 1;
      return acc;
    }, {}),
  };

  return ok({ entries, range: { from, to: toEnd }, stats });
}, { permission: "inbox.use", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  title: z.string().min(2),
  entryType: z.enum(["TASK", "MEETING", "CALENDAR", "FOCUS", "BREAK"]).default("FOCUS"),
  date: z.coerce.date(),
  startTime: z.string().max(5).optional().nullable(),
  endTime: z.string().max(5).optional().nullable(),
  durationMins: z.coerce.number().int().min(5).max(960).default(60),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  taskId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  meetingId: z.string().optional().nullable(),
  estimatedHours: z.coerce.number().min(0).max(24).default(1),
  notes: z.string().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  // Every referenced record must be real — never create isolated planner data
  let task: { id: string; code: string } | null = null;
  if (body.taskId) {
    task = await db.task.findUnique({ where: { id: body.taskId }, select: { id: true, code: true } });
    if (!task) throw new ApiError(404, "Task not found");
  }
  let project: { id: string; code: string } | null = null;
  if (body.projectId) {
    project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true } });
    if (!project) throw new ApiError(404, "Project not found");
  }
  let meeting: { id: string; title: string } | null = null;
  if (body.meetingId) {
    meeting = await db.meeting.findUnique({ where: { id: body.meetingId }, select: { id: true, title: true } });
    if (!meeting) throw new ApiError(404, "Meeting not found");
  }

  const created = await db.plannerEntry.create({
    data: {
      userId: session.id,
      title: body.title,
      entryType: body.entryType,
      date: body.date,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      durationMins: body.durationMins,
      priority: body.priority,
      status: "PLANNED",
      estimatedHours: body.estimatedHours,
      notes: body.notes ?? null,
      taskId: body.taskId ?? null,
      projectId: body.projectId ?? null,
      meetingId: body.meetingId ?? null,
    },
    include: {
      task: { select: { id: true, code: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "PlannerEntry", entityId: created.id, entityName: created.title,
    after: { entryType: created.entryType, date: created.date, taskId: created.taskId, projectId: created.projectId, meetingId: created.meetingId },
    ipAddress: ctx.ip,
  });
  emitRealtime("planner:changed", { userId: session.id, entryId: created.id, action: "CREATED" }, `user:${session.id}`);
  return ok({ entry: created }, 201);
}, { permission: "inbox.use", rateLimit: { limit: 120, windowMs: 60_000 } });
