// PM CONTROL TOWER — Agentic AI Actions API
// GET   /api/integrity/ai-actions                — action log (draft-first, human-gated)
// POST  /api/integrity/ai-actions {projectId, type} — DRAFT a steering pack (or trigger replan check)
// PATCH /api/integrity/ai-actions {id, status|content} — human decision: approve/reject/edit
// CONSTITUTION: AI never auto-executes. Drafts only; reviewers are recorded; audit captures both.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { composeSteeringPack, stalledSpi } from "@/lib/engines/steering";
import { computeProjectFreshness, buildScenarioSnapshot, simulateScenario } from "@/lib/services/integrity";
import { computeEVM } from "@/lib/engines/evm";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  const actions = await db.aiAction.findMany({
    where: projectId ? { projectId } : {},
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { project: { select: { code: true, name: true } } },
  });
  return ok({ actions });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({ projectId: z.string(), type: z.enum(["STEERING_PACK", "REPLAN_PROPOSAL"]).default("STEERING_PACK") }));
  const project = await db.project.findUnique({
    where: { id: body.projectId },
    include: {
      tasks: true, risks: { where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } } },
      milestones: true, stageGates: { where: { decisionStatus: "PENDING" }, orderBy: { sequence: "asc" } },
      changeRequests: { where: { status: { in: ["DRAFT", "SUBMITTED", "ASSESSMENT"] } } },
      evmPeriods: { orderBy: { statusDate: "asc" } },
    },
  });
  if (!project) throw new ApiError(404, "Project not found");

  const evm = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, project.statusDate || new Date());
  const prev = project.evmPeriods.length >= 2 ? project.evmPeriods[project.evmPeriods.length - 2] : null;
  const freshness = await computeProjectFreshness(body.projectId);
  const spiTrend = project.evmPeriods.slice(-4).map((p) => p.spi);

  const pack = composeSteeringPack({
    project: { code: project.code, name: project.name, rag: project.ragStatus, healthScore: project.healthScore },
    kpis: { cpi: evm.cpi, spi: evm.spi, eac: evm.eac, bac: evm.bac, percentComplete: evm.percentComplete, prevCpi: prev?.cpi ?? null, prevSpi: prev?.spi ?? null },
    freshness: { score: freshness?.score ?? 100, level: freshness?.level ?? "CURRENT", worstFeed: freshness?.worstFeed ?? "none" },
    topRisks: project.risks.sort((a, b) => b.score - a.score).slice(0, 5).map((r) => ({ title: r.title, severity: r.severity, score: r.score })),
    overdueMilestones: project.milestones.filter((m) => m.dueDate && m.dueDate < new Date() && m.status !== "COMPLETED").map((m) => m.name),
    pendingDecisions: [
      ...project.stageGates.map((g) => `Gate decision — ${g.code} ${g.name}`),
      ...project.changeRequests.map((c) => `Change request — ${c.code} ${c.title}`),
    ],
    spiTrend,
  });

  // Automation: Threshold-Breach Re-Planning — SPI below 0.90 for consecutive periods
  // generates THREE quantified recovery options (crash / descope / extend) from the
  // scenario engine. Drafts only — a human decides.
  let recoveryScenarios: { name: string; finishDeltaDays: number; description: string }[] | null = null;
  if (pack.needsRePlan) {
    try {
      const snapshot = await buildScenarioSnapshot(body.projectId);
      const mk = (o: Parameters<typeof simulateScenario>[1]) => simulateScenario(snapshot, o).diff;
      const crash = mk({ durationChanges: Object.fromEntries(snapshot.tasks.filter((x) => !x.isSummary).slice(0, Math.max(1, Math.ceil(snapshot.tasks.length * 0.3))).map((x) => [x.id, Math.max(0.5, Math.round(x.durationDays * 0.7))])) });
      const descope = mk({ durationChanges: Object.fromEntries([...snapshot.tasks].sort((x, y) => y.durationDays - x.durationDays).slice(0, Math.max(1, Math.ceil(snapshot.tasks.length * 0.2))).map((x) => [x.id, Math.max(0.5, Math.round(x.durationDays * 0.5))])) });
      const extend = mk({ durationChanges: Object.fromEntries(snapshot.tasks.filter((x) => !x.isSummary).map((x) => [x.id, Math.round(x.durationDays * 1.25)])) });
      recoveryScenarios = [
        { name: "Crash schedule", finishDeltaDays: crash.finishDeltaDays, description: "Compress the 30% longest-work tasks to 70% duration — finish delta " + crash.finishDeltaDays + "d vs baseline (assumes added cost/pressure)." },
        { name: "Descope lowest value", finishDeltaDays: descope.finishDeltaDays, description: "Halve the 20% heaviest low-priority tasks — finish delta " + descope.finishDeltaDays + "d (requires scope change approval)." },
        { name: "Extend timeline", finishDeltaDays: extend.finishDeltaDays, description: "Re-plan all tasks at 125% duration — finish delta " + extend.finishDeltaDays + "d (honest reset, no added cost)." },
      ];
    } catch { /* scenario math not available — draft without options */ }
  }

  const action = await db.aiAction.create({
    data: {
      type: body.type, projectId: body.projectId, title: pack.title,
      contentJson: JSON.stringify({ ...pack, recoveryScenarios }), status: "DRAFTED", trigger: pack.needsRePlan ? "SPI_BELOW_090_3WEEKS" : "MANUAL",
    },
  });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "AiAction", entityId: action.id, entityName: pack.title, after: { type: body.type, trigger: "drafted for human review" } });
  emitRealtime("ai:action", { actionId: action.id, projectId: body.projectId, type: body.type }, `project:${body.projectId}`);
  return ok({ actionId: action.id, title: pack.title, needsRePlan: pack.needsRePlan, pack: { ...pack, recoveryScenarios } }, 201);
}, { permission: "integrity.manage", rateLimit: { limit: 30, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({
    id: z.string(),
    status: z.enum(["EDITED", "APPROVED", "REJECTED"]).optional(),
    contentJson: z.string().optional(),
  }));
  const action = await db.aiAction.findUnique({ where: { id: body.id } });
  if (!action) throw new ApiError(404, "AI action not found");
  if (action.status === "APPROVED" || action.status === "REJECTED") throw new ApiError(409, "Decision already recorded — AI actions are append-only once decided");
  const updated = await db.aiAction.update({
    where: { id: body.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.contentJson ? { contentJson: body.contentJson, status: body.status === "REJECTED" ? "REJECTED" : "EDITED" } : {}),
      humanReviewer: session.name, decidedAt: body.status ? new Date() : undefined,
    },
  });
  await writeAudit({ userId: session.id, userName: session.name, action: "UPDATE", entityType: "AiAction", entityId: body.id, entityName: action.title, before: { status: action.status }, after: { status: updated.status, humanReviewer: session.name }, severity: "NOTICE" });
  emitRealtime("ai:action", { actionId: body.id, status: updated.status }, action.projectId ? `project:${action.projectId}` : "global");
  return ok({ id: updated.id, status: updated.status, humanReviewer: updated.humanReviewer });
}, { permission: "integrity.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
