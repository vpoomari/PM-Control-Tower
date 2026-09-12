// PM CONTROL TOWER — Probabilistic Forecasting API
// GET  /api/integrity/simulate?projectId=  — stored simulation runs (latest first)
// POST /api/integrity/simulate {projectId, seed?, iterations?} — seeded Monte Carlo (P10/P50/P80/P90)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { enqueueSimulation } from "@/lib/services/simqueue";
import { writeAudit } from "@/lib/audit";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "projectId required");
  const runs = await db.simulationRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10 });
  return ok({ runs: runs.map((r) => ({ ...r, result: r.status === "COMPLETE" && r.resultsJson && r.resultsJson !== "{}" ? JSON.parse(r.resultsJson) : null })) });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({
    projectId: z.string(),
    seed: z.number().int().optional(),
    iterations: z.number().int().min(200).max(10_000).optional(),
  }));
  // Async by default: enqueue and return immediately; the worker never blocks the API thread.
  const { runId } = await enqueueSimulation(body.projectId, { seed: body.seed, iterations: body.iterations });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "SimulationRun", entityId: runId, entityName: "Monte Carlo (queued)", after: { iterations: body.iterations ?? 1000 } });
  return ok({ runId, status: "QUEUED" }, 202);
}, { permission: "integrity.manage", rateLimit: { limit: 20, windowMs: 60_000 } });
