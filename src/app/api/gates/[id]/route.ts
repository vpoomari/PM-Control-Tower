// PM CONTROL TOWER — Stage Gate Decision API
// GET    /api/gates/[id]
// PATCH  /api/gates/[id] — evidence/comments (project.manage) + decision (gate.decide).
//                         Decisions stamp decisionDate + approver and notify the project owner.
// DELETE /api/gates/[id] — guarded: decided gates are immutable

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { GATE_DECISION } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const gate = await db.stageGate.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  if (!gate) throw new ApiError(404, "Gate not found");
  return ok({ gate });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  criteria: z.string().optional().nullable(),
  plannedDate: z.coerce.date().optional().nullable(),
  evidence: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
  decisionStatus: z.enum(GATE_DECISION).optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.stageGate.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true, ownerId: true } } },
  });
  if (!before) throw new ApiError(404, "Gate not found");

  const decisionChanging = body.decisionStatus !== undefined && body.decisionStatus !== before.decisionStatus;
  if (decisionChanging && !hasPermission(session, "gate.decide")) {
    throw new ApiError(403, "Permission denied: gate.decide is required to record gate decisions");
  }

  const data = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.criteria !== undefined ? { criteria: body.criteria } : {}),
    ...(body.plannedDate !== undefined ? { plannedDate: body.plannedDate } : {}),
    ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
    ...(body.comments !== undefined ? { comments: body.comments } : {}),
    ...(decisionChanging
      ? {
          decisionStatus: body.decisionStatus!,
          decisionDate: body.decisionStatus === "PENDING" ? null : new Date(),
          approverId: body.decisionStatus === "PENDING" ? null : session.id,
          approverName: body.decisionStatus === "PENDING" ? null : session.name,
        }
      : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.stageGate.update({ where: { id }, data });

  if (decisionChanging && body.decisionStatus !== "PENDING") {
    // Notify the project owner of the governance outcome
    const ownerId = before.project.ownerId;
    if (ownerId && ownerId !== session.id) {
      await db.inboxItem.create({
        data: {
          userId: ownerId,
          category: "GOVERNANCE",
          title: `Gate decision — ${updated.code} ${body.decisionStatus}`,
          message: `Gate "${updated.name}" on ${before.project.name} recorded as ${body.decisionStatus} by ${session.name}.`,
          entityType: "StageGate", entityId: updated.id, projectId: before.projectId,
          priority: body.decisionStatus === "FAILED" ? "CRITICAL" : "HIGH",
          actionUrl: "#/governance", sourceType: "STAGE_GATE",
        },
      });
      await db.notification.create({
        data: {
          userId: ownerId, notifType: "GOVERNANCE", category: "GOVERNANCE",
          title: `Gate ${body.decisionStatus} — ${updated.code}`,
          message: `Gate "${updated.name}" decision recorded by ${session.name}.`,
          entityType: "StageGate", entityId: updated.id, projectId: before.projectId,
          severity: body.decisionStatus === "FAILED" ? "CRITICAL" : "INFO", actionUrl: "#/governance",
        },
      });
    }
    await writeAudit({
      userId: session.id, userName: session.name, role: session.roles[0],
      action: "EXECUTE", entityType: "StageGate", entityId: id, entityName: `${updated.code} — ${updated.name}`,
      before: { decisionStatus: before.decisionStatus }, after: { decisionStatus: updated.decisionStatus, decidedBy: session.name },
      ipAddress: ctx.ip,
    });
    emitRealtime("governance:changed", { gateId: updated.id, projectId: updated.projectId, decisionStatus: updated.decisionStatus }, projectRoom(updated.projectId));
  } else if (Object.keys(data).length > 0) {
    await writeAudit({
      userId: session.id, userName: session.name, role: session.roles[0],
      action: "UPDATE", entityType: "StageGate", entityId: id, entityName: `${updated.code} — ${updated.name}`,
      before, after: updated, ipAddress: ctx.ip,
    });
  }

  return ok({ gate: updated });
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const gate = await db.stageGate.findUnique({ where: { id } });
  if (!gate) throw new ApiError(404, "Gate not found");
  if (gate.decisionStatus !== "PENDING") {
    throw new ApiError(409, `Gate has been decided (${gate.decisionStatus}) — decided gates are part of the governance record and cannot be deleted`);
  }

  await db.stageGate.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "StageGate", entityId: id, entityName: `${gate.code} — ${gate.name}`,
    before: { decisionStatus: gate.decisionStatus }, ipAddress: ctx.ip, severity: "WARNING",
  });
  return ok({ deleted: true, id });
}, { permission: "project.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
