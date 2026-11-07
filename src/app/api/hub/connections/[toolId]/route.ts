// PM CONTROL TOWER — TowerIntegration Hub: connection configuration.
// PATCH /api/hub/connections/[toolId] — set auth kind + secret (encrypted
// with the same AES-256-GCM vault as AI BYOK), ingress mode, base URL.
// Audited as CONFIGURE on HubConnection.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { setConnectionAuth, connectionView } from "@/lib/hub/hub-service";

const patchSchema = z.object({
  authKind: z.enum(["HMAC", "JWT", "OAUTH2", "MTLS", "NONE"]),
  secret: z.string().min(8).max(512).optional(),
  ingressMode: z.enum(["WEBHOOK", "POLL", "BI_REFRESH", "CSV_UPLOAD"]).optional(),
  baseUrl: z.string().url().max(512).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const toolId = (ctx.params.toolId ?? "").toLowerCase();
  const body = await parseBody(ctx.req, patchSchema);

  const row = await db.hubConnection.findUnique({ where: { toolId } });
  if (!row) throw new ApiError(404, `No Hub connection for tool "${toolId}"`);

  await setConnectionAuth({
    connectionId: row.id,
    authKind: body.authKind,
    secret: body.secret ?? null,
    ingressMode: body.ingressMode,
    baseUrl: body.baseUrl ?? null,
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    ip: ctx.ip,
  });

  const updated = await db.hubConnection.findUnique({ where: { id: row.id } });
  return ok(connectionView(updated as never));
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
