// PM CONTROL TOWER — Executive Control Tower bundle
// GET /api/reports/executive — single-roundtrip executive payload:
// portfolios, project KPIs, financial roll-up, EVM averages, top risks, alerts,
// overdue milestones, capacity hot spots, health changes, governance queue.
// Batched queries — no per-row N+1 (bounded per-project loop only for EVM).

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { computeEVM } from "@/lib/engines/evm";
import { round2 } from "@/lib/constants";

interface TaskEvmRow {
  projectId: string;
  plannedCost: number;
  plannedHours: number;
  progress: number;
  startDate: Date | null;
  endDate: Date | null;
}

export const GET = withApi(async () => {
  const now = new Date();
  const activeProjects = await db.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, name: true },
  });
  const activeIds = activeProjects.map((p) => p.id);
  const activeProjectTasksP: Promise<TaskEvmRow[]> = activeIds.length
    ? db.task.findMany({
        where: { projectId: { in: activeIds } },
        select: { projectId: true, plannedCost: true, plannedHours: true, progress: true, startDate: true, endDate: true },
      })
    : Promise.resolve([]);

  const [
    portfolios,
    programCounts,
    projectFinancials,
    statusCounts,
    ragCounts,
    healthAvg,
    activeProjectTasksResolved,
    latestEvmPeriods,
    topRisks,
    openAlerts,
    overdueMsList,
    overdueMsCount,
    allocationSums,
    recentSnapshots,
    pendingGates,
    queueCRs,
    totalProjects,
  ] = await Promise.all([
    db.portfolio.findMany({
      include: { _count: { select: { programs: true, projects: true } } },
      orderBy: { code: "asc" },
    }),
    db.program.groupBy({ by: ["portfolioId"], _count: { id: true } }),
    db.project.groupBy({
      by: ["portfolioId"],
      _sum: { baselineBudget: true, currentBudget: true, actualCost: true, forecastCost: true },
      _count: { id: true },
    }),
    db.project.groupBy({ by: ["status"], _count: { id: true } }),
    db.project.groupBy({ by: ["ragStatus"], _count: { id: true } }),
    db.project.aggregate({ _avg: { healthScore: true } }),
    activeProjectTasksP,
    db.evmPeriod.findMany({
      where: { projectId: { in: activeIds } },
      orderBy: { statusDate: "desc" },
      select: { projectId: true, cpi: true, spi: true, statusDate: true },
    }),
    db.risk.findMany({
      where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } },
      orderBy: { score: "desc" },
      take: 5,
      include: { project: { select: { code: true, name: true } } },
    }),
    db.alertEvent.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { project: { select: { code: true, name: true } } },
    }),
    db.milestone.findMany({
      where: { dueDate: { lt: now }, status: { not: "COMPLETED" } },
      orderBy: { dueDate: "asc" },
      take: 10,
      include: { project: { select: { code: true, name: true } } },
    }),
    db.milestone.count({ where: { dueDate: { lt: now }, status: { not: "COMPLETED" } } }),
    db.assignment.groupBy({
      by: ["resourceId"],
      where: { status: "ACTIVE" },
      _sum: { allocationPercent: true },
      orderBy: { _sum: { allocationPercent: "desc" } },
    }),
    db.projectHealthSnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 80,
      include: { project: { select: { code: true, name: true } } },
    }),
    db.stageGate.findMany({
      where: { decisionStatus: "PENDING" },
      orderBy: { plannedDate: "asc" },
      take: 10,
      include: { project: { select: { code: true, name: true } } },
    }),
    db.changeRequest.findMany({
      where: { status: { in: ["ASSESSMENT", "APPROVAL"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { project: { select: { code: true, name: true } } },
    }),
    db.project.count(),
  ]);

  // ---- Financial roll-up per portfolio ----
  const finByPortfolio = new Map(projectFinancials.map((f) => [f.portfolioId, f]));
  const progCountByPortfolio = new Map(programCounts.map((p) => [p.portfolioId, p._count.id]));

  // ---- EVM portfolio averages: per active project use latest stored period, else compute ----
  const latestPeriodByProject = new Map<string, { cpi: number; spi: number }>();
  for (const period of latestEvmPeriods) {
    if (!latestPeriodByProject.has(period.projectId)) latestPeriodByProject.set(period.projectId, { cpi: period.cpi, spi: period.spi });
  }
  const activeProjectTasks: TaskEvmRow[] = activeProjectTasksResolved;
  const tasksByProject = new Map<string, TaskEvmRow[]>();
  for (const t of activeProjectTasks) {
    const arr = tasksByProject.get(t.projectId);
    if (arr) arr.push(t);
    else tasksByProject.set(t.projectId, [t]);
  }
  const projects = await db.project.findMany({
    where: { id: { in: activeIds } },
    select: { id: true, actualCost: true, currentBudget: true, baselineBudget: true, statusDate: true },
  });
  const projectEvm = projects.map((p) => {
    const stored = latestPeriodByProject.get(p.id);
    if (stored) return { projectId: p.id, cpi: stored.cpi, spi: stored.spi, source: "EVM_PERIOD" as const };
    const tasks = tasksByProject.get(p.id) ?? [];
    const evm = computeEVM(tasks, p.actualCost, p.currentBudget || p.baselineBudget || null, p.statusDate || now);
    return { projectId: p.id, cpi: evm.cpi, spi: evm.spi, source: "COMPUTED" as const };
  });
  const avg = (nums: number[]): number => (nums.length ? round2(nums.reduce((s, n) => s + n, 0) / nums.length) : 1);
  const evmAverages = {
    projectCount: projectEvm.length,
    meanCpi: avg(projectEvm.map((e) => e.cpi)),
    meanSpi: avg(projectEvm.map((e) => e.spi)),
    perProject: projectEvm.map((e) => ({ ...e, project: activeProjects.find((p) => p.id === e.projectId) })),
  };

  // ---- Capacity hot spots: top 5 overallocated (Σ allocation > 100%) ----
  const overAllocated = allocationSums.filter((a) => (a._sum.allocationPercent ?? 0) > 100).slice(0, 5);
  const hotSpotResources = overAllocated.length
    ? await db.resource.findMany({
        where: { id: { in: overAllocated.map((a) => a.resourceId) } },
        select: { id: true, name: true, employeeCode: true, title: true, capacityHoursPerWeek: true, availabilityStatus: true },
      })
    : [];
  const capacityHotSpots = overAllocated.map((a) => {
    const r = hotSpotResources.find((x) => x.id === a.resourceId);
    const allocated = round2(a._sum.allocationPercent ?? 0);
    return {
      resourceId: a.resourceId,
      name: r?.name ?? "Unknown",
      employeeCode: r?.employeeCode,
      title: r?.title,
      allocatedPercent: allocated,
      overAllocatedPercent: round2(allocated - 100),
    };
  });

  // ---- Recent health changes: snapshots where RAG differs from the prior snapshot ----
  const healthChanges: { projectId: string; projectCode: string; projectName: string; capturedAt: Date; ragStatus: string; previousRag: string; healthScore: number }[] = [];
  const seenProjects = new Set<string>();
  for (let i = 0; i < recentSnapshots.length && healthChanges.length < 10; i++) {
    const snap = recentSnapshots[i];
    const prior = recentSnapshots[i + 1] && recentSnapshots[i + 1].projectId === snap.projectId ? recentSnapshots[i + 1] : null;
    if (prior && prior.ragStatus !== snap.ragStatus && !seenProjects.has(snap.projectId)) {
      seenProjects.add(snap.projectId);
      healthChanges.push({
        projectId: snap.projectId, projectCode: snap.project.code, projectName: snap.project.name,
        capturedAt: snap.capturedAt, ragStatus: snap.ragStatus, previousRag: prior.ragStatus, healthScore: snap.healthScore,
      });
    }
  }

  return ok({
    generatedAt: now.toISOString(),
    portfolios: portfolios.map((pf) => {
      const fin = finByPortfolio.get(pf.id);
      return {
        id: pf.id, code: pf.code, name: pf.name, status: pf.status, ragStatus: pf.ragStatus,
        healthScore: pf.healthScore, ownerId: pf.ownerId,
        programCount: progCountByPortfolio.get(pf.id) ?? 0,
        projectCount: fin?._count.id ?? pf._count.projects,
        programs: pf._count.programs,
        budgetTarget: pf.budgetTarget,
        sums: {
          baselineBudget: round2(fin?._sum.baselineBudget ?? 0),
          currentBudget: round2(fin?._sum.currentBudget ?? 0),
          actualCost: round2(fin?._sum.actualCost ?? 0),
          forecastCost: round2(fin?._sum.forecastCost ?? 0),
        },
      };
    }),
    projectKpis: {
      total: totalProjects,
      byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count.id })),
      byRag: ragCounts.map((r) => ({ rag: r.ragStatus, count: r._count.id })),
      avgHealthScore: round2(healthAvg._avg.healthScore ?? 0),
    },
    financials: {
      baselineBudget: round2(projectFinancials.reduce((s, f) => s + (f._sum.baselineBudget ?? 0), 0)),
      currentBudget: round2(projectFinancials.reduce((s, f) => s + (f._sum.currentBudget ?? 0), 0)),
      actualCost: round2(projectFinancials.reduce((s, f) => s + (f._sum.actualCost ?? 0), 0)),
      forecastCost: round2(projectFinancials.reduce((s, f) => s + (f._sum.forecastCost ?? 0), 0)),
    },
    evmAverages,
    topRisks: topRisks.map((r) => ({ id: r.id, code: r.code, title: r.title, score: r.score, severity: r.severity, status: r.status, projectCode: r.project.code, projectName: r.project.name })),
    openAlerts: openAlerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, alertType: a.alertType, createdAt: a.createdAt, projectCode: a.project?.code ?? null })),
    overdueMilestones: { count: overdueMsCount, list: overdueMsList.map((m) => ({ id: m.id, code: m.code, name: m.name, dueDate: m.dueDate, projectCode: m.project.code })) },
    capacityHotSpots,
    recentHealthChanges: healthChanges,
    governanceQueue: {
      pendingGates: pendingGates.map((g) => ({ id: g.id, code: g.code, name: g.name, plannedDate: g.plannedDate, projectCode: g.project.code })),
      changeRequests: queueCRs.map((cr) => ({ id: cr.id, code: cr.code, title: cr.title, status: cr.status, priority: cr.priority, projectCode: cr.project.code })),
    },
  });
}, { permission: "executive.view", rateLimit: { limit: 300, windowMs: 60_000 } });
