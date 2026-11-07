"use client";
// PM CONTROL TOWER — AddFieldFromDictionary
// "Add Field from Dictionary" panel for every supported module. Selecting a field
// links the EXISTING global definition to this module — it never creates a
// duplicate dictionary record.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, LoadingBlock, SearchInput, StatusChip, cn } from "@/components/pmct/kit";
import { api, useApi } from "@/lib/client";
import { FIELD_TYPE_META, normalizeType, ruleSummary } from "@/lib/engines/field-dictionary";
import { Plus, Layers } from "lucide-react";
import type { AssignmentLite, CategoryLite, FieldLite, ModuleLite } from "./types";

const ANY = "__any__";
const NO_SECTION = "__none__";

export interface AddFieldResult { assigned: { fieldKey: string; label: string }[]; skipped: { fieldKey: string; reason: string }[] }

export default function AddFieldFromDictionary({
  moduleKey, open, onOpenChange, onAdded,
}: {
  moduleKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (res: AddFieldResult) => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>(ANY);
  const [dataType, setDataType] = useState<string>(ANY);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [section, setSection] = useState<string>(NO_SECTION);
  const [preview, setPreview] = useState<FieldLite | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const moduleInfo = useApi<{ module: ModuleLite; sections: string[] }>(open ? `/api/modules/${moduleKey}/fields` : null);
  const categories = useApi<{ categories: CategoryLite[] }>(open ? "/api/field-categories" : null);
  const assigned = useApi<{ assignments: AssignmentLite[] }>(open ? `/api/modules/${moduleKey}/fields?includeHidden=true` : null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (dataType !== ANY) p.set("dataType", dataType);
    if (category !== ANY) p.set("categoryId", category);
    if (unusedOnly) p.set("unused", "true");
    return `/api/field-dictionary?${p.toString()}`;
  }, [q, dataType, category, unusedOnly]);

  const dictionary = useApi<{ fields: FieldLite[]; admin: boolean }>(open ? query : null, [query]);
  const assignedIds = new Set((assigned.data?.assignments ?? []).map((a) => a.field.id));

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setPreview(null);
      setQ("");
    }
  }, [open]);

  const sections = moduleInfo.data?.sections ?? [];
  const rows = dictionary.data?.fields ?? [];
  const selectable = rows.filter((f) => f.status === "ACTIVE");

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setPreview(rows.find((r) => r.id === id) ?? null);
  };

  const submit = async () => {
    if (!selected.size) return;
    setSubmitting(true);
    try {
      const res = await api.post<AddFieldResult>(`/api/modules/${moduleKey}/fields`, {
        assignments: [...selected].map((fieldId) => ({
          fieldId,
          ...(section !== NO_SECTION ? { section } : {}),
        })),
      });
      const msg = res.assigned.length
        ? `Added ${res.assigned.length} field(s) to ${moduleInfo.data?.module.label ?? moduleKey}`
        : "No fields were added";
      if (res.skipped.length) toast.warning(res.skipped.map((s) => `${s.fieldKey}: ${s.reason}`).join(" · "));
      toast.success(msg);
      onAdded?.(res);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add fields");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-500" />
            Add Field from Dictionary
            {moduleInfo.data?.module && <Badge variant="outline" className="ml-1 text-[10px]">{moduleInfo.data.module.label}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Select one or more existing dictionary fields to use in this module. The definition is reused — never duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b border-slate-200 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search by name, key, description or category…" className="w-full sm:w-72" />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All categories</SelectItem>
                {(categories.data?.categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={dataType} onValueChange={setDataType}>
              <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Data type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All data types</SelectItem>
                {Object.values(FIELD_TYPE_META).map((m) => <SelectItem key={m.type} value={m.type}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Checkbox checked={unusedOnly} onCheckedChange={(v) => setUnusedOnly(v === true)} />
              Unused fields only
            </label>
            {sections.length > 0 && (
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SECTION}>Module default section</SelectItem>
                  {sections.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            {selectable.length} available · {selected.size} selected
            {assignedIds.size ? ` · ${assignedIds.size} already in this module` : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {dictionary.loading && !rows.length ? (
            <LoadingBlock label="Loading dictionary…" />
          ) : !rows.length ? (
            <EmptyState title="No matching fields" description="Adjust the filters, or create the field in the Field Dictionary first." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((f) => {
                const isAssigned = assignedIds.has(f.id);
                const disabled = isAssigned || f.status !== "ACTIVE";
                return (
                  <li key={f.id} className={cn("flex items-start gap-3 px-1 py-2.5", disabled && "opacity-60")}>
                    <Checkbox
                      checked={selected.has(f.id)} disabled={disabled}
                      onCheckedChange={() => toggle(f.id)} className="mt-1"
                      aria-label={`Select ${f.label}`}
                    />
                    <button type="button" onClick={() => setPreview(f)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{f.label}</span>
                        <code className="text-[10px] text-slate-400">{f.fieldKey}</code>
                        {f.categoryName && <Badge variant="outline" className="text-[10px]">{f.categoryName}</Badge>}
                        {isAssigned && <Badge className="bg-blue-50 text-[10px] text-blue-700" variant="outline">In this module</Badge>}
                        {f.status !== "ACTIVE" && <StatusChip status={f.status} />}
                        {f.sensitivity !== "INTERNAL" && (
                          <Badge variant="outline" className={cn("text-[10px]", f.sensitivity === "RESTRICTED" || f.sensitivity === "CONFIDENTIAL" ? "border-amber-200 bg-amber-50 text-amber-700" : "")}>
                            {f.sensitivity}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        {f.description || "No description"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {FIELD_TYPE_META[normalizeType(f.dataType)]?.label ?? f.dataType}
                        {f.isRequired ? " · required by default" : " · optional"}
                        {f.modules.length ? ` · used in ${f.modules.length} module(s)` : " · not assigned anywhere yet"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {preview && (
          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs">
            <p className="font-semibold text-slate-800">{preview.label} <span className="font-normal text-slate-500">— field preview</span></p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600 sm:grid-cols-3">
              <div><dt className="text-[10px] uppercase tracking-wide text-slate-400">Type</dt><dd>{FIELD_TYPE_META[normalizeType(preview.dataType)]?.label ?? preview.dataType}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wide text-slate-400">Required</dt><dd>{preview.isRequired ? "Yes" : "No"}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wide text-slate-400">Used in</dt><dd>{preview.modules.length ? preview.modules.join(", ") : "—"}</dd></div>
              {preview.options.length > 0 && <div className="col-span-2 sm:col-span-3"><dt className="text-[10px] uppercase tracking-wide text-slate-400">Options</dt><dd className="truncate">{preview.options.join(", ")}</dd></div>}
              {ruleSummary(preview.config) && <div className="col-span-2 sm:col-span-3"><dt className="text-[10px] uppercase tracking-wide text-slate-400">Validation</dt><dd>{ruleSummary(preview.config)}</dd></div>}
            </dl>
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!selected.size || submitting}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? "Adding…" : `Add Selected Fields${selected.size ? ` (${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
