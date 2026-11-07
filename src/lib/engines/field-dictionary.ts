// PM CONTROL TOWER — Field Dictionary Engine (pure logic, no db imports)
// Centralised, reusable field definitions: define once, reuse across modules,
// configure per module, store values against the correct business record.
//
// Layers:
//   (A) FieldDefinition  — CustomFieldDefinition row (global, reusable)
//   (B) Assignment       — ModuleFieldAssignment row (per-module display config)
//   (C) Value            — CustomFieldValue row (typed, per business record)
//
// Everything here is pure so tests/engines/field-dictionary.test.ts can cover it.
// DB access lives in src/lib/fields/store.ts.

import { normalizeFieldConfig, normalizeOptions, type FieldConfig, type FieldValue } from "./custom-fields";

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export const FIELD_TYPES = [
  "TEXT", "LONG_TEXT", "INTEGER", "DECIMAL", "CURRENCY", "PERCENTAGE",
  "DATE", "DATETIME", "CHECKBOX", "SINGLE_SELECT", "MULTI_SELECT",
  "USER_LOOKUP", "ENTITY_LOOKUP", "URL", "EMAIL", "PHONE", "FORMULA",
] as const;
export type FieldTypeDef = (typeof FIELD_TYPES)[number];

export function isFieldType(v: unknown): v is FieldTypeDef {
  return typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v);
}

export interface FieldTypeMeta {
  type: FieldTypeDef;
  label: string;
  group: "Text" | "Number" | "Date" | "Choice" | "Reference" | "Computed";
  /** Which typed CustomFieldValue column stores the value. */
  column: "valueText" | "valueNumber" | "valueDate" | "valueBool" | "valueJson";
  /** Can the type be numerically compared (sorted / range-filtered)? */
  sortable: boolean;
  /** Can the type be used in an advanced filter? */
  filterable: boolean;
  /** Can the type appear in reports and exports? */
  reportable: boolean;
  /** Does the type require an options list? */
  needsOptions: boolean;
  /** Input control the UI should render. */
  input: "text" | "textarea" | "number" | "currency" | "percentage" | "date" | "datetime" | "checkbox" | "select" | "multiselect" | "user" | "entity" | "url" | "email" | "phone" | "formula";
  /** Types that behave like the legacy v3.2 engine (Tab Builder compat). */
  legacy?: string;
}

export const FIELD_TYPE_META: Record<FieldTypeDef, FieldTypeMeta> = {
  TEXT:         { type: "TEXT", label: "Text", group: "Text", column: "valueText", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "text", legacy: "TEXT" },
  LONG_TEXT:    { type: "LONG_TEXT", label: "Long text", group: "Text", column: "valueText", sortable: false, filterable: true, reportable: true, needsOptions: false, input: "textarea", legacy: "TEXT" },
  INTEGER:      { type: "INTEGER", label: "Integer", group: "Number", column: "valueNumber", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "number", legacy: "NUMBER" },
  DECIMAL:      { type: "DECIMAL", label: "Decimal", group: "Number", column: "valueNumber", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "number", legacy: "NUMBER" },
  CURRENCY:     { type: "CURRENCY", label: "Currency", group: "Number", column: "valueNumber", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "currency", legacy: "NUMBER" },
  PERCENTAGE:   { type: "PERCENTAGE", label: "Percentage", group: "Number", column: "valueNumber", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "percentage", legacy: "NUMBER" },
  DATE:         { type: "DATE", label: "Date", group: "Date", column: "valueDate", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "date", legacy: "DATE" },
  DATETIME:     { type: "DATETIME", label: "Date & time", group: "Date", column: "valueDate", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "datetime" },
  CHECKBOX:     { type: "CHECKBOX", label: "Checkbox", group: "Choice", column: "valueBool", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "checkbox", legacy: "BOOLEAN" },
  SINGLE_SELECT:{ type: "SINGLE_SELECT", label: "Single select", group: "Choice", column: "valueText", sortable: true, filterable: true, reportable: true, needsOptions: true, input: "select", legacy: "DROPDOWN" },
  MULTI_SELECT: { type: "MULTI_SELECT", label: "Multi select", group: "Choice", column: "valueJson", sortable: false, filterable: true, reportable: true, needsOptions: true, input: "multiselect", legacy: "MULTI_SELECT" },
  USER_LOOKUP:  { type: "USER_LOOKUP", label: "User lookup", group: "Reference", column: "valueText", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "user", legacy: "USER_LOOKUP" },
  ENTITY_LOOKUP:{ type: "ENTITY_LOOKUP", label: "Entity lookup", group: "Reference", column: "valueText", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "entity" },
  URL:          { type: "URL", label: "URL", group: "Text", column: "valueText", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "url", legacy: "URL" },
  EMAIL:        { type: "EMAIL", label: "Email", group: "Text", column: "valueText", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "email", legacy: "EMAIL" },
  PHONE:        { type: "PHONE", label: "Phone", group: "Text", column: "valueText", sortable: false, filterable: true, reportable: true, needsOptions: false, input: "phone", legacy: "PHONE" },
  FORMULA:      { type: "FORMULA", label: "Formula / calculated", group: "Computed", column: "valueNumber", sortable: true, filterable: true, reportable: true, needsOptions: false, input: "formula" },
};

export type FieldStatus = "ACTIVE" | "INACTIVE" | "DEPRECATED" | "ARCHIVED";
export const FIELD_STATUSES: FieldStatus[] = ["ACTIVE", "INACTIVE", "DEPRECATED", "ARCHIVED"];

export type FieldSensitivity = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
export const FIELD_SENSITIVITIES: FieldSensitivity[] = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];

/** Accept legacy v3.2 type names and map them onto the v4.0 catalog. */
export function normalizeType(dataType: string): FieldTypeDef {
  const direct = (FIELD_TYPES as readonly string[]).includes(dataType) ? (dataType as FieldTypeDef) : null;
  if (direct) return direct;
  const legacyMap: Record<string, FieldTypeDef> = {
    NUMBER: "DECIMAL", BOOLEAN: "CHECKBOX", DROPDOWN: "SINGLE_SELECT",
  };
  return legacyMap[dataType] ?? "TEXT";
}

// ---------------------------------------------------------------------------
// Module registry — the 23 supported modules. Pure data so it is testable and
// importable from both server routes and client components.
// ---------------------------------------------------------------------------

export interface FieldModuleDef {
  key: string;
  label: string;
  singular: string;
  area: "Portfolio" | "Plan" | "Execute" | "Control" | "Administration";
  /** Permission required to READ values for this module. */
  viewPerm: string;
  /** Permission required to ASSIGN fields to / WRITE values for this module. */
  managePerm: string;
  /** Form sections the module offers (first is the default). */
  sections: string[];
  /** Human name of the business record (used in copy + audit lines). */
  recordNoun: string;
  /** True when records carry a projectId (used to scope values + permissions). */
  projectScoped: boolean;
  /** Field types that make no sense for this module (documented limitation). */
  unsupported?: string[];
}

export const FIELD_MODULES: FieldModuleDef[] = [
  // Portfolio
  { key: "portfolio", label: "Portfolios", singular: "Portfolio", area: "Portfolio", viewPerm: "portfolio.view", managePerm: "portfolio.manage", sections: ["general", "strategy", "financial", "governance"], recordNoun: "portfolio", projectScoped: false },
  { key: "program", label: "Programs", singular: "Program", area: "Portfolio", viewPerm: "program.view", managePerm: "program.manage", sections: ["general", "strategy", "financial", "governance"], recordNoun: "program", projectScoped: false },
  { key: "project", label: "Projects", singular: "Project", area: "Portfolio", viewPerm: "project.view", managePerm: "project.manage", sections: ["general", "delivery", "financial", "governance", "additional"], recordNoun: "project", projectScoped: false },
  // Plan
  { key: "requirement", label: "Requirements", singular: "Requirement", area: "Plan", viewPerm: "project.view", managePerm: "project.manage", sections: ["general", "acceptance", "traceability"], recordNoun: "requirement", projectScoped: true },
  { key: "wbs_node", label: "WBS Nodes", singular: "WBS Node", area: "Plan", viewPerm: "project.view", managePerm: "wbs.manage", sections: ["general", "planning"], recordNoun: "WBS node", projectScoped: true },
  { key: "task", label: "Tasks", singular: "Task", area: "Plan", viewPerm: "project.view", managePerm: "wbs.manage", sections: ["general", "planning", "delivery"], recordNoun: "task", projectScoped: true },
  { key: "milestone", label: "Milestones", singular: "Milestone", area: "Plan", viewPerm: "project.view", managePerm: "project.manage", sections: ["general", "acceptance"], recordNoun: "milestone", projectScoped: true },
  { key: "baseline", label: "Baselines", singular: "Baseline", area: "Plan", viewPerm: "project.view", managePerm: "baseline.manage", sections: ["general", "approval"], recordNoun: "baseline", projectScoped: true },
  // Execute
  { key: "resource", label: "Resources", singular: "Resource", area: "Execute", viewPerm: "resource.view", managePerm: "resource.manage", sections: ["general", "capacity", "commercial"], recordNoun: "resource", projectScoped: false },
  { key: "timesheet", label: "Timesheets", singular: "Timesheet", area: "Execute", viewPerm: "timesheet.own", managePerm: "timesheet.approve", sections: ["general", "approval"], recordNoun: "timesheet", projectScoped: false },
  { key: "timesheet_entry", label: "Timesheet Entries", singular: "Timesheet Entry", area: "Execute", viewPerm: "timesheet.own", managePerm: "timesheet.approve", sections: ["general"], recordNoun: "timesheet entry", projectScoped: true },
  // Control
  { key: "budget_line", label: "Budget Lines", singular: "Budget Line", area: "Control", viewPerm: "financial.view", managePerm: "financial.manage", sections: ["general", "financial", "approval"], recordNoun: "budget line", projectScoped: true },
  { key: "evm_period", label: "EVM Periods", singular: "EVM Period", area: "Control", viewPerm: "evm.view", managePerm: "evm.manage", sections: ["general", "analysis"], recordNoun: "EVM period", projectScoped: true },
  { key: "health_snapshot", label: "Health Snapshots", singular: "Health Snapshot", area: "Control", viewPerm: "evm.view", managePerm: "evm.manage", sections: ["general", "analysis"], recordNoun: "health snapshot", projectScoped: true },
  { key: "risk", label: "Risks (RAID)", singular: "Risk", area: "Control", viewPerm: "project.view", managePerm: "raid.manage", sections: ["general", "analysis", "mitigation", "ownership"], recordNoun: "risk", projectScoped: true },
  { key: "issue", label: "Issues (RAID)", singular: "Issue", area: "Control", viewPerm: "project.view", managePerm: "raid.manage", sections: ["general", "analysis", "mitigation", "ownership"], recordNoun: "issue", projectScoped: true },
  { key: "assumption", label: "Assumptions (RAID)", singular: "Assumption", area: "Control", viewPerm: "project.view", managePerm: "raid.manage", sections: ["general", "analysis", "ownership"], recordNoun: "assumption", projectScoped: true },
  { key: "change_request", label: "Change Requests", singular: "Change Request", area: "Control", viewPerm: "project.view", managePerm: "change.manage", sections: ["general", "impact", "approval"], recordNoun: "change request", projectScoped: true },
  { key: "stage_gate", label: "Stage Gates", singular: "Stage Gate", area: "Control", viewPerm: "project.view", managePerm: "project.manage", sections: ["general", "criteria", "approval"], recordNoun: "stage gate", projectScoped: true },
  { key: "governance_rule", label: "Governance Rules", singular: "Governance Rule", area: "Control", viewPerm: "project.view", managePerm: "governance.manage", sections: ["general", "thresholds"], recordNoun: "governance rule", projectScoped: false },
  { key: "governance_alert", label: "Governance Alerts", singular: "Governance Alert", area: "Control", viewPerm: "project.view", managePerm: "governance.manage", sections: ["general", "triage"], recordNoun: "governance alert", projectScoped: true },
  // Administration
  { key: "user", label: "Users", singular: "User", area: "Administration", viewPerm: "admin.users", managePerm: "admin.users", sections: ["general", "access"], recordNoun: "user", projectScoped: false, unsupported: ["ENTITY_LOOKUP"] },
  { key: "audit_trail", label: "Audit Trail", singular: "Audit Entry", area: "Administration", viewPerm: "admin.audit", managePerm: "admin.audit", sections: ["general"], recordNoun: "audit entry", projectScoped: false, unsupported: ["ENTITY_LOOKUP"] },
];

export const MODULE_KEYS = FIELD_MODULES.map((m) => m.key);

export function getModule(key: string): FieldModuleDef | null {
  return FIELD_MODULES.find((m) => m.key === key) ?? null;
}

/** Derive a stable snake_case field key from a name/label (admin convenience). */
export function deriveFieldKey(name: string, label: string): string {
  const base = (name || label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return base || "field";
}

export function isModuleKey(v: unknown): v is string {
  return typeof v === "string" && MODULE_KEYS.includes(v);
}

/** Modules a definition is (or can be) used in — used by the dictionary table. */
export function moduleLabel(key: string): string {
  return getModule(key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Typed value packing / unpacking — CustomFieldValue has typed columns so
// numeric, date, currency and relationship values stay valid for filters,
// sorts, reports and exports (never "everything is a string").
// ---------------------------------------------------------------------------

export interface PackedValue {
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  valueBool: boolean | null;
  valueJson: unknown;
}

export const EMPTY_PACKED: PackedValue = { valueText: null, valueNumber: null, valueDate: null, valueBool: null, valueJson: null };

export type PackResult = { ok: true; value: FieldValue; packed: PackedValue } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_RE = /^\+?[\d\s().-]+$/;
const MAX_TEXT_LENGTH = 4000;

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

/**
 * Validate + coerce a submitted value for a definition, then pack it into the
 * typed columns. `cfg` may carry per-assignment validation overrides.
 */
export function packValue(
  def: { label: string; dataType: string; options?: unknown; config?: unknown },
  raw: unknown,
  overrides?: FieldConfig | null,
): PackResult {
  const type = normalizeType(def.dataType);
  const base = normalizeFieldConfig(def.config);
  const cfg: FieldConfig = overrides ? { ...base, ...overrides } : base;
  const label = def.label;
  const isEmpty = raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0);
  if (isEmpty) return { ok: true, value: null, packed: EMPTY_PACKED };

  const text = (v: string): PackResult => ({ ok: true, value: v, packed: { ...EMPTY_PACKED, valueText: v } });
  const number = (n: number): PackResult => ({ ok: true, value: n, packed: { ...EMPTY_PACKED, valueNumber: n } });

  switch (type) {
    case "TEXT":
    case "LONG_TEXT":
    case "EMAIL":
    case "URL":
    case "PHONE": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected text` };
      const v = raw.trim();
      if (v.length > MAX_TEXT_LENGTH) return { ok: false, error: `${label}: max ${MAX_TEXT_LENGTH} characters` };
      if (cfg.maxLength !== undefined && v.length > cfg.maxLength) return { ok: false, error: `${label}: max ${cfg.maxLength} characters` };
      if (cfg.minLength !== undefined && v.length < cfg.minLength) return { ok: false, error: `${label}: min ${cfg.minLength} characters` };
      if (type === "EMAIL" && !EMAIL_RE.test(v)) return { ok: false, error: `${label}: expected a valid email address` };
      if (type === "URL" && !isValidUrl(v)) return { ok: false, error: `${label}: expected a valid URL (e.g. https://example.com)` };
      if (type === "PHONE" && !isValidPhone(v)) return { ok: false, error: `${label}: expected a valid phone number (7–15 digits)` };
      return text(v);
    }
    case "INTEGER":
    case "DECIMAL":
    case "CURRENCY":
    case "PERCENTAGE": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return { ok: false, error: `${label}: expected a finite number` };
      if (type === "INTEGER" && !Number.isInteger(n)) return { ok: false, error: `${label}: expected a whole number` };
      if (cfg.integer && !Number.isInteger(n)) return { ok: false, error: `${label}: expected a whole number` };
      if (cfg.min !== undefined && n < cfg.min) return { ok: false, error: `${label}: must be at least ${cfg.min}` };
      if (cfg.max !== undefined && n > cfg.max) return { ok: false, error: `${label}: must be at most ${cfg.max}` };
      if (type === "PERCENTAGE" && (n < -1000 || n > 1000)) return { ok: false, error: `${label}: percentage out of range` };
      return number(n);
    }
    case "DATE": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected a date string` };
      const iso = raw.slice(0, 10);
      const d = new Date(`${iso}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, error: `${label}: invalid date` };
      return { ok: true, value: iso, packed: { ...EMPTY_PACKED, valueDate: d, valueText: iso } };
    }
    case "DATETIME": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected a date-time string` };
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { ok: false, error: `${label}: invalid date-time` };
      return { ok: true, value: d.toISOString(), packed: { ...EMPTY_PACKED, valueDate: d, valueText: d.toISOString() } };
    }
    case "CHECKBOX": {
      if (typeof raw === "boolean") return { ok: true, value: raw, packed: { ...EMPTY_PACKED, valueBool: raw } };
      if (raw === "true" || raw === "false") return { ok: true, value: raw === "true", packed: { ...EMPTY_PACKED, valueBool: raw === "true" } };
      return { ok: false, error: `${label}: expected true/false` };
    }
    case "SINGLE_SELECT": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected one of the options` };
      const options = normalizeOptions(def.options);
      if (options.length && !options.includes(raw)) return { ok: false, error: `${label}: "${raw}" is not a valid option` };
      return text(raw);
    }
    case "MULTI_SELECT": {
      if (!Array.isArray(raw)) return { ok: false, error: `${label}: expected an array of options` };
      const options = normalizeOptions(def.options);
      const picked: string[] = [];
      for (const item of raw) {
        if (typeof item !== "string") return { ok: false, error: `${label}: expected an array of options` };
        const v = item.trim();
        if (!v) continue;
        if (options.length && !options.includes(v)) return { ok: false, error: `${label}: "${v}" is not a valid option` };
        if (!picked.includes(v)) picked.push(v);
      }
      if (!picked.length) return { ok: true, value: null, packed: EMPTY_PACKED };
      if (picked.length > 200) return { ok: false, error: `${label}: max 200 selections` };
      return { ok: true, value: picked, packed: { ...EMPTY_PACKED, valueJson: picked, valueText: picked.join(", ") } };
    }
    case "USER_LOOKUP": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected a user id` };
      return text(raw); // existence is verified in the route (needs db)
    }
    case "ENTITY_LOOKUP": {
      if (typeof raw !== "string") return { ok: false, error: `${label}: expected a record id` };
      return text(raw); // existence is verified in the route (needs db)
    }
    case "FORMULA": {
      // Formulas are computed, never directly submitted.
      return { ok: false, error: `${label}: calculated fields are read-only` };
    }
    default:
      return { ok: false, error: `${label}: unknown data type "${def.dataType}"` };
  }
}

/** Typed CustomFieldValue row → the flat value the UI/reporting layer consumes. */
export function unpackValue(row: {
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | string | null;
  valueBool: boolean | null;
  valueJson: unknown;
}): FieldValue {
  if (row.valueJson !== null && row.valueJson !== undefined) {
    const j = row.valueJson as unknown;
    if (Array.isArray(j) && j.every((x) => typeof x === "string")) return j as string[];
  }
  if (row.valueBool !== null) return row.valueBool;
  if (row.valueNumber !== null) return row.valueNumber;
  if (row.valueDate !== null) {
    const d = row.valueDate instanceof Date ? row.valueDate : new Date(row.valueDate);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (row.valueText !== null && row.valueText !== "") return row.valueText;
  return null;
}

// ---------------------------------------------------------------------------
// Display / export formatting
// ---------------------------------------------------------------------------

export function formatValue(def: { dataType: string; options?: unknown; config?: unknown }, value: FieldValue, currency = "USD"): string {
  if (value === null || value === undefined || value === "") return "";
  const type = normalizeType(def.dataType);
  switch (type) {
    case "CHECKBOX":
      return value === true ? "Yes" : "No";
    case "MULTI_SELECT":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "CURRENCY": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return String(value);
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
      } catch {
        return String(value);
      }
    }
    case "PERCENTAGE":
      return typeof value === "number" ? `${value}%` : String(value);
    case "USER_LOOKUP":
    case "ENTITY_LOOKUP":
      return String(value); // callers may resolve to a name via lookup maps
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

// ---------------------------------------------------------------------------
// Formula evaluation — a small, safe arithmetic evaluator (no eval/Function).
// Supports + - * / % ( ) unary minus, numeric literals and references to the
// record's own custom field keys. Unknown refs evaluate to 0; division by zero
// yields an error the UI can surface.
// ---------------------------------------------------------------------------

export interface FormulaScope { [fieldKey: string]: number | null | undefined }

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

export function evaluateFormula(expression: string, scope: FormulaScope): FormulaResult {
  const src = (expression ?? "").trim();
  if (!src) return { ok: false, error: "Empty expression" };
  if (src.length > 500) return { ok: false, error: "Expression too long" };

  type Tok = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "op"; v: string };
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `Invalid number "${raw}"` };
      tokens.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ t: "ref", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%()".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    return { ok: false, error: `Unexpected character "${c}"` };
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v: string) => { const t = tokens[pos]; if (t && t.t === "op" && t.v === v) { pos++; return true; } return false; };

  const parseExpr = (): number => parseAdd();
  function parseAdd(): number {
    let left = parseMul();
    for (;;) {
      if (eat("+")) left += parseMul();
      else if (eat("-")) left -= parseMul();
      else return left;
    }
  }
  function parseMul(): number {
    let left = parseUnary();
    for (;;) {
      if (eat("*")) left *= parseUnary();
      else if (eat("/")) {
        const d = parseUnary();
        if (d === 0) throw new Error("Division by zero");
        left /= d;
      } else if (eat("%")) {
        const d = parseUnary();
        if (d === 0) throw new Error("Modulo by zero");
        left %= d;
      } else return left;
    }
  }
  function parseUnary(): number {
    if (eat("-")) return -parseUnary();
    if (eat("+")) return parseUnary();
    return parseAtom();
  }
  function parseAtom(): number {
    const t = peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.t === "num") { pos++; return t.v; }
    if (t.t === "ref") {
      pos++;
      const v = scope[t.v];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    }
    if (t.t === "op" && t.v === "(") {
      pos++;
      const v = parseExpr();
      if (!eat(")")) throw new Error("Missing closing parenthesis");
      return v;
    }
    throw new Error(`Unexpected token "${t.v}"`);
  }

  try {
    const value = parseExpr();
    if (pos !== tokens.length) return { ok: false, error: "Trailing tokens in expression" };
    if (!Number.isFinite(value)) return { ok: false, error: "Expression did not evaluate to a finite number" };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid expression" };
  }
}

/** Field keys referenced by a formula expression (for impact analysis). */
export function formulaRefs(expression: string): string[] {
  const refs = new Set<string>();
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  const known = new Set(["e", "pi"]);
  for (const m of (expression ?? "").matchAll(re)) {
    const w = m[0];
    if (!known.has(w.toLowerCase()) && !/^\d/.test(w)) refs.add(w);
  }
  return [...refs];
}

// ---------------------------------------------------------------------------
// Access control for sensitive fields — role-based view/edit gates.
// ---------------------------------------------------------------------------

export interface FieldAccessSubject { roles: string[]; isSuperAdmin: boolean }

function roleList(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv.split(",").map((r) => r.trim()).filter(Boolean);
}

/** Can this subject SEE the field at all (sensitivity + visible-roles gate)? */
export function canViewField(def: { sensitivity?: string | null; visibleRolesJson?: string | null }, subject: FieldAccessSubject | null): boolean {
  if (!subject) return false;
  if (subject.isSuperAdmin || subject.roles.includes("*") || subject.roles.includes("PMO_ADMIN")) return true;
  const allowed = roleList(def.visibleRolesJson);
  if (allowed.length === 0) return true; // no restriction
  return subject.roles.some((r) => allowed.includes(r));
}

/** Can this subject EDIT values of the field (visible + editable-roles gate)? */
export function canEditField(def: { sensitivity?: string | null; visibleRolesJson?: string | null; editableRolesJson?: string | null; isReadOnly?: boolean }, subject: FieldAccessSubject | null): boolean {
  if (!subject) return false;
  if (def.isReadOnly) return false;
  if (!canViewField(def, subject)) return false;
  if (subject.isSuperAdmin || subject.roles.includes("*") || subject.roles.includes("PMO_ADMIN")) return true;
  const allowed = roleList(def.editableRolesJson);
  if (allowed.length === 0) return true;
  return subject.roles.some((r) => allowed.includes(r));
}

// ---------------------------------------------------------------------------
// Impact analysis — what a proposed definition change touches before it saves.
// ---------------------------------------------------------------------------

export interface FieldUsageSnapshot {
  assignments: { moduleKey: string; count: number; sections: string[] }[];
  totalAssignments: number;
  totalValues: number;
  recordsWithValue: number;
  /** Modules that hold at least one non-null value. */
  modulesWithValues: string[];
}

export interface FieldChange {
  fieldKey?: string;
  dataType?: string;
  options?: string[];
  isRequired?: boolean;
  isReadOnly?: boolean;
  status?: string;
  sensitivity?: string;
  label?: string;
  description?: string;
}

export type ImpactSeverity = "none" | "low" | "medium" | "high";

export interface ImpactFinding {
  code: string;
  severity: ImpactSeverity;
  message: string;
  requiresMigration: boolean;
  requiresApproval: boolean;
}

/** Classify a proposed change into findings + the migration it implies. */
export function analyseImpact(before: FieldChange, after: FieldChange, usage: FieldUsageSnapshot): ImpactFinding[] {
  const findings: ImpactFinding[] = [];
  const values = usage.recordsWithValue;

  if (after.fieldKey !== undefined && before.fieldKey !== undefined && after.fieldKey !== before.fieldKey) {
    findings.push({
      code: "KEY_CHANGED",
      severity: "high",
      message: `The immutable field key would change from "${before.fieldKey}" to "${after.fieldKey}". Every stored value and every module assignment references the key.`,
      requiresMigration: true,
      requiresApproval: true,
    });
  }

  if (after.dataType !== undefined && before.dataType !== undefined && normalizeType(after.dataType) !== normalizeType(before.dataType)) {
    const from = normalizeType(after.dataType);
    const to = normalizeType(before.dataType);
    const compatible = isTypeCompatible(from, to);
    findings.push({
      code: "TYPE_CHANGED",
      severity: compatible ? "medium" : "high",
      message: `Data type would change from ${from} to ${to}.${values ? ` ${values} stored value(s) across ${usage.modulesWithValues.length} module(s) may need conversion.` : ""} ${compatible ? "Values can be converted in place." : "Values of the old type cannot be converted automatically and must be remediated."}`,
      requiresMigration: values > 0,
      requiresApproval: true,
    });
  }

  if (after.options !== undefined && before.options !== undefined) {
    const removed = before.options.filter((o) => !after.options!.includes(o));
    if (removed.length) {
      findings.push({
        code: "OPTIONS_REMOVED",
        severity: values > 0 ? "high" : "medium",
        message: `${removed.length} option(s) would be removed (${removed.slice(0, 5).join(", ")}${removed.length > 5 ? "…" : ""}). Existing values using them become orphaned.`,
        requiresMigration: values > 0,
        requiresApproval: values > 0,
      });
    }
  }

  if (after.isRequired === true && before.isRequired !== true) {
    findings.push({
      code: "NOW_REQUIRED",
      severity: values > 0 ? "medium" : "low",
      message: values > 0
        ? `The field becomes required while ${values} record(s) already exist — existing blank values must be remediated.`
        : "The field becomes required for new records.",
      requiresMigration: values > 0,
      requiresApproval: false,
    });
  }

  if (after.status !== undefined && after.status !== before.status) {
    if (after.status === "ARCHIVED" || after.status === "DEPRECATED") {
      findings.push({
        code: "STATUS_TIGHTENED",
        severity: "low",
        message: `Status moves to ${after.status}. Historical values are preserved and remain visible in read-only mode.`,
        requiresMigration: false,
        requiresApproval: false,
      });
    }
  }

  if (after.sensitivity !== undefined && after.sensitivity !== before.sensitivity) {
    const restricts = FIELD_SENSITIVITIES.indexOf(after.sensitivity as FieldSensitivity) > FIELD_SENSITIVITIES.indexOf((before.sensitivity ?? "INTERNAL") as FieldSensitivity);
    findings.push({
      code: "SENSITIVITY_CHANGED",
      severity: restricts ? "medium" : "low",
      message: restricts
        ? `Sensitivity tightens to ${after.sensitivity} — fewer roles will see this field.`
        : `Sensitivity relaxes to ${after.sensitivity}.`,
      requiresMigration: false,
      requiresApproval: restricts,
    });
  }

  if (after.label !== undefined && after.label !== before.label) {
    findings.push({
      code: "LABEL_CHANGED",
      severity: "none",
      message: "Labels and descriptions are safe to change — no stored data is affected.",
      requiresMigration: false,
      requiresApproval: false,
    });
  }

  return findings;
}

/** Can values of `from` be converted in place to `to`? */
export function isTypeCompatible(from: FieldTypeDef, to: FieldTypeDef): boolean {
  if (from === to) return true;
  const group = (t: FieldTypeDef) => FIELD_TYPE_META[t]?.group;
  if (group(from) === "Number" && group(to) === "Number") return true;
  if (group(from) === "Text" && group(to) === "Text") return true;
  if (from === "SINGLE_SELECT" && to === "MULTI_SELECT") return true;
  if (from === "MULTI_SELECT" && to === "SINGLE_SELECT") return true;
  if (from === "CHECKBOX" && group(to) === "Number") return true;
  return false;
}

export function highestSeverity(findings: ImpactFinding[]): ImpactSeverity {
  const order: ImpactSeverity[] = ["none", "low", "medium", "high"];
  return findings.reduce<ImpactSeverity>((acc, f) => (order.indexOf(f.severity) > order.indexOf(acc) ? f.severity : acc), "none");
}

// ---------------------------------------------------------------------------
// Assignment governance rules (enforced in the store layer, documented here).
// ---------------------------------------------------------------------------

export const ASSIGNMENT_RULES = [
  "Every field has a unique, immutable Field ID and Field Key.",
  "The same field cannot be assigned to the same module more than once.",
  "A field can be assigned to multiple modules.",
  "The global definition is the source of truth for core metadata.",
  "Module display settings never mutate the global definition.",
  "Fields with existing data cannot be destructively deleted without authorization.",
  "Deactivated or deprecated fields keep their historical values.",
  "Only authorized users can create or modify global definitions.",
  "Module administrators can assign approved fields within their module permissions.",
  "All field creation, update, assignment, removal and status changes are audited.",
];

export type { FieldConfig, FieldValue };
export { ruleSummary, normalizeFieldConfig, normalizeOptions } from "./custom-fields";
