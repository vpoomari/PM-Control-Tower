// PM CONTROL TOWER — Report scheduling (spec §21)
// GET  /api/reports/schedules — configured report schedules
// POST /api/reports/schedules — create a schedule (audited)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { addDays } from "@/lib/constants";

const FREQ_DAYS: Record<string, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30, QUARTERLY: 90 };

const createSchema = z.object({
  name: z.string().min(2).max(120),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]),
  scope: z.enum(["PORTFOLIO", "PROJECT"]).default("PORTFOLIO"),
  projectId: z.string().optional(),
  recipients: z.string().max(1000).optional(),
  sections: z.string().max(2000).optional(),
});

export const GET = withApi(async () => {
  const schedules = await db.reportSchedule.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return ok({ schedules });
}, { permission: "reports.view", rateLimit: { limit: 200, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);
  if (body.scope === "PROJECT" && !body.projectId) throw new ApiError(400, "projectId is required for PROJECT scope");
  const schedule = await db.reportSchedule.create({
    data: {
      name: body.name, frequency: body.frequency, scope: body.scope,
      projectId: body.projectId ?? null, recipients: body.recipients ?? null,
      sections: body.sections ?? null,
      createdByName: ctx.session.name,
      nextRunAt: addDays(new Date(), FREQ_DAYS[body.frequency] ?? 7),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "CONFIGURE", entityType: "ReportSchedule", entityId: schedule.id, entityName: schedule.name,
    after: { frequency: body.frequency, scope: body.scope, recipients: body.recipients ?? null },
    context: "Report schedule created",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(schedule, 201);
}, { permission: "project.manage", rateLimit: { limit: 40, windowMs: 60_000 } });
