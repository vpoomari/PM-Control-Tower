"use client";
// PM CONTROL TOWER — ADMIN · Form Tab Builder
// Dynamic Field Configuration Engine. Build the custom tabs shown on every
// project workspace:
//   • assign dictionary fields with a list-to-list selector (order = display order)
//   • per-field settings on the tab: required, read-only, full width, in report
//   • create a field inline and drop it straight onto the tab
//   • preview the tab exactly as users see it
//   • field reporting: coverage, gaps and value statistics across projects
//   • export / import / duplicate the whole tab configuration

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import {
  PageHeader, SectionCard, StatCard, SearchInput, Button, Input, LoadingBlock, ErrorBlock,
  EmptyState, StatusChip, ConfirmButton, DataTable, Column, cn,
} from "@/components/pmct/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DynamicFormRenderer from "@/components/pmct/DynamicFormRenderer";
import {
  FIELD_DATA_TYPES,
  ruleSummary,
  type CustomData,
  type FieldConfig,
  type FieldDataType,
  type HydratedTab,
  type TabField,
} from "@/lib/engines/custom-fields";
import {
  GripVertical, Plus, Pencil, RefreshCw, Save, ChevronUp, ChevronDown, X, ArrowRight, ArrowLeft,
  PanelsTopLeft, Copy, Download, Upload, Eye, BarChart3, Lock, StretchHorizontal, Radar,
} from "lucide-react";

// Stable empty data reference — a fresh {} every render would re-trigger the
// preview renderer's hydration effect.
const EMPTY_CUSTOM_DATA: CustomData = {};

interface FieldRow {
  id: string;
  fieldKey: string;
  label: string;
  dataType: string;
  options: string[] | null;
  config: FieldConfig | null;
  description: string | null;
  isActive: boolean;
  tabCount: number;
}

type FlagKey = "isRequired" | "isReadOnly" | "fullWidth" | "showInReport";
interface DraftEntry {
  fieldId: string;
  isRequired: boolean;
  isReadOnly: boolean;
  fullWidth: boolean;
  showInReport: boolean;
}

interface ReportRow {
  fieldKey: string; label: string; dataType: string; unit: string | null;
  total: number; filled: number; fillRatePct: number; distinct: number;
  numeric: { min: number; max: number; avg: number; sum: number } | null;
  dates: { earliest: string; latest: string } | null;
  topValues: { value: string; count: number; pct: number }[];
  required: boolean; showInReport: boolean; isActive: boolean;
  tabs: string[]; tabCount: number; displayOrder: number;
}
interface ReportData {
  scope: string; projectCount: number; rows: ReportRow[];
  summary: {
    fieldCount: number; activeFieldCount: number; avgFillRatePct: number;
    populatedValues: number; requiredFields: number; requiredGaps: number;
    incompleteProjects: number; reportableFields: number;
  };
}
interface ImportDoc {
  version?: number;
  fields: { fieldKey: string; label: string; dataType: string; options?: string[] | null; config?: Record<string, unknown> | null; description?: string | null; isActive?: boolean }[];
  tabs: { name: string; order?: number; description?: string | null; fields: { fieldKey: string; isRequired?: boolean; isReadOnly?: boolean; fullWidth?: boolean; showInReport?: boolean }[] }[];
}
interface ImportStats {
  fieldsCreated: number; fieldsUpdated: number;
  tabsCreated: number; tabsUpdated: number; mappingsApplied: number;
}

const TYPE_TONE: Record<string, string> = {
  TEXT: "bg-slate-100 text-slate-600 border-slate-200",
  NUMBER: "bg-blue-50 text-blue-700 border-blue-200",
  DATE: "bg-violet-50 text-violet-700 border-violet-200",
  BOOLEAN: "bg-amber-50 text-amber-700 border-amber-200",
  DROPDOWN: "bg-emerald-50 text-emerald-700 border-emerald-200",
  USER_LOOKUP: "bg-cyan-50 text-cyan-700 border-cyan-200",
  EMAIL: "bg-teal-50 text-teal-700 border-teal-200",
  URL: "bg-indigo-50 text-indigo-700 border-indigo-200",
  PHONE: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  MULTI_SELECT: "bg-lime-50 text-lime-700 border-lime-200",
};

function TypeChip({ dataType }: { dataType: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", TYPE_TONE[dataType] || "bg-slate-100 text-slate-600 border-slate-200")}>
      {dataType}
    </span>
  );
}

/** Compact per-field settings toggle rendered inside the assigned list. */
function Flag({ on, onClick, title, tone, children }: {
  on: boolean; onClick: () => void; title: string; tone: "blue" | "amber" | "violet" | "emerald"; children: React.ReactNode;
}) {
  const tones = {
    blue: "border-blue-300 bg-blue-50 text-blue-700",
    amber: "border-amber-300 bg-amber-50 text-amber-700",
    violet: "border-violet-300 bg-violet-50 text-violet-700",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-700",
  };
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
        on ? tones[tone] : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-500",
      )}
    >
      {children}
    </button>
  );
}

/** What the reporting table shows in its "Insight" column. */
function insight(r: ReportRow): string {
  if (r.numeric) {
    return `avg ${r.numeric.avg}${r.unit ? ` ${r.unit}` : ""} · ${r.numeric.min}–${r.numeric.max} · Σ ${r.numeric.sum}`;
  }
  if (r.dates) return `${r.dates.earliest} → ${r.dates.latest}`;
  if (r.topValues.length) return r.topValues.slice(0, 3).map((t) => `${t.value} ${t.pct}%`).join(" · ");
  return `${r.distinct} distinct value${r.distinct === 1 ? "" : "s"}`;
}

const EMPTY_QUICK = { fieldKey: "", label: "", dataType: "TEXT" as FieldDataType, options: [] as string[], description: "" };

export default function TabBuilder() {
  const tabsApi = useApi<{ tabs: HydratedTab[] }>("/api/tabs");
  const fieldsApi = useApi<{ fields: FieldRow[]; total: number }>("/api/fields?take=600");

  const tabs = tabsApi.data?.tabs ?? [];
  const allFields = fieldsApi.data?.fields ?? [];
  const fieldById = useMemo(() => new Map(allFields.map((f) => [f.id, f])), [allFields]);

  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableSel, setAvailableSel] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [addAsRequired, setAddAsRequired] = useState(false);

  // create-tab dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // edit-tab dialog (double-click a tab or press the pencil)
  const [editTab, setEditTab] = useState<HydratedTab | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // preview
  const [previewOpen, setPreviewOpen] = useState(false);

  // inline field creation
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState({ ...EMPTY_QUICK });
  const [quickOption, setQuickOption] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  // export / import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importDoc, setImportDoc] = useState<ImportDoc | null>(null);
  const [importing, setImporting] = useState(false);

  // reporting
  const [reportScope, setReportScope] = useState<"tab" | "mapped" | "all">("tab");
  const [reportableOnly, setReportableOnly] = useState(true);

  // select the first tab by default; re-sync draft when the selection changes
  useEffect(() => {
    if (!selectedTabId && tabs.length) setSelectedTabId(tabs[0].id);
  }, [tabs, selectedTabId]);

  useEffect(() => {
    const tab = tabs.find((t) => t.id === selectedTabId);
    setDraft(tab
      ? tab.fields.map((f) => ({
          fieldId: fieldIdOf(f),
          isRequired: f.isRequired,
          isReadOnly: f.isReadOnly,
          fullWidth: f.fullWidth,
          showInReport: f.showInReport,
        }))
      : []);
    setDirty(false);
    setAvailableSel(new Set());
  }, [selectedTabId, tabsApi.data]);

  const selectedTab = tabs.find((t) => t.id === selectedTabId) ?? null;

  // ---- reporting ----
  const reportScopeKey = reportScope === "tab" && !selectedTabId ? "mapped" : reportScope;
  const reportPath = `/api/fields/report?scope=${reportScopeKey}${reportScopeKey === "tab" && selectedTabId ? `&tabId=${selectedTabId}` : ""}`;
  const reportApi = useApi<ReportData>(reportPath, [reportPath]);
  const summary = reportApi.data?.summary;
  const reportRows = (reportApi.data?.rows ?? []).filter((r) => !reportableOnly || r.showInReport);

  // ---- draft-derived counts ----
  const requiredCount = draft.filter((d) => d.isRequired).length;
  const readOnlyCount = draft.filter((d) => d.isReadOnly).length;
  const fullWidthCount = draft.filter((d) => d.fullWidth).length;
  const reportFlaggedCount = draft.filter((d) => d.showInReport).length;

  // available = active fields NOT on the draft (search-filtered)
  const assignedIds = useMemo(() => new Set(draft.map((d) => d.fieldId)), [draft]);
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allFields
      .filter((f) => f.isActive && !assignedIds.has(f.id))
      .filter((f) => !q || f.label.toLowerCase().includes(q) || f.fieldKey.toLowerCase().includes(q));
  }, [allFields, assignedIds, search]);

  // preview reflects the UNSAVED draft so admins can check before saving
  const previewTab = useMemo<HydratedTab | null>(() => {
    if (!selectedTab) return null;
    const fields: TabField[] = [];
    draft.forEach((entry, i) => {
      const f = fieldById.get(entry.fieldId);
      if (!f) return;
      fields.push({
        displayOrder: (i + 1) * 10,
        isRequired: entry.isRequired,
        isReadOnly: entry.isReadOnly,
        fullWidth: entry.fullWidth,
        showInReport: entry.showInReport,
        field: {
          id: f.id, fieldKey: f.fieldKey, label: f.label, dataType: f.dataType,
          options: f.options, config: f.config, description: f.description, isActive: f.isActive,
        },
      });
    });
    return { ...selectedTab, fields };
  }, [selectedTab, draft, fieldById]);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= draft.length) return;
    setDraft((prev) => {
      const next = [...prev];
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const addSelected = () => {
    if (!availableSel.size) return;
    const additions = available.filter((f) => availableSel.has(f.id)).map((f) => ({
      fieldId: f.id,
      isRequired: addAsRequired,
      isReadOnly: false,
      fullWidth: false,
      showInReport: true,
    }));
    setDraft((prev) => [...prev, ...additions]);
    setDirty(true);
    setAvailableSel(new Set());
  };

  const removeAt = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const toggleFlag = (index: number, key: FlagKey) => {
    setDraft((prev) => prev.map((d, i) => {
      if (i !== index) return d;
      const next: DraftEntry = { ...d };
      next[key] = !d[key];
      return next;
    }));
    setDirty(true);
  };

  const saveMapping = async () => {
    if (!selectedTabId) return;
    setSaving(true);
    try {
      await api.post("/api/tabs/map", { tabId: selectedTabId, fields: draft });
      toast.success(`"${selectedTab?.name}" updated — ${draft.length} field(s)`);
      await Promise.all([tabsApi.refetch(), reportApi.refetch()]);
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createTab = async () => {
    if (!newName.trim()) { toast.error("Tab name is required"); return; }
    setCreating(true);
    try {
      const tab = await api.post<HydratedTab>("/api/tabs", {
        name: newName.trim(),
        description: newDesc.trim() || null,
      });
      toast.success(`Tab "${tab.name}" created`);
      setNewOpen(false);
      setNewName("");
      setNewDesc("");
      await tabsApi.refetch();
      setSelectedTabId(tab.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const renameTab = async (tab: HydratedTab, name: string) => {
    if (!name.trim() || name === tab.name) return;
    try {
      await api.patch(`/api/tabs/${tab.id}`, { name: name.trim() });
      toast.success("Tab renamed");
      await tabsApi.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  };

  const openEditTab = (tab: HydratedTab) => {
    setEditTab(tab);
    setEditName(tab.name);
    setEditDesc(tab.description ?? "");
  };
  const saveTabRename = async () => {
    if (!editTab) return;
    if (!editName.trim()) { toast.error("Tab name is required"); return; }
    setEditSaving(true);
    try {
      await api.patch(`/api/tabs/${editTab.id}`, { name: editName.trim(), description: editDesc.trim() || null });
      toast.success(`Tab updated — "${editName.trim()}"`);
      setEditTab(null);
      await tabsApi.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  };

  const moveTab = async (tab: HydratedTab, dir: -1 | 1) => {
    const idx = tabs.findIndex((t) => t.id === tab.id);
    const target = idx + dir;
    if (target < 0 || target >= tabs.length) return;
    try {
      await Promise.all([
        api.patch(`/api/tabs/${tab.id}`, { order: tabs[target].order }),
        api.patch(`/api/tabs/${tabs[target].id}`, { order: tab.order }),
      ]);
      await tabsApi.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  };

  const duplicateTab = async (tab: HydratedTab) => {
    try {
      const copy = await api.post<HydratedTab>(`/api/tabs/${tab.id}/duplicate`);
      await tabsApi.refetch();
      setSelectedTabId(copy.id);
      toast.success(`Duplicated "${tab.name}" → "${copy.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
    }
  };

  const deleteTab = async (tab: HydratedTab) => {
    try {
      await api.del(`/api/tabs/${tab.id}`);
      toast.success(`Tab "${tab.name}" deleted`);
      if (selectedTabId === tab.id) setSelectedTabId(null);
      await tabsApi.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // ---- inline field creation (stays in the builder) ----
  const openQuickCreate = () => { setQuick({ ...EMPTY_QUICK }); setQuickOption(""); setQuickOpen(true); };

  const addQuickOption = () => {
    const v = quickOption.trim();
    if (!v) return;
    if (quick.options.includes(v)) { toast.error("Option already exists"); return; }
    setQuick({ ...quick, options: [...quick.options, v] });
    setQuickOption("");
  };

  const createQuickField = async () => {
    if (!quick.label.trim()) { toast.error("Label is required"); return; }
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(quick.fieldKey)) { toast.error("Field key must be snake_case (a-z, 0-9, _)"); return; }
    const needsOptions = quick.dataType === "DROPDOWN" || quick.dataType === "MULTI_SELECT";
    if (needsOptions && quick.options.length === 0) { toast.error(`${quick.dataType} fields need at least one option`); return; }
    setQuickSaving(true);
    try {
      const created = await api.post<FieldRow>("/api/fields", {
        fieldKey: quick.fieldKey.trim(),
        label: quick.label.trim(),
        dataType: quick.dataType,
        options: needsOptions ? quick.options : undefined,
        description: quick.description.trim() || undefined,
      });
      if (selectedTabId) {
        const newEntry: DraftEntry = {
          fieldId: created.id, isRequired: false, isReadOnly: false, fullWidth: false, showInReport: true,
        };
        setDraft((d) => [...d, newEntry]);
        setDirty(true);
      }
      setQuickOpen(false);
      await fieldsApi.refetch();
      toast.success(`Field "${created.label}" created${selectedTabId ? " and added to this tab" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setQuickSaving(false);
    }
  };

  // ---- export / import ----
  const exportConfig = async () => {
    try {
      const doc = await api.get<ImportDoc>("/api/tabs/export");
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pmct-form-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${doc.fields.length} field(s) and ${doc.tabs.length} tab(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text()) as ImportDoc;
      if (!Array.isArray(doc?.fields) || !Array.isArray(doc?.tabs)) {
        throw new Error("That file is not a Form Tab Builder export document");
      }
      setImportDoc(doc);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the file");
    }
  };

  const runImport = async () => {
    if (!importDoc) return;
    setImporting(true);
    try {
      const res = await api.post<ImportStats>("/api/tabs/import", importDoc);
      toast.success(`Import applied — ${res.fieldsCreated + res.fieldsUpdated} field(s), ${res.tabsCreated + res.tabsUpdated} tab(s), ${res.mappingsApplied} mapping(s)`);
      setImportDoc(null);
      await Promise.all([tabsApi.refetch(), fieldsApi.refetch(), reportApi.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (tabsApi.loading && !tabsApi.data) return <LoadingBlock label="Loading tabs…" />;
  if (tabsApi.error) return <ErrorBlock message={tabsApi.error} onRetry={tabsApi.refetch} />;

  const reportColumns: Column<ReportRow & Record<string, unknown>>[] = [
    {
      key: "label", header: "Field",
      render: (r) => (
        <div className="min-w-[180px]">
          <p className="flex items-center gap-1.5 font-medium text-slate-800">
            {r.label}
            {!r.isActive && <span className="rounded border border-slate-200 bg-slate-50 px-1 text-[9px] font-semibold uppercase text-slate-400">inactive</span>}
          </p>
          <p className="font-mono text-[11px] text-slate-400">{r.fieldKey}</p>
        </div>
      ),
    },
    { key: "dataType", header: "Type", render: (r) => <TypeChip dataType={r.dataType} /> },
    {
      key: "tabs", header: "Tabs",
      render: (r) => <span className="text-xs text-slate-500" title={r.tabs.join(", ") || "Not on any tab"}>{r.tabs.join(", ") || "—"}</span>,
    },
    {
      key: "required", header: "Required",
      render: (r) => (r.required
        ? <span className="text-xs font-semibold text-blue-600" title="Marked required on at least one tab">Yes</span>
        : <span className="text-xs text-slate-300">—</span>),
    },
    {
      key: "fillRatePct", header: "Coverage",
      render: (r) => {
        const tone = r.fillRatePct >= 90 ? "bg-emerald-500" : r.fillRatePct >= 50 ? "bg-amber-500" : "bg-red-500";
        const gap = r.required && r.fillRatePct < 100;
        return (
          <div className="flex min-w-[150px] items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", tone)} style={{ width: `${r.fillRatePct}%` }} />
            </div>
            <span className="w-9 text-right text-xs tabular-nums text-slate-600">{r.fillRatePct}%</span>
            {gap && <span className="rounded border border-red-200 bg-red-50 px-1 text-[9px] font-semibold text-red-600">GAP</span>}
          </div>
        );
      },
    },
    {
      key: "filled", header: "Values",
      render: (r) => <span className="text-xs tabular-nums text-slate-500">{r.filled}/{r.total} · {r.distinct} distinct</span>,
    },
    { key: "insight", header: "Insight", render: (r) => <span className="text-xs text-slate-600">{insight(r)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Form Tab Builder"
        breadcrumb={["Administration", "Form Tab Builder"]}
        subtitle="Compose the custom tabs on every project workspace — assign dictionary fields, set per-field rules, preview the form, report on coverage, and export or import the whole configuration."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={tabsApi.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} title="Import a configuration document exported earlier">
              <Upload className="h-4 w-4 mr-1.5" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={exportConfig} title="Download fields + tabs + settings as JSON">
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New tab</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tabs" value={tabs.length} sub="on every project workspace" icon={<PanelsTopLeft className="h-4 w-4" />} />
        <StatCard
          label="Fields on this tab"
          value={draft.length}
          sub={selectedTab ? `${allFields.length} in the dictionary` : "select a tab"}
          tone="info"
          icon={<GripVertical className="h-4 w-4" />}
        />
        <StatCard
          label="Enforced"
          value={requiredCount}
          sub={`${readOnlyCount} locked · ${fullWidthCount} full width · ${reportFlaggedCount} in report`}
          tone={requiredCount ? "good" : "default"}
          icon={<Lock className="h-4 w-4" />}
        />
        <StatCard
          label="Avg coverage"
          value={summary ? `${summary.avgFillRatePct}%` : "—"}
          sub={summary ? `across ${reportApi.data?.projectCount ?? 0} project(s) · ${summary.requiredGaps} required gap(s)` : "loading…"}
          tone={summary && summary.requiredGaps ? "warn" : "good"}
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] items-start">
        {/* Tab list */}
        <SectionCard title={`Tabs (${tabs.length})`} description="Shown on the project workspace in this order">
          {tabs.length === 0 ? (
            <EmptyState title="No tabs yet" description="Create your first tab, then assign fields to it." />
          ) : (
            <div className="space-y-1.5">
              {tabs.map((t, i) => (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-lg border p-2.5 cursor-pointer transition-colors",
                    t.id === selectedTabId ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                  onClick={() => setSelectedTabId(t.id)}
                  onDoubleClick={() => openEditTab(t)}
                  title="Double-click to edit this tab"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                    <input
                      className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-800 outline-none focus:bg-white rounded px-1 py-0.5"
                      defaultValue={t.name}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onBlur={(e) => renameTab(t, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <span className="text-[10px] tabular-nums text-slate-400">{t.fields.length}f</span>
                  </div>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 pl-5 text-[11px] leading-snug text-slate-400">{t.description}</p>
                  )}
                  <div className="mt-1.5 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit tab (or double-click)" onClick={() => openEditTab(t)}><Pencil className="h-3.5 w-3.5 text-slate-500" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => moveTab(t, -1)} title="Move up"><ChevronUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === tabs.length - 1} onClick={() => moveTab(t, 1)} title="Move down"><ChevronDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => duplicateTab(t)} title="Duplicate this tab (with every field setting)"><Copy className="h-3.5 w-3.5 text-slate-500" /></Button>
                    </div>
                    <ConfirmButton
                      title={`Delete tab "${t.name}"?`}
                      description="Field assignments are removed. Stored values on projects are kept (re-assigning the field shows them again)."
                      confirmLabel="Delete tab" variant="destructive"
                      onConfirm={() => deleteTab(t)}
                    >
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-600" title="Delete"><X className="h-3.5 w-3.5" /></Button>
                    </ConfirmButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Field assignment */}
        {selectedTab ? (
          <SectionCard
            title={`Fields on "${selectedTab.name}"`}
            description={fieldsApi.data && fieldsApi.data.total > allFields.length
              ? `Showing ${allFields.length} of ${fieldsApi.data.total} fields — refine with search`
              : "Left: available fields · Right: assigned fields (top→bottom = display order) with their settings"}
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={!draft.length} title="Render this tab exactly as users see it">
                  <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                </Button>
                <Button size="sm" onClick={saveMapping} disabled={!dirty || saving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : dirty ? "Save mapping" : "Saved"}
                </Button>
              </>
            }
          >
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] items-start">
              {/* Available */}
              <div className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-100 px-3 py-2 bg-slate-50 rounded-t-lg">
                  <SearchInput value={search} onChange={setSearch} placeholder="Search available fields…" className="w-full" />
                </div>
                <div className="max-h-[440px] overflow-y-auto p-1.5 space-y-0.5">
                  {available.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6">No available fields{search ? " match your search" : ""}.</p>
                  )}
                  {available.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-blue-600"
                        checked={availableSel.has(f.id)}
                        onChange={(e) => {
                          const next = new Set(availableSel);
                          if (e.target.checked) next.add(f.id); else next.delete(f.id);
                          setAvailableSel(next);
                        }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-slate-700">{f.label}</span>
                        <span className="block truncate font-mono text-[10px] text-slate-400">
                          {f.fieldKey}{ruleSummary(f.config) ? ` · ${ruleSummary(f.config)}` : ""}
                        </span>
                      </span>
                      <TypeChip dataType={f.dataType} />
                    </label>
                  ))}
                </div>
                <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
                  <label className="flex items-center gap-2 px-0.5 text-[11px] text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-blue-600"
                      checked={addAsRequired}
                      onChange={(e) => setAddAsRequired(e.target.checked)}
                    />
                    Add as required
                  </label>
                  <Button size="sm" className="w-full" disabled={!availableSel.size} onClick={addSelected}>
                    <ArrowRight className="h-3.5 w-3.5 mr-1.5" />Add {availableSel.size ? `${availableSel.size} ` : ""}→
                  </Button>
                  <Button size="sm" variant="outline" className="w-full" onClick={openQuickCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />New field on this tab
                  </Button>
                </div>
              </div>

              {/* Move controls */}
              <div className="hidden md:flex flex-col gap-2 pt-20">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={!availableSel.size} onClick={addSelected} title="Add selected">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Assigned (ordered) */}
              <div className="rounded-lg border border-blue-200">
                <div className="border-b border-blue-100 bg-blue-50/60 px-3 py-2 rounded-t-lg flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-700">Assigned — {draft.length} field(s)</span>
                  {dirty && <StatusChip status="UNSAVED" />}
                </div>
                <div className="max-h-[440px] overflow-y-auto p-1.5 space-y-1">
                  {draft.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-6">Nothing assigned yet — select fields on the left and click Add.</p>
                  )}
                  {draft.map((entry, i) => {
                    const f = fieldById.get(entry.fieldId);
                    const rules = f ? ruleSummary(f.config) : null;
                    return (
                      <div key={entry.fieldId} className="rounded-md border border-slate-100 bg-white px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] tabular-nums text-slate-400 w-5 shrink-0">{(i + 1) * 10}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-slate-700">{f?.label ?? entry.fieldId}</p>
                            <p className="truncate font-mono text-[10px] text-slate-400">
                              {f?.fieldKey ?? "—"}{rules ? ` · ${rules}` : ""}
                            </p>
                          </div>
                          {f && <TypeChip dataType={f.dataType} />}
                          <div className="flex shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ChevronUp className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === draft.length - 1} onClick={() => move(i, 1)} title="Move down"><ChevronDown className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => removeAt(i)} title="Remove"><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-7">
                          <Flag on={entry.isRequired} tone="blue" title="Required — saving this tab fails while it is empty" onClick={() => toggleFlag(i, "isRequired")}>req</Flag>
                          <Flag on={entry.isReadOnly} tone="amber" title="Read-only — shown on the form but never editable here" onClick={() => toggleFlag(i, "isReadOnly")}>lock</Flag>
                          <Flag on={entry.fullWidth} tone="violet" title="Full width — spans both form columns" onClick={() => toggleFlag(i, "fullWidth")}>wide</Flag>
                          <Flag on={entry.showInReport} tone="emerald" title="Include in field reporting / coverage" onClick={() => toggleFlag(i, "showInReport")}>rpt</Flag>
                          {rules && <span className="ml-auto text-[10px] text-slate-400">{rules}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-blue-100 px-3 py-2 flex items-center justify-between">
                  <Button variant="outline" size="sm" className="h-7" disabled={!draft.length} onClick={() => { setDraft([]); setDirty(true); }}>
                    <ArrowLeft className="h-3 w-3 mr-1" />Clear all
                  </Button>
                  <span className="text-[10px] text-slate-400">displayOrder 10, 20, 30 …</span>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="Field assignment">
            <EmptyState
              title="Select or create a tab"
              description="Pick a tab on the left (or create one) to assign dictionary fields to it."
              action={<Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New tab</Button>}
            />
          </SectionCard>
        )}
      </div>

      {/* ---- Field reporting ---- */}
      <SectionCard
        title="Field reporting"
        description={`Coverage and value statistics across ${reportApi.data?.projectCount ?? 0} project record(s) — what is actually being captured, and where tracking has gaps.`}
        actions={
          <div className="flex items-center gap-2">
            <Select value={reportScopeKey} onValueChange={(v) => setReportScope(v as "tab" | "mapped" | "all")}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tab" disabled={!selectedTabId}>This tab{selectedTabId ? "" : " (select a tab)"}</SelectItem>
                <SelectItem value="mapped">All mapped fields</SelectItem>
                <SelectItem value="all">Whole dictionary</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={reportApi.refetch}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Switch checked={reportableOnly} onCheckedChange={setReportableOnly} />
              Only fields flagged for reporting ({reportApi.data?.summary.reportableFields ?? 0} of {reportApi.data?.summary.fieldCount ?? 0})
            </label>
            <span className="text-[11px] text-slate-400">
              {reportApi.data
                ? `${reportApi.data.summary.populatedValues} value(s) captured · ${reportApi.data.summary.incompleteProjects} project(s) missing a required field`
                : "Loading coverage…"}
            </span>
          </div>

          {summary && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Avg coverage" value={`${summary.avgFillRatePct}%`} tone={summary.avgFillRatePct >= 80 ? "good" : summary.avgFillRatePct >= 50 ? "warn" : "bad"} />
              <StatCard label="Values captured" value={summary.populatedValues} sub={`over ${reportApi.data?.projectCount ?? 0} project(s)`} tone="info" />
              <StatCard label="Required gaps" value={summary.requiredGaps} sub={`${summary.incompleteProjects} project(s) incomplete`} tone={summary.requiredGaps ? "bad" : "good"} />
              <StatCard label="Reportable" value={summary.reportableFields} sub={`of ${summary.fieldCount} field(s) in scope`} />
            </div>
          )}

          {reportApi.loading && !reportApi.data ? (
            <LoadingBlock label="Computing coverage…" />
          ) : reportApi.error && !reportApi.data ? (
            <ErrorBlock message={reportApi.error} onRetry={reportApi.refetch} />
          ) : (
            <DataTable
              columns={reportColumns}
              rows={reportRows as unknown as (ReportRow & Record<string, unknown>)[]}
              keyField="fieldKey"
              maxHeight="460px"
              emptyTitle="Nothing to report yet"
              emptyDescription={reportableOnly
                ? "No fields in this scope are flagged for reporting — toggle the switch above or enable the report flag on a field."
                : "No fields in this scope."}
            />
          )}
        </div>
      </SectionCard>

      {/* Create tab dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PanelsTopLeft className="h-4 w-4" />New project tab</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tb-name" className="text-xs">Tab name *</Label>
              <Input id="tb-name" className="h-9" value={newName} placeholder="e.g. Compliance" autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createTab(); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-desc" className="text-xs">Description (help text)</Label>
              <Textarea id="tb-desc" rows={2} value={newDesc} placeholder="Shown above the form on every project workspace"
                onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <p className="text-[11px] text-slate-400">Appears on every project workspace after the built-in tabs.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createTab} disabled={creating}>{creating ? "Creating…" : "Create tab"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit tab dialog (double-click a tab in the list) */}
      <Dialog open={editTab !== null} onOpenChange={(o) => { if (!o) setEditTab(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit tab{editTab ? ` — ${editTab.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tb-edit-name" className="text-xs">Tab name *</Label>
              <Input id="tb-edit-name" className="h-9" value={editName} autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTabRename(); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-edit-desc" className="text-xs">Description (help text)</Label>
              <Textarea id="tb-edit-desc" rows={2} value={editDesc} placeholder="Shown above the form on every project workspace"
                onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <p className="text-[11px] text-slate-400">Applies to every project workspace. Field assignments are kept.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTab(null)}>Cancel</Button>
            <Button onClick={saveTabRename} disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog — renders the current DRAFT exactly as users see it */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />Preview — {selectedTab?.name}</DialogTitle>
            <DialogDescription>
              How this tab renders on every project workspace{dirty ? " — note: unsaved changes are included, save to apply them." : "."}
            </DialogDescription>
          </DialogHeader>
          {previewTab && (
            <DynamicFormRenderer tab={previewTab} projectId="" customData={EMPTY_CUSTOM_DATA} preview />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close preview</Button>
            <Button onClick={() => { setPreviewOpen(false); void saveMapping(); }} disabled={!dirty || saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />Save & close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline field creation — stays in the builder */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New field{selectedTab ? ` → "${selectedTab.name}"` : ""}</DialogTitle>
            <DialogDescription>Defines the field once in the dictionary{selectedTab ? " and assigns it to this tab" : ""}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="qk-label" className="text-xs">Label *</Label>
                <Input id="qk-label" className="h-9" value={quick.label} placeholder="Delivery Region"
                  onChange={(e) => setQuick({
                    ...quick,
                    label: e.target.value,
                    fieldKey: quick.fieldKey || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
                  })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qk-key" className="text-xs">Field key *</Label>
                <Input id="qk-key" className="h-9 font-mono text-xs" value={quick.fieldKey} placeholder="delivery_region"
                  onChange={(e) => setQuick({ ...quick, fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data type</Label>
              <Select value={quick.dataType} onValueChange={(v) => setQuick({ ...quick, dataType: v as FieldDataType })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(quick.dataType === "DROPDOWN" || quick.dataType === "MULTI_SELECT") && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                <Label className="text-xs">Options *</Label>
                {quick.options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quick.options.map((opt) => (
                      <span key={opt} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                        {opt}
                        <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setQuick({ ...quick, options: quick.options.filter((o) => o !== opt) })}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input className="h-8 flex-1" value={quickOption} placeholder="Add an option…"
                    onChange={(e) => setQuickOption(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickOption(); } }} />
                  <Button variant="outline" size="sm" className="h-8" onClick={addQuickOption}>Add</Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="qk-desc" className="text-xs">Description (help text)</Label>
              <Textarea id="qk-desc" rows={2} value={quick.description} placeholder="Shown under the field on the project form"
                onChange={(e) => setQuick({ ...quick, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)}>Cancel</Button>
            <Button onClick={createQuickField} disabled={quickSaving}>{quickSaving ? "Creating…" : "Create field"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import confirmation */}
      <Dialog open={importDoc !== null} onOpenChange={(o) => { if (!o) setImportDoc(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" />Import form configuration?</DialogTitle>
            <DialogDescription>The document below will be applied to this workspace.</DialogDescription>
          </DialogHeader>
          {importDoc && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-semibold tabular-nums text-slate-800">{importDoc.fields.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">fields</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-semibold tabular-nums text-slate-800">{importDoc.tabs.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">tabs</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-semibold tabular-nums text-slate-800">
                    {importDoc.tabs.reduce((s, t) => s + t.fields.length, 0)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">mappings</p>
                </div>
              </div>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                Fields are upserted by key, tabs by name, and each imported tab&apos;s field list is
                replaced. Stored project values are never touched. The action is audited.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDoc(null)}>Cancel</Button>
            <Button onClick={runImport} disabled={importing}>{importing ? "Importing…" : "Import configuration"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** TabField → fieldId (HydratedTab.fields entries carry the field object). */
function fieldIdOf(f: HydratedTab["fields"][number]): string {
  return f.field.id;
}
