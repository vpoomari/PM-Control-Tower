// PM CONTROL TOWER — Integration detail
// GET   /api/integrations/[id] — detail + credentials (masked only) + last 50 events
// PATCH /api/integrations/[id] — update metadata / non-secret config

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { toJson } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  syncFrequency: z.string().max(20).optional(),
  syncDirection: z.string().max(20).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const SECRET_FIELD_PATTERN = /(secret|password|key|token)/i;

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const integration = await db.integration.findUnique({
    where: { id },
    include: {
      // maskedValue only — raw credential values are never stored, so never returned
      credentials: { select: { id: true, label: true, credType: true, maskedValue: true, status: true, expiresAt: true, rotatedAt: true }, orderBy: { label: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!integration) throw new ApiError(404, "Integration not found");
  return ok(integration);
}, { permission: "integration.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const integration = await db.integration.findUnique({ where: { id } });
  if (!integration) throw new ApiError(404, "Integration not found");
  const body = await parseBody(ctx.req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No fields to update");

  if (body.config) {
    const offending = Object.keys(body.config).filter((k) => SECRET_FIELD_PATTERN.test(k));
    if (offending.length > 0) {
      throw new ApiError(400, `Config must not contain credential fields (${offending.join(", ")}). Register secrets via the credentials endpoint.`);
    }
  }

  const before = { name: integration.name, description: integration.description, syncFrequency: integration.syncFrequency, configJson: integration.configJson };
  const updated = await db.integration.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.syncFrequency !== undefined ? { syncFrequency: body.syncFrequency } : {}),
      ...(body.syncDirection !== undefined ? { syncDirection: body.syncDirection } : {}),
      ...(body.config !== undefined ? { configJson: toJson(body.config) } : {}),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "Integration", entityId: id, entityName: updated.name,
    before, after: { name: updated.name, syncFrequency: updated.syncFrequency, configJson: updated.configJson },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(updated);
}, { permission: "integration.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
