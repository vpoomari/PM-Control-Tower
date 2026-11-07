// PM CONTROL TOWER — agent action layer: the ONLY place an agent may write.
// Every proposed action is re-validated with zod against its handler schema,
// re-checked against the database (referential integrity), capped in size and
// written to the audit ledger. The runner never writes business records
// directly — it always funnels through applyAction().

import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import type { ApplyResult, ProposedAction } from "./types";

export type { ProposedAction };

export const AGENT_ACTION_TYPES = [
  "CHANGE_REQUEST_CREATE",
  "RISK_MITIGATION_UPDATE",
  "ASSIGNMENT_REASSIGN",
  "NOTIFY",
  "KNOWLEDGE_PUBLISH",
  "EXPORT_PLAN",
] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export interface ApplyCtx {
  runId: string;
  agentKey: string;
  agentName: string;
  /** Human/system who triggered the run (audit). */
  actorName: string;
  actorUserId?: string | null;
}

// ---------------------------------------------------------------------------
// Schemas — one per action type, the contract agents must draft against
// ---------------------------------------------------------------------------

const changeRequestSchema = z.object({
  projectId: z.string().min(1).max(60),
  title: z.string().trim().min(3).max(160),
  description: z.string().max(8000),
  category: z.enum(["SCOPE", "COST", "SCHEDULE", "QUALITY", "RISK", "RESOURCE", "CONTRACT", "OTHER"]).default("SCOPE"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});

const riskMitigationSchema = z.object({
  riskId: z.string().min(1).max(60),
  code: z.string().max(40).optional(),
  mitigation: z.string().trim().min(20).max(4000),
});

const reassignSchema = z.object({
  assignmentId: z.string().min(1).max(60),
  toResourceId: z.string().min(1).max(60),
  movePercent: z.number().min(1).max(100),
});

const notifySchema = z.object({
  title: z.string().trim().min(3).max(200),
  message: z.string().max(5000),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
  roles: z.array(z.string().min(1).max(60)).max(10).optional(),
  userIds: z.array(z.string().min(1).max(60)).max(20).optional(),
});

const knowledgeSchema = z.object({
  entries: z
    .array(
      z.object({
        kind: z.enum(["PATTERN", "PREFERENCE", "CORRECTION"]),
        content: z.string().trim().min(5).max(500),
        source: z.string().max(80).optional(),
      })
    )
    .min(1)
    .max(5),
});

const exportPlanSchema = z.object({
  request: z.string().trim().min(3).max(1000),
  entities: z.array(z.string().min(1).max(60)).max(10),
  projectId: z.string().max(60).nullable().optional(),
  format: z.enum(["CSV", "XLSX", "JSON"]).default("CSV"),
});

export const ACTION_SCHEMAS: Record<AgentActionType, z.ZodTypeAny> = {
  CHANGE_REQUEST_CREATE: changeRequestSchema,
  RISK_MITIGATION_UPDATE: riskMitigationSchema,
  ASSIGNMENT_REASSIGN: reassignSchema,
  NOTIFY: notifySchema,
  KNOWLEDGE_PUBLISH: knowledgeSchema,
  EXPORT_PLAN: exportPlanSchema,
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const audit = (ctx: ApplyCtx, entityName: string, after: unknown, severity = "INFO") =>
  writeAudit({
    userId: ctx.actorUserId ?? null,
    userName: ctx.actorName,
    role: "AI_AGENT",
    action: "EXECUTE",
    entityType: "AgentRun",
    entityId: ctx.runId,
    entityName,
    after,
    context: `agent:${ctx.agentKey}`,
    severity,
  }).catch(() => undefined);

/** Resolve notification/inbox recipients the same way automations do. */
async function resolveRecipients(payload: { userIds?: string[]; roles?: string[] }): Promise<string[]> {
  const out = new Set<string>();
  for (const u of payload.userIds ?? []) out.add(u);
  if (payload.roles?.length) {
    const users = await db.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { code: { in: payload.roles } } } } },
      select: { id: true },
    });
    users.forEach((u) => out.add(u.id));
  }
  if (!out.size) {
    const admins = await db.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { code: "PMO_ADMIN" } } } },
      select: { id: true },
      take: 20,
    });
    admins.forEach((u) => out.add(u.id));
  }
  return [...out].slice(0, 20);
}

async function nextChangeCode(): Promise<string> {
  const count = await db.changeRequest.count();
  for (let n = count + 1; n < count + 1000; n++) {
    const code = `CR-${String(n).padStart(3, "0")}`;
    const dup = await db.changeRequest.findFirst({ where: { code }, select: { id: true } });
    if (!dup) return code;
  }
  throw new Error("Unable to allocate a change request code");
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function applyChangeRequest(ctx: ApplyCtx, payload: unknown): Promise<ApplyResult> {
  const body = changeRequestSchema.parse(payload);
  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true } });
  if (!project) return { ok: false, detail: "Project no longer exists — draft discarded." };

  const code = await nextChangeCode();
  const created = await db.changeRequest.create({
    data: {
      projectId: project.id,
      code,
      title: body.title,
      description: body.description,
      category: body.category,
      priority: body.priority,
      status: "DRAFT",
      requesterName: `AI Agent (${ctx.agentName})`,
      reason: "Drafted by the AI agent runtime — review impact fields before routing to sign-off.",
    },
  });
  await audit(ctx, `Change request ${code}`, { code, title: body.title, projectId: project.id });
  emitRealtime("change:changed", { code, projectId: project.id });
  return { ok: true, detail: `Created ${code} in DRAFT on ${project.code} — review and route it to sign-off.` };
}

async function applyRiskMitigation(ctx: ApplyCtx, payload: unknown): Promise<ApplyResult> {
  const body = riskMitigationSchema.parse(payload);
  const risk = await db.risk.findUnique({ where: { id: body.riskId }, select: { id: true, code: true, title: true, projectId: true, mitigation: true } });
  if (!risk) return { ok: false, detail: "Risk no longer exists — draft discarded." };

  await db.risk.update({
    where: { id: risk.id },
    data: { mitigation: body.mitigation, responseStrategy: "MITIGATE", updatedAt: new Date() },
  });
  await audit(ctx, `Risk mitigation ${risk.code}`, { riskId: risk.id, mitigation: body.mitigation.slice(0, 500) });
  emitRealtime("raid:changed", { riskId: risk.id, projectId: risk.projectId });
  return { ok: true, detail: `Mitigation attached to ${risk.code} (${risk.title}).` };
}

async function applyReassign(ctx: ApplyCtx, payload: unknown): Promise<ApplyResult> {
  const body = reassignSchema.parse(payload);
  const assignment = await db.assignment.findUnique({
    where: { id: body.assignmentId },
    include: { project: { select: { code: true } }, resource: { select: { name: true } } },
  });
  if (!assignment) return { ok: false, detail: "Source assignment no longer exists — rebalance discarded." };
  if (assignment.resourceId === body.toResourceId) return { ok: false, detail: "Source and target resource are the same." };
  if (body.movePercent >= assignment.allocationPercent) {
    return { ok: false, detail: `Move (${body.movePercent}%) exceeds the assignment's allocation (${assignment.allocationPercent}%).` };
  }
  const target = await db.resource.findUnique({ where: { id: body.toResourceId }, select: { id: true, name: true, isActive: true } });
  if (!target || !target.isActive) return { ok: false, detail: "Target resource is missing or inactive." };

  const remaining = Math.round((assignment.allocationPercent - body.movePercent) * 100) / 100;
  const movedHours = assignment.allocationPercent > 0
    ? Math.round((assignment.plannedHours * body.movePercent) / assignment.allocationPercent * 100) / 100
    : 0;

  await db.$transaction([
    db.assignment.update({ where: { id: assignment.id }, data: { allocationPercent: remaining, plannedHours: Math.max(0, assignment.plannedHours - movedHours) } }),
    db.assignment.create({
      data: {
        projectId: assignment.projectId,
        resourceId: target.id,
        taskId: assignment.taskId,
        role: assignment.role,
        allocationPercent: body.movePercent,
        plannedHours: movedHours,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        status: "ACTIVE",
        billable: assignment.billable,
      },
    }),
  ]);
  await audit(ctx, `Assignment rebalance ${assignment.project.code}`, {
    from: assignment.resource.name, to: target.name, movePercent: body.movePercent,
  });
  emitRealtime("resource:assigned", { projectId: assignment.projectId, resourceId: target.id });
  return {
    ok: true,
    detail: `Moved ${body.movePercent}% of ${assignment.project.code} work from ${assignment.resource.name} to ${target.name}.`,
  };
}

async function applyNotify(ctx: ApplyCtx, payload: unknown): Promise<ApplyResult> {
  const body = notifySchema.parse(payload);
  const recipients = await resolveRecipients({ userIds: body.userIds, roles: body.roles });
  if (!recipients.length) return { ok: false, detail: "No recipients resolved (no active users with the target roles)." };

  for (const userId of recipients) {
    await db.notification.create({
      data: {
        userId,
        notifType: "AGENT",
        category: "AGENT",
        title: body.title,
        message: body.message,
        entityType: "AgentRun",
        entityId: ctx.runId,
        severity: body.severity,
        channel: "IN_APP",
        actionUrl: "#/settings",
      },
    });
  }
  await audit(ctx, `Agent notification: ${body.title}`, { recipients: recipients.length, severity: body.severity });
  emitRealtime("notification:created", { agent: ctx.agentKey, count: recipients.length });
  return { ok: true, detail: `Notified ${recipients.length} recipient(s): ${body.title}` };
}

async function applyKnowledge(ctx: ApplyCtx, payload: unknown): Promise<ApplyResult> {
  const body = knowledgeSchema.parse(payload);
  const day = new Date();
  let added = 0;
  let reinforced = 0;

  for (const e of body.entries) {
    const source = e.source ?? `AGENT:${ctx.agentKey}`;
    const existing = await db.aiKnowledge.findFirst({ where: { day, content: e.content } });
    if (existing) {
      await db.aiKnowledge.update({ where: { id: existing.id }, data: { weight: { increment: 1 } } });
      reinforced += 1;
    } else {
      await db.aiKnowledge.create({ data: { day, kind: e.kind, content: e.content, weight: 1, source } });
      added += 1;
    }
  }
  await audit(ctx, "Knowledge publish", { added, reinforced });
  emitRealtime("ai:action", { agent: ctx.agentKey, added, reinforced });
  return { ok: true, detail: `Published ${added} new knowledge entr(y/ies), reinforced ${reinforced} existing.` };
}

async function applyExportPlan(ctx: ApplyCtx, payload: unknown): Promise<ApplyResult> {
  const body = exportPlanSchema.parse(payload);
  const recipients = await resolveRecipients({ roles: ["PMO_ADMIN"] });
  if (!recipients.length) return { ok: false, detail: "No PMO admins to deliver the export plan to." };

  const plan = [
    `EXPORT PLAN (${body.format}) — generated by ${ctx.agentName}`,
    `Request: ${body.request}`,
    `Entities: ${body.entities.join(", ") || "projects (default)"}`,
    `Scope: ${body.projectId ?? "portfolio-wide"}`,
    "Columns: take them from the list view's column picker; use the view's Export button for the exact rows shown.",
  ].join("\n");

  for (const userId of recipients) {
    await db.inboxItem.create({
      data: {
        userId,
        category: "ACTION_REQUIRED",
        title: `Export plan: ${body.entities.join(", ") || "projects"} (${body.format})`,
        message: plan.slice(0, 4000),
        entityType: "AgentRun",
        entityId: ctx.runId,
        projectId: body.projectId ?? null,
        priority: "MEDIUM",
        actionUrl: "#/data/import",
        sourceType: "AGENT",
      },
    });
  }
  await audit(ctx, "Export plan", { entities: body.entities, format: body.format, recipients: recipients.length });
  emitRealtime("inbox:changed", { agent: ctx.agentKey, count: recipients.length });
  return { ok: true, detail: `Export plan delivered to ${recipients.length} inbox(es).` };
}

// ---------------------------------------------------------------------------
// Entry point — never throws; every failure becomes { ok: false, detail }
// ---------------------------------------------------------------------------

export async function applyAction(action: ProposedAction, ctx: ApplyCtx): Promise<ApplyResult> {
  try {
    if (!AGENT_ACTION_TYPES.includes(action.type as AgentActionType)) {
      return { ok: false, detail: `Unknown action type "${action.type}" — nothing was written.` };
    }
    switch (action.type as AgentActionType) {
      case "CHANGE_REQUEST_CREATE": return await applyChangeRequest(ctx, action.payload);
      case "RISK_MITIGATION_UPDATE": return await applyRiskMitigation(ctx, action.payload);
      case "ASSIGNMENT_REASSIGN": return await applyReassign(ctx, action.payload);
      case "NOTIFY": return await applyNotify(ctx, action.payload);
      case "KNOWLEDGE_PUBLISH": return await applyKnowledge(ctx, action.payload);
      case "EXPORT_PLAN": return await applyExportPlan(ctx, action.payload);
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return { ok: false, detail: `Action rejected (${first?.path.join(".") || "payload"}): ${first?.message ?? "invalid payload"}` };
    }
    console.error(`[agents] applyAction failed (${action.type})`, err);
    return { ok: false, detail: "The action failed to execute — see server logs. Nothing was written." };
  }
  return { ok: false, detail: `Unhandled action type "${action.type}".` };
}
