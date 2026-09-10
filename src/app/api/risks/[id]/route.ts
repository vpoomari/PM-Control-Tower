// PM CONTROL TOWER — Risk Detail API
// GET    /api/risks/[id]
// PATCH  /api/risks/[id] — status transitions (OPEN|MITIGATING|CLOSED|ACCEPTED|ESCALATED),
//                          residual scoring, mitigation detail
// DELETE /api/risks/[id]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const RISK_STATUSES = ["OPEN", "MITIGATING", "CLOSED", "ACCEPTED", "ESCALATED"] as const;

function severityFromScore(score: number): string {
  if (score >= 16) return "CRITICAL";
  if (score >= 10) return "HIGH";
  if (score >= 5) return "MEDIUM";
  return "LOW";
}

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const risk = await db.risk.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  if (!risk) throw new ApiError(404, "Risk not found");
  const residualScore = risk.residualProbability * risk.residualImpact;
  return ok({
    risk,
    residual: { score: residualScore, severity: severityFromScore(residualScore) },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  category: z.enum(["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "EXTERNAL", "OTHER"]).optional(),
  probability: z.coerce.number().int().min(1).max(5).optional(),
  impact: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(RISK_STATUSES).optional(),
  ownerName: z.string().optional().nullable(),
  responseStrategy: z.enum(["AVOID", "MITIGATE", "TRANSFER", "ACCEPT", "MONITOR", "ESCALATE"]).optional(),
  mitigation: z.string().optional().nullable(),
  contingency: z.string().optional().nullable(),
  residualProbability: z.coerce.number().int().min(1).max(5).optional(),
  residualImpact: z.coerce.number().int().min(1).max(5).optional(),
  escalationLevel: z.enum(["NONE", "PROJECT", "PROGRAM", "PORTFOLIO"]).optional(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.risk.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Risk not found");

  const probability = body.probability ?? before.probability;
  const impact = body.impact ?? before.impact;
  const score = probability * impact;
  const status = body.status ?? before.status;
  if (status && !RISK_STATUSES.includes(status as (typeof RISK_STATUSES)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${RISK_STATUSES.join(", ")}`);
  }

  const data = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.category !== undefined ? { category: body.category } : {}),
    ...(body.probability !== undefined ? { probability: body.probability } : {}),
    ...(body.impact !== undefined ? { impact: body.impact } : {}),
    ...(body.probability !== undefined || body.impact !== undefined ? { score, severity: severityFromScore(score) } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    // Closing / accepting stamps closedAt; reopening clears it
    ...(body.status !== undefined ? { closedAt: ["CLOSED", "ACCEPTED"].includes(status) ? new Date() : null } : {}),
    ...(body.ownerName !== undefined ? { ownerName: body.ownerName } : {}),
    ...(body.responseStrategy !== undefined ? { responseStrategy: body.responseStrategy } : {}),
    ...(body.mitigation !== undefined ? { mitigation: body.mitigation } : {}),
    ...(body.contingency !== undefined ? { contingency: body.contingency } : {}),
    ...(body.residualProbability !== undefined ? { residualProbability: body.residualProbability } : {}),
    ...(body.residualImpact !== undefined ? { residualImpact: body.residualImpact } : {}),
    ...(body.escalationLevel !== undefined ? { escalationLevel: body.escalationLevel } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.risk.update({ where: { id }, data });
  const residualScore = updated.residualProbability * updated.residualImpact;

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Risk", entityId: id, entityName: `${updated.code} — ${updated.title}`,
    before: { status: before.status, score: before.score, severity: before.severity },
    after: { status: updated.status, score: updated.score, severity: updated.severity, residualScore, residualSeverity: severityFromScore(residualScore) },
    ipAddress: ctx.ip,
  });
  emitRealtime("raid:changed", { projectId: updated.projectId, type: "risk", riskId: updated.id, code: updated.code, severity: updated.severity, status: updated.status, action: "UPDATED" }, projectRoom(updated.projectId));
  return ok({
    risk: updated,
    residual: { score: residualScore, severity: severityFromScore(residualScore) },
  });
}, { permission: "raid.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const risk = await db.risk.findUnique({ where: { id } });
  if (!risk) throw new ApiError(404, "Risk not found");

  await db.risk.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Risk", entityId: id, entityName: `${risk.code} — ${risk.title}`,
    before: { status: risk.status, score: risk.score, severity: risk.severity },
    ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("raid:changed", { projectId: risk.projectId, type: "risk", riskId: id, code: risk.code, action: "DELETED" }, projectRoom(risk.projectId));
  return ok({ deleted: true, id });
}, { permission: "raid.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
