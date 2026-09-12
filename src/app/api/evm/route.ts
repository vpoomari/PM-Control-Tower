// PM CONTROL TOWER — EVM API
// GET  /api/evm?projectId= — live EVM block + snapshot history
// POST /api/evm — period close: either fully computed from live rows (PERIOD_CLOSE)
//                 or a full-field manual period (MANUAL_PERIOD) with base inputs
//                 (statusDate, BAC, PV, EV, AC) and optional derived overrides.
//                 Derived metrics are always computed unless explicitly overridden.
//                 Every manual period is audited and recalc.projectHealth runs.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { computeEVM } from "@/lib/engines/evm";
import { recalcProjectHealth } from "@/lib/engines/health";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "projectId required");
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { tasks: true, evmPeriods: { orderBy: { statusDate: "asc" } } },
  });
  if (!project) throw new ApiError(404, "Project not found");
  const evm = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, project.statusDate || new Date());
  return ok({ evm, history: project.evmPeriods, latestSnapshot: project.evmPeriods[project.evmPeriods.length - 1] ?? null });
}, { permission: "evm.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const postSchema = z.object({
  projectId: z.string().min(1),
  statusDate: z.coerce.date().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  bac: z.number().min(0).optional(),
  pv: z.number().min(0).optional(),
  ev: z.number().min(0).optional(),
  ac: z.number().min(0).optional(),
  cpi: z.number().optional(),
  spi: z.number().optional(),
  eac: z.number().min(0).optional(),
  etc: z.number().min(0).optional(),
  vac: z.number().optional(),
  tcpi: z.number().optional(),
  costVariance: z.number().optional(),
  scheduleVariance: z.number().optional(),
  percentComplete: z.number().min(0).max(100).optional(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, postSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, include: { tasks: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const statusDate = body.statusDate ?? project.statusDate ?? new Date();
  const live = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, statusDate);
  const manual = body.bac != null || body.pv != null || body.ev != null || body.ac != null;

  const bac = body.bac ?? live.bac;
  const pv = body.pv ?? live.pv;
  const ev = body.ev ?? live.ev;
  const ac = body.ac ?? live.ac;
  const cpi = body.cpi ?? (ac > 0 ? ev / ac : 1);
  const spi = body.spi ?? (pv > 0 ? ev / pv : 1);
  const eac = body.eac ?? (cpi > 0 ? bac / cpi : bac);
  const etc = body.etc ?? Math.max(0, eac - ac);
  const vac = body.vac ?? bac - eac;
  const tcpi = body.tcpi ?? (bac - ac !== 0 ? (bac - ev) / (bac - ac) : 1);
  const costVariance = body.costVariance ?? ev - ac;
  const scheduleVariance = body.scheduleVariance ?? ev - pv;
  const percentComplete = body.percentComplete ?? (bac > 0 ? (ev / bac) * 100 : 0);
  const source = manual ? "MANUAL_PERIOD" : "PERIOD_CLOSE";

  const period = await db.evmPeriod.create({
    data: {
      projectId: project.id,
      statusDate,
      periodStart: body.periodStart ?? project.startDate,
      periodEnd: body.periodEnd ?? project.endDate,
      bac, pv, ev, ac, cpi, spi, eac, etc, vac, tcpi, costVariance, scheduleVariance, percentComplete,
      source,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, action: "CREATE", entityType: "EvmPeriod", entityId: period.id,
    entityName: `EVM period — ${project.code} @ ${statusDate.toISOString().slice(0, 10)}`,
    after: { source, bac, pv, ev, ac, cpi, spi, eac }, severity: manual ? "WARNING" : "NOTICE",
  });
  emitRealtime("evm:changed", { projectId: project.id, periodId: period.id, source }, `project:${project.id}`);
  await recalcProjectHealth(project.id, source);

  return ok({ period }, 201);
}, { permission: "evm.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
