// PM CONTROL TOWER — Meetings API
// GET  /api/meetings?projectId&from&to — meeting register (calendar range filter)
// POST /api/meetings — schedule a meeting

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const MEETING_TYPES = ["STEERCO", "STANDUP", "REVIEW", "WORKSHOP", "GATE", "RETROSPECTIVE", "ONE_ON_ONE", "OTHER"] as const;

function parseDateParam(raw: string | null, endOfDay = false): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const from = parseDateParam(ctx.searchParams.get("from"));
  const to = parseDateParam(ctx.searchParams.get("to"), true);

  const meetings = await db.meeting.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(from || to ? { scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: { _count: { select: { plannerEntries: true } } },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });

  // Meeting carries projectId without a FK relation — resolve project context separately
  const meetingProjectIds = [...new Set(meetings.map((m) => m.projectId).filter((p): p is string => Boolean(p)))];
  const meetingProjects = meetingProjectIds.length
    ? await db.project.findMany({ where: { id: { in: meetingProjectIds } }, select: { id: true, code: true, name: true } })
    : [];
  const projectById = new Map(meetingProjects.map((p) => [p.id, p]));

  return ok({
    meetings: meetings.map((m) => ({
      ...m,
      project: m.projectId ? projectById.get(m.projectId) ?? null : null,
    })),
    total: meetings.length,
    summary: {
      upcoming: meetings.filter((m) => m.scheduledAt >= new Date() && m.status === "SCHEDULED").length,
      totalPlannerLinks: meetings.reduce((s, m) => s + m._count.plannerEntries, 0),
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().optional().nullable(),
  title: z.string().min(3),
  meetingType: z.string().default("STEERCO"),
  scheduledAt: z.coerce.date(),
  durationMins: z.coerce.number().int().min(5).max(600).default(60),
  location: z.string().optional().nullable(),
  attendees: z.string().optional().nullable(),
  agenda: z.string().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true } });
    if (!project) throw new ApiError(404, "Project not found");
  }
  if (!MEETING_TYPES.includes(body.meetingType as (typeof MEETING_TYPES)[number])) {
    throw new ApiError(400, `Invalid meetingType. Use one of: ${MEETING_TYPES.join(", ")}`);
  }

  const created = await db.meeting.create({
    data: {
      projectId: body.projectId ?? null,
      title: body.title,
      meetingType: body.meetingType,
      scheduledAt: body.scheduledAt,
      durationMins: body.durationMins,
      location: body.location ?? null,
      organizerId: session.id,
      attendees: body.attendees ?? null,
      agenda: body.agenda ?? null,
      status: "SCHEDULED",
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Meeting", entityId: created.id, entityName: created.title,
    after: { scheduledAt: created.scheduledAt, durationMins: created.durationMins, meetingType: created.meetingType },
    ipAddress: ctx.ip,
  });
  if (created.projectId) {
    emitRealtime("planner:changed", { projectId: created.projectId, meetingId: created.id, action: "MEETING_SCHEDULED" }, `project:${created.projectId}`);
  }
  return ok({ meeting: created }, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
