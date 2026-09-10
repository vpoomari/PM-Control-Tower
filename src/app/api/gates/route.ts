// PM CONTROL TOWER — Stage Gate API
// GET  /api/gates?projectId — gates ordered by sequence
// POST /api/gates — create gate (sequence auto = max+1, code auto `${project.code}-G<n>`)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const gates = await db.stageGate.findMany({
    where: projectId ? { projectId } : {},
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: [{ projectId: "asc" }, { sequence: "asc" }],
    take: 200,
  });
  return ok({
    gates,
    total: gates.length,
    summary: {
      pending: gates.filter((g) => g.decisionStatus === "PENDING").length,
      passed: gates.filter((g) => g.decisionStatus === "PASSED").length,
      failed: gates.filter((g) => g.decisionStatus === "FAILED").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  criteria: z.string().optional().nullable(),
  plannedDate: z.coerce.date().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const maxSeq = await db.stageGate.aggregate({ where: { projectId: body.projectId }, _max: { sequence: true } });
  const sequence = (maxSeq._max.sequence ?? 0) + 1;
  const code = `${project.code}-G${sequence}`;

  const created = await db.stageGate.create({
    data: {
      projectId: body.projectId,
      code,
      sequence,
      name: body.name,
      description: body.description ?? null,
      criteria: body.criteria ?? null,
      plannedDate: body.plannedDate ?? null,
      decisionStatus: "PENDING",
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "StageGate", entityId: created.id, entityName: `${created.code} — ${created.name}`,
    after: { sequence, decisionStatus: "PENDING" }, ipAddress: ctx.ip,
  });
  return ok({ gate: created }, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
