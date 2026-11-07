"use client";
// PM CONTROL TOWER — FieldInput
// Renders the correct control for a dictionary field's data type and keeps the
// value in the right JS shape for typed persistence. Shared by the module
// record panels, the project workspace and the dictionary preview.

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/components/pmct/kit";
import { useApi } from "@/lib/client";
import { normalizeType } from "@/lib/engines/field-dictionary";
import type { FieldValue } from "@/lib/engines/custom-fields";
import type { AssignmentLite, FieldLite } from "./types";

const NO_SELECT = "__pmct_none__";

export interface FieldInputProps {
  field: FieldLite;
  assignment?: Pick<AssignmentLite, "isRequired" | "isReadOnly" | "validationOverrides" | "displayLabel"> | null;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  disabled?: boolean;
  idPrefix?: string;
  autoFocus?: boolean;
}

export function fieldLabel(a: Pick<AssignmentLite, "displayLabel" | "field"> | null | undefined, field: FieldLite): string {
  return a?.displayLabel || field.label;
}

export function FieldInput({ field, assignment, value, onChange, disabled, idPrefix = "cf", autoFocus }: FieldInputProps) {
  const type = normalizeType(field.dataType);
  const cfg = { ...(field.config ?? {}), ...(assignment?.validationOverrides ?? {}) };
  const locked = disabled || assignment?.isReadOnly || field.isReadOnly || type === "FORMULA" || field.status !== "ACTIVE";
  const inputId = `${idPrefix}-${field.fieldKey}`;

  // USER_LOOKUP / ENTITY_LOOKUP options (fetched only when needed)
  const needsUsers = type === "USER_LOOKUP";
  const users = useApi<{ users: { id: string; name: string; title: string | null }[] }>(needsUsers ? "/api/users/lookup" : null);
  const entityOptions = useEntityOptions(type === "ENTITY_LOOKUP" ? (field.config as { entity?: string } | null)?.entity : undefined);

  const numberValue = value === null || value === undefined || value === "" ? "" : String(value);
  const textValue = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);

  const unit = cfg.unit;
  const currency = (cfg as { currency?: string }).currency || "USD";

  const rendered = useMemo(() => {
    switch (type) {
      case "LONG_TEXT":
        return (
          <Textarea
            id={inputId} rows={3} value={textValue} disabled={locked} autoFocus={autoFocus}
            maxLength={cfg.maxLength} placeholder={cfg.placeholder ?? field.label}
            onChange={(e) => onChange(e.target.value || null)} className="bg-white"
          />
        );
      case "TEXT":
      case "EMAIL":
      case "URL":
      case "PHONE":
        return (
          <Input
            id={inputId}
            type={type === "EMAIL" ? "email" : type === "URL" ? "url" : type === "PHONE" ? "tel" : "text"}
            value={textValue} disabled={locked} autoFocus={autoFocus}
            maxLength={cfg.maxLength} placeholder={cfg.placeholder ?? field.label}
            onChange={(e) => onChange(e.target.value || null)} className="bg-white"
          />
        );
      case "INTEGER":
      case "DECIMAL":
      case "CURRENCY":
      case "PERCENTAGE":
        return (
          <div className="relative">
            {type === "CURRENCY" && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency}
              </span>
            )}
            <Input
              id={inputId} type="number" value={numberValue} disabled={locked} autoFocus={autoFocus}
              step={cfg.step ?? (type === "INTEGER" ? 1 : "any")} min={cfg.min} max={cfg.max}
              placeholder={cfg.placeholder}
              className={cn("bg-white", type === "CURRENCY" && "pl-7", (unit || type === "PERCENTAGE") && "pr-10")}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            />
            {(unit || type === "PERCENTAGE") && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {unit || "%"}
              </span>
            )}
          </div>
        );
      case "DATE":
        return <Input id={inputId} type="date" value={textValue.slice(0, 10)} disabled={locked} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value || null)} className="bg-white" />;
      case "DATETIME":
        return <Input id={inputId} type="datetime-local" value={textValue.slice(0, 16)} disabled={locked} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value || null)} className="bg-white" />;
      case "CHECKBOX":
        return (
          <div className="flex h-9 items-center gap-2">
            <Checkbox id={inputId} checked={value === true} disabled={locked} onCheckedChange={(v) => onChange(v === true)} />
            <span className="text-xs text-slate-500">{value === true ? "Yes" : "No"}</span>
          </div>
        );
      case "SINGLE_SELECT":
        return (
          <Select value={typeof value === "string" ? value : NO_SELECT} disabled={locked} onValueChange={(v) => onChange(v === NO_SELECT ? null : v)}>
            <SelectTrigger id={inputId} className="h-9 bg-white"><SelectValue placeholder={cfg.placeholder ?? "Select…"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECT}>— None —</SelectItem>
              {field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "MULTI_SELECT": {
        const picked = Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
        return (
          <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2">
            {field.options.length === 0 ? (
              <p className="text-xs text-amber-600">No options configured for this field.</p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                {field.options.map((o) => (
                  <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-white">
                    <Checkbox
                      checked={picked.includes(o)} disabled={locked}
                      onCheckedChange={(v) => onChange(v === true ? [...picked, o] : picked.filter((x) => x !== o))}
                    />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      }
      case "USER_LOOKUP":
        return (
          <Select value={typeof value === "string" ? value : NO_SELECT} disabled={locked} onValueChange={(v) => onChange(v === NO_SELECT ? null : v)}>
            <SelectTrigger id={inputId} className="h-9 bg-white"><SelectValue placeholder="Select a user…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECT}>— None —</SelectItem>
              {(users.data?.users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}{u.title ? ` — ${u.title}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "ENTITY_LOOKUP":
        return (
          <Select value={typeof value === "string" ? value : NO_SELECT} disabled={locked} onValueChange={(v) => onChange(v === NO_SELECT ? null : v)}>
            <SelectTrigger id={inputId} className="h-9 bg-white"><SelectValue placeholder="Select a record…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECT}>— None —</SelectItem>
              {entityOptions.loading && <div className="px-2 py-1 text-xs text-slate-400">Loading…</div>}
              {(entityOptions.data?.records ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "FORMULA": {
        const expr = (field.config as { expression?: string } | null)?.expression ?? "";
        return (
          <div className="flex h-9 items-center justify-between rounded-md border border-dashed border-slate-200 bg-slate-50 px-3">
            <span className="text-sm tabular-nums text-slate-700">
              {value === null || value === undefined || value === "" ? "—" : String(value)}
            </span>
            <code className="text-[10px] text-slate-400">{expr}</code>
          </div>
        );
      }
      default:
        return <Input id={inputId} value={textValue} disabled={locked} onChange={(e) => onChange(e.target.value || null)} className="bg-white" />;
    }
  }, [type, value, locked, field, assignment, cfg, users.data, entityOptions.data, onChange, inputId, autoFocus, currency, unit, numberValue, textValue]);

  return <div key={field.fieldKey}>{rendered}</div>;
}

/** ENTITY_LOOKUP options loader — resolves a small, known set of entities. */
function useEntityOptions(entity?: string) {
  const path = entity ? ENTITY_ENDPOINTS[entity] : undefined;
  return useApi<{ records: { id: string; label: string }[] }>(path ?? null);
}

const ENTITY_ENDPOINTS: Record<string, string> = {
  project: "/api/field-options/projects",
  portfolio: "/api/field-options/portfolios",
  program: "/api/field-options/programs",
  client: "/api/field-options/clients",
};
