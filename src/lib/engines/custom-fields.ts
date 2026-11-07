// PM CONTROL TOWER — Dynamic Field Configuration Engine (pure logic)
// Admin-defined field dictionary + tab mappings. Values live on Project.customData
// (Json column keyed by fieldKey). No Prisma/db imports here — everything is
// unit-testable (tests/engines/custom-fields.test.ts).
//
// SQLite note: Prisma stores Json as TEXT on SQLite; on PostgreSQL the same
// column maps to JSONB with no code changes. Deep merging happens app-side so
// the behavior is identical on both connectors.

/** Supported field data types (app-level enum — SQLite has no Prisma enums). */
export const FIELD_DATA_TYPES = [
  "TEXT", "NUMBER", "DATE", "BOOLEAN", "DROPDOWN", "USER_LOOKUP",
  "EMAIL", "URL", "PHONE", "MULTI_SELECT",
] as const;
export type FieldDataType = (typeof FIELD_DATA_TYPES)[number];

export function isFieldDataType(v: unknown): v is FieldDataType {
  return typeof v === "string" && (FIELD_DATA_TYPES as readonly string[]).includes(v);
}

/** A single custom value: primitives + MULTI_SELECT string[] (flat by fieldKey). */
export type FieldValue = string | number | boolean | string[] | null;

/** project.customData shape: { [fieldKey]: value } */
export type CustomData = Record<string, FieldValue>;

/** Dictionary definition subset the engine validates against. */
export interface FieldDef {
  id: string;
  fieldKey: string;
  label: string;
  dataType: string;
  options?: unknown; // Json column → unknown; DROPDOWN/MULTI_SELECT expect string[]
  config?: unknown;  // Json column → unknown; validation + display rules (FieldConfig)
  description?: string | null;
  isActive: boolean;
}

/**
 * Per-field validation + display rules (CustomFieldDefinition.config Json).
 * Every key is optional — an absent/invalid rule simply isn't enforced, so a
 * malformed config can never make a field unsavable.
 */
export interface FieldConfig {
  min?: number;         // NUMBER: minimum inclusive value
  max?: number;         // NUMBER: maximum inclusive value
  step?: number;        // NUMBER: input step hint (renderer)
  integer?: boolean;    // NUMBER: whole numbers only
  unit?: string;        // display suffix: %, hrs, USD …
  minLength?: number;   // TEXT/EMAIL/URL/PHONE: minimum characters
  maxLength?: number;   // TEXT/EMAIL/URL/PHONE: maximum characters
  multiline?: boolean;  // TEXT: render as a textarea
  placeholder?: string; // input placeholder override
  defaultValue?: FieldValue; // prefill when the project has never stored a value
}

/** A field as mapped onto a tab (hydrated from TabFieldMapping). */
export interface TabField {
  displayOrder: number;
  isRequired: boolean;
  isReadOnly: boolean;   // locked on this tab
  fullWidth: boolean;    // spans both form columns
  showInReport: boolean; // included in field reporting / coverage
  field: FieldDef;
}

/** Fully-hydrated tab (GET /api/tabs shape). */
export interface HydratedTab {
  id: string;
  name: string;
  order: number;
  description: string | null;
  fields: TabField[];
}

export const MAX_TEXT_LENGTH = 2000;
export const MAX_MULTI_SELECT = 200;

// ---------------------------------------------------------------------------
// Deep merge — PATCH of one tab must never clobber keys owned by other tabs.
// Plain objects merge recursively; arrays and primitives are replaced;
// `undefined` patch values are ignored (absent ≠ clear).
// ---------------------------------------------------------------------------
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = deepMerge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// parseCustomData — Json column comes back as `unknown`; keep only flat
// primitive entries plus MULTI_SELECT string[] so downstream code can rely on
// CustomData typing. Malformed / nested garbage degrades gracefully.
// ---------------------------------------------------------------------------
export function parseCustomData(raw: unknown): CustomData {
  if (!isPlainObject(raw)) return {};
  const out: CustomData = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[key] = value as string[]; // MULTI_SELECT selection (string arrays only)
    }
    // nested objects / mixed arrays / undefined are dropped (not valid field values)
  }
  return out;
}

// ---------------------------------------------------------------------------
// normalizeOptions — DROPDOWN / MULTI_SELECT options Json → string[] (graceful).
// ---------------------------------------------------------------------------
export function normalizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is string => typeof o === "string" && o.trim().length > 0).map((o) => o.trim());
}

// ---------------------------------------------------------------------------
// normalizeFieldConfig — CustomFieldDefinition.config Json → FieldConfig.
// Unknown keys and impossible ranges are dropped rather than enforced, so a
// bad config degrades to "no rule" instead of locking admins out of a field.
// ---------------------------------------------------------------------------
export function normalizeFieldConfig(raw: unknown): FieldConfig {
  if (!isPlainObject(raw)) return {};
  const out: FieldConfig = {};

  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

  const min = num(raw.min);
  const max = num(raw.max);
  const minLength = num(raw.minLength);
  const maxLength = num(raw.maxLength);
  const step = num(raw.step);
  const unit = typeof raw.unit === "string" ? raw.unit.trim() : "";
  const placeholder = typeof raw.placeholder === "string" ? raw.placeholder.trim() : "";

  if (min !== undefined) out.min = min;
  if (max !== undefined) out.max = max;
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) {
    delete out.min; // inverted range → no range rule (never block a write)
    delete out.max;
  }
  if (step !== undefined && step > 0) out.step = step;
  if (typeof raw.integer === "boolean" && raw.integer) out.integer = true;
  if (unit) out.unit = unit.slice(0, 16);
  if (minLength !== undefined && minLength >= 0) out.minLength = Math.floor(minLength);
  if (maxLength !== undefined && maxLength > 0) out.maxLength = Math.min(Math.floor(maxLength), MAX_TEXT_LENGTH);
  if (out.minLength !== undefined && out.maxLength !== undefined && out.minLength > out.maxLength) {
    delete out.minLength; // inverted range → no length rule
    delete out.maxLength;
  }
  if (typeof raw.multiline === "boolean" && raw.multiline) out.multiline = true;
  if (placeholder) out.placeholder = placeholder.slice(0, 120);

  const dv = raw.defaultValue;
  if (typeof dv === "string" || typeof dv === "number" || typeof dv === "boolean") {
    out.defaultValue = dv;
  } else if (Array.isArray(dv) && dv.length && dv.every((v) => typeof v === "string")) {
    out.defaultValue = dv as string[];
  }
  return out;
}

/**
 * Value a form should prefill when the record has never stored one —
 * resolves the configured default against the field's type and options.
 * Returns undefined when there is no usable default (or it would be invalid).
 */
export function fieldDefault(
  def: Pick<FieldDef, "dataType" | "options" | "config">,
): FieldValue | undefined {
  const cfg = normalizeFieldConfig(def.config);
  const dv = cfg.defaultValue;
  if (dv === undefined || dv === null) return undefined;

  switch (def.dataType) {
    case "BOOLEAN":
      return typeof dv === "boolean" ? dv : undefined;
    case "NUMBER": {
      const n = typeof dv === "number" ? dv : typeof dv === "string" ? Number(dv) : NaN;
      if (!Number.isFinite(n)) return undefined;
      if (cfg.integer && !Number.isInteger(n)) return undefined;
      if (cfg.min !== undefined && n < cfg.min) return undefined;
      if (cfg.max !== undefined && n > cfg.max) return undefined;
      return n;
    }
    case "DATE":
      return typeof dv === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dv) ? dv : undefined;
    case "DROPDOWN": {
      if (typeof dv !== "string") return undefined;
      return normalizeOptions(def.options).includes(dv) ? dv : undefined;
    }
    case "MULTI_SELECT": {
      const options = normalizeOptions(def.options);
      const members = (Array.isArray(dv) ? dv : [])
        .filter((m): m is string => typeof m === "string" && options.includes(m));
      return members.length ? [...new Set(members)] : undefined;
    }
    case "USER_LOOKUP":
      return typeof dv === "string" && dv ? dv : undefined;
    default:
      // TEXT / EMAIL / URL / PHONE — strings only
      return typeof dv === "string" && dv ? dv : undefined;
  }
}

/**
 * One-line human summary of a field's rules ("0–100 % · whole", "≤40 chars").
 * Shared by the Form Tab Builder and the Field Dictionary so both surfaces
 * describe a field identically.
 */
export function ruleSummary(cfg: FieldConfig | null | undefined): string | null {
  if (!cfg) return null;
  const bits: string[] = [];
  if (cfg.min !== undefined || cfg.max !== undefined) {
    bits.push(`${cfg.min ?? "−∞"}–${cfg.max ?? "∞"}${cfg.unit ? ` ${cfg.unit}` : ""}`);
  } else if (cfg.unit) {
    bits.push(cfg.unit);
  }
  if (cfg.integer) bits.push("whole");
  if (cfg.minLength !== undefined) bits.push(`≥${cfg.minLength} chars`);
  if (cfg.maxLength !== undefined) bits.push(`≤${cfg.maxLength} chars`);
  if (cfg.multiline) bits.push("long text");
  if (cfg.placeholder) bits.push(`placeholder “${cfg.placeholder}”`);
  if (cfg.defaultValue !== undefined && cfg.defaultValue !== null && cfg.defaultValue !== "") {
    const d = Array.isArray(cfg.defaultValue) ? cfg.defaultValue.join(", ") : String(cfg.defaultValue);
    bits.push(`default ${d}`);
  }
  return bits.length ? bits.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Format checks for the string-shaped data types.
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_RE = /^\+?[\d\s().-]+$/;

function isValidUrl(v: string): boolean {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname.includes(".") || u.hostname === "localhost";
  } catch {
    return false;
  }
}

function isValidPhone(v: string): boolean {
  if (!PHONE_ALLOWED_RE.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// ---------------------------------------------------------------------------
// coerceValue — validate + coerce one submitted value against its dataType
// and its FieldConfig rules (range, length, integer, unit is display-only).
// ---------------------------------------------------------------------------
export type CoerceResult = { ok: true; value: FieldValue } | { ok: false; error: string };

export function coerceValue(
  def: Pick<FieldDef, "label" | "dataType" | "options"> & { config?: unknown },
  raw: unknown,
): CoerceResult {
  const label = def.label;
  const cfg = normalizeFieldConfig(def.config);
  const isEmpty = raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0);
  if (isEmpty) return { ok: true, value: null }; // empty clears the field

  switch (def.dataType) {
    case "TEXT":
    case "EMAIL":
    case "URL":
    case "PHONE": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected text` };
      const v = raw.trim();
      if (v.length > MAX_TEXT_LENGTH) return { ok: false, error: `${label}: max ${MAX_TEXT_LENGTH} characters` };
      if (cfg.maxLength !== undefined && v.length > cfg.maxLength) {
        return { ok: false, error: `${label}: max ${cfg.maxLength} characters` };
      }
      if (cfg.minLength !== undefined && v.length < cfg.minLength) {
        return { ok: false, error: `${label}: min ${cfg.minLength} characters` };
      }
      if (def.dataType === "EMAIL" && !EMAIL_RE.test(v)) {
        return { ok: false, error: `${label}: expected a valid email address` };
      }
      if (def.dataType === "URL" && !isValidUrl(v)) {
        return { ok: false, error: `${label}: expected a valid URL (e.g. https://example.com)` };
      }
      if (def.dataType === "PHONE" && !isValidPhone(v)) {
        return { ok: false, error: `${label}: expected a valid phone number (7–15 digits)` };
      }
      return { ok: true, value: v };
    }
    case "NUMBER": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return { ok: false, error: `${label}: expected a finite number` };
      if (cfg.integer && !Number.isInteger(n)) return { ok: false, error: `${label}: expected a whole number` };
      if (cfg.min !== undefined && n < cfg.min) return { ok: false, error: `${label}: must be at least ${cfg.min}` };
      if (cfg.max !== undefined && n > cfg.max) return { ok: false, error: `${label}: must be at most ${cfg.max}` };
      return { ok: true, value: n };
    }
    case "DATE": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected a date string` };
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { ok: false, error: `${label}: invalid date` };
      return { ok: true, value: raw.slice(0, 10) }; // normalize to yyyy-mm-dd
    }
    case "BOOLEAN": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
      return { ok: false, error: `${label}: expected true/false` };
    }
    case "DROPDOWN": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected one of the options` };
      const options = normalizeOptions(def.options);
      if (!options.includes(raw)) return { ok: false, error: `${label}: "${raw}" is not a valid option` };
      return { ok: true, value: raw };
    }
    case "MULTI_SELECT": {
      if (!Array.isArray(raw)) return { ok: false, error: `${label}: expected an array of options` };
      const options = normalizeOptions(def.options);
      const picked: string[] = [];
      for (const item of raw) {
        if (typeof item !== "string") return { ok: false, error: `${label}: expected an array of options` };
        const v = item.trim();
        if (!v) continue;
        if (!options.includes(v)) return { ok: false, error: `${label}: "${v}" is not a valid option` };
        if (!picked.includes(v)) picked.push(v); // de-dupe, preserve order
      }
      if (picked.length === 0) return { ok: true, value: null };
      if (picked.length > MAX_MULTI_SELECT) return { ok: false, error: `${label}: max ${MAX_MULTI_SELECT} selections` };
      return { ok: true, value: picked };
    }
    case "USER_LOOKUP": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected a user id` };
      return { ok: true, value: raw }; // existence checked at the route level (needs db)
    }
    default:
      return { ok: false, error: `${label}: unknown data type "${def.dataType}"` };
  }
}

// ---------------------------------------------------------------------------
// validateCustomData — validate an incoming partial payload against the
// dictionary. Unknown keys / inactive fields are hard errors (400) so silent
// data loss never happens. Required enforcement is caller-driven via
// `requiredKeys` and applies only to SUBMITTED keys (updating one tab must not
// fail because an unrelated tab's required field is empty).
// ---------------------------------------------------------------------------
export interface ValidateResult {
  values: CustomData;
  errors: string[];
}

export function validateCustomData(
  defs: FieldDef[],
  incoming: Record<string, unknown>,
  opts: { requiredKeys?: ReadonlySet<string> } = {},
): ValidateResult {
  const byKey = new Map(defs.map((d) => [d.fieldKey, d]));
  const values: CustomData = {};
  const errors: string[] = [];

  for (const [key, raw] of Object.entries(incoming)) {
    const def = byKey.get(key);
    if (!def) {
      errors.push(`Unknown field "${key}"`);
      continue;
    }
    if (!def.isActive) {
      errors.push(`Field "${def.label}" is inactive`);
      continue;
    }
    const res = coerceValue(def, raw);
    if (!res.ok) {
      errors.push(res.error);
      continue;
    }
    if (opts.requiredKeys?.has(key) && (res.value === null || res.value === "")) {
      errors.push(`${def.label} is required`);
      continue;
    }
    values[key] = res.value;
  }
  return { values, errors };
}

// ---------------------------------------------------------------------------
// missingRequired — keys of `defs` marked required whose value is empty
// (null / "" / an empty MULTI_SELECT selection).
// ---------------------------------------------------------------------------
export function missingRequired(fields: { isRequired: boolean; field: FieldDef }[], data: CustomData): string[] {
  const missing: string[] = [];
  for (const f of fields) {
    if (!f.isRequired) continue;
    const v = data[f.field.fieldKey];
    const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) missing.push(f.field.fieldKey);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Reporting — compute one row of coverage/statistics for a field across the
// scanned records (one value per record, raw Json values).
// ---------------------------------------------------------------------------
export interface FieldTopValue {
  value: string;
  count: number;
  pct: number; // share of FILLED values (rounded)
}
export interface FieldNumericStat { min: number; max: number; avg: number; sum: number }
export interface FieldDateStat { earliest: string; latest: string }

export interface FieldReportRow {
  fieldKey: string;
  label: string;
  dataType: string;
  unit: string | null;
  total: number;         // records scanned
  filled: number;        // records with a non-empty value
  fillRatePct: number;   // filled / total (0 when nothing scanned)
  distinct: number;      // distinct values (members, for MULTI_SELECT)
  numeric: FieldNumericStat | null; // NUMBER only
  dates: FieldDateStat | null;      // DATE only
  topValues: FieldTopValue[];       // DROPDOWN / MULTI_SELECT / BOOLEAN only (top 5)
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const TOP_N = 5;

export function computeFieldStats(def: FieldDef, values: readonly unknown[]): FieldReportRow {
  const cfg = normalizeFieldConfig(def.config);
  const total = values.length;
  let filled = 0;
  let nMin = Infinity;
  let nMax = -Infinity;
  let nSum = 0;
  let nCount = 0;
  // date range accumulators — a boolean guard avoids self-referential
  // narrowing (reading and writing the same nullable accumulator in one
  // expression collapses the flow type to `never` for the comparison).
  let earliest = "";
  let latest = "";
  let seenDate = false;
  const counts = new Map<string, number>();

  const bump = (v: string) => counts.set(v, (counts.get(v) ?? 0) + 1);

  for (const raw of values) {
    if (raw === null || raw === undefined || raw === "") continue;
    if (Array.isArray(raw)) {
      const members = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (!members.length) continue;
      filled += 1;
      for (const m of members) bump(m);
      continue;
    }
    if (typeof raw === "object") continue; // nested garbage is not a value

    if (typeof raw === "number") {
      filled += 1;
      if (Number.isFinite(raw)) {
        nMin = Math.min(nMin, raw);
        nMax = Math.max(nMax, raw);
        nSum += raw;
        nCount += 1;
      }
      bump(String(raw));
      continue;
    }
    if (typeof raw === "boolean") {
      filled += 1;
      bump(raw ? "Yes" : "No");
      continue;
    }
    // string
    if (typeof raw !== "string") continue; // symbols / bigints are not field values
    if (!raw.trim()) continue;
    filled += 1;
    if (def.dataType === "DATE" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      if (!seenDate || raw < earliest) earliest = raw;
      if (!seenDate || raw > latest) latest = raw;
      seenDate = true;
    }
    bump(raw);
  }

  const countable = def.dataType === "DROPDOWN" || def.dataType === "MULTI_SELECT" || def.dataType === "BOOLEAN";
  const topValues: FieldTopValue[] = countable && filled > 0
    ? [...counts.entries()]
        .map(([value, count]) => ({ value, count, pct: Math.round((count / filled) * 100) }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, TOP_N)
    : [];

  return {
    fieldKey: def.fieldKey,
    label: def.label,
    dataType: def.dataType,
    unit: cfg.unit ?? null,
    total,
    filled,
    fillRatePct: total > 0 ? Math.round((filled / total) * 100) : 0,
    distinct: counts.size,
    numeric: def.dataType === "NUMBER" && nCount > 0
      ? { min: nMin, max: nMax, avg: round2(nSum / nCount), sum: round2(nSum) }
      : null,
    dates: def.dataType === "DATE" && seenDate ? { earliest, latest } : null,
    topValues,
  };
}
