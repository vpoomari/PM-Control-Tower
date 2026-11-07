"use client";
// PM CONTROL TOWER — ConfigureFieldsDialog
// Per-module field configuration: reorder (drag or arrows), assign sections,
// toggle required / read-only / visible / form / table / detail inclusion, and
// remove a field from the module. Module settings never mutate the global
// definition — the dictionary stays the single source of truth.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton, EmptyState, LoadingBlock, StatusChip, cn } from "@/components/pmct/kit";
import { api } from "@/lib/client";
import { FIELD_TYPE_META, normalizeType } from "@/lib/engines/field-dictionary";
import { ChevronDown, ChevronUp, Trash2, GripVertical, Plus } from "lucide-react";
import type { AssignmentLite, ModuleLite } from "./types";

export default function ConfigureFieldsDialog({
  moduleKey, open, onOpenChange, assignments, sections, module, loading, onChanged, onAdd,
}: {
  moduleKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: AssignmentLite[];
  sections: string[];
  module: ModuleLite | null;
  loading?: boolean;
  onChanged?: () => void;
  onAdd?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const items = useMemo(() => [...assignments].sort((a, b) => a.sortOrder - b.sortOrder), [assignments]);

  const patch = async (a: AssignmentLite, body: Record<string, unknown>, label: string) => {
    setBusy(a.id);
    try {
      await api.patch(`/api/modules/${moduleKey}/fields/${a.id}`, body);
      toast.success(`${a.displayLabel || a.field.label} — ${label}`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const move = (a: AssignmentLite, dir: -1 | 1) => {
    const idx = items.findIndex((x) => x.id === a.id);
    const other = items[idx + dir];
    if (!other) return;
    void patch(a, { sortOrder: other.sortOrder }, "reordered");
    void patch(other, { sortOrder: a.sortOrder }, "reordered");
  };

  const remove = async (a: AssignmentLite) => {
    setBusy(a.id);
    try {
      await api.del(`/api/modules/${moduleKey}/fields/${a.id}`);
      toast.success(`Removed "${a.field.label}" from ${module?.label ?? moduleKey} (stored values retained)`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Configure Fields
            {module && <Badge variant="outline" className="ml-1 text-[10px]">{module.label}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Choose which dictionary fields appear in this module and how they render. Changes apply to this module only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <LoadingBlock label="Loading assignments…" />
          ) : !items.length ? (
            <EmptyState
              title="No custom fields assigned"
              description="Add existing fields from the Field Dictionary — define once, reuse everywhere."
              action={onAdd ? <Button size="sm" onClick={onAdd}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Field</Button> : undefined}
            />
          ) : (
            <ul className="space-y-2">
              {items.map((a, idx) => {
                const meta = FIELD_TYPE_META[normalizeType(a.field.dataType)];
                return (
                  <li key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
                    className="rounded-lg border border-slate-200 bg-white p-3 hover:border-blue-300">
                    <div className="flex flex-wrap items-start gap-3">
                      <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-slate-300" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{a.displayLabel || a.field.label}</span>
                          {a.displayLabel && a.displayLabel !== a.field.label && (
                            <span className="text-[11px] text-slate-400">global label: {a.field.label}</span>
                          )}
                          <code className="text-[10px] text-slate-400">{a.field.fieldKey}</code>
                          <Badge variant="outline" className="text-[10px]">{meta?.label ?? a.field.dataType}</Badge>
                          {a.field.categoryName && <Badge variant="outline" className="text-[10px]">{a.field.categoryName}</Badge>}
                          {a.field.status !== "ACTIVE" && <StatusChip status={a.field.status} />}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <Toggle label="Required" checked={a.isRequired} disabled={busy === a.id}
                            onChange={(v) => patch(a, { isRequired: v }, v ? "now required" : "optional")} />
                          <Toggle label="Read-only" checked={a.isReadOnly} disabled={busy === a.id}
                            onChange={(v) => patch(a, { isReadOnly: v }, v ? "read-only" : "editable")} />
                          <Toggle label="Visible" checked={a.isVisible} disabled={busy === a.id}
                            onChange={(v) => patch(a, { isVisible: v }, v ? "visible" : "hidden")} />
                          <Toggle label="Form" checked={a.isInForm} disabled={busy === a.id}
                            onChange={(v) => patch(a, { isInForm: v }, v ? "in form" : "out of form")} />
                          <Toggle label="Table" checked={a.isInTable} disabled={busy === a.id}
                            onChange={(v) => patch(a, { isInTable: v }, v ? "in table" : "out of table")} />
                          <Toggle label="Detail" checked={a.isInDetail} disabled={busy === a.id}
                            onChange={(v) => patch(a, { isInDetail: v }, v ? "in detail" : "out of detail")} />
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {sections.length > 0 && (
                          <Select value={a.section} onValueChange={(v) => patch(a, { section: v }, "moved section")}>
                            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {sections.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={idx === 0 || busy === a.id} onClick={() => move(a, -1)} title="Move up">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={idx === items.length - 1 || busy === a.id} onClick={() => move(a, 1)} title="Move down">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <ConfirmButton
                          title={`Remove "${a.field.label}" from ${module?.label ?? moduleKey}?`}
                          description="The field definition stays in the dictionary and stored values are retained for historical integrity."
                          confirmLabel="Remove from module"
                          variant="destructive"
                          onConfirm={() => remove(a)}
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" disabled={busy === a.id}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </ConfirmButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          {onAdd && (
            <Button size="sm" onClick={onAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add Field
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center gap-1.5", disabled && "opacity-60")}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="h-4 w-7" />
      <span>{label}</span>
    </label>
  );
}
