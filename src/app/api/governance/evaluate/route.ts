// PM CONTROL TOWER — Governance Evaluation API
// POST /api/governance/evaluate — run the governance engine (optionally scoped to one project)
// GET  /api/governance/evaluate — recent alert events (last 50)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { evaluateGovernance } from "@/lib/engines/governance";

const postSchema = z.object({ projectId: z.string().optional() });

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, postSchema);

  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true } });
    if (!project) throw new ApiError(404, "Project not found");
  }

  const result = await evaluateGovernance(body.projectId || undefined);
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "EXECUTE", entityType: "GovernanceEngine", entityName: body.projectId ? "Scoped evaluation" : "Portfolio evaluation",
    after: { evaluated: result.evaluated, breaches: result.breaches.length, projectId: body.projectId ?? "ALL" },
    ipAddress: ctx.ip,
  });
  return ok(result);
}, { permission: "governance.manage", rateLimit: { limit: 60, windowMs: 60_000 } });

export const GET = withApi(async (ctx) => {
  const alerts = await db.alertEvent.findMany({
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({
    alerts,
    total: alerts.length,
    open: alerts.filter((a) => a.status === "NEW").length,
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });
