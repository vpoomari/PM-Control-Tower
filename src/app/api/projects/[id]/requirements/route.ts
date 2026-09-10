// PM CONTROL TOWER — Project Requirements API
// GET  /api/projects/[id]/requirements?status=&type=&q=
// POST /api/projects/[id]/requirements — create with auto reqCode (PROJECT-REQ-###)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const requirementCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().optional().nullable(),
  reqType: z.string().trim().min(2).optional(),
  priority: z.string().trim().min(2).optional(),
  status: z.string().trim().min(2).optional(),
  acceptanceCriteria: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  effortEstimate: z.coerce.number().min(0).optional(),
  wbsId: z.string().optional().nullable(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const status = ctx.searchParams.get("status");
  const type = ctx.searchParams.get("type");
  const q = ctx.searchParams.get("q")?.trim();

  const requirements = await db.requirement.findMany({
    where: {
      projectId: id,
      ...(status ? { status } : {}),
      ...(type ? { reqType: type } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { reqCode: { contains: q } }, { description: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { wbs: { select: { id: true, code: true, name: true } } },
  });

  return ok({ projectId: id, items: requirements, total: requirements.length });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, requirementCreateSchema);
  if (body.wbsId) {
    const wbs = await db.wBSNode.findFirst({ where: { id: body.wbsId, projectId: id }, select: { id: true } });
    if (!wbs) throw new ApiError(400, "WBS node not found in this project");
  }

  // Auto reqCode: <PROJECT-CODE>-REQ-### (sequence = max existing + 1)
  const prefix = `${project.code}-REQ-`;
  const existing = await db.requirement.findMany({ where: { projectId: id, reqCode: { startsWith: prefix } }, select: { reqCode: true } });
  let maxSeq = 0;
  for (const r of existing) {
    const n = Number(r.reqCode.slice(prefix.length));
    if (Number.isFinite(n) && Number.isInteger(n) && n > maxSeq) maxSeq = n;
  }
  const reqCode = `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;

  const requirement = await db.requirement.create({
    data: {
      projectId: id,
      wbsId: body.wbsId ?? null,
      reqCode,
      title: body.title,
      description: body.description ?? null,
      reqType: body.reqType ?? "FUNCTIONAL",
      priority: body.priority ?? "MEDIUM",
      status: body.status ?? "DRAFT",
      acceptanceCriteria: body.acceptanceCriteria ?? null,
      source: body.source ?? null,
      ownerName: body.ownerName ?? null,
      effortEstimate: body.effortEstimate ?? 0,
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "Requirement", entityId: requirement.id, entityName: `${reqCode} ${requirement.title}`,
    after: requirement, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("project:updated", { entity: "requirement", action: "created", projectId: id, requirementId: requirement.id }, projectRoom(id));

  return ok(requirement, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
