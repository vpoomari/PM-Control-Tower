// PM CONTROL TOWER — Integration credentials
// POST /api/integrations/[id]/credentials — register a credential.
// SECURITY: only a masked value is ever persisted (first 4 + **** + last 2).
// The raw value is used in-memory for nothing else, never logged, never returned.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const credentialSchema = z.object({
  label: z.string().min(2).max(120),
  credType: z.enum(["API_KEY", "BEARER_TOKEN", "BASIC_AUTH", "OAUTH_CLIENT", "WEBHOOK_SECRET", "CERTIFICATE", "OTHER"]),
  value: z.string().min(6).max(4096),
});

/** Mask a secret for storage/display: first 4 + **** + last 2. Short values are fully masked. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}****${value.slice(-2)}`;
}

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const integration = await db.integration.findUnique({ where: { id } });
  if (!integration) throw new ApiError(404, "Integration not found");
  const body = await parseBody(ctx.req, credentialSchema);

  const maskedValue = maskSecret(body.value);
  const credential = await db.integrationCredential.create({
    data: {
      integrationId: id,
      label: body.label,
      credType: body.credType,
      maskedValue,
      status: "ACTIVE",
    },
  });
  // A registered credential means auth material exists → authStatus CONFIGURED,
  // which is the gate required before the integration can be enabled.
  const updatedIntegration = await db.integration.update({
    where: { id },
    data: { authStatus: "CONFIGURED" },
  });

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CONFIGURE", entityType: "IntegrationCredential", entityId: credential.id, entityName: `${integration.name} · ${body.label}`,
    after: { label: body.label, credType: body.credType, maskedValue, authStatus: updatedIntegration.authStatus },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: "WARNING",
    context: "Credential registered — raw value discarded, masked value only",
  });

  return ok({ id: credential.id, label: credential.label, credType: credential.credType, maskedValue: credential.maskedValue, status: credential.status, integrationAuthStatus: updatedIntegration.authStatus }, 201);
}, { permission: "integration.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
