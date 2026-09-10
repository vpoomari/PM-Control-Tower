// PM CONTROL TOWER — PATCH /api/decisions/[id]
// Record the leadership decision, update register metadata, or cancel.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { hasPermission } from "@/lib/rbac";

const patchSchema = z.object({
  decision: z.string().max(2000).optional(),
  decidedBy: z.string().max(120).optional(),
  decisionOwner: z.string().max(120).nullable().optional(),
  requiredBy: z.string().nullable().optional(),
  businessImpact: z.string().max(1000).nullable().optional(),
  recommendedDecision: z.string().max(1000).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const existing = await db.decision.findUnique({ where: { id: ctx.params.id } });
  if (!existing) throw new ApiError(404, "Decision not found");
  const body = await parseBody(ctx.req, patchSchema);
  // Recording the actual decision is a governance act — requires gate.decide.
  if (body.decision !== undefined && !hasPermission(ctx.session, "gate.decide")) {
    throw new ApiError(403, "Permission denied: gate.decide is required to record a decision");
  }
  const decision = await db.decision.update({
    where: { id: ctx.params.id },
    data: {
      ...(body.decision !== undefined ? { decision: body.decision, decidedBy: body.decidedBy ?? ctx.session.name, decisionDate: new Date(), status: "COMPLETED" } : {}),
      ...(body.decisionOwner !== undefined ? { decisionOwner: body.decisionOwner } : {}),
      ...(body.requiredBy !== undefined ? { requiredBy: body.requiredBy ? new Date(body.requiredBy) : null } : {}),
      ...(body.businessImpact !== undefined ? { businessImpact: body.businessImpact } : {}),
      ...(body.recommendedDecision !== undefined ? { recommendedDecision: body.recommendedDecision } : {}),
      ...(body.priority ? { priority: body.priority } : {}),
      ...(body.status ? { status: body.status } : {}),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: body.decision !== undefined ? "APPROVE" : "UPDATE", entityType: "Decision", entityId: decision.id, entityName: decision.title,
    before: { decision: existing.decision, status: existing.status }, after: { decision: decision.decision, status: decision.status },
    context: body.decision !== undefined ? "Leadership decision recorded" : "Decision register updated",
    severity: body.decision !== undefined ? "WARNING" : "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  emitRealtime("governance:changed", { kind: "decision", id: decision.id, code: decision.code });
  return ok(decision);
}, { permission: "reports.view", rateLimit: { limit: 60, windowMs: 60_000 } });
