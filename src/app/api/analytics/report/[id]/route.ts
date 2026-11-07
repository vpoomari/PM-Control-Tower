// PM CONTROL TOWER — Analytics report payload API
// GET /api/analytics/report/[id] — computes one report's live payload.
// Query: ?projectId= scopes every source read to a single project.
// Roadmap reports return metadata + payload:null (the UI shows the spec card).

import { withApi, ok, ApiError } from "@/lib/api";
import { getReport, ANALYTICS_MODULES } from "@/lib/analytics/registry";
import { loadAnalyticsContext } from "@/lib/analytics/context";

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const def = getReport(id);
  if (!def) throw new ApiError(404, `Unknown analytics report: ${id}`);

  const moduleMeta = ANALYTICS_MODULES.find((m) => m.id === def.module) ?? null;
  const meta = {
    id: def.id, module: def.module, pillar: def.pillar, title: def.title,
    subtitle: def.subtitle, formula: def.formula, sources: def.sources,
    status: def.status, roadmapNote: def.roadmapNote,
  };

  if (!def.compute) return ok({ report: meta, moduleMeta, payload: null });

  const projectId = ctx.searchParams.get("projectId") ?? undefined;
  if (projectId) {
    const { db } = await import("@/lib/db");
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new ApiError(404, "Project not found");
  }
  const context = await loadAnalyticsContext(projectId);
  const payload = await def.compute(context);
  return ok({ report: meta, moduleMeta, payload });
}, { permission: "reports.view" });
