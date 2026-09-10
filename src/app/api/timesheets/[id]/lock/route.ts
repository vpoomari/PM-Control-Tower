// PM CONTROL TOWER — Timesheet Lock (PMO period close)
// POST /api/timesheets/[id]/lock — APPROVED → LOCKED (immutable)

import { withApi, ok, ApiError } from "@/lib/api";
import { lockTimesheet } from "@/lib/engines/timesheet";

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;

  const actor = { id: session.id, name: session.name, role: session.roles[0] || "PMO_ADMIN" };
  const updated = await lockTimesheet(id, actor, ctx.ip);
  return ok({ timesheet: updated });
}, { permission: "timesheet.approve", rateLimit: { limit: 60, windowMs: 60_000 } });
