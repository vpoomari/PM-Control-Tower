// PM CONTROL TOWER — Evidence Bundle API
// GET  /api/integrity/evidence?projectId= — bundle registry
// POST /api/integrity/evidence {projectId} — export a tamper-evident bundle (hash chain)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { buildEvidenceBundle } from "@/lib/services/integrity";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  const bundles = await db.evidenceBundle.findMany({
    where: projectId ? { projectId } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { project: { select: { code: true, name: true } } },
  });
  return ok({ bundles });
}, { permission: "integrity.view", rateLimit: { limit: 120, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({ projectId: z.string() }));
  const result = await buildEvidenceBundle(body.projectId, session);
  return ok({
    bundleId: result.bundle.id, docCount: result.docCount, manifestHash: result.manifestHash,
    createdAt: result.bundle.createdAt,
  }, 201);
}, { permission: "integrity.manage", rateLimit: { limit: 20, windowMs: 60_000 } });
