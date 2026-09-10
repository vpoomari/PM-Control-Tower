// PM CONTROL TOWER — Project Dependencies API
// GET  /api/projects/[id]/dependencies — list with predecessor/successor task names
// POST /api/projects/[id]/dependencies — create (FS|SS|FF|SF + lag; self/duplicate/cycle guarded)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rescheduleProject } from "@/lib/engines/rollup";
import { DEP_TYPES } from "@/lib/constants";

const dependencyCreateSchema = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  depType: z.enum(DEP_TYPES).optional(),
  lagDays: z.coerce.number().optional(),
  isExternal: z.boolean().optional(),
  externalRef: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const dependencies = await db.dependency.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    include: {
      predecessor: { select: { id: true, code: true, name: true, status: true, progress: true, isCritical: true } },
      successor: { select: { id: true, code: true, name: true, status: true, progress: true, isCritical: true } },
    },
  });

  return ok({ projectId: id, items: dependencies, total: dependencies.length });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, dependencyCreateSchema);
  if (body.predecessorId === body.successorId) {
    throw new ApiError(400, "A task cannot depend on itself");
  }

  const [pred, succ] = await Promise.all([
    db.task.findFirst({ where: { id: body.predecessorId, projectId: id }, select: { id: true, code: true, name: true } }),
    db.task.findFirst({ where: { id: body.successorId, projectId: id }, select: { id: true, code: true, name: true } }),
  ]);
  if (!pred || !succ) throw new ApiError(400, "Both tasks must exist in this project");

  const duplicate = await db.dependency.findFirst({
    where: { projectId: id, predecessorId: body.predecessorId, successorId: body.successorId },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, `Dependency ${pred.code} → ${succ.code} already exists`);

  // Cycle guard: if successor can already reach predecessor through existing edges, reject
  const edges = await db.dependency.findMany({ where: { projectId: id }, select: { predecessorId: true, successorId: true } });
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.predecessorId) ?? [];
    list.push(e.successorId);
    adjacency.set(e.predecessorId, list);
  }
  const visited = new Set<string>();
  const stack = [body.successorId];
  let cyclic = false;
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === body.predecessorId) { cyclic = true; break; }
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adjacency.get(cur) ?? []) stack.push(next);
  }
  if (cyclic) throw new ApiError(400, `Rejected: this dependency would create a schedule cycle (${pred.code} → ${succ.code})`);

  const dependency = await db.dependency.create({
    data: {
      projectId: id,
      predecessorId: body.predecessorId,
      successorId: body.successorId,
      depType: body.depType ?? "FS",
      lagDays: body.lagDays ?? 0,
      isExternal: body.isExternal ?? false,
      externalRef: body.externalRef ?? null,
    },
    include: {
      predecessor: { select: { id: true, code: true, name: true } },
      successor: { select: { id: true, code: true, name: true } },
    },
  });

  const schedule = await rescheduleProject(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Dependency", entityId: dependency.id,
    entityName: `${pred.code} → ${succ.code} (${dependency.depType})`,
    after: dependency, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("dependency:changed", { projectId: id, action: "created", dependencyId: dependency.id, criticalCount: schedule.criticalCount }, projectRoom(id));

  return ok(dependency, 201);
}, { permission: "schedule.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
