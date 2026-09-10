// PM CONTROL TOWER — Leadership Decision Register
// GET  /api/decisions — decisions with register metadata
// POST /api/decisions — raise a leadership decision (audited)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const createSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  decisionOwner: z.string().max(120).optional(),
  requiredBy: z.string().optional(),
  businessImpact: z.string().max(1000).optional(),
  projectImpact: z.string().max(1000).optional(),
  recommendedDecision: z.string().max(1000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});

export const GET = withApi(async () => {
  const decisions = await db.decision.findMany({ orderBy: { decisionDate: "desc" }, take: 200 });
  return ok({ decisions });
}, { permission: "reports.view", rateLimit: { limit: 200, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);
  const count = await db.decision.count();
  const decision = await db.decision.create({
    data: {
      projectId: body.projectId ?? null,
      code: `DEC-${String(count + 1).padStart(3, "0")}`,
      title: body.title, description: body.description,
      decisionOwner: body.decisionOwner ?? null,
      raisedAt: new Date(), requiredBy: body.requiredBy ? new Date(body.requiredBy) : null,
      businessImpact: body.businessImpact ?? null, projectImpact: body.projectImpact ?? null,
      recommendedDecision: body.recommendedDecision ?? null,
      priority: body.priority, status: "ACTIVE",
      decisionDate: new Date(),
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "CREATE", entityType: "Decision", entityId: decision.id, entityName: decision.title,
    after: { code: decision.code, requiredBy: body.requiredBy ?? null, priority: body.priority },
    context: "Leadership decision raised",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  emitRealtime("governance:changed", { kind: "decision", id: decision.id, code: decision.code });
  return ok(decision, 201);
}, { permission: "project.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
