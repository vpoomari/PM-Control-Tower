// PM CONTROL TOWER — TowerIntegration Hub: DLQ replay.
// POST /api/hub/dlq/[id]/replay — re-run one Dead Letter entry through the
// pipeline (auth failures and unknown tools are not replayable — the
// connection/registry must be fixed first; the service enforces this).

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { replayDlq } from "@/lib/hub/hub-service";

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  if (!id) throw new ApiError(400, "Missing dead-letter id");

  const result = await replayDlq(id);
  if (!result.replayed) throw new ApiError(400, `Not replayable: ${result.detail}`);

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "EXECUTE", entityType: "HubDeadLetter", entityId: id,
    after: { outcome: result.outcome?.outcome ?? result.detail, harmonized: result.outcome?.stats.harmonized ?? 0 },
    ipAddress: ctx.ip,
  });
  return ok({ replayed: true, outcome: result.outcome?.outcome ?? result.detail, harmonized: result.outcome?.stats.harmonized ?? 0, dlq: result.outcome?.dlq.length ?? 0 });
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
