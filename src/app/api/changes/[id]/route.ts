// PM CONTROL TOWER — Change Request Detail API (GOVERNANCE WORKFLOW)
// GET   /api/changes/[id]
// PATCH /api/changes/[id] — workflow: DRAFT→SUBMITTED→ASSESSMENT→APPROVAL→(APPROVED|REJECTED)
//                         →IMPLEMENTED→CLOSED. Decisions (APPROVED/REJECTED) require a
//                         governance role: PROJECT_MANAGER | PROGRAM_MANAGER |
//                         PORTFOLIO_MANAGER | EXECUTIVE | PMO_ADMIN.
//                         Approval does NOT mutate project budget — impact is recorded only.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { round2, CR_STATUS } from "@/lib/constants";

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["ASSESSMENT"],
  ASSESSMENT: ["APPROVAL", "REJECTED"],
  APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["IMPLEMENTED"],
  IMPLEMENTED: ["CLOSED"],
  REJECTED: [],
  CLOSED: [],
};

const DECISION_ROLES = ["PROJECT_MANAGER", "PROGRAM_MANAGER", "PORTFOLIO_MANAGER", "EXECUTIVE", "PMO_ADMIN"];

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const change = await db.changeRequest.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true } } },
  });
  if (!change) throw new ApiError(404, "Change request not found");
  return ok({
    change,
    workflow: {
      allowedNext: TRANSITIONS[change.status] ?? [],
      decisionRoles: DECISION_ROLES,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  category: z.enum(["SCOPE", "COST", "SCHEDULE", "QUALITY", "RISK", "RESOURCE", "CONTRACT", "OTHER"]).optional(),
  ownerId: z.string().optional().nullable(),
  impactHours: z.coerce.number().min(0).optional(),
  impactCost: z.coerce.number().min(0).optional(),
  scheduleImpactDays: z.coerce.number().optional(),
  riskImpact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  status: z.enum(CR_STATUS).optional(),
  decision: z.enum(["APPROVED", "REJECTED"]).optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { id } = ctx.params;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await db.changeRequest.findUnique({
    where: { id },
    include: { project: { select: { id: true, code: true, name: true, ownerId: true, managerId: true } } },
  });
  if (!before) throw new ApiError(404, "Change request not found");

  let decision = body.decision ?? null;
  if (decision === before.decision && body.status === undefined) decision = null; // idempotent re-send
  if (decision && body.status && body.status !== decision) {
    throw new ApiError(400, `decision:${decision} conflicts with status:${body.status}`);
  }
  // A status move to APPROVED/REJECTED implies the corresponding decision
  if (!decision && (body.status === "APPROVED" || body.status === "REJECTED")) {
    decision = body.status;
  }

  // ---- Governance gate: decisions need an authorized role ----
  if (decision) {
    const authorized = session.isSuperAdmin || DECISION_ROLES.some((r) => session.roles.includes(r));
    if (!authorized) {
      throw new ApiError(403, "Change decisions require role PROJECT_MANAGER, PROGRAM_MANAGER, PORTFOLIO_MANAGER, EXECUTIVE or PMO_ADMIN");
    }
    if (!["ASSESSMENT", "APPROVAL"].includes(before.status)) {
      throw new ApiError(409, `Decisions are taken during ASSESSMENT/APPROVAL — current status is ${before.status}`);
    }
  }

  // ---- Workflow transition validation ----
  let nextStatus = before.status;
  if (body.status && body.status !== before.status) {
    const allowed = TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw new ApiError(409, `Invalid workflow transition ${before.status} → ${body.status}. Allowed: ${allowed.join(", ") || "none"}`);
    }
    nextStatus = body.status;
  } else if (decision && decision !== before.status) {
    nextStatus = decision;
  }

  const data = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.reason !== undefined ? { reason: body.reason } : {}),
    ...(body.category !== undefined ? { category: body.category } : {}),
    ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
    ...(body.impactHours !== undefined ? { impactHours: round2(body.impactHours) } : {}),
    ...(body.impactCost !== undefined ? { impactCost: round2(body.impactCost) } : {}),
    ...(body.scheduleImpactDays !== undefined ? { scheduleImpactDays: body.scheduleImpactDays } : {}),
    ...(body.riskImpact !== undefined ? { riskImpact: body.riskImpact } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
    ...(nextStatus !== before.status ? { status: nextStatus } : {}),
    ...(decision ? { decision, decisionDate: new Date(), decidedBy: session.name } : {}),
  };
  if (Object.keys(data).length === 0) throw new ApiError(400, "No updatable fields provided");

  const updated = await db.changeRequest.update({
    where: { id },
    data,
    include: { project: { select: { id: true, code: true, name: true } } },
  });

  // ---- Approved: notify the PM with an actionable inbox item (impact recorded, not applied) ----
  if (decision === "APPROVED") {
    const pmId = before.project.ownerId || before.project.managerId;
    if (pmId) {
      await db.inboxItem.create({
        data: {
          userId: pmId,
          category: "ACTION_REQUIRED",
          title: `Change request approved — ${updated.code}`,
          message: `"${updated.title}" approved by ${session.name}. Plan implementation — recorded impact: ${round2(updated.impactCost)} cost, ${updated.impactHours}h effort, ${updated.scheduleImpactDays}d schedule.`,
          entityType: "ChangeRequest", entityId: updated.id, projectId: updated.projectId,
          priority: "HIGH", actionUrl: "#/changes", sourceType: "CHANGE_MANAGEMENT",
        },
      });
      await db.notification.create({
        data: {
          userId: pmId, notifType: "CHANGE", category: "CHANGE",
          title: `CR approved — ${updated.code}`, message: `"${updated.title}" was approved by ${session.name}.`,
          entityType: "ChangeRequest", entityId: updated.id, projectId: updated.projectId,
          severity: "INFO", actionUrl: "#/changes",
        },
      });
    }
  }

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: decision ? "EXECUTE" : "UPDATE", entityType: "ChangeRequest", entityId: id,
    entityName: `${updated.code} — ${updated.title}`,
    before: { status: before.status, decision: before.decision },
    after: { status: updated.status, decision: updated.decision, decidedBy: updated.decidedBy, impactCostRecordedOnly: true },
    ipAddress: ctx.ip,
  });
  emitRealtime("change:changed", { projectId: updated.projectId, changeId: updated.id, code: updated.code, status: updated.status, decision: updated.decision, action: "UPDATED" }, projectRoom(updated.projectId));
  return ok({
    change: updated,
    workflow: { allowedNext: TRANSITIONS[updated.status] ?? [], budgetApplied: false },
  });
}, { permission: "change.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
