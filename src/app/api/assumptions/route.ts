// PM CONTROL TOWER — Assumption Register API
// GET  /api/assumptions?projectId&status&q — assumption log
// POST /api/assumptions — create assumption (auto code ASM-###, status VALID)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

const ASSUMPTION_STATUSES = ["VALID", "AT_RISK", "INVALID", "CLOSED"] as const;

async function nextAssumptionCode(): Promise<string> {
  const count = await db.assumption.count();
  for (let n = count + 1; n < count + 1000; n++) {
    const code = `ASM-${String(n).padStart(3, "0")}`;
    const dup = await db.assumption.findFirst({ where: { code }, select: { id: true } });
    if (!dup) return code;
  }
  throw new ApiError(500, "Unable to allocate an assumption code");
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const status = ctx.searchParams.get("status")?.trim();
  const q = ctx.searchParams.get("q")?.trim();

  if (status && !ASSUMPTION_STATUSES.includes(status as (typeof ASSUMPTION_STATUSES)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${ASSUMPTION_STATUSES.join(", ")}`);
  }

  const assumptions = await db.assumption.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ description: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok({
    assumptions,
    total: assumptions.length,
    summary: {
      valid: assumptions.filter((a) => a.status === "VALID").length,
      atRisk: assumptions.filter((a) => a.status === "AT_RISK").length,
      invalid: assumptions.filter((a) => a.status === "INVALID").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().min(3),
  rationale: z.string().optional().nullable(),
  impactIfFalse: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  validationDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const code = await nextAssumptionCode();
  const created = await db.assumption.create({
    data: {
      projectId: body.projectId,
      code,
      description: body.description,
      rationale: body.rationale ?? null,
      impactIfFalse: body.impactIfFalse ?? null,
      status: "VALID",
      ownerName: body.ownerName ?? null,
      validationDate: body.validationDate ?? null,
      dueDate: body.dueDate ?? null,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Assumption", entityId: created.id, entityName: `${created.code} — ${created.description.slice(0, 60)}`,
    after: { status: "VALID" }, ipAddress: ctx.ip,
  });
  emitRealtime("raid:changed", { projectId: body.projectId, type: "assumption", assumptionId: created.id, code, action: "CREATED" }, projectRoom(body.projectId));
  return ok({ assumption: created }, 201);
}, { permission: "raid.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
