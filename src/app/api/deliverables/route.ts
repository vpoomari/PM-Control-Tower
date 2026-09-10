// PM CONTROL TOWER — Deliverables API
// GET  /api/deliverables?projectId — deliverable register
// POST /api/deliverables — create deliverable (code auto `${project.code}-DLV-n` unless provided)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const DELIVERABLE_TYPES = ["DOCUMENT", "SOFTWARE", "HARDWARE", "SERVICE", "REPORT", "TRAINING", "OTHER"] as const;
const DELIVERABLE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DELIVERED", "ACCEPTED", "CANCELLED"] as const;

async function nextDeliverableCode(projectCode: string): Promise<string> {
  const count = await db.deliverable.count({ where: { project: { code: projectCode } } });
  for (let n = count + 1; n < count + 1000; n++) {
    const code = `${projectCode}-DLV-${String(n).padStart(2, "0")}`;
    const dup = await db.deliverable.findFirst({ where: { code }, select: { id: true } });
    if (!dup) return code;
  }
  throw new ApiError(500, "Unable to allocate a deliverable code");
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const status = ctx.searchParams.get("status")?.trim();
  if (status && !DELIVERABLE_STATUSES.includes(status as (typeof DELIVERABLE_STATUSES)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${DELIVERABLE_STATUSES.join(", ")}`);
  }
  const deliverables = await db.deliverable.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok({
    deliverables,
    total: deliverables.length,
    summary: {
      delivered: deliverables.filter((d) => d.status === "DELIVERED" || d.status === "ACCEPTED").length,
      pendingQuality: deliverables.filter((d) => d.qualityStatus === "PENDING").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(2),
  code: z.string().optional(),
  description: z.string().optional().nullable(),
  wbsId: z.string().optional().nullable(),
  deliverableType: z.enum(DELIVERABLE_TYPES).default("DOCUMENT"),
  status: z.enum(DELIVERABLE_STATUSES).default("NOT_STARTED"),
  ownerName: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  deliveredAt: z.coerce.date().optional().nullable(),
  acceptanceCriteria: z.string().optional().nullable(),
  qualityStatus: z.enum(["PENDING", "PASSED", "FAILED", "WAIVED"]).default("PENDING"),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");
  if (body.wbsId) {
    const wbs = await db.wBSNode.findUnique({ where: { id: body.wbsId }, select: { id: true, projectId: true } });
    if (!wbs) throw new ApiError(404, "WBS node not found");
    if (wbs.projectId !== body.projectId) throw new ApiError(409, "WBS node does not belong to the given project");
  }
  if (body.code) {
    const dup = await db.deliverable.findFirst({ where: { code: body.code }, select: { id: true } });
    if (dup) throw new ApiError(409, `Deliverable code ${body.code} already exists`);
  }

  const code = body.code ?? (await nextDeliverableCode(project.code));
  const created = await db.deliverable.create({
    data: {
      projectId: body.projectId,
      code,
      name: body.name,
      description: body.description ?? null,
      wbsId: body.wbsId ?? null,
      deliverableType: body.deliverableType,
      status: body.status,
      ownerName: body.ownerName ?? null,
      dueDate: body.dueDate ?? null,
      deliveredAt: body.deliveredAt ?? null,
      acceptanceCriteria: body.acceptanceCriteria ?? null,
      qualityStatus: body.qualityStatus,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Deliverable", entityId: created.id, entityName: `${created.code} — ${created.name}`,
    after: { status: created.status, deliverableType: created.deliverableType }, ipAddress: ctx.ip,
  });
  emitRealtime("task:changed", { projectId: body.projectId, deliverableId: created.id, code, action: "DELIVERABLE_CREATED" }, projectRoom(body.projectId));
  return ok({ deliverable: created }, 201);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
