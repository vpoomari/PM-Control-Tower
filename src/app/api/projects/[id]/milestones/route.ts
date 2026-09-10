// PM CONTROL TOWER — Project Milestones API
// GET  /api/projects/[id]/milestones
// POST /api/projects/[id]/milestones — create (auto code <PROJECT>-MS-<n>)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const milestoneCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  baselineDate: z.coerce.date().optional().nullable(),
  isCritical: z.boolean().optional(),
  status: z.string().trim().min(2).optional(),
  wbsId: z.string().optional().nullable(),
  gateId: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const milestones = await db.milestone.findMany({
    where: { projectId: id },
    orderBy: [{ dueDate: "asc" }, { code: "asc" }],
  });

  const now = new Date();
  const overdue = milestones.filter((m) => m.dueDate && m.dueDate < now && m.status !== "COMPLETED").length;

  return ok({ projectId: id, items: milestones, total: milestones.length, overdue });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, milestoneCreateSchema);
  if (body.wbsId) {
    const node = await db.wBSNode.findFirst({ where: { id: body.wbsId, projectId: id }, select: { id: true } });
    if (!node) throw new ApiError(400, "WBS node not found in this project");
  }

  // Auto code: <PROJECT-CODE>-MS-<n>
  const prefix = `${project.code}-MS-`;
  const existing = await db.milestone.findMany({ where: { projectId: id, code: { startsWith: prefix } }, select: { code: true } });
  let maxSeq = 0;
  for (const m of existing) {
    const n = Number(m.code.slice(prefix.length));
    if (Number.isFinite(n) && Number.isInteger(n) && n > maxSeq) maxSeq = n;
  }
  const code = `${prefix}${maxSeq + 1}`;
  const status = body.status ?? "PENDING";

  const milestone = await db.milestone.create({
    data: {
      projectId: id,
      wbsId: body.wbsId ?? null,
      code,
      name: body.name,
      description: body.description ?? null,
      dueDate: body.dueDate ?? null,
      baselineDate: body.baselineDate ?? null,
      status,
      isCritical: body.isCritical ?? false,
      gateId: body.gateId ?? null,
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Milestone", entityId: milestone.id, entityName: `${code} ${milestone.name}`,
    after: milestone, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("task:changed", { entity: "milestone", action: "created", projectId: id, milestoneId: milestone.id, code }, projectRoom(id));

  return ok(milestone, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
