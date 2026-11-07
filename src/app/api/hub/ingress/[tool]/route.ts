// PM CONTROL TOWER — TowerIntegration Hub: webhook ingress.
// POST /api/hub/ingress/[tool] — public endpoint external systems call.
// Authentication is per-connection (HMAC signature / JWT / OAuth bearer /
// mTLS CN forwarded by the proxy) — NOT a PMCT session, so auth:false here.
// The payload runs the full Hub pipeline: identify → authenticate → extract →
// facade → UWM harmonize → anomalies to DLQ → queue for WBS/CPM.

import { z } from "zod";
import { withApi, ok, ApiError } from "@/lib/api";
import { ingestPayload } from "@/lib/hub/hub-service";
import { hubTool } from "@/lib/hub/registry";

export const POST = withApi(async (ctx) => {
  const toolId = (ctx.params.tool ?? "").toLowerCase();
  if (!hubTool(toolId)) throw new ApiError(404, `Unknown tool "${toolId}" — not in the Hub registry`);

  const rawBody = await ctx.req.text();
  let payload: unknown;
  const contentType = ctx.req.headers.get("content-type") ?? "";
  if (contentType.includes("json") || rawBody.trimStart().startsWith("{") || rawBody.trimStart().startsWith("[")) {
    try { payload = JSON.parse(rawBody); }
    catch { throw new ApiError(400, "Malformed JSON payload"); }
  } else {
    payload = rawBody; // CSV / plain text — the csv facade handles it
  }

  // Forwarded mTLS context (set by the terminating proxy), if present.
  const headers: Record<string, string> = {};
  ctx.req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const tool = hubTool(toolId)!; // guarded above
  const result = await ingestPayload({
    toolId,
    mode: tool.ingress[0] ?? "WEBHOOK",
    payload,
    rawBody,
    headers,
    clientCertCn: headers["x-client-cert-cn"] ?? null,
    clientCertPresent: headers["x-client-cert-present"] === "true",
  });

  // Auth failures are 401 to the caller (honest), everything else 200 with the
  // pipeline outcome — the sender must not have to know our internal states.
  if (result.stats.authFailures > 0) {
    return ok({ accepted: false, reason: result.reason, eventId: result.eventId }, 401);
  }
  return ok({
    accepted: true,
    outcome: result.outcome,
    queue: result.route?.queue ?? null,
    harmonized: result.stats.harmonized,
    dlq: result.dlq.length,
    handoff: result.handoff ?? null,
    eventId: result.eventId,
  });
}, { auth: false, rateLimit: { limit: 300, windowMs: 60_000 } });
