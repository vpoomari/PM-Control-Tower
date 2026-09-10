// PM CONTROL TOWER — Earned Value Management API
// GET  /api/evm?projectId — live EVM computation + persisted period history + latest snapshot
// POST /api/evm — persist a manual EVM snapshot (source: MANUAL_SNAPSHOT)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { computeEVM } from "@/lib/engines/evm";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  if (!projectId) throw new ApiError(400, "projectId query parameter is required");

  const project = await db.project.findUnique({ where: { id: projectId }, include: { tasks: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const evm = computeEVM(
    project.tasks,
    project.actualCost,
    project.currentBudget || project.baselineBudget || null,
    project.statusDate || new Date(),
  );

  const historyDesc = await db.evmPeriod.findMany({
    where: { projectId },
    orderBy: { statusDate: "desc" },
    take: 52,
  });
  const history = historyDesc.slice().reverse(); // asc
  const latest = historyDesc[0] ?? null;

  return ok({
    evm,
    current: {
      bac: evm.bac, pv: evm.pv, ev: evm.ev, ac: evm.ac,
      cpi: evm.cpi, spi: evm.spi, eac: evm.eac, etc: evm.etc, vac: evm.vac, tcpi: evm.tcpi,
      costVariance: evm.costVariance, scheduleVariance: evm.scheduleVariance, percentComplete: evm.percentComplete,
    },
    latestSnapshot: latest,
    history,
    project: { id: project.id, code: project.code, name: project.name, statusDate: project.statusDate, baselineBudget: project.baselineBudget, currentBudget: project.currentBudget, actualCost: project.actualCost },
  });
}, { permission: "evm.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const postSchema = z.object({
  projectId: z.string().min(1),
  statusDate: z.coerce.date().optional(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, postSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, include: { tasks: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const statusDate = body.statusDate ?? project.statusDate ?? new Date();
  const evm = computeEVM(
    project.tasks,
    project.actualCost,
    project.currentBudget || project.baselineBudget || null,
    statusDate,
  );

  const period = await db.evmPeriod.create({
    data: {
      projectId: project.id,
      statusDate,
      periodStart: project.startDate,
      periodEnd: project.endDate,
      bac: evm.bac, pv: evm.pv, ev: evm.ev, ac: evm.ac,
      cpi: evm.cpi, spi: evm.spi, eac: evm.eac, etc: evm.etc, vac: evm.vac, tcpi: evm.tcpi,
      costVariance: evm.costVariance, scheduleVariance: evm.scheduleVariance, percentComplete: evm.percentComplete,
      source: "MANUAL_SNAPSHOT",
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "EvmPeriod", entityId: period.id, entityName: `${project.code} snapshot ${statusDate.toISOString().slice(0, 10)}`,
    after: { cpi: evm.cpi, spi: evm.spi, eac: evm.eac, ac: evm.ac, source: "MANUAL_SNAPSHOT" },
    ipAddress: ctx.ip,
  });
  emitRealtime("evm:changed", { projectId: project.id, cpi: evm.cpi, spi: evm.spi, eac: evm.eac, source: "MANUAL_SNAPSHOT" }, projectRoom(project.id));
  return ok({ evm, period }, 201);
}, { permission: "evm.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
