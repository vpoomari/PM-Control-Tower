// PM CONTROL TOWER — Timesheet Approval (triggers the full actuals cascade)
// POST /api/timesheets/[id]/approve — SUBMITTED/UNDER_REVIEW → APPROVED

import { z } from "zod";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { approveTimesheet } from "@/lib/engines/timesheet";

const approveSchema = z.object({ comments: z.string().optional() });

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, approveSchema).catch(() => ({ comments: undefined }));

  const actor = { id: session.id, name: session.name, role: session.roles[0] || "PMO_ADMIN" };
  const updated = await approveTimesheet(id, actor, body.comments, ctx.ip);
  return ok({ timesheet: updated });
}, { permission: "timesheet.approve", rateLimit: { limit: 120, windowMs: 60_000 } });
