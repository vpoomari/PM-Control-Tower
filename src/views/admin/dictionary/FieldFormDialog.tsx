"use client";
// PM CONTROL TOWER — Field Dictionary · create / edit dialog
// Full global definition editor: identity, categorisation, type + options,
// validation rules, defaults, lifecycle status, sensitivity & role gates.
// Editing here NEVER touches a module's display settings — those live on the
// assignment layer.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useApi } from "@/lib/client";
import { FIELD_SENSITIVITIES, FIELD_STATUSES, FIELD_TYPE_META, FIELD_TYPES, deriveFieldKey, normalizeType, ruleSummary } from "@/lib/engines/field-dictionary";
import { Save } from "lucide-react";
import type { CategoryLite, FieldLite } from "@/components/fields/types";

const NO_CATEGORY = "__none__";
const ROLES = ["EXECUTIVE", "PMO_ADMIN", "PORTFOLIO_MANAGER", "PROGRAM_MANAGER", "PROJECT_MANAGER", "FINANCE", "AUDITOR", "TEAM_MEMBER"];

interface FormState {
  name: string; label: string; fieldKey: string; description: string;
  categoryId: string; fieldGroup: string; dataType: string;
  options: string; // newline separated in the editor
  isRequired: boolean; isReadOnly: boolean;
  isSearchable: boolean; isFilterable: boolean; isSortable: boolean; isReportable: boolean; isExportable: boolean;
  status: string; sensitivity: string;
  visibleRoles: string[]; editableRoles: string[];
  deprecationReason: string;
  // validation rules
  min: string; max: string; step: string; integer: boolean;
  minLength: string; maxLength: string; multiline: boolean; unit: string; placeholder: string;
  defaultValue: string; currency: string; expression: string;
}

const EMPTY: FormState = {
  name: "", label: "", fieldKey: "", description: "", categoryId: NO_CATEGORY, fieldGroup: "",
  dataType: "TEXT", options: "", isRequired: false, isReadOnly: false,
  isSearchable: true, isFilterable: true, isSortable: true, isReportable: true, isExportable: true,
  status: "ACTIVE", sensitivity: "INTERNAL", visibleRoles: [], editableRoles: [], deprecationReason: "",
  min: "", max: "", step: "", integer: false, minLength: "", maxLength: "", multiline: false,
  unit: "", placeholder: "", defaultValue: "", currency: "USD", expression: "",
};

function toForm(f: FieldLite | null): FormState {
  if (!f) return { ...EMPTY };
  const cfg = f.config ?? {};
  return {
    name: f.name || f.label,
    label: f.label,
    fieldKey: f.fieldKey,
    description: f.description ?? "",
    categoryId: f.categoryId ?? NO_CATEGORY,
    fieldGroup: f.fieldGroup ?? "",
    dataType: normalizeType(f.dataType),
    options: f.options.join("\n"),
    isRequired: f.isRequired, isReadOnly: f.isReadOnly,
    isSearchable: f.isSearchable, isFilterable: f.isFilterable, isSortable: f.isSortable,
    isReportable: f.isReportable, isExportable: f.isExportable,
    status: f.status, sensitivity: f.sensitivity,
    visibleRoles: f.visibleRoles, editableRoles: f.editableRoles,
    deprecationReason: f.deprecationReason ?? "",
    min: cfg.min !== undefined ? String(cfg.min) : "",
    max: cfg.max !== undefined ? String(cfg.max) : "",
    step: cfg.step !== undefined ? String(cfg.step) : "",
    integer: Boolean(cfg.integer),
    minLength: cfg.minLength !== undefined ? String(cfg.minLength) : "",
    maxLength: cfg.maxLength !== undefined ? String(cfg.maxLength) : "",
    multiline: Boolean(cfg.multiline),
    unit: cfg.unit ?? "",
    placeholder: cfg.placeholder ?? "",
    defaultValue: cfg.defaultValue === undefined || cfg.defaultValue === null ? "" : Array.isArray(cfg.defaultValue) ? cfg.defaultValue.join("\n") : String(cfg.defaultValue),
    currency: (cfg as { currency?: string }).currency ?? "USD",
    expression: (cfg as { expression?: string }).expression ?? "",
  };
}

export default function FieldFormDialog({
  open, onOpenChange, field, onSaved, categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  field: FieldLite | null; // null = create
  onSaved: () => void;
  categories: CategoryLite[];
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [ackImpact, setAckImpact] = useState(false);
  const editing = Boolean(field);

  useEffect(() => {
    if (open) { setForm(toForm(field)); setAckImpact(false); }
  }, [open, field]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const meta = FIELD_TYPE_META[normalizeType(form.dataType)];
  const needsOptions = meta?.needsOptions;
  const isNumber = ["INTEGER", "DECIMAL", "CURRENCY", "PERCENTAGE"].includes(normalizeType(form.dataType));
  const isTexty = ["TEXT", "LONG_TEXT", "EMAIL", "URL", "PHONE"].includes(normalizeType(form.dataType));
  const isFormula = normalizeType(form.dataType) === "FORMULA";

  const optionList = useMemo(
    () => form.options.split("\n").map((s) => s.trim()).filter(Boolean),
    [form.options],
  );

  const deriveKey = () => {
    if (editing) return;
    const key = deriveFieldKey(form.name, form.label);
    set("fieldKey", key);
  };

  const submit = async () => {
    if (!form.label.trim()) { toast.error("Display label is required"); return; }
    if (needsOptions && !optionList.length) { toast.error(`${meta.label} fields need at least one option`); return; }

    const config: Record<string, unknown> = {};
    if (isNumber || isFormula) {
      if (form.min !== "") config.min = Number(form.min);
      if (form.max !== "") config.max = Number(form.max);
      if (form.step !== "") config.step = Number(form.step);
      if (form.integer) config.integer = true;
      if (normalizeType(form.dataType) === "CURRENCY") config.currency = form.currency;
    }
    if (normalizeType(form.dataType) === "PERCENTAGE") config.unit = "%";
    if (form.unit && normalizeType(form.dataType) !== "PERCENTAGE") config.unit = form.unit;
    if (isTexty) {
      if (form.minLength !== "") config.minLength = Number(form.minLength);
      if (form.maxLength !== "") config.maxLength = Number(form.maxLength);
      if (form.multiline) config.multiline = true;
    }
    if (form.placeholder) config.placeholder = form.placeholder;
    if (form.defaultValue) {
      if (normalizeType(form.dataType) === "CHECKBOX") config.defaultValue = form.defaultValue === "true";
      else if (isNumber || isFormula) { const n = Number(form.defaultValue); if (Number.isFinite(n)) config.defaultValue = n; }
      else if (normalizeType(form.dataType) === "MULTI_SELECT") config.defaultValue = form.defaultValue.split("\n").map((s) => s.trim()).filter(Boolean);
      else config.defaultValue = form.defaultValue;
    }
    if (isFormula) config.expression = form.expression;

    const payload = {
      name: form.name.trim() || form.label.trim(),
      label: form.label.trim(),
      description: form.description.trim() || null,
      categoryId: form.categoryId === NO_CATEGORY ? null : form.categoryId,
      fieldGroup: form.fieldGroup.trim() || null,
      dataType: form.dataType,
      options: needsOptions ? optionList : null,
      config: Object.keys(config).length ? config : null,
      isRequired: form.isRequired, isReadOnly: form.isReadOnly,
      isSearchable: form.isSearchable, isFilterable: form.isFilterable, isSortable: form.isSortable,
      isReportable: form.isReportable, isExportable: form.isExportable,
      status: form.status, sensitivity: form.sensitivity,
      visibleRoles: form.visibleRoles, editableRoles: form.editableRoles,
      deprecationReason: form.status === "DEPRECATED" ? form.deprecationReason || null : null,
    };

    setSaving(true);
    try {
      if (editing && field) {
        await api.patch(`/api/field-dictionary/${field.id}`, { ...payload, acknowledgeImpact: ackImpact });
        toast.success(`Updated "${payload.label}"`);
      } else {
        const key = form.fieldKey.trim() || deriveFieldKey(form.name, form.label);
        await api.post("/api/field-dictionary", { ...payload, fieldKey: key });
        toast.success(`Created "${payload.label}" — now available to every module`);
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? (e as { status: number }).status : 0;
      if (status === 409) {
        toast.warning("This change affects stored data — review the impact analysis, then save again to acknowledge.");
        setAckImpact(true);
      } else {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit field — ${field?.label}` : "New dictionary field"}</DialogTitle>
          <DialogDescription>
            Define the field once. It can then be added to any module that supports it.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="definition" className="flex-1 overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="definition">Definition</TabsTrigger>
            <TabsTrigger value="validation">Validation &amp; display</TabsTrigger>
            <TabsTrigger value="governance">Status &amp; access</TabsTrigger>
          </TabsList>

          <div className="max-h-[58vh] overflow-y-auto pr-1">
            <TabsContent value="definition" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Field name">
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} onBlur={deriveKey} placeholder="Business Owner" />
                </Field>
                <Field label="Display label">
                  <Input value={form.label} onChange={(e) => set("label", e.target.value)} onBlur={deriveKey} placeholder="Business Owner" />
                </Field>
                <Field label="Field key (immutable)">
                  <Input
                    value={form.fieldKey} disabled={editing} onChange={(e) => set("fieldKey", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                    placeholder="business_owner" className="font-mono text-xs"
                  />
                  {!editing && <p className="mt-1 text-[11px] text-slate-400">snake_case · cannot be changed after creation</p>}
                </Field>
                <Field label="Data type">
                  <Select value={form.dataType} onValueChange={(v) => set("dataType", v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.values(FIELD_TYPE_META).map((m) => (
                        <SelectItem key={m.type} value={m.type}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>— None —</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Field group">
                  <Input value={form.fieldGroup} onChange={(e) => set("fieldGroup", e.target.value)} placeholder="e.g. Commercial" />
                </Field>
              </div>
              <Field label="Business definition">
                <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What this field means and who owns it." />
              </Field>

              {needsOptions && (
                <Field label={`Options (${meta.label})`}>
                  <Textarea rows={5} value={form.options} onChange={(e) => set("options", e.target.value)} placeholder={"One option per line"} className="font-mono text-xs" />
                  <p className="mt-1 text-[11px] text-slate-400">{optionList.length} option(s)</p>
                </Field>
              )}

              {isFormula && (
                <Field label="Expression">
                  <Input value={form.expression} onChange={(e) => set("expression", e.target.value)} placeholder="capex + opex" className="font-mono text-xs" />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Arithmetic over this record&apos;s other custom field keys: + − * / % ( ). Read-only for users.
                  </p>
                </Field>
              )}
            </TabsContent>

            <TabsContent value="validation" className="mt-4 space-y-4">
              {isNumber && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Minimum"><Input type="number" value={form.min} onChange={(e) => set("min", e.target.value)} /></Field>
                  <Field label="Maximum"><Input type="number" value={form.max} onChange={(e) => set("max", e.target.value)} /></Field>
                  <Field label="Step"><Input type="number" value={form.step} onChange={(e) => set("step", e.target.value)} /></Field>
                  {normalizeType(form.dataType) === "CURRENCY" && (
                    <Field label="Currency">
                      <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{["USD", "EUR", "GBP", "ZAR", "AED"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <Checkbox checked={form.integer} onCheckedChange={(v) => set("integer", v === true)} /> Whole numbers only
                  </label>
                </div>
              )}
              {isTexty && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Min length"><Input type="number" value={form.minLength} onChange={(e) => set("minLength", e.target.value)} /></Field>
                  <Field label="Max length"><Input type="number" value={form.maxLength} onChange={(e) => set("maxLength", e.target.value)} /></Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600">
                    <Checkbox checked={form.multiline} onCheckedChange={(v) => set("multiline", v === true)} /> Multi-line (textarea)
                  </label>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Placeholder"><Input value={form.placeholder} onChange={(e) => set("placeholder", e.target.value)} /></Field>
                {!isFormula && <Field label="Default value"><Input value={form.defaultValue} onChange={(e) => set("defaultValue", e.target.value)} /></Field>}
                {!isNumber && !isFormula && normalizeType(form.dataType) !== "CHECKBOX" && (
                  <Field label="Unit suffix"><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="%, hrs, days…" /></Field>
                )}
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700">Summary</p>
                <p className="mt-1">{ruleSummary({
                  ...(form.min !== "" ? { min: Number(form.min) } : {}),
                  ...(form.max !== "" ? { max: Number(form.max) } : {}),
                  ...(form.integer ? { integer: true } : {}),
                  ...(form.minLength !== "" ? { minLength: Number(form.minLength) } : {}),
                  ...(form.maxLength !== "" ? { maxLength: Number(form.maxLength) } : {}),
                  ...(form.multiline ? { multiline: true } : {}),
                  ...(form.unit ? { unit: form.unit } : {}),
                } as never) || "No validation rules configured."}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Flag form={form} set={set} k="isSearchable" label="Searchable" />
                <Flag form={form} set={set} k="isFilterable" label="Filterable" />
                <Flag form={form} set={set} k="isSortable" label="Sortable" />
                <Flag form={form} set={set} k="isReportable" label="Include in reports" />
                <Flag form={form} set={set} k="isExportable" label="Include in exports" />
              </div>
            </TabsContent>

            <TabsContent value="governance" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Sensitivity">
                  <Select value={form.sensitivity} onValueChange={(v) => set("sensitivity", v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_SENSITIVITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {form.status === "DEPRECATED" && (
                <Field label="Deprecation reason">
                  <Input value={form.deprecationReason} onChange={(e) => set("deprecationReason", e.target.value)} placeholder="Superseded by …" />
                </Field>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Flag form={form} set={set} k="isRequired" label="Required by default" />
                <Flag form={form} set={set} k="isReadOnly" label="Read-only by default" />
              </div>
              <RolePicker title="Roles allowed to view" roles={form.visibleRoles} onChange={(r) => set("visibleRoles", r)} />
              <RolePicker title="Roles allowed to edit" roles={form.editableRoles} onChange={(r) => set("editableRoles", r)} />
              <p className="text-[11px] text-slate-400">
                Leaving a role list empty means unrestricted for that axis. Sensitivity and role gates apply in every module that uses the field.
              </p>
            </TabsContent>
          </div>
        </Tabs>

        {ackImpact && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This change affects existing data. Press Save again to acknowledge the impact and apply it.
          </div>
        )}

        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : ackImpact ? "Acknowledge & save" : editing ? "Save changes" : "Create field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function Flag({ form, set, k, label }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; k: keyof FormState; label: string }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
      {label}
      <Switch checked={Boolean(form[k])} onCheckedChange={(v) => set(k, v as never)} />
    </label>
  );
}

function RolePicker({ title, roles, onChange }: { title: string; roles: string[]; onChange: (r: string[]) => void }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-xs font-medium text-slate-600">{title} <Badge variant="outline" className="ml-1 text-[10px]">{roles.length || "all"}</Badge></p>
      <div className="flex flex-wrap gap-3">
        {ROLES.map((r) => (
          <label key={r} className="flex items-center gap-1.5 text-xs text-slate-600">
            <Checkbox
              checked={roles.includes(r)}
              onCheckedChange={(v) => onChange(v === true ? [...roles, r] : roles.filter((x) => x !== r))}
            />
            {r.replace(/_/g, " ")}
          </label>
        ))}
      </div>
    </div>
  );
}
