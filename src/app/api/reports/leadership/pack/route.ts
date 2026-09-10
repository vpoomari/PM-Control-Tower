// PM CONTROL TOWER — POST /api/reports/leadership/pack
// One-click Leadership Pack: generates the full bundle, persists a versioned
// ReportSnapshot (report history & audit), auto-escalates overdue decisions,
// fans out a realtime event. Body: { scope?: "PORTFOLIO"|"PROJECT", projectId? }

import { z } from "zod";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { generateLeadershipPack } from "@/lib/engines/leadership";

const bodySchema = z.object({
  scope: z.enum(["PORTFOLIO", "PROJECT"]).default("PORTFOLIO"),
  projectId: z.string().optional(),
});

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, bodySchema);
  if (body.scope === "PROJECT" && !body.projectId) throw new ApiError(400, "projectId is required for PROJECT scope");
  const pack = await generateLeadershipPack(body.scope, body.projectId ?? null, { id: ctx.session.id, name: ctx.session.name });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "EXECUTE", entityType: "ReportSnapshot", entityId: pack.id, entityName: pack.title,
    after: { version: pack.version, scope: body.scope, projectId: body.projectId ?? null },
    context: "Leadership Pack generated",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  emitRealtime("report:generated", { id: pack.id, title: pack.title, version: pack.version, scope: body.scope });
  return ok(pack, 201);
}, { permission: "reports.view", rateLimit: { limit: 30, windowMs: 60_000 } });
