// PM CONTROL TOWER — Field reporting API (Form Tab Builder analytics)
// GET /api/fields/report?scope=tab|mapped|all&tabId=…
//   tab    — every field mapped to one tab (default when tabId is given)
//   mapped — every field mapped to at least one tab
//   all    — the whole dictionary (including never-mapped fields)
// For each field: coverage (fill rate across projects), distinct values,
// numeric / date statistics and top values for choice fields — so admins can
// see what is actually being captured and where tracking has gaps.

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { parseCustomData, computeFieldStats, type FieldDef, type CustomData } from "@/lib/engines/custom-fields";

interface FieldMeta {
  def: FieldDef;
  required: boolean;
  showInReport: boolean;
  tabs: string[];
  displayOrder: number;
}

const isEmptyValue = (v: CustomData[string]) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

export const GET = withApi(async (ctx) => {
  const tabId = ctx.searchParams.get("tabId") || null;
  const requested = ctx.searchParams.get("scope") || (tabId ? "tab" : "mapped");
  if (!["tab", "mapped", "all"].includes(requested)) throw new ApiError(400, `Invalid scope "${requested}"`);
  const scope = requested as "tab" | "mapped" | "all";
  if (scope === "tab" && !tabId) throw new ApiError(400, "tabId is required for scope=tab");

  const allTabs = await db.projectTab.findMany({
    include: { fields: { orderBy: { displayOrder: "asc" }, include: { field: true } } },
    orderBy: { order: "asc" },
  });

  const meta = new Map<string, FieldMeta>();
  const touch = (m: FieldMeta, tabName: string, flags: { required: boolean; showInReport: boolean }) => {
    if (!m.tabs.includes(tabName)) m.tabs.push(tabName);
    m.required = m.required || flags.required;
    m.showInReport = m.showInReport || flags.showInReport;
  };

  if (scope === "tab") {
    const tab = allTabs.find((t) => t.id === tabId);
    if (!tab) throw new ApiError(404, "Tab not found");
    tab.fields.forEach((m, i) => {
      meta.set(m.field.id, {
        def: m.field,
        required: m.isRequired,
        showInReport: m.showInReport,
        tabs: [tab.name],
        displayOrder: i,
      });
    });
  } else {
    for (const tab of allTabs) {
      tab.fields.forEach((m, i) => {
        const existing = meta.get(m.field.id);
        if (existing) {
          touch(existing, tab.name, { required: m.isRequired, showInReport: m.showInReport });
        } else {
          meta.set(m.field.id, {
            def: m.field,
            required: m.isRequired,
            showInReport: m.showInReport,
            tabs: [tab.name],
            displayOrder: i,
          });
        }
      });
    }
    if (scope === "all") {
      const known = new Set(meta.keys());
      const rest = await db.customFieldDefinition.findMany({ orderBy: { label: "asc" } });
      rest.forEach((f) => {
        if (known.has(f.id)) return;
        meta.set(f.id, { def: f, required: false, showInReport: false, tabs: [], displayOrder: 9999 });
      });
    }
  }

  const projects = await db.project.findMany({ select: { id: true, customData: true } });
  const parsed = projects.map((p) => parseCustomData(p.customData));

  const rows = [...meta.values()].map((m) => ({
    ...computeFieldStats(m.def, parsed.map((c) => c[m.def.fieldKey])),
    required: m.required,
    showInReport: m.showInReport,
    isActive: m.def.isActive,
    tabs: m.tabs,
    tabCount: m.tabs.length,
    displayOrder: m.displayOrder,
  }));
  rows.sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));

  const active = rows.filter((r) => r.isActive);
  const requiredRows = rows.filter((r) => r.required);
  const requiredGaps = requiredRows.reduce((s, r) => s + (r.total - r.filled), 0);
  const incompleteProjects = parsed.filter((c) => requiredRows.some((r) => isEmptyValue(c[r.fieldKey]))).length;

  return ok({
    scope,
    tabId,
    projectCount: projects.length,
    rows,
    summary: {
      fieldCount: rows.length,
      activeFieldCount: active.length,
      avgFillRatePct: active.length
        ? Math.round(active.reduce((s, r) => s + r.fillRatePct, 0) / active.length)
        : 0,
      populatedValues: rows.reduce((s, r) => s + r.filled, 0),
      requiredFields: requiredRows.length,
      requiredGaps,
      incompleteProjects,
      reportableFields: rows.filter((r) => r.showInReport).length,
    },
  });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });
