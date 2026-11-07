// PM CONTROL TOWER — Prioritized Task Dashboard API
// GET /api/dashboard/priorities
// Returns the four prioritized widgets for the signed-in PMO / PM session:
//   Overdue (last 7 days) · Due Today · Upcoming (next 7 days) · Action Not Taken
// Data is role-scoped in collectPriorities (PMO = organisation-wide, PM = own
// assignments + owned projects); inbox facets are always the session user's.

import { withApi, ok, ApiError } from "@/lib/api";
import { collectPriorities } from "@/lib/priorities/dashboard";

export const GET = withApi(
  async (ctx) => {
    if (!ctx.session) throw new ApiError(401, "Authentication required");
    const payload = await collectPriorities(new Date(), ctx.session);
    return ok(payload);
  },
  { permission: "project.view", rateLimit: { limit: 120, windowMs: 60_000 } }
);
