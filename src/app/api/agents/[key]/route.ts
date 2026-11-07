// PM CONTROL TOWER — manual agent run.
// POST /api/agents/[key] — run one agent now (admin.config).
// Body: { input?: string } — free-text input for MANUAL agents
// (CR Intake, Import/Export Agent).
//
// Activation is enforced inside runAgent(): a PAUSED agent cannot be run
// even by an admin (activate it first) — one consistent rule everywhere.

import { z } from "zod";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { runAgent } from "@/lib/agents/runner";
import { AGENTS } from "@/lib/agents/catalog";

const bodySchema = z.object({
  input: z.string().max(4000).optional(),
});

export const POST = withApi(async (ctx) => {
  const key = ctx.params.key;
  if (!AGENTS.some((a) => a.key === key)) throw new ApiError(404, `Unknown agent "${key}"`);
  const body = await parseBody(ctx.req, bodySchema);

  const outcome = await runAgent(key, {
    trigger: "MANUAL",
    actorName: ctx.session?.name ?? "admin",
    actorUserId: ctx.session?.id ?? null,
    input: body.input,
    ignoreCadence: true,
  });

  // A skipped/failed run is still a valid, informative response (the UI shows
  // the reason) — only unknown agents 404 above.
  return ok(outcome, 201);
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
