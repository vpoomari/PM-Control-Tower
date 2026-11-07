"use client";
// PM CONTROL TOWER — Resource register: searchable grid/table, detail drawer, add-resource dialog.

import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDate, money, num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, StatusChip, Toolbar, SearchInput, LoadingBlock, ErrorBlock,
  EmptyState, DataTable, Column, Button, Badge, Input, ConfirmButton, cn,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { hasPerm, useMe } from "@/views/execute/shared/pickers";
import { Avatar } from "@/components/pmct/avatar";
import { AvatarPickerDialog } from "@/components/pmct/avatar-picker";
import { useModuleFieldsHandle } from "@/components/fields/ModuleFields";
import { customFieldColumns } from "@/components/fields/custom-columns";
import RecordFieldsButton from "@/components/fields/RecordFieldsButton";
import { LayoutGrid, Table2, UserPlus, Users, Gauge, TriangleAlert, Trash2, Pencil, Camera } from "lucide-react";

interface ResourceRow {
  [key: string]: unknown;
  id: string; employeeCode: string; name: string; email: string; title: string | null;
  department: string | null; resourceType: string; seniority: string; primarySkill: string | null;
  skills: string | null; capacityHoursPerWeek: number; costRate: number; billableRate: number;
  currency: string; availabilityStatus: string; location: string | null; managerName: string | null;
  isActive: boolean; userId?: string | null;
  activeAssignments: number; projectCount: number; assignedWeeklyHours: number;
  utilizationPct: number; overallocated: boolean; avatarUrl?: string | null;
}
interface ResourcesData {
  resources: ResourceRow[]; total: number; departments: string[];
  summary: { totalResources?: number; totalCapacityWeekly?: number; totalAllocatedWeekly?: number; overallocatedCount?: number };
}
interface Assignment {
  id: string; projectId: string; role: string | null; allocationPercent: number;
  plannedHours: number; actualHours: number; startDate: string; endDate: string; status: string; billable: boolean;
  project: { id: string; code: string; name: string; status: string };
  task: { id: string; code: string; name: string } | null;
}
interface ResourceDetail { resource: ResourceRow & { assignments: Assignment[] } }
interface TsLite { id: string; weekStart: string; status: string; totalHours: number; entriesCount: number }

const AVATAR_COLORS = ["#2563eb", "#0d9488", "#0284c7", "#16a34a", "#d97706", "#b45309", "#0f766e", "#4d7c0f", "#64748b", "#334155"];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Deterministic generated avatar per resource: DiceBear is seeded with the
 * employee code (falls back to the name), so each person always renders the
 * same image across cards, table and reloads. If the image cannot load
 * (offline / blocked), <Avatar> falls back to the solid-color initials above.
 */
function dicebearUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

/** Prefer a stored avatar, else the generated one — never a blank circle. */
function resourceAvatarUrl(r: ResourceRow): string {
  return r.avatarUrl || dicebearUrl(r.employeeCode || r.name);
}

/** Utilization bar with explicit over-allocation red. */
function UtilBar({ pct, over }: { pct: number; over: boolean }) {
  const v = Math.min(100, Math.max(0, pct));
  const color = over || pct > 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : pct >= 40 ? "bg-blue-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden min-w-16">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
      </div>
      <span className={cn("text-xs tabular-nums font-medium", over || pct > 100 ? "text-red-600" : pct >= 85 ? "text-amber-600" : "text-slate-600")}>
        {num(pct)}%
      </span>
    </div>
  );
}

const AVAILABILITY_TONES: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ALLOCATED: "bg-blue-50 text-blue-700 border-blue-200",
  ON_LEAVE: "bg-amber-50 text-amber-700 border-amber-200",
  UNAVAILABLE: "bg-slate-100 text-slate-500 border-slate-200",
};

function AvailabilityChip({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("font-medium", AVAILABILITY_TONES[status] || AVAILABILITY_TONES.UNAVAILABLE)}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

const emptyForm = {
  employeeCode: "", name: "", email: "", title: "", department: "", skills: "",
  capacityHoursPerWeek: "40", costRate: "0", billableRate: "0", location: "",
  resourceType: "EMPLOYEE", seniority: "MID",
};

/** Every stored field of the register row — what the edit form round-trips (avatar lives in its own picker). */
interface EditForm {
  employeeCode: string; name: string; email: string; title: string; department: string;
  location: string; managerName: string; resourceType: string; seniority: string;
  availabilityStatus: string; primarySkill: string; skills: string;
  capacityHoursPerWeek: string; costRate: string; billableRate: string; currency: string;
  isActive: boolean;
}

function editFormOf(r: ResourceRow): EditForm {
  return {
    employeeCode: r.employeeCode,
    name: r.name,
    email: r.email,
    title: r.title ?? "",
    department: r.department ?? "",
    location: r.location ?? "",
    managerName: r.managerName ?? "",
    resourceType: r.resourceType,
    seniority: r.seniority,
    availabilityStatus: r.availabilityStatus,
    primarySkill: r.primarySkill ?? "",
    skills: r.skills ?? "",
    capacityHoursPerWeek: String(r.capacityHoursPerWeek),
    costRate: String(r.costRate),
    billableRate: String(r.billableRate),
    currency: r.currency,
    isActive: r.isActive,
  };
}

/** Read-only profile cell (viewers without resource.manage still see every field). */
function ProfileField({ label, value, className, tabular }: {
  label: string; value: string | null | undefined; className?: string; tabular?: boolean;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase text-slate-400">{label}</p>
      <p className={cn("text-slate-700", tabular && "tabular-nums", !value && "text-slate-400")}>{value || "—"}</p>
    </div>
  );
}

export default function ResourcesView() {
  const me = useMe();
  const list = useApi<ResourcesData>("/api/resources");
  useRealtimeRefetch(list.refetch, ["resource:assigned", "actuals:changed"]);

  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useApi<ResourceDetail>(detailId ? `/api/resources/${detailId}` : null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // --- Edit mode (all register fields) + avatar choosing ---
  const canManage = hasPerm(me, "resource.manage");
  const [editForm, setEditForm] = useState<EditForm | null>(null); // non-null ⇔ the drawer is in edit mode
  const [editSaving, setEditSaving] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [addAvatarOpen, setAddAvatarOpen] = useState(false);
  const [addAvatar, setAddAvatar] = useState<string | null>(null);

  const openEdit = () => {
    if (!detail.data) return;
    setEditForm(editFormOf(detail.data.resource));
  };

  const saveEdit = async () => {
    const f = editForm;
    if (!f || !detailId) return;
    const employeeCode = f.employeeCode.trim();
    const name = f.name.trim();
    const email = f.email.trim();
    const currency = f.currency.trim().toUpperCase();
    const capacity = Number(f.capacityHoursPerWeek);
    const costRate = Number(f.costRate);
    const billableRate = Number(f.billableRate);
    if (employeeCode.length < 2) return toast.error("Employee code must be at least 2 characters");
    if (name.length < 2) return toast.error("Full name must be at least 2 characters");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid e-mail address");
    if (currency.length !== 3) return toast.error("Currency must be a 3-letter code (e.g. USD)");
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 80) return toast.error("Capacity must be between 1 and 80 h/week");
    if (!Number.isFinite(costRate) || costRate < 0 || !Number.isFinite(billableRate) || billableRate < 0) return toast.error("Rates cannot be negative");

    setEditSaving(true);
    try {
      await api.patch(`/api/resources/${detailId}`, {
        employeeCode,
        name,
        email,
        title: f.title.trim() || null,
        department: f.department.trim() || null,
        location: f.location.trim() || null,
        managerName: f.managerName.trim() || null,
        resourceType: f.resourceType,
        seniority: f.seniority,
        availabilityStatus: f.availabilityStatus,
        primarySkill: f.primarySkill.trim() || null,
        skills: f.skills.trim() || null,
        capacityHoursPerWeek: capacity,
        costRate,
        billableRate,
        currency,
        isActive: f.isActive,
      });
      toast.success(`${name} saved to the register`);
      setEditForm(null);
      await Promise.all([detail.refetch(), list.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save resource");
    } finally {
      setEditSaving(false);
    }
  };

  /** Persist a bundled-avatar choice (or null → account default / generated fallback). */
  const pickAvatar = async (url: string | null) => {
    if (!detailId) return;
    await api.patch(`/api/resources/${detailId}`, { avatarUrl: url });
    toast.success(url ? "Avatar updated" : "Avatar cleared — falling back to the account default");
    await Promise.all([detail.refetch(), list.refetch()]);
  };

  const deleteResource = async () => {
    if (!detailId) return;
    setDeleting(true);
    try {
      await api.del(`/api/resources/${detailId}`);
      toast.success("Resource removed from the register");
      setDetailId(null);
      setEditForm(null);
      await list.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete resource");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list.data?.resources ?? []).filter((r) => {
      if (dept !== "all" && (r.department || "—") !== dept) return false;
      if (!q) return true;
      return [r.name, r.title, r.department, r.skills, r.employeeCode, r.location].filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
    });
  }, [list.data, query, dept]);

  const detailTs = useApi<{ timesheets: TsLite[] }>(detailId && hasPerm(me, "timesheet.approve") ? `/api/timesheets?scope=all&resourceId=${detailId}` : null);

  // --- Field Dictionary: assignments + bulk values for the visible resources ---
  const fields = useModuleFieldsHandle("resource", filtered.map((r) => r.id));

  const set = (k: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  /** Text-field change for the edit drawer (isActive is select-only — see the form). */
  type EditTextKey = Exclude<keyof EditForm, "isActive">;
  const setEdit = (k: EditTextKey) => (e: ChangeEvent<HTMLInputElement>) =>
    setEditForm((p) => (p ? { ...p, [k]: e.target.value } : p));
  const setEditSel = (k: EditTextKey) => (v: string) =>
    setEditForm((p) => (p ? { ...p, [k]: v } : p));

  const addResource = async () => {
    if (!form.employeeCode.trim() || !form.name.trim() || !form.email.trim()) {
      toast.error("Employee code, name and email are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/resources", {
        employeeCode: form.employeeCode.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        title: form.title || null,
        department: form.department || null,
        resourceType: form.resourceType,
        seniority: form.seniority,
        primarySkill: form.skills.split(",")[0]?.trim() || null,
        skills: form.skills || null,
        capacityHoursPerWeek: Number(form.capacityHoursPerWeek) || 40,
        costRate: Number(form.costRate) || 0,
        billableRate: Number(form.billableRate) || 0,
        location: form.location || null,
        avatarUrl: addAvatar,
      });
      toast.success(`Resource ${form.name} added to the register`);
      setAddOpen(false);
      setForm(emptyForm);
      setAddAvatar(null);
      await list.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add resource");
    } finally {
      setSaving(false);
    }
  };

  if (list.loading && !list.data) return <LoadingBlock label="Loading resource register…" />;
  if (list.error && !list.data) return <ErrorBlock message={list.error} onRetry={list.refetch} />;

  const data = list.data!;
  const summary = data.summary ?? {};

  const columns: Column<ResourceRow>[] = [
    { key: "name", header: "Resource", render: (r) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.name} color={avatarColor(r.name)} url={resourceAvatarUrl(r)} size="h-8 w-8 text-xs" />
        <div>
          <p className="font-medium text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-400">{r.employeeCode}{r.title ? ` · ${r.title}` : ""}</p>
        </div>
      </div>
    ) },
    { key: "department", header: "Department", render: (r) => <span className="text-slate-600">{r.department || "—"}</span> },
    { key: "skills", header: "Skills", className: "max-w-52", render: (r) => <span className="text-xs text-slate-500 line-clamp-1">{r.skills || "—"}</span> },
    { key: "capacity", header: "Capacity", render: (r) => <span className="tabular-nums">{r.capacityHoursPerWeek}h/wk</span> },
    { key: "rates", header: "Rates", render: (r) => <span className="text-xs tabular-nums text-slate-500">{money(r.costRate, r.currency)} / {money(r.billableRate, r.currency)}</span> },
    { key: "utilization", header: "Utilization", className: "w-44", render: (r) => <UtilBar pct={r.utilizationPct} over={r.overallocated} /> },
    { key: "assignments", header: "Assignments", render: (r) => <span className="tabular-nums text-slate-600">{r.activeAssignments}</span> },
    // Field Dictionary: dynamic columns for any field flagged "in table"
    ...customFieldColumns<ResourceRow>(fields.tableColumns, fields.values),
    { key: "cf", header: "", className: "w-10", render: (r) => (
      <RecordFieldsButton moduleKey="resource" recordId={r.id} label={r.name ?? r.id} onSaved={fields.refetch} />
    ) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        io="resources"
        title="Resources"
        subtitle="People, capacity and utilization across the delivery organization."
        breadcrumb={["Home", "Execute", "Resources"]}
        actions={
          <>
            {fields.actions}
            {hasPerm(me, "resource.manage") && (
              <Button size="sm" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4 mr-1.5" />Add resource</Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Resources" value={summary.totalResources ?? data.total} sub={`${data.departments.length} departments`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Weekly capacity" value={`${num(summary.totalCapacityWeekly ?? 0)}h`} sub={`${num(summary.totalAllocatedWeekly ?? 0)}h allocated`} icon={<Gauge className="h-4 w-4" />} />
        <StatCard label="Over-allocated" value={summary.overallocatedCount ?? 0} tone={(summary.overallocatedCount ?? 0) > 0 ? "warn" : "good"} sub="Above contracted hours" icon={<TriangleAlert className="h-4 w-4" />} />
        <StatCard label="Avg utilization" value={`${num(data.resources.length ? data.resources.reduce((s, r) => s + r.utilizationPct, 0) / data.resources.length : 0)}%`} sub="Assigned vs capacity" />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, skill, code…" className="w-full sm:w-72" />
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="bg-white h-9 w-full sm:w-52" aria-label="Department filter">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {data.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto inline-flex rounded-md border border-slate-200 p-0.5 bg-white">
          <button aria-label="Card view" onClick={() => setView("cards")} className={cn("px-2 py-1 rounded", view === "cards" ? "bg-blue-600 text-white" : "text-slate-500")}><LayoutGrid className="h-4 w-4" /></button>
          <button aria-label="Table view" onClick={() => setView("table")} className={cn("px-2 py-1 rounded", view === "table" ? "bg-blue-600 text-white" : "text-slate-500")}><Table2 className="h-4 w-4" /></button>
        </div>
      </Toolbar>

      {filtered.length === 0 ? (
        <EmptyState title="No resources match" description="Adjust the search or department filter." />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <button key={r.id} onClick={() => setDetailId(r.id)} className="text-left">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-4 h-full">
                <div className="flex items-start gap-3">
                  <Avatar name={r.name} color={avatarColor(r.name)} url={resourceAvatarUrl(r)} size="h-10 w-10 text-sm" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{r.name}</p>
                    <p className="text-xs text-slate-500 truncate">{r.title || "—"} · {r.department || "—"}</p>
                  </div>
                  <AvailabilityChip status={r.availabilityStatus} />
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {(r.skills || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4).map((s) => (
                    <Badge key={s} variant="outline" className="border-slate-200 text-slate-600 font-normal">{s}</Badge>
                  ))}
                  {(r.skills || "").split(",").filter((s) => s.trim()).length > 4 && (
                    <Badge variant="outline" className="border-slate-200 text-slate-400 font-normal">+{r.skills!.split(",").filter((s) => s.trim()).length - 4}</Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div><span className="block text-[10px] uppercase text-slate-400">Capacity</span><span className="tabular-nums text-slate-700 font-medium">{r.capacityHoursPerWeek}h/wk</span></div>
                  <div><span className="block text-[10px] uppercase text-slate-400">Cost / bill</span><span className="tabular-nums text-slate-700 font-medium">{money(r.costRate, r.currency)}/{money(r.billableRate, r.currency)}</span></div>
                  <div><span className="block text-[10px] uppercase text-slate-400">Projects</span><span className="tabular-nums text-slate-700 font-medium">{r.activeAssignments} active</span></div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] uppercase text-slate-400 mb-1">
                    <span>Utilization</span><span className={cn(r.overallocated && "text-red-500 font-semibold")}>{num(r.assignedWeeklyHours, 1)}h / {r.capacityHoursPerWeek}h</span>
                  </div>
                  <UtilBar pct={r.utilizationPct} over={r.overallocated} />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <DataTable columns={columns} rows={filtered} keyField="id" onRowClick={(r) => setDetailId(r.id)}
          emptyTitle="No resources match" maxHeight="34rem" />
      )}

      {/* Detail drawer */}
      <Sheet open={Boolean(detailId)} onOpenChange={(o) => { if (!o) { setDetailId(null); setEditForm(null); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3">
              {detail.data && (
                <div className="relative shrink-0">
                  <Avatar
                    name={detail.data.resource.name}
                    color={avatarColor(detail.data.resource.name)}
                    url={resourceAvatarUrl(detail.data.resource)}
                    size="h-10 w-10 text-sm"
                  />
                  {canManage && (
                    <button
                      type="button"
                      aria-label="Choose avatar"
                      title="Choose avatar"
                      onClick={() => setAvatarOpen(true)}
                      className="absolute -bottom-1.5 -right-1.5 rounded-full border border-slate-200 bg-white p-1 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Camera className="h-3 w-3 text-slate-600" />
                    </button>
                  )}
                </div>
              )}
              <SheetTitle>{detail.data?.resource.name || "Resource"}</SheetTitle>
            </div>
            <SheetDescription>
              {detail.data ? `${detail.data.resource.employeeCode} · ${detail.data.resource.title || "—"} · ${detail.data.resource.department || "—"}` : "Loading profile…"}
            </SheetDescription>
          </SheetHeader>
          {detail.loading && !detail.data ? <LoadingBlock /> : detail.error ? <ErrorBlock message={detail.error} onRetry={detail.refetch} /> : detail.data ? (
            <div className="px-4 pb-8 space-y-5">
              {editForm ? (
                /* ---- Edit mode: every stored register field is editable ---- */
                <form
                  className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3"
                  onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">Edit resource</h4>
                    <span className="text-[11px] text-slate-500">Avatar via the camera button above</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label htmlFor="e-code">Employee code *</Label><Input id="e-code" value={editForm.employeeCode} onChange={setEdit("employeeCode")} /></div>
                    <div className="space-y-1"><Label htmlFor="e-name">Full name *</Label><Input id="e-name" value={editForm.name} onChange={setEdit("name")} /></div>
                    <div className="space-y-1"><Label htmlFor="e-email">Email *</Label><Input id="e-email" type="email" value={editForm.email} onChange={setEdit("email")} /></div>
                    <div className="space-y-1"><Label htmlFor="e-title">Title</Label><Input id="e-title" value={editForm.title} onChange={setEdit("title")} placeholder="Senior Engineer" /></div>
                    <div className="space-y-1"><Label htmlFor="e-dept">Department</Label><Input id="e-dept" value={editForm.department} onChange={setEdit("department")} placeholder="Engineering" /></div>
                    <div className="space-y-1"><Label htmlFor="e-loc">Location</Label><Input id="e-loc" value={editForm.location} onChange={setEdit("location")} placeholder="Singapore" /></div>
                    <div className="space-y-1"><Label htmlFor="e-mgr">Manager</Label><Input id="e-mgr" value={editForm.managerName} onChange={setEdit("managerName")} placeholder="Line manager" /></div>
                    <div className="space-y-1"><Label htmlFor="e-type">Resource type</Label>
                      <Select value={editForm.resourceType} onValueChange={setEditSel("resourceType")}>
                        <SelectTrigger className="bg-white" id="e-type"><SelectValue /></SelectTrigger>
                        <SelectContent>{["EMPLOYEE", "CONTRACTOR", "CONSULTANT", "VENDOR"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label htmlFor="e-sen">Seniority</Label>
                      <Select value={editForm.seniority} onValueChange={setEditSel("seniority")}>
                        <SelectTrigger className="bg-white" id="e-sen"><SelectValue /></SelectTrigger>
                        <SelectContent>{["JUNIOR", "MID", "SENIOR", "PRINCIPAL"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label htmlFor="e-avail">Availability</Label>
                      <Select value={editForm.availabilityStatus} onValueChange={setEditSel("availabilityStatus")}>
                        <SelectTrigger className="bg-white" id="e-avail"><SelectValue /></SelectTrigger>
                        <SelectContent>{["AVAILABLE", "ALLOCATED", "ON_LEAVE", "UNAVAILABLE"].map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label htmlFor="e-skill">Primary skill</Label><Input id="e-skill" value={editForm.primarySkill} onChange={setEdit("primarySkill")} placeholder="TypeScript" /></div>
                    <div className="space-y-1"><Label htmlFor="e-status">Status</Label>
                      <Select value={editForm.isActive ? "true" : "false"} onValueChange={(v) => setEditForm((p) => (p ? { ...p, isActive: v === "true" } : p))}>
                        <SelectTrigger className="bg-white" id="e-status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Active</SelectItem>
                          <SelectItem value="false">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2"><Label htmlFor="e-skills">Skills (comma separated)</Label><Input id="e-skills" value={editForm.skills} onChange={setEdit("skills")} placeholder="TypeScript, Cloud, SQL" /></div>
                    <div className="space-y-1"><Label htmlFor="e-cap">Capacity (h/week)</Label><Input id="e-cap" type="number" min={1} max={80} value={editForm.capacityHoursPerWeek} onChange={setEdit("capacityHoursPerWeek")} /></div>
                    <div className="space-y-1"><Label htmlFor="e-cur">Currency</Label><Input id="e-cur" maxLength={3} value={editForm.currency} onChange={setEdit("currency")} placeholder="USD" /></div>
                    <div className="space-y-1"><Label htmlFor="e-cost">Cost rate / h</Label><Input id="e-cost" type="number" min={0} step="0.01" value={editForm.costRate} onChange={setEdit("costRate")} /></div>
                    <div className="space-y-1"><Label htmlFor="e-bill">Billable rate / h</Label><Input id="e-bill" type="number" min={0} step="0.01" value={editForm.billableRate} onChange={setEdit("billableRate")} /></div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" disabled={editSaving} onClick={() => setEditForm(null)}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</Button>
                  </div>
                </form>
              ) : (
                /* ---- Read-only view: every stored field is visible; managers get Edit ---- */
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">Profile</h4>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={openEdit}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <ProfileField label="Email" value={detail.data.resource.email} />
                    <ProfileField label="Employee code" value={detail.data.resource.employeeCode} />
                    <ProfileField label="Title" value={detail.data.resource.title} />
                    <ProfileField label="Department" value={detail.data.resource.department} />
                    <ProfileField label="Location" value={detail.data.resource.location} />
                    <ProfileField label="Manager" value={detail.data.resource.managerName} />
                    <ProfileField label="Type / seniority" value={`${detail.data.resource.resourceType} · ${detail.data.resource.seniority}`} />
                    <ProfileField label="Availability" value={detail.data.resource.availabilityStatus.replace(/_/g, " ").toLowerCase()} />
                    <ProfileField label="Capacity" value={`${detail.data.resource.capacityHoursPerWeek} h/week`} tabular />
                    <ProfileField label="Currency" value={detail.data.resource.currency} />
                    <ProfileField label="Rates (cost / billable)" value={`${money(detail.data.resource.costRate, detail.data.resource.currency)} / ${money(detail.data.resource.billableRate, detail.data.resource.currency)}`} tabular />
                    <ProfileField label="Status" value={detail.data.resource.isActive ? "Active" : "Inactive"} />
                    <ProfileField label="Primary skill" value={detail.data.resource.primarySkill} />
                    <ProfileField label="Skills" value={detail.data.resource.skills} className="col-span-2" />
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">Assignments ({detail.data.resource.assignments.length})</h4>
                {detail.data.resource.assignments.length === 0 ? <EmptyState title="No active assignments" /> : (
                  <div className="space-y-2">
                    {detail.data.resource.assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <a href={`#/projects/${a.project.id}`} className="text-sm font-medium text-slate-800 hover:text-blue-700 truncate block">{a.project.code} — {a.project.name}</a>
                            <p className="text-xs text-slate-500">{a.role || "Team member"} · {a.allocationPercent}% allocation</p>
                          </div>
                          <StatusChip status={a.status} />
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-500 tabular-nums">
                          <span>Planned {num(a.plannedHours)}h</span>
                          <span>Actual {num(a.actualHours)}h</span>
                          <span>{fmtDate(a.startDate)} → {fmtDate(a.endDate)}</span>
                          {a.billable && <Badge variant="outline" className="border-emerald-200 text-emerald-700">Billable</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {hasPerm(me, "timesheet.approve") && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">Recent timesheets</h4>
                  {detailTs.loading && !detailTs.data ? <LoadingBlock label="Loading timesheets…" /> :
                    (detailTs.data?.timesheets ?? []).length === 0 ? <EmptyState title="No timesheets filed" /> : (
                      <div className="space-y-1.5">
                        {detailTs.data!.timesheets.slice(0, 8).map((t) => (
                          <div key={t.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                            <span className="text-slate-600 tabular-nums">Week of {t.weekStart.slice(0, 10)}</span>
                            <span className="flex items-center gap-3">
                              <span className="text-xs tabular-nums text-slate-500">{num(t.totalHours)}h · {t.entriesCount} entries</span>
                              <StatusChip status={t.status} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {hasPerm(me, "resource.manage") && (
                <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-red-900">Danger zone</p>
                      <p className="text-xs text-red-600">Removes the register entry. Resources with assignments or timesheets must be deactivated instead.</p>
                    </div>
                    <ConfirmButton
                      variant="destructive"
                      title={`Delete ${detail.data?.resource.name || "resource"}?`}
                      description="This permanently removes the resource record. This action cannot be undone."
                      confirmLabel={deleting ? "Deleting…" : "Delete resource"}
                      onConfirm={() => void deleteResource()}
                    >
                      <Button variant="destructive" size="sm" className="shrink-0"><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
                    </ConfirmButton>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Add resource dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddAvatar(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add resource</DialogTitle>
            <DialogDescription>Register a person on the delivery bench with capacity and rates.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Avatar name={form.name || "New resource"} color={avatarColor(form.name || "New resource")} url={addAvatar} size="h-12 w-12 text-sm" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700">Avatar</p>
              <p className="text-xs text-slate-500">{addAvatar ? "Bundled avatar selected" : "Generated face until you choose one"}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAddAvatarOpen(true)}>
              <Camera className="h-3.5 w-3.5 mr-1.5" />Choose avatar
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="r-code">Employee code *</Label><Input id="r-code" value={form.employeeCode} onChange={set("employeeCode")} placeholder="EMP-011" /></div>
            <div className="space-y-1"><Label htmlFor="r-name">Full name *</Label><Input id="r-name" value={form.name} onChange={set("name")} placeholder="Jordan Smith" /></div>
            <div className="space-y-1"><Label htmlFor="r-email">Email *</Label><Input id="r-email" type="email" value={form.email} onChange={set("email")} placeholder="jordan@pmct.io" /></div>
            <div className="space-y-1"><Label htmlFor="r-title">Title</Label><Input id="r-title" value={form.title} onChange={set("title")} placeholder="Senior Engineer" /></div>
            <div className="space-y-1"><Label htmlFor="r-dept">Department</Label><Input id="r-dept" value={form.department} onChange={set("department")} placeholder="Engineering" /></div>
            <div className="space-y-1"><Label htmlFor="r-loc">Location</Label><Input id="r-loc" value={form.location} onChange={set("location")} placeholder="Singapore" /></div>
            <div className="space-y-1"><Label htmlFor="r-type">Resource type</Label>
              <Select value={form.resourceType} onValueChange={(v) => setForm((p) => ({ ...p, resourceType: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{["EMPLOYEE", "CONTRACTOR", "CONSULTANT", "VENDOR"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label htmlFor="r-sen">Seniority</Label>
              <Select value={form.seniority} onValueChange={(v) => setForm((p) => ({ ...p, seniority: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{["JUNIOR", "MID", "SENIOR", "PRINCIPAL"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label htmlFor="r-skills">Skills (comma separated)</Label><Input id="r-skills" value={form.skills} onChange={set("skills")} placeholder="TypeScript, Cloud, SQL" /></div>
            <div className="space-y-1"><Label htmlFor="r-cap">Capacity (h/week)</Label><Input id="r-cap" type="number" min={1} max={80} value={form.capacityHoursPerWeek} onChange={set("capacityHoursPerWeek")} /></div>
            <div className="space-y-1"><Label htmlFor="r-cast">Cost rate / h</Label><Input id="r-cast" type="number" min={0} value={form.costRate} onChange={set("costRate")} /></div>
            <div className="space-y-1"><Label htmlFor="r-bill">Billable rate / h</Label><Input id="r-bill" type="number" min={0} value={form.billableRate} onChange={set("billableRate")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setAddAvatar(null); }}>Cancel</Button>
            <Button disabled={saving} onClick={() => void addResource()}>{saving ? "Adding…" : "Add resource"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Avatar chooser — resource drawer (persists immediately via PATCH) */}
      <AvatarPickerDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        current={detail.data?.resource.avatarUrl ?? null}
        title={detail.data ? `Choose avatar — ${detail.data.resource.name}` : "Choose avatar"}
        description="Pick a face for this resource across the register, cards and tables — or fall back to the linked account avatar / generated initials."
        onPick={pickAvatar}
      />

      {/* Avatar chooser — add dialog (applied when the resource is created) */}
      <AvatarPickerDialog
        open={addAvatarOpen}
        onOpenChange={setAddAvatarOpen}
        current={addAvatar}
        title="Choose avatar"
        description="Pick a face for the new resource — applied on save and changeable any time."
        onPick={async (url) => { setAddAvatar(url); }}
      />
    </div>
  );
}
