// PM CONTROL TOWER — Global Search API
// GET /api/search?q= — grouped cross-entity search (projects, programs, portfolios,
// tasks, risks, issues) plus a "custom" group over searchable Field Dictionary values.

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { searchCustomValues } from "@/lib/fields/enrich";

export const GET = withApi(async (ctx) => {
  const q = ctx.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return ok({
      query: q,
      projects: [], programs: [], portfolios: [], tasks: [], risks: [], issues: [], custom: [],
      total: 0,
      hint: "Enter at least 2 characters",
    });
  }

  const [projects, programs, portfolios, tasks, risks, issues] = await Promise.all([
    db.project.findMany({
      where: { OR: [{ code: { contains: q } }, { name: { contains: q } }] },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, name: true, status: true, priority: true, ragStatus: true, healthScore: true, progress: true },
    }),
    db.program.findMany({
      where: { OR: [{ code: { contains: q } }, { name: { contains: q } }] },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, name: true, status: true, healthScore: true, ragStatus: true, portfolio: { select: { id: true, code: true, name: true } } },
    }),
    db.portfolio.findMany({
      where: { OR: [{ code: { contains: q } }, { name: { contains: q } }] },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, name: true, status: true, healthScore: true, ragStatus: true },
    }),
    db.task.findMany({
      where: { OR: [{ code: { contains: q } }, { name: { contains: q } }] },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true, code: true, name: true, status: true, progress: true, isCritical: true, project: { select: { id: true, code: true, name: true } } },
    }),
    db.risk.findMany({
      where: { OR: [{ code: { contains: q } }, { title: { contains: q } }] },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true, code: true, title: true, severity: true, status: true, score: true, project: { select: { id: true, code: true, name: true } } },
    }),
    db.issue.findMany({
      where: { OR: [{ code: { contains: q } }, { title: { contains: q } }] },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true, code: true, title: true, severity: true, status: true, priority: true, project: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  // Searchable Field Dictionary values (respecting sensitivity + role gates).
  const custom = await searchCustomValues(
    q,
    ctx.session ? { roles: ctx.session.roles, isSuperAdmin: ctx.session.isSuperAdmin } : null,
    8,
  );

  const total = projects.length + programs.length + portfolios.length + tasks.length
    + risks.length + issues.length + custom.length;

  return ok({ query: q, projects, programs, portfolios, tasks, risks, issues, custom, total });
}, { permission: "project.view", rateLimit: { limit: 120, windowMs: 60_000 } });
