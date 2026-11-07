// PM CONTROL TOWER — approval gate for agent-proposed actions.
// POST /api/agents/runs/[id] — { decision: "APPROVE" | "REJECT", reason? }
//
// Approve → the stored action is re-validated and executed through applyAction
//          (zod + referential checks + audit), run becomes APPLIED.
// Reject  → nothing is written; run becomes REJECTED with the reason.
// The AGENT_RUNTIME kill switch blocks approvals too: when the runtime is off,
// agents may not act — not even retroactively.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { applyAction, type ProposedAction } from "@/lib/agents/apply";
import { agentsRuntimeEnabled } from "@/lib/agents/runner";

const bodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(1000).optional(),
});

export const POST = withApi(async (ctx) => {
  const id = ctx.params.id;
  const body = await parseBody(ctx.req, bodySchema);

  const run = await db.agentRun.findUnique({ where: { id } });
  if (!run) throw new ApiError(404, "Run not found");
  if (run.status !== "PENDING_APPROVAL") {
    throw new ApiError(409, `Run is ${run.status} — only PENDING_APPROVAL runs can be decided.`);
  }
  if (!(await agentsRuntimeEnabled())) {
    throw new ApiError(409, "Agent runtime is disabled (AGENT_RUNTIME kill switch) — approvals are blocked.");
  }

  const actor = ctx.session?.name ?? "admin";

  if (body.decision === "REJECT") {
    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "REJECTED", approvedBy: actor, approvedAt: new Date(), rejectedReason: body.reason ?? "Rejected by admin" },
    });
    await writeAudit({
      userId: ctx.session?.id ?? null, userName: ctx.session?.name ?? null, role: ctx.session?.roles[0] ?? null,
      action: "REJECT", entityType: "AgentRun", entityId: run.id, entityName: run.agentKey,
      after: { decision: "REJECT", reason: body.reason ?? null }, ipAddress: ctx.ip, severity: "WARNING",
    });
    emitRealtime("agent:run", { agentKey: run.agentKey, runId: run.id, status: "REJECTED" });
    return ok({ status: "REJECTED" });
  }

  // APPROVE — parse the stored payload and execute it through the action layer.
  if (!run.actionJson || !run.actionType) throw new ApiError(409, "Run has no stored action to approve.");
  let action: ProposedAction;
  try {
    const parsed = JSON.parse(run.actionJson) as ProposedAction;
    action = { type: parsed.type ?? run.actionType, label: parsed.label ?? run.actionType, payload: parsed.payload ?? {} };
  } catch {
    throw new ApiError(500, "Stored action payload is unreadable — reject and re-run the agent.");
  }

  const applied = await applyAction(action, {
    runId: run.id, agentKey: run.agentKey, agentName: run.agentKey,
    actorName: actor, actorUserId: ctx.session?.id ?? null,
  });

  await db.agentRun.update({
    where: { id: run.id },
    data: applied.ok
      ? { status: "APPLIED", approvedBy: actor, approvedAt: new Date(), summary: `${run.summary} → ${applied.detail}`.slice(0, 4000) }
      : { status: "FAILED", approvedBy: actor, approvedAt: new Date(), errorMessage: applied.detail, summary: `${run.summary} → ${applied.detail}`.slice(0, 4000) },
  });

  await writeAudit({
    userId: ctx.session?.id ?? null, userName: ctx.session?.name ?? null, role: ctx.session?.roles[0] ?? null,
    action: applied.ok ? "APPROVE" : "EXECUTE",
    entityType: "AgentRun", entityId: run.id, entityName: run.agentKey,
    after: { decision: "APPROVE", actionType: run.actionType, applied: applied.ok, detail: applied.detail },
    ipAddress: ctx.ip,
    severity: applied.ok ? "INFO" : "WARNING",
  });
  emitRealtime("agent:run", { agentKey: run.agentKey, runId: run.id, status: applied.ok ? "APPLIED" : "FAILED" });

  if (!applied.ok) return ok({ status: "FAILED", detail: applied.detail });
  return ok({ status: "APPLIED", detail: applied.detail });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });
