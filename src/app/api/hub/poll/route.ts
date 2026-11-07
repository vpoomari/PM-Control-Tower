// PM CONTROL TOWER — TowerIntegration Hub: poll cycle trigger.
// POST /api/hub/poll {toolId} — run one polling cycle for a tool through the
// breaker + exponential-backoff wrapper (the directive's async processing path
// for tools without webhooks).

import { z } from "zod";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { pollTool } from "@/lib/hub/hub-service";
import { hubTool } from "@/lib/hub/registry";

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, z.object({ toolId: z.string().min(1).max(64) }));
  const tool = hubTool(body.toolId);
  if (!tool) throw new ApiError(404, `Unknown tool "${body.toolId}"`);
  if (!tool.ingress.includes("POLL") && !tool.ingress.includes("BI_REFRESH")) {
    throw new ApiError(400, `${tool.name} does not support polling — it delivers by ${tool.ingress.join("/")}`);
  }

  const result = await pollTool(body.toolId, { maxAttempts: 2 });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "EXECUTE", entityType: "HubConnection", entityName: tool.name,
    after: { ok: result.ok, attempts: result.attempts, detail: result.detail, delays: result.delays },
    severity: result.ok ? "NOTICE" : "WARNING",
    ipAddress: ctx.ip,
  });
  return ok(result, result.ok ? 200 : 502);
}, { permission: "integration.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
