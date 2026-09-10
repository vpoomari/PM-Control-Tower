// PM CONTROL TOWER — Capacity Heatmap API
// GET /api/capacity?weeks=8 — weekly capacity vs allocation per ACTIVE resource

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { startOfWeek, addDays, round2, safeDiv } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const weeksParam = Number(ctx.searchParams.get("weeks") || 8);
  const n = Math.max(1, Math.min(26, Number.isFinite(weeksParam) ? Math.floor(weeksParam) : 8));

  const resources = await db.resource.findMany({
    where: { isActive: true },
    include: { assignments: { where: { status: "ACTIVE" } } },
    orderBy: { name: "asc" },
  });

  const base = startOfWeek(new Date());
  const weeks: string[] = [];
  const weekBounds: { start: number; end: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ws = addDays(base, i * 7);
    weeks.push(ws.toISOString().slice(0, 10));
    weekBounds.push({ start: ws.getTime(), end: addDays(ws, 6).getTime() });
  }

  const rows = resources.map((r) => {
    const capacity = r.capacityHoursPerWeek || 40;
    const cells = weeks.map((week, idx) => {
      const { start, end } = weekBounds[idx];
      let allocated = 0;
      for (const a of r.assignments) {
        const s = a.startDate ? a.startDate.getTime() : Number.NEGATIVE_INFINITY;
        const e = a.endDate ? a.endDate.getTime() : Number.POSITIVE_INFINITY;
        if (s <= end && e >= start) allocated += (a.allocationPercent / 100) * 40;
      }
      allocated = round2(allocated);
      const utilizationPct = round2(safeDiv(allocated, capacity, 0) * 100);
      return { week, allocated, capacity, utilizationPct, overallocated: allocated > capacity };
    });
    const totalAllocated = round2(cells.reduce((s, c) => s + c.allocated, 0));
    const totalCapacity = round2(cells.reduce((s, c) => s + c.capacity, 0));
    return {
      resource: {
        id: r.id, name: r.name, employeeCode: r.employeeCode,
        department: r.department, resourceType: r.resourceType, title: r.title,
        capacityHoursPerWeek: r.capacityHoursPerWeek,
      },
      cells,
      totalAllocated,
      totalCapacity,
      avgUtilizationPct: round2(safeDiv(totalAllocated, totalCapacity, 0) * 100),
      peakUtilizationPct: cells.reduce((m, c) => Math.max(m, c.utilizationPct), 0),
      overallocatedWeeks: cells.filter((c) => c.overallocated).length,
    };
  });

  const sumCapacity = round2(rows.reduce((s, r) => s + r.totalCapacity, 0));
  const sumAllocated = round2(rows.reduce((s, r) => s + r.totalAllocated, 0));
  const summary = {
    weekCount: n,
    weekStart: weeks[0],
    resourceCount: rows.length,
    totalCapacity: sumCapacity,
    totalAllocated: sumAllocated,
    avgUtilizationPct: round2(safeDiv(sumAllocated, sumCapacity, 0) * 100),
    overallocatedResources: rows.filter((r) => r.overallocatedWeeks > 0).length,
  };

  return ok({ weeks, rows, summary });
}, { permission: "resource.view", rateLimit: { limit: 300, windowMs: 60_000 } });
