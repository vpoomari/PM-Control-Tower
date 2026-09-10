// PM CONTROL TOWER — Timesheet Rejection
// POST /api/timesheets/[id]/reject — SUBMITTED/UNDER_REVIEW → REJECTED (reason required)

import { z } from "zod";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { rejectTimesheet } from "@/lib/engines/timesheet";

const rejectSchema = z.object({ reason: z.string().min(3, "A rejection reason is required") });

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, rejectSchema);

  const actor = { id: session.id, name: session.name, role: session.roles[0] || "PMO_ADMIN" };
  const updated = await rejectTimesheet(id, actor, body.reason, ctx.ip);
  return ok({ timesheet: updated });
}, { permission: "timesheet.approve", rateLimit: { limit: 120, windowMs: 60_000 } });
