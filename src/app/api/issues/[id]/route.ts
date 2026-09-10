// PM CONTROL TOWER — Issue Detail API
// GET    /api/issues/[id]
// PATCH  /api/issues/[id] — status workflow (OPEN|IN_PROGRESS|RESOLVED|CLOSED), resolution stamp
// DELETE /api/issues/[id]

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const RESOLVED_LIKE = ["RESOLVED", "CLOSED"];

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const issue = await db.issue.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  if (!issue) throw new ApiError(404, "Issue not found");
  return ok({ issue });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  category: z.enum(["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "QUALITY", "VENDOR", "OTHER"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  ownerName: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
  resolution: z.string().optional().nullable(),
  escalationLevel: z.enum(["NONE", "PROJECT", "PROGRAM", "PORTFOLIO"]).optional(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.issue.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Issue not found");

  const status = body.status ?? before.status;
  const severity = body.severity ?? before.severity;
  // CRITICAL severity ⇒ CRITICAL priority unless an explicit priority is supplied
  const priority = body.priority ?? (severity === "CRITICAL" ? "CRITICAL" : before.priority);

  const data = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.category !== undefined ? { category: body.category } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : priority !== before.priority ? { priority } : {}),
    ...(body.severity !== undefined ? { severity: body.severity } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.status !== undefined ? { resolvedAt: RESOLVED_LIKE.includes(status) ? new Date() : null } : {}),
    ...(body.ownerName !== undefined ? { ownerName: body.ownerName } : {}),
    ...(body.impact !== undefined ? { impact: body.impact } : {}),
    ...(body.resolution !== undefined ? { resolution: body.resolution } : {}),
    ...(body.escalationLevel !== undefined ? { escalationLevel: body.escalationLevel } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.issue.update({ where: { id }, data });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Issue", entityId: id, entityName: `${updated.code} — ${updated.title}`,
    before: { status: before.status, severity: before.severity, priority: before.priority },
    after: { status: updated.status, severity: updated.severity, priority: updated.priority, resolvedAt: updated.resolvedAt },
    ipAddress: ctx.ip,
  });
  emitRealtime("raid:changed", { projectId: updated.projectId, type: "issue", issueId: updated.id, code: updated.code, severity: updated.severity, status: updated.status, action: "UPDATED" }, projectRoom(updated.projectId));
  return ok({ issue: updated });
}, { permission: "raid.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const issue = await db.issue.findUnique({ where: { id } });
  if (!issue) throw new ApiError(404, "Issue not found");

  await db.issue.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Issue", entityId: id, entityName: `${issue.code} — ${issue.title}`,
    before: { status: issue.status, severity: issue.severity },
    ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("raid:changed", { projectId: issue.projectId, type: "issue", issueId: id, code: issue.code, action: "DELETED" }, projectRoom(issue.projectId));
  return ok({ deleted: true, id });
}, { permission: "raid.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
