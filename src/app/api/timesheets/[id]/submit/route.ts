// PM CONTROL TOWER — Timesheet Submission
// POST /api/timesheets/[id]/submit — DRAFT/REJECTED → SUBMITTED (own, or approver for any)

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { submitTimesheet } from "@/lib/engines/timesheet";

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;

  const ts = await db.timesheet.findUnique({ where: { id }, include: { resource: { select: { userId: true } } } });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  const isOwn = ts.resource.userId === session.id || ts.userId === session.id;
  const canApprove = hasPermission(session, "timesheet.approve");
  if (!isOwn && !canApprove) throw new ApiError(403, "You can only submit your own timesheets");

  const actor = { id: session.id, name: session.name, role: session.roles[0] || "TEAM_MEMBER" };
  const updated = await submitTimesheet(id, actor, ctx.ip);
  return ok({ timesheet: updated });
}, { permission: "timesheet.own", rateLimit: { limit: 120, windowMs: 60_000 } });
