// PM CONTROL TOWER — Data Freshness Integrity API
// GET  /api/integrity/freshness            — all projects, live-computed composite + per-feed ages
// GET  /api/integrity/freshness?projectId= — single project
// POST /api/integrity/freshness {projectId, cadences?} — recalc now / tune cadence (manage)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { computeProjectFreshness, recalcProjectFreshness } from "@/lib/services/integrity";
import { emitRealtime } from "@/lib/realtime";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (projectId) {
    const single = await computeProjectFreshness(projectId);
    if (!single) throw new ApiError(404, "Project not found");
    return ok(single);
  }
  const projects = await db.project.findMany({ select: { id: true, code: true, name: true, ragStatus: true, healthScore: true }, orderBy: { name: "asc" } });
  const out: Array<{ project: { id: string; code: string; name: string; ragStatus: string; healthScore: number }; score: number; level: string; worstFeed: string; feeds: unknown[]; projectId: string }> = [];
  for (const p of projects) {
    const f = await computeProjectFreshness(p.id);
    if (f) out.push({ project: p, ...f });
  }
  return ok({ projects: out });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });

const cadenceSchema = z.object({
  projectId: z.string(),
  cadences: z.record(z.string(), z.number().int().min(1).max(365)).optional(),
});

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, cadenceSchema);
  if (body.cadences) {
    for (const [feed, days] of Object.entries(body.cadences)) {
      await db.freshnessMetric.upsert({
        where: { projectId_feed: { projectId: body.projectId, feed } },
        create: { projectId: body.projectId, feed, lastUpdate: new Date(), expectedCadenceDays: days },
        update: { expectedCadenceDays: days },
      });
    }
  }
  await recalcProjectFreshness(body.projectId);
  const fresh = await computeProjectFreshness(body.projectId);
  emitRealtime("freshness:changed", { projectId: body.projectId }, `project:${body.projectId}`);
  return ok(fresh);
}, { permission: "integrity.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
