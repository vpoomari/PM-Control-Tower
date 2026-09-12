// PM CONTROL TOWER — Scenario merge
// POST /api/integrity/scenarios/[id]/merge — converts accepted overrides into a
// Change Request and applies the deltas to production rows inside ONE audited
// transaction. The merge is the only path from sandbox to production.

import { withApi, ok, ApiError } from "@/lib/api";
import { mergeScenario } from "@/lib/services/integrity";

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const { id } = ctx.params as { id: string };
  if (!id) throw new ApiError(400, "Scenario id required");
  const result = await mergeScenario(id, { id: session.id, name: session.name, roles: session.roles ?? [] });
  return ok({ changeRequest: result.cr, scenario: { id: result.scenario.id, status: result.scenario.status } }, 201);
}, { permission: "scenario.manage", rateLimit: { limit: 10, windowMs: 60_000 } });
