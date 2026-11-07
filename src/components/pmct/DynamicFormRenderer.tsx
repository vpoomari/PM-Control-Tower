"use client";
// PM CONTROL TOWER — DynamicFormRenderer
// End-user form for one admin-configured ProjectTab. Renders an input per
// field dataType (React Hook Form state), gracefully handles missing
// customData keys, and submits ONLY this tab's values as a partial payload —
// the API deep-merges so other tabs' values are never clobbered.
// Supports dictionary validation rules (min/max/length/unit/placeholder/
// default value) and per-mapping settings (required, read-only, full width).

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, cn } from "@/components/pmct/kit";
import { Eye, Save } from "lucide-react";
import {
  fieldDefault, normalizeFieldConfig, normalizeOptions,
  type CustomData, type FieldValue, type HydratedTab,
} from "@/lib/engines/custom-fields";

type FormValues = Record<string, string | boolean | string[]>;

/** Missing keys degrade to type-appropriate empty values — never crash.
 *  A field the project has never stored picks up its configured default. */
function buildDefaults(tab: HydratedTab, data: CustomData): FormValues {
  const defaults: FormValues = {};
  for (const f of tab.fields) {
    const key = f.field.fieldKey;
    const stored = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
    const v = stored === undefined ? fieldDefault(f.field) : stored;
    if (f.field.dataType === "BOOLEAN") {
      defaults[key] = v === true;
    } else if (f.field.dataType === "MULTI_SELECT") {
      defaults[key] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } else {
      defaults[key] = typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
    }
  }
  return defaults;
}

/** Form state → partial customData payload for this tab's editable fields only.
 *  Read-only fields are never submitted, so a locked value can't be rewritten. */
function toPayload(tab: HydratedTab, values: FormValues): Record<string, FieldValue> {
  const payload: Record<string, FieldValue> = {};
  for (const f of tab.fields) {
    if (f.isReadOnly) continue;
    const raw = values[f.field.fieldKey];
    switch (f.field.dataType) {
      case "BOOLEAN":
        payload[f.field.fieldKey] = raw === true;
        break;
      case "NUMBER":
        payload[f.field.fieldKey] = raw === "" || raw === undefined ? null : Number(raw);
        break;
      case "MULTI_SELECT": {
        const picked = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
        payload[f.field.fieldKey] = picked.length ? picked : null;
        break;
      }
      default:
        payload[f.field.fieldKey] = raw === "" || raw === undefined ? null : String(raw);
    }
  }
  return payload;
}

export default function DynamicFormRenderer({
  tab,
  projectId,
  customData,
  onSaved,
  preview = false,
}: {
  tab: HydratedTab;
  projectId: string;
  customData: unknown;
  onSaved?: () => void;
  /** Render the form exactly as it appears to users, but inert (no saving). */
  preview?: boolean;
}) {
  const data = useMemo<CustomData>(() => {
    // inline tiny parse (keeps this component dependency-free of engine internals)
    if (typeof customData !== "object" || customData === null || Array.isArray(customData)) return {};
    const out: CustomData = {};
    for (const [k, v] of Object.entries(customData as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === "string")) out[k] = v as string[];
    }
    return out;
  }, [customData]);

  const needsUsers = tab.fields.some((f) => f.field.dataType === "USER_LOOKUP");
  const users = useApi<{ users: { id: string; name: string; title: string | null }[] }>(needsUsers ? "/api/users/lookup" : null);

  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: buildDefaults(tab, data),
  });

  // re-hydrate when the stored JSON changes (save, realtime refetch, other tab)
  useEffect(() => {
    reset(buildDefaults(tab, data));
  }, [customData, tab.id]);

  if (!tab.fields.length) {
    return <EmptyState title="No fields configured" description="An admin can assign fields to this tab in the Form Tab Builder." />;
  }

  const submit = async (values: FormValues) => {
    try {
      await api.patch(`/api/projects/${projectId}`, { customData: toPayload(tab, values) });
      toast.success(`${tab.name} saved`);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const requiredCount = tab.fields.filter((f) => f.isRequired).length;
  const lockedCount = tab.fields.filter((f) => f.isReadOnly).length;

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {tab.description && (
        <p className="text-xs text-slate-500 -mb-1">{tab.description}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {tab.fields.map(({ field, isRequired, isReadOnly, fullWidth }) => {
          const key = field.fieldKey;
          const hint = field.description;
          const cfg = normalizeFieldConfig(field.config);
          const locked = isReadOnly || preview;
          const span = fullWidth || cfg.multiline || field.dataType === "TEXT" || field.dataType === "MULTI_SELECT"
            ? "sm:col-span-2"
            : "";
          const rangeHint = field.dataType === "NUMBER" && (cfg.min !== undefined || cfg.max !== undefined || cfg.integer)
            ? `${cfg.integer ? "whole number" : "number"} · ${cfg.min ?? "−∞"} to ${cfg.max ?? "∞"}${cfg.unit ? ` ${cfg.unit}` : ""}`
            : null;

          const labelNode = (
            <Label htmlFor={key} className="text-xs font-medium text-slate-600">
              {field.label}
              {isRequired && <span className="text-red-500 ml-0.5">*</span>}
              {isReadOnly && (
                <span className="ml-2 inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
                  locked
                </span>
              )}
            </Label>
          );

          const inputClass = cn("h-9", cfg.unit && field.dataType === "NUMBER" && "pr-11");

          const stringInput = (type: string) => (
            <Input
              id={key}
              type={type}
              className={inputClass}
              placeholder={cfg.placeholder ?? field.label}
              maxLength={cfg.maxLength}
              disabled={locked}
              {...register(key)}
            />
          );

          return (
            <div key={key} className={cn("space-y-1.5", span)}>
              {labelNode}

              {field.dataType === "TEXT" && cfg.multiline ? (
                <Textarea
                  id={key}
                  rows={3}
                  placeholder={cfg.placeholder ?? field.label}
                  maxLength={cfg.maxLength}
                  disabled={locked}
                  {...register(key)}
                />
              ) : field.dataType === "TEXT" ? (
                stringInput("text")
              ) : field.dataType === "EMAIL" ? (
                stringInput("email")
              ) : field.dataType === "URL" ? (
                stringInput("url")
              ) : field.dataType === "PHONE" ? (
                stringInput("tel")
              ) : field.dataType === "NUMBER" ? (
                <div className="relative">
                  <Input
                    id={key}
                    type="number"
                    step={cfg.step ?? "any"}
                    min={cfg.min}
                    max={cfg.max}
                    className={inputClass}
                    placeholder={cfg.placeholder}
                    disabled={locked}
                    {...register(key)}
                  />
                  {cfg.unit && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      {cfg.unit}
                    </span>
                  )}
                </div>
              ) : field.dataType === "DATE" ? (
                <Input id={key} type="date" className="h-9" disabled={locked} {...register(key)} />
              ) : field.dataType === "BOOLEAN" ? (
                <Controller
                  control={control}
                  name={key}
                  render={({ field: rf }) => (
                    <div className="flex items-center gap-2 h-9">
                      <Checkbox
                        id={key}
                        checked={rf.value === true}
                        disabled={locked}
                        onCheckedChange={(v) => rf.onChange(v === true)}
                      />
                      <span className="text-xs text-slate-500">{rf.value === true ? "Yes" : "No"}</span>
                    </div>
                  )}
                />
              ) : field.dataType === "DROPDOWN" ? (
                <Controller
                  control={control}
                  name={key}
                  render={({ field: rf }) => (
                    <Select value={typeof rf.value === "string" ? rf.value : ""} onValueChange={rf.onChange} disabled={locked}>
                      <SelectTrigger id={key} className="h-9"><SelectValue placeholder={cfg.placeholder ?? "Select…"} /></SelectTrigger>
                      <SelectContent>
                        {normalizeOptions(field.options).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : field.dataType === "MULTI_SELECT" ? (
                <Controller
                  control={control}
                  name={key}
                  render={({ field: rf }) => {
                    const picked = Array.isArray(rf.value) ? rf.value.filter((x): x is string => typeof x === "string") : [];
                    const options = normalizeOptions(field.options);
                    return (
                      <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2">
                        {options.length === 0 ? (
                          <p className="text-xs text-amber-600">No options configured for this field.</p>
                        ) : (
                          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                            {options.map((opt) => (
                              <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-white">
                                <Checkbox
                                  checked={picked.includes(opt)}
                                  disabled={locked}
                                  onCheckedChange={(v) =>
                                    rf.onChange(v === true ? [...picked, opt] : picked.filter((x) => x !== opt))
                                  }
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              ) : field.dataType === "USER_LOOKUP" ? (
                users.loading && !users.data ? (
                  <div className="h-9 flex items-center text-xs text-slate-400">Loading users…</div>
                ) : (
                  <Controller
                    control={control}
                    name={key}
                    render={({ field: rf }) => (
                      <Select value={typeof rf.value === "string" ? rf.value : ""} onValueChange={rf.onChange} disabled={locked}>
                        <SelectTrigger id={key} className="h-9"><SelectValue placeholder="Select a user…" /></SelectTrigger>
                        <SelectContent>
                          {(users.data?.users ?? []).map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )
              ) : (
                <div className="h-9 flex items-center text-xs text-amber-600">Unsupported field type: {field.dataType}</div>
              )}

              {(hint || rangeHint) && (
                <p className="text-[11px] text-slate-400">{hint}{hint && rangeHint ? " · " : ""}{rangeHint}</p>
              )}
            </div>
          );
        })}
      </div>

      {preview ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          Preview — this is exactly how the tab renders for users. Nothing is saved from preview.
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" size="sm" disabled={formState.isSubmitting}>
            <Save className="h-3.5 w-3.5 mr-1.5" />Save {tab.name}
          </Button>
          <span className="text-[11px] text-slate-400">
            {requiredCount} required{lockedCount ? ` · ${lockedCount} locked` : ""} · values persist on the project record
          </span>
        </div>
      )}
    </form>
  );
}
