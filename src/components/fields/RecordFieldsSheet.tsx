"use client";
// PM CONTROL TOWER — RecordFieldsSheet
// Universal "Custom fields" side panel for ONE business record of ANY supported
// module. Renders the module's assigned dictionary fields with the right control
// per data type, enforces required/read-only rules and saves through the typed
// values API. Used from every module's row actions.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EmptyState, LoadingBlock, ErrorBlock } from "@/components/pmct/kit";
import { Save, Sparkles } from "lucide-react";
import { FieldInput } from "./FieldInput";
import { useModuleFields } from "./useModuleFields";
import type { FieldValue } from "@/lib/engines/custom-fields";
import type { AssignmentLite } from "./types";

export default function RecordFieldsSheet({
  moduleKey, recordId, recordLabel, open, onOpenChange, onSaved,
}: {
  moduleKey: string;
  recordId: string | null;
  recordLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const ids = useMemo(() => (recordId ? [recordId] : []), [recordId]);
  const { module, assignments, bySection, values, loading, error, saveValues, saving, refetch } = useModuleFields(moduleKey, ids);
  const [draft, setDraft] = useState<Record<string, FieldValue>>({});
  const [dirty, setDirty] = useState(false);

  const current = recordId ? (values[recordId] ?? {}) : {};

  // The sheet component is mounted from page load (it backs a row action), so
  // its data hooks run long before the sheet is ever shown. Refresh assignments
  // and values on every open so it never renders a stale snapshot (e.g. right
  // after a field was added to the module).
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  useEffect(() => {
    if (!open || !recordId) return;
    const next: Record<string, FieldValue> = {};
    for (const a of assignments) {
      const stored = current[a.field.fieldKey];
      next[a.field.fieldKey] = stored === undefined ? defaultValue(a) : stored;
    }
    setDraft(next);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordId, JSON.stringify(assignments.map((a) => [a.field.fieldKey, current[a.field.fieldKey]]))]);

  const editable = assignments.filter((a) => a.isVisible && a.isInDetail);

  if (!open || !recordId) return null;

  const submit = async () => {
    const payload: Record<string, FieldValue> = {};
    for (const a of assignments) {
      if (!a.isVisible || a.isReadOnly || a.field.isReadOnly) continue;
      if (a.field.status !== "ACTIVE") continue;
      if (a.field.dataType === "FORMULA") continue;
      payload[a.field.fieldKey] = draft[a.field.fieldKey] ?? null;
    }
    try {
      const res = await saveValues(recordId, payload);
      toast.success(`Saved ${res.saved.length} field value(s)`);
      setDirty(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg">
        <SheetHeader className="border-b border-slate-200 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Custom fields
            {module && <Badge variant="outline" className="ml-1 text-[10px]">{module.label}</Badge>}
          </SheetTitle>
          <SheetDescription>{recordLabel || "Dictionary fields configured for this record."}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto py-4">
          {loading && !assignments.length ? (
            <LoadingBlock label="Loading fields…" />
          ) : error ? (
            <ErrorBlock message={error} onRetry={refetch} />
          ) : !editable.length ? (
            <EmptyState
              title="No custom fields yet"
              description="An administrator or module owner can add fields from the Field Dictionary."
            />
          ) : (
            bySection.map(({ section, items }) => (
              <div key={section} className="space-y-4">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.replace(/_/g, " ")}</p>
                  <Separator className="flex-1" />
                </div>
                {items.map((a) => (
                  <FieldRow
                    key={a.id}
                    assignment={a}
                    value={draft[a.field.fieldKey] ?? null}
                    onChange={(v) => { setDraft((d) => ({ ...d, [a.field.fieldKey]: v })); setDirty(true); }}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {editable.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-[11px] text-slate-400">
              {editable.filter((a) => a.isRequired).length} required · values persist on this record
            </span>
            <Button size="sm" onClick={submit} disabled={saving || !dirty}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save fields"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldRow({ assignment, value, onChange }: {
  assignment: AssignmentLite;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const locked = assignment.isReadOnly || assignment.field.isReadOnly || assignment.field.status !== "ACTIVE";
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600" htmlFor={`rec-${assignment.field.fieldKey}`}>
        {assignment.displayLabel || assignment.field.label}
        {assignment.isRequired && <span className="ml-0.5 text-red-500">*</span>}
        {locked && (
          <span className="ml-2 inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
            {assignment.field.status === "DEPRECATED" ? "deprecated" : "locked"}
          </span>
        )}
      </label>
      <FieldInput field={assignment.field} assignment={assignment} value={value} onChange={onChange} idPrefix="rec" />
      {assignment.field.description && <p className="text-[11px] text-slate-400">{assignment.field.description}</p>}
    </div>
  );
}

function defaultValue(a: AssignmentLite): FieldValue {
  const dv = a.field.config?.defaultValue;
  if (dv === undefined) return a.field.dataType === "MULTI_SELECT" ? [] : null;
  return dv;
}
