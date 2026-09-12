// PM CONTROL TOWER — Benefits Realization API
// GET   /api/integrity/benefits?projectId=  — profiles + rollup + strategic overlay
// GET   /api/integrity/benefits             — portfolio value view (promised / delivered / at risk)
// POST  /api/integrity/benefits {action: "profile"|"actual"|"review", ...}
// PATCH /api/integrity/benefits {id, ...}   — update profile
// Activation: when a project's FINAL stage gate passes, its profiles activate for tracking (synced here).

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { benefitsRollupForProject, portfolioBenefitsRollup } from "@/lib/services/integrity";
import { strategicHealth } from "@/lib/engines/benefits";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

async function syncActivation(projectId: string): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { _count: { select: { stageGates: true } }, stageGates: { orderBy: { sequence: "desc" }, take: 1, select: { sequence: true, decisionStatus: true } } },
  });
  if (!project || project._count.stageGates === 0) return false;
  const finalGate = project.stageGates[0];
  if (finalGate.decisionStatus !== "PASSED") return false;
  const inactive = await db.benefitProfile.findMany({ where: { projectId, active: false }, select: { id: true } });
  if (inactive.length === 0) return false;
  await db.benefitProfile.updateMany({ where: { projectId, active: false }, data: { active: true, activatedAt: new Date() } });
  emitRealtime("benefits:updated", { projectId, activated: inactive.length }, `project:${projectId}`);
  return true;
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (projectId) {
    await syncActivation(projectId);
    const { profiles, rollup } = await benefitsRollupForProject(projectId);
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, ragStatus: true } });
    if (!project) throw new ApiError(404, "Project not found");
    const strategic = strategicHealth(project.ragStatus, rollup.realizationPct, rollup.activeProfiles);
    return ok({ project, profiles, rollup, strategic });
  }
  const portfolio = await portfolioBenefitsRollup();
  const totals = portfolio.reduce((acc, p) => ({ promised: acc.promised + p.rollup.promised, delivered: acc.delivered + p.rollup.delivered }), { promised: 0, delivered: 0 });
  return ok({
    projects: portfolio,
    totals: { ...totals, realizationPct: totals.promised > 0 ? Math.round((totals.delivered / totals.promised) * 1000) / 10 : 0 },
  });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"), projectId: z.string(), name: z.string().min(2),
    type: z.enum(["REVENUE", "COST_SAVING", "CAPACITY", "KPI"]),
    baselineValue: z.number().min(0), targetValue: z.number().min(0),
    timeframeMonths: z.number().int().min(1).max(60), owner: z.string().min(2),
    reviewCadenceDays: z.number().int().min(7).max(180).default(30),
  }),
  z.object({ action: z.literal("actual"), profileId: z.string(), period: z.coerce.date(), value: z.number(), source: z.string().optional().nullable() }),
  z.object({ action: z.literal("review"), profileId: z.string(), status: z.enum(["ON_TRACK", "AT_RISK", "MISSED"]), commentary: z.string().optional().nullable() }),
]);

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, postSchema);
  if (body.action === "profile") {
    const profile = await db.benefitProfile.create({
      data: { projectId: body.projectId, name: body.name, type: body.type, baselineValue: body.baselineValue, targetValue: body.targetValue, timeframeMonths: body.timeframeMonths, owner: body.owner, reviewCadenceDays: body.reviewCadenceDays },
    });
    await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "BenefitProfile", entityId: profile.id, entityName: profile.name, after: { targetValue: profile.targetValue } });
    emitRealtime("benefits:updated", { projectId: body.projectId }, `project:${body.projectId}`);
    return ok({ profile }, 201);
  }
  if (body.action === "actual") {
    const actual = await db.benefitActual.upsert({
      where: { profileId_period: { profileId: body.profileId, period: body.period } },
      create: { profileId: body.profileId, period: body.period, value: body.value, source: body.source ?? null },
      update: { value: body.value, source: body.source ?? null },
    });
    const profile = await db.benefitProfile.findUnique({ where: { id: body.profileId }, select: { projectId: true, name: true } });
    await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "BenefitActual", entityId: actual.id, entityName: profile?.name ?? body.profileId, after: { period: body.period, value: body.value } });
    emitRealtime("benefits:updated", { profileId: body.profileId }, profile ? `project:${profile.projectId}` : "global");
    return ok({ actual }, 201);
  }
  const review = await db.benefitReview.create({ data: { profileId: body.profileId, date: new Date(), status: body.status, commentary: body.commentary ?? null } });
  return ok({ review }, 201);
}, { permission: "benefits.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({
    id: z.string(), name: z.string().min(2).optional(), owner: z.string().min(2).optional(),
    targetValue: z.number().min(0).optional(), timeframeMonths: z.number().int().min(1).max(60).optional(),
  }));
  const before = await db.benefitProfile.findUnique({ where: { id: body.id } });
  if (!before) throw new ApiError(404, "Benefit profile not found");
  const profile = await db.benefitProfile.update({
    where: { id: body.id },
    data: { ...(body.name ? { name: body.name } : {}), ...(body.owner ? { owner: body.owner } : {}), ...(body.targetValue != null ? { targetValue: body.targetValue } : {}), ...(body.timeframeMonths ? { timeframeMonths: body.timeframeMonths } : {}) },
  });
  await writeAudit({ userId: session.id, userName: session.name, action: "UPDATE", entityType: "BenefitProfile", entityId: body.id, entityName: profile.name, before, after: profile });
  return ok({ profile });
}, { permission: "benefits.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
