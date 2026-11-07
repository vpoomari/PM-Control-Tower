"use client";
// PM CONTROL TOWER — ADMIN · Field Dictionary (v4.0)
// Centralised, reusable field definitions. Define a field once here, then add
// it to any of the 23 supported modules from that module's "Add Field" action.
//
// Screen: stats, search + category/type/status/module/unused filters, the
// dictionary table, a full create/edit dialog, per-field impact analysis +
// history, category management, and lifecycle actions (activate, deactivate,
// deprecate, archive, guarded delete).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, StatCard, Toolbar, SearchInput, DataTable, StatusChip, ConfirmButton,
  Button, Input, Badge, EmptyState, LoadingBlock, ErrorBlock, cn, type Column,
} from "@/components/pmct/kit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Plus, Pencil, History, Trash2, MoreHorizontal, Layers, FolderCog, Tags, Archive, Ban, CheckCircle2 } from "lucide-react";
import { FIELD_MODULES, FIELD_STATUSES, FIELD_TYPE_META, FIELD_TYPES, moduleLabel, normalizeType, ruleSummary } from "@/lib/engines/field-dictionary";
import FieldFormDialog from "./dictionary/FieldFormDialog";
import ImpactDialog from "./dictionary/ImpactDialog";
import type { CategoryLite, FieldLite } from "@/components/fields/types";

const ANY = "__any__";
const PAGE_SIZE = 25;

const TYPE_TONE: Record<string, string> = {
  Text: "bg-slate-100 text-slate-600 border-slate-200",
  Number: "bg-blue-50 text-blue-700 border-blue-200",
  Date: "bg-violet-50 text-violet-700 border-violet-200",
  Choice: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Reference: "bg-cyan-50 text-cyan-700 border-cyan-200",
  Computed: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function FieldDictionaryAdmin() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ANY);
  const [dataType, setDataType] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [module, setModule] = useState(ANY);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FieldLite | null>(null);
  const [impactField, setImpactField] = useState<FieldLite | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (category !== ANY) p.set("categoryId", category);
    if (dataType !== ANY) p.set("dataType", dataType);
    if (status !== ANY) p.set("status", status);
    if (module !== ANY) p.set("module", module);
    if (unusedOnly) p.set("unused", "true");
    return `/api/field-dictionary?${p.toString()}`;
  }, [q, category, dataType, status, module, unusedOnly]);

  const fields = useApi<{ fields: FieldLite[]; total: number; admin: boolean }>(query, [query]);
  const categories = useApi<{ categories: CategoryLite[] }>("/api/field-categories");
  useRealtimeRefetch(() => { fields.refetch(); categories.refetch(); }, ["field:changed"]);

  const rows = fields.data?.fields ?? [];
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const refresh = () => { fields.refetch(); categories.refetch(); };

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (f: FieldLite) => { setEditing(f); setFormOpen(true); };
  const openImpact = (f: FieldLite) => { setImpactField(f); setImpactOpen(true); };

  const setStatus_ = async (f: FieldLite, next: string, reason?: string) => {
    try {
      await api.patch(`/api/field-dictionary/${f.id}`, {
        status: next, deprecationReason: reason ?? f.deprecationReason, acknowledgeImpact: true,
      });
      toast.success(`"${f.label}" is now ${next.toLowerCase()}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (f: FieldLite) => {
    try {
      await api.del(`/api/field-dictionary/${f.id}`);
      toast.success(`Deleted "${f.label}"`);
      refresh();
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? (e as { status: number }).status : 0;
      if (status === 409) toast.warning(e instanceof Error ? e.message : "Field holds data — deprecate instead.");
      else toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const duplicate = async (f: FieldLite) => {
    try {
      await api.post("/api/field-dictionary", {
        name: `${f.name} (copy)`, label: `${f.label} (copy)`,
        fieldKey: `${f.fieldKey}_copy_${Math.random().toString(36).slice(2, 6)}`,
        description: f.description, categoryId: f.categoryId, fieldGroup: f.fieldGroup,
        dataType: normalizeType(f.dataType), options: f.options.length ? f.options : null,
        config: f.config, isRequired: f.isRequired, isReadOnly: f.isReadOnly,
        sensitivity: f.sensitivity, visibleRoles: f.visibleRoles, editableRoles: f.editableRoles,
      });
      toast.success(`Duplicated "${f.label}"`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
    }
  };

  const stats = {
    total: rows.length,
    active: rows.filter((f) => f.status === "ACTIVE").length,
    unused: rows.filter((f) => f.assignmentCount === 0).length,
    deprecated: rows.filter((f) => f.status === "DEPRECATED" || f.status === "ARCHIVED").length,
    values: rows.reduce((s, f) => s + f.valueCount, 0),
  };

  const columns: Column<FieldLite>[] = useMemo(() => [
    {
      key: "label", header: "Field name",
      render: (f) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800">{f.label}</span>
            {f.sensitivity !== "INTERNAL" && (
              <Badge variant="outline" className={cn("text-[9px]", f.sensitivity === "RESTRICTED" || f.sensitivity === "CONFIDENTIAL" ? "border-amber-200 bg-amber-50 text-amber-700" : "")}>
                {f.sensitivity}
              </Badge>
            )}
          </div>
          {f.description && <p className="mt-0.5 line-clamp-1 max-w-md text-[11px] text-slate-400">{f.description}</p>}
        </div>
      ),
    },
    { key: "fieldKey", header: "Key", render: (f) => <code className="text-[11px] text-slate-500">{f.fieldKey}</code> },
    {
      key: "category", header: "Category",
      render: (f) => f.categoryName ? <Badge variant="outline" className="text-[10px]">{f.categoryName}</Badge> : <span className="text-slate-300">—</span>,
    },
    {
      key: "dataType", header: "Data type",
      render: (f) => {
        const meta = FIELD_TYPE_META[normalizeType(f.dataType)];
        return (
          <span className="flex flex-col gap-0.5">
            <Badge variant="outline" className={cn("w-fit text-[10px]", TYPE_TONE[meta?.group ?? "Text"])}>{meta?.label ?? f.dataType}</Badge>
            {ruleSummary(f.config) && <span className="text-[10px] text-slate-400">{ruleSummary(f.config)}</span>}
          </span>
        );
      },
    },
    { key: "status", header: "Status", render: (f) => <StatusChip status={f.status} /> },
    {
      key: "modules", header: "Used in modules",
      render: (f) => f.modules.length ? (
        <div className="flex max-w-[220px] flex-wrap gap-1">
          {f.modules.slice(0, 3).map((m) => <Badge key={m} variant="outline" className="text-[10px]">{moduleLabel(m)}</Badge>)}
          {f.modules.length > 3 && <span className="text-[10px] text-slate-400">+{f.modules.length - 3}</span>}
        </div>
      ) : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">Unused</Badge>,
    },
    { key: "createdBy", header: "Created by", render: (f) => <span className="text-xs text-slate-500">{f.createdByName ?? "—"}</span> },
    { key: "updated", header: "Last updated", render: (f) => <span className="text-xs text-slate-500">{new Date(f.updatedAt).toLocaleDateString()} <span className="text-slate-300">v{f.version}</span></span> },
    {
      key: "actions", header: "", className: "w-10",
      render: (f) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${f.label}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">{f.label}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openEdit(f)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit definition</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openImpact(f)}><History className="mr-2 h-3.5 w-3.5" />Impact &amp; history</DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicate(f)}><Layers className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            {f.status === "ACTIVE" ? (
              <>
                <DropdownMenuItem onClick={() => setStatus_(f, "INACTIVE")}><Ban className="mr-2 h-3.5 w-3.5" />Deactivate</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatus_(f, "DEPRECATED", "Deprecated from the Field Dictionary")}><Archive className="mr-2 h-3.5 w-3.5" />Deprecate (keep values)</DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => setStatus_(f, "ACTIVE")}><CheckCircle2 className="mr-2 h-3.5 w-3.5" />Re-activate</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <ConfirmButton
              title={`Delete "${f.label}"?`}
              description={f.valueCount > 0
                ? `This field holds ${f.valueCount} stored value(s) across ${f.modules.length || 0} module(s). Deprecating it is safer — delete only if you accept losing the data.`
                : "The definition and its module assignments will be removed. This cannot be undone."}
              confirmLabel="Delete permanently"
              variant="destructive"
              onConfirm={() => remove(f)}
            >
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete…
              </DropdownMenuItem>
            </ConfirmButton>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [rows]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Field Dictionary"
        subtitle="Define a field once and reuse it across every module. Module-specific display settings never change the global definition."
        breadcrumb={["Home", "Administration", "Field Dictionary"]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)}>
              <FolderCog className="mr-1.5 h-3.5 w-3.5" />Categories
            </Button>
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", fields.loading && "animate-spin")} />Refresh</Button>
            <Button size="sm" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5" />New Field</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Fields" value={stats.total} sub="in the dictionary" />
        <StatCard label="Active" value={stats.active} tone="info" sub="usable in modules" />
        <StatCard label="Unused" value={stats.unused} tone={stats.unused ? "warn" : "good"} sub="not assigned anywhere" />
        <StatCard label="Deprecated / archived" value={stats.deprecated} sub="values preserved" />
        <StatCard label="Stored values" value={stats.values} tone="good" sub="across all modules" />
      </div>

      <Toolbar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, key, description…" className="w-full sm:w-72" />
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All categories</SelectItem>
            {(categories.data?.categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dataType} onValueChange={(v) => { setDataType(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Data type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All data types</SelectItem>
            {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_META[t].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All statuses</SelectItem>
            {FIELD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={module} onValueChange={(v) => { setModule(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-48"><SelectValue placeholder="Module usage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All modules</SelectItem>
            {FIELD_MODULES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={unusedOnly} onChange={(e) => { setUnusedOnly(e.target.checked); setPage(1); }} className="h-3.5 w-3.5 rounded border-slate-300" />
          Unused only
        </label>
      </Toolbar>

      {fields.error ? (
        <ErrorBlock message={fields.error} onRetry={refresh} />
      ) : fields.loading && !rows.length ? (
        <LoadingBlock label="Loading dictionary…" />
      ) : (
        <>
          <DataTable
            columns={columns} rows={paged} keyField="id"
            emptyTitle="No fields match" emptyDescription="Adjust the filters, or create the first dictionary field."
          />
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Showing {paged.length} of {rows.length} fields</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="px-2 py-1">Page {page} / {pages}</span>
                <Button variant="outline" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <FieldFormDialog
        open={formOpen} onOpenChange={setFormOpen} field={editing}
        categories={categories.data?.categories ?? []} onSaved={refresh}
      />
      <ImpactDialog field={impactField} open={impactOpen} onOpenChange={setImpactOpen} />
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} categories={categories.data?.categories ?? []} onSaved={refresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category management
// ---------------------------------------------------------------------------
function CategoriesDialog({ open, onOpenChange, categories, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; categories: CategoryLite[]; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) { toast.error("Category name is required"); return; }
    setBusy(true);
    try {
      await api.post("/api/field-categories", { name: name.trim(), description: description.trim() || null });
      toast.success(`Category "${name.trim()}" created`);
      setName(""); setDescription("");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: CategoryLite) => {
    try {
      await api.del(`/api/field-categories/${c.id}`);
      toast.success(`Category "${c.name}" deleted`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tags className="h-4 w-4 text-blue-500" />Field categories</DialogTitle>
          <DialogDescription>Group dictionary fields for browsing and filtering.</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {categories.length === 0 ? (
            <EmptyState title="No categories yet" description="Create one below to start grouping fields." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.name} <code className="ml-1 text-[10px] text-slate-400">{c.key}</code></p>
                    {c.description && <p className="text-[11px] text-slate-400">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{c.fieldCount} field(s)</span>
                    <ConfirmButton title={`Delete category "${c.name}"?`} description="Fields keep their data and simply lose the category link." confirmLabel="Delete" variant="destructive" onConfirm={() => remove(c)}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </ConfirmButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">New category</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Commercial" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Description</Label>
            <Textarea rows={1} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          <Button size="sm" onClick={create} disabled={busy}><Plus className="mr-1.5 h-3.5 w-3.5" />{busy ? "Creating…" : "Create category"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
