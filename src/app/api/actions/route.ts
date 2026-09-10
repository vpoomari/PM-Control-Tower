// PM CONTROL TOWER — Action Register
// GET  /api/actions — leadership action register
// POST /api/actions — raise an action (audited)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const createSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  ownerName: z.string().max(120).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  dueDate: z.string().optional(),
  relatedType: z.string().max(40).optional(),
  relatedCode: z.string().max(40).optional(),
});

export const GET = withApi(async (ctx) => {
  const status = ctx.searchParams.get("status");
  const actions = await db.actionItem.findMany({
    where: status ? { status } : {},
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
  return ok({ actions });
}, { permission: "reports.view", rateLimit: { limit: 200, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);
  const count = await db.actionItem.count();
  const action = await db.actionItem.create({
    data: {
      projectId: body.projectId ?? null,
      code: `ACT-${String(count + 1).padStart(3, "0")}`,
      title: body.title, description: body.description ?? null,
      ownerName: body.ownerName ?? null, priority: body.priority,
      status: "OPEN", source: "LEADERSHIP",
      relatedType: body.relatedType ?? null, relatedCode: body.relatedCode ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      raisedAt: new Date(), raisedByName: ctx.session.name,
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
    action: "CREATE", entityType: "ActionItem", entityId: action.id, entityName: action.title,
    after: { code: action.code, owner: body.ownerName ?? null, dueDate: body.dueDate ?? null, priority: body.priority },
    context: "Leadership action raised",
    severity: "INFO", ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  emitRealtime("governance:changed", { kind: "action", id: action.id, code: action.code });
  return ok(action, 201);
}, { permission: "project.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
