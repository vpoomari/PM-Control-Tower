// PM CONTROL TOWER — Change Request API
// GET  /api/changes?projectId&status — change log
// POST /api/changes — raise a change request (auto code CR-###, requester = session)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { runAutomations } from "@/lib/engines/automations";
import { round2, CR_STATUS } from "@/lib/constants";

async function nextChangeCode(): Promise<string> {
  const count = await db.changeRequest.count();
  for (let n = count + 1; n < count + 1000; n++) {
    const code = `CR-${String(n).padStart(3, "0")}`;
    const dup = await db.changeRequest.findFirst({ where: { code }, select: { id: true } });
    if (!dup) return code;
  }
  throw new ApiError(500, "Unable to allocate a change request code");
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const status = ctx.searchParams.get("status")?.trim();

  if (status && !CR_STATUS.includes(status as (typeof CR_STATUS)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${CR_STATUS.join(", ")}`);
  }

  const changes = await db.changeRequest.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok({
    changes,
    total: changes.length,
    summary: {
      open: changes.filter((c) => !["APPROVED", "REJECTED", "IMPLEMENTED", "CLOSED"].includes(c.status)).length,
      pendingDecision: changes.filter((c) => c.status === "APPROVAL" || c.status === "ASSESSMENT").length,
      approved: changes.filter((c) => c.status === "APPROVED" || c.status === "IMPLEMENTED" || c.status === "CLOSED").length,
      impactCostOpen: round2(changes.filter((c) => !["REJECTED", "CLOSED"].includes(c.status)).reduce((s, c) => s + c.impactCost, 0)),
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  category: z.enum(["SCOPE", "COST", "SCHEDULE", "QUALITY", "RISK", "RESOURCE", "CONTRACT", "OTHER"]).default("SCOPE"),
  ownerId: z.string().optional().nullable(),
  impactHours: z.coerce.number().min(0).default(0),
  impactCost: z.coerce.number().min(0).default(0),
  scheduleImpactDays: z.coerce.number().default(0),
  riskImpact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  dueDate: z.coerce.date().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");
  if (body.ownerId) {
    const owner = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
    if (!owner) throw new ApiError(404, "Owner (user) not found");
  }

  const code = await nextChangeCode();
  const created = await db.changeRequest.create({
    data: {
      projectId: body.projectId,
      code,
      title: body.title,
      description: body.description ?? null,
      reason: body.reason ?? null,
      category: body.category,
      requesterId: session.id,
      requesterName: session.name,
      ownerId: body.ownerId ?? null,
      impactHours: round2(body.impactHours),
      impactCost: round2(body.impactCost),
      scheduleImpactDays: body.scheduleImpactDays,
      riskImpact: body.riskImpact,
      status: "DRAFT",
      priority: body.priority,
      dueDate: body.dueDate ?? null,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "ChangeRequest", entityId: created.id, entityName: `${created.code} — ${created.title}`,
    after: { status: "DRAFT", impactCost: created.impactCost, impactHours: created.impactHours, scheduleImpactDays: created.scheduleImpactDays },
    ipAddress: ctx.ip,
  });
  emitRealtime("change:changed", { projectId: body.projectId, changeId: created.id, code, status: "DRAFT", action: "CREATED" }, projectRoom(body.projectId));
  await runAutomations("CHANGE_REQUESTED", { entityType: "ChangeRequest", entityId: created.id, projectId: body.projectId, changeId: created.id });
  return ok({ change: created }, 201);
}, { permission: "change.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
