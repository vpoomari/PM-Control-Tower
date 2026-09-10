// PM CONTROL TOWER — Risk Register API
// GET  /api/risks?projectId&status&severity&q — scored risk register (score desc)
// POST /api/risks — create risk (auto code RSK-###, score = probability × impact,
//                    severity auto: >=16 CRITICAL, >=10 HIGH, >=5 MEDIUM else LOW)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { runAutomations } from "@/lib/engines/automations";

const RISK_STATUSES = ["OPEN", "MITIGATING", "CLOSED", "ACCEPTED", "ESCALATED"] as const;
const RISK_CATEGORIES = ["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "EXTERNAL", "OTHER"] as const;

function severityFromScore(score: number): string {
  if (score >= 16) return "CRITICAL";
  if (score >= 10) return "HIGH";
  if (score >= 5) return "MEDIUM";
  return "LOW";
}

async function nextRiskCode(): Promise<string> {
  const count = await db.risk.count();
  for (let n = count + 1; n < count + 1000; n++) {
    const code = `RSK-${String(n).padStart(3, "0")}`;
    const dup = await db.risk.findFirst({ where: { code }, select: { id: true } });
    if (!dup) return code;
  }
  throw new ApiError(500, "Unable to allocate a risk code");
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const status = ctx.searchParams.get("status")?.trim();
  const severity = ctx.searchParams.get("severity")?.trim();
  const q = ctx.searchParams.get("q")?.trim();

  if (status && !RISK_STATUSES.includes(status as (typeof RISK_STATUSES)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${RISK_STATUSES.join(", ")}`);
  }

  const risks = await db.risk.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: [{ score: "desc" }, { identifiedAt: "desc" }],
    take: 200,
  });

  return ok({
    risks,
    total: risks.length,
    summary: {
      open: risks.filter((r) => r.status === "OPEN").length,
      critical: risks.filter((r) => r.severity === "CRITICAL" && r.status !== "CLOSED").length,
      escalated: risks.filter((r) => r.status === "ESCALATED").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().optional().nullable(),
  category: z.enum(RISK_CATEGORIES).default("TECHNICAL"),
  probability: z.coerce.number().int().min(1).max(5).default(3),
  impact: z.coerce.number().int().min(1).max(5).default(3),
  ownerName: z.string().optional().nullable(),
  responseStrategy: z.enum(["AVOID", "MITIGATE", "TRANSFER", "ACCEPT", "MONITOR", "ESCALATE"]).default("MITIGATE"),
  mitigation: z.string().optional().nullable(),
  contingency: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const score = body.probability * body.impact;
  const severity = severityFromScore(score);
  const code = await nextRiskCode();

  const created = await db.risk.create({
    data: {
      projectId: body.projectId,
      code,
      title: body.title,
      description: body.description ?? null,
      category: body.category,
      probability: body.probability,
      impact: body.impact,
      score,
      severity,
      status: "OPEN",
      ownerName: body.ownerName ?? null,
      responseStrategy: body.responseStrategy,
      mitigation: body.mitigation ?? null,
      contingency: body.contingency ?? null,
      dueDate: body.dueDate ?? null,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Risk", entityId: created.id, entityName: `${created.code} — ${created.title}`,
    after: { severity, score, probability: created.probability, impact: created.impact, status: "OPEN" },
    ipAddress: ctx.ip,
  });
  emitRealtime("raid:changed", { projectId: body.projectId, type: "risk", riskId: created.id, code, severity, action: "CREATED" }, projectRoom(body.projectId));
  await runAutomations("RAID_CREATED", { entityType: "Risk", entityId: created.id, projectId: body.projectId, severity });
  return ok({ risk: created }, 201);
}, { permission: "raid.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
