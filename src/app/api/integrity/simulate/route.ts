// PM CONTROL TOWER — Probabilistic Forecasting API
// GET  /api/integrity/simulate?projectId=  — stored simulation runs (latest first)
// POST /api/integrity/simulate {projectId, seed?, iterations?} — seeded Monte Carlo (P10/P50/P80/P90)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { runAndStoreSimulation } from "@/lib/services/integrity";
import { writeAudit } from "@/lib/audit";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "projectId required");
  const runs = await db.simulationRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10 });
  return ok({ runs });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({
    projectId: z.string(),
    seed: z.number().int().optional(),
    iterations: z.number().int().min(200).max(10_000).optional(),
  }));
  const { run, result, projectName, projectCode } = await runAndStoreSimulation(body.projectId, { seed: body.seed, iterations: body.iterations });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "SimulationRun", entityId: run.id, entityName: `Monte Carlo — ${projectCode}`, after: { seed: result.seed, iterations: result.iterations, p80: result.finish.p80 } });
  return ok({
    runId: run.id, seed: result.seed, iterations: result.iterations, prng: result.prng,
    deterministicFinishDay: result.deterministicFinishDay,
    finish: result.finish, cost: result.cost, milestones: result.milestones,
    criticality: result.criticality, projectName, projectCode,
  }, 201);
}, { permission: "integrity.manage", rateLimit: { limit: 20, windowMs: 60_000 } });
