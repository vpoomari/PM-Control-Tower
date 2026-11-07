// PM CONTROL TOWER — Field Dictionary store (db-backed helpers)
// Hydration, assignment, value persistence, impact analysis and audit for the
// three dictionary layers. Kept out of route files because Next.js route
// modules may only export HTTP handlers.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { toJson } from "@/lib/constants";
import { ROLE_TEMPLATES } from "@/lib/rbac";
import {
  analyseImpact, canEditField, canViewField, deriveFieldKey, EMPTY_PACKED, evaluateFormula, FIELD_TYPE_META,
  getModule, normalizeType, packValue, unpackValue,
  type FieldChange, type FieldUsageSnapshot, type ImpactFinding, type PackedValue,
} from "@/lib/engines/field-dictionary";
import { normalizeFieldConfig, normalizeOptions, type FieldConfig, type FieldValue } from "@/lib/engines/custom-fields";

// ---------------------------------------------------------------------------
// Module model registry — moduleKey → Prisma delegate accessors.
// Every supported module is explicitly wired (no reflective magic, fully typed).
// ---------------------------------------------------------------------------

type RecordRef = { exists: boolean; projectId?: string | null; label?: string | null };

interface ModuleModel {
  count: () => Promise<number>;
  resolve: (id: string) => Promise<RecordRef>;
}

const MODULE_MODELS: Record<string, ModuleModel> = {
  portfolio: {
    count: () => db.portfolio.count(),
    resolve: async (id) => {
      const r = await db.portfolio.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
      return r ? { exists: true, label: `${r.code} — ${r.name}` } : { exists: false };
    },
  },
  program: {
    count: () => db.program.count(),
    resolve: async (id) => {
      const r = await db.program.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
      return r ? { exists: true, label: `${r.code} — ${r.name}` } : { exists: false };
    },
  },
  project: {
    count: () => db.project.count(),
    resolve: async (id) => {
      const r = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
      return r ? { exists: true, label: `${r.code} — ${r.name}` } : { exists: false };
    },
  },
  requirement: {
    count: () => db.requirement.count(),
    resolve: async (id) => {
      const r = await db.requirement.findUnique({ where: { id }, select: { id: true, projectId: true, title: true } });
      return r ? { exists: true, projectId: r.projectId, label: r.title } : { exists: false };
    },
  },
  wbs_node: {
    count: () => db.wBSNode.count(),
    resolve: async (id) => {
      const r = await db.wBSNode.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, name: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code ?? ""} ${r.name}`.trim() } : { exists: false };
    },
  },
  task: {
    count: () => db.task.count(),
    resolve: async (id) => {
      const r = await db.task.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, name: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code ?? ""} ${r.name}`.trim() } : { exists: false };
    },
  },
  milestone: {
    count: () => db.milestone.count(),
    resolve: async (id) => {
      const r = await db.milestone.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, name: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code ?? ""} ${r.name}`.trim() } : { exists: false };
    },
  },
  baseline: {
    count: () => db.baseline.count(),
    resolve: async (id) => {
      const r = await db.baseline.findUnique({ where: { id }, select: { id: true, projectId: true, name: true } });
      return r ? { exists: true, projectId: r.projectId, label: r.name } : { exists: false };
    },
  },
  resource: {
    count: () => db.resource.count(),
    resolve: async (id) => {
      const r = await db.resource.findUnique({ where: { id }, select: { id: true, name: true } });
      return r ? { exists: true, label: r.name } : { exists: false };
    },
  },
  timesheet: {
    count: () => db.timesheet.count(),
    resolve: async (id) => {
      const r = await db.timesheet.findUnique({ where: { id }, select: { id: true } });
      return r ? { exists: true } : { exists: false };
    },
  },
  timesheet_entry: {
    count: () => db.timesheetEntry.count(),
    resolve: async (id) => {
      const r = await db.timesheetEntry.findUnique({ where: { id }, select: { id: true, projectId: true } });
      return r ? { exists: true, projectId: r.projectId } : { exists: false };
    },
  },
  budget_line: {
    count: () => db.budgetLine.count(),
    resolve: async (id) => {
      const r = await db.budgetLine.findUnique({ where: { id }, select: { id: true, projectId: true, name: true } });
      return r ? { exists: true, projectId: r.projectId, label: r.name } : { exists: false };
    },
  },
  evm_period: {
    count: () => db.evmPeriod.count(),
    resolve: async (id) => {
      const r = await db.evmPeriod.findUnique({ where: { id }, select: { id: true, projectId: true, statusDate: true } });
      return r ? { exists: true, projectId: r.projectId, label: r.statusDate.toISOString().slice(0, 10) } : { exists: false };
    },
  },
  health_snapshot: {
    count: () => db.projectHealthSnapshot.count(),
    resolve: async (id) => {
      const r = await db.projectHealthSnapshot.findUnique({ where: { id }, select: { id: true, projectId: true, healthScore: true, ragStatus: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.ragStatus} · ${r.healthScore}` } : { exists: false };
    },
  },
  risk: {
    count: () => db.risk.count(),
    resolve: async (id) => {
      const r = await db.risk.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, title: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code} — ${r.title}` } : { exists: false };
    },
  },
  issue: {
    count: () => db.issue.count(),
    resolve: async (id) => {
      const r = await db.issue.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, title: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code} — ${r.title}` } : { exists: false };
    },
  },
  assumption: {
    count: () => db.assumption.count(),
    resolve: async (id) => {
      const r = await db.assumption.findUnique({ where: { id }, select: { id: true, projectId: true, code: true } });
      return r ? { exists: true, projectId: r.projectId, label: r.code } : { exists: false };
    },
  },
  change_request: {
    count: () => db.changeRequest.count(),
    resolve: async (id) => {
      const r = await db.changeRequest.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, title: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code} — ${r.title}` } : { exists: false };
    },
  },
  stage_gate: {
    count: () => db.stageGate.count(),
    resolve: async (id) => {
      const r = await db.stageGate.findUnique({ where: { id }, select: { id: true, projectId: true, code: true, name: true } });
      return r ? { exists: true, projectId: r.projectId, label: `${r.code ?? ""} ${r.name}`.trim() } : { exists: false };
    },
  },
  governance_rule: {
    count: () => db.governanceRule.count(),
    resolve: async (id) => {
      const r = await db.governanceRule.findUnique({ where: { id }, select: { id: true, name: true } });
      return r ? { exists: true, label: r.name } : { exists: false };
    },
  },
  governance_alert: {
    count: () => db.alertEvent.count(),
    resolve: async (id) => {
      const r = await db.alertEvent.findUnique({ where: { id }, select: { id: true, projectId: true, title: true } });
      return r ? { exists: true, projectId: r.projectId, label: r.title } : { exists: false };
    },
  },
  user: {
    count: () => db.user.count(),
    resolve: async (id) => {
      const r = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
      return r ? { exists: true, label: `${r.name} (${r.email})` } : { exists: false };
    },
  },
  audit_trail: {
    count: () => db.auditEvent.count(),
    resolve: async (id) => {
      const r = await db.auditEvent.findUnique({ where: { id }, select: { id: true, action: true, entityType: true } });
      return r ? { exists: true, label: `${r.action} ${r.entityType}` } : { exists: false };
    },
  },
};

/** Modules whose records are append-only (no value writes are permitted). */
export const READ_ONLY_MODULES = new Set(["audit_trail"]);

export function moduleRecordCount(moduleKey: string): Promise<number> {
  const m = MODULE_MODELS[moduleKey];
  return m ? m.count() : Promise.resolve(0);
}

export function resolveRecord(moduleKey: string, recordId: string): Promise<RecordRef> {
  const m = MODULE_MODELS[moduleKey];
  return m ? m.resolve(recordId) : Promise.resolve({ exists: false });
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export interface DictField {
  id: string;
  fieldKey: string;
  name: string;
  label: string;
  dataType: string;
  options: string[];
  config: FieldConfig;
  description: string | null;
  status: string;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryKey: string | null;
  fieldGroup: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
  isSearchable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  isReportable: boolean;
  isExportable: boolean;
  sensitivity: string;
  visibleRoles: string[];
  editableRoles: string[];
  deprecationReason: string | null;
  version: number;
  createdById: string | null;
  createdByName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  modules: string[];
  assignmentCount: number;
  valueCount: number;
}

export interface HydratedAssignment {
  id: string;
  moduleKey: string;
  section: string;
  sortOrder: number;
  displayLabel: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
  isVisible: boolean;
  isInForm: boolean;
  isInTable: boolean;
  isInDetail: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  validationOverrides: FieldConfig | null;
  field: DictField;
}

type DefinitionRow = Prisma.CustomFieldDefinitionGetPayload<{ include: { category: true } }>;

function toDictField(row: DefinitionRow, usage: { modules: string[]; assignments: number; values: number }): DictField {
  return {
    id: row.id,
    fieldKey: row.fieldKey,
    name: row.name || row.label,
    label: row.label,
    dataType: row.dataType,
    options: normalizeOptions(row.options),
    config: normalizeFieldConfig(row.config),
    description: row.description,
    status: row.status,
    isActive: row.status === "ACTIVE",
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    categoryKey: row.category?.key ?? null,
    fieldGroup: row.fieldGroup,
    isRequired: row.isRequired,
    isReadOnly: row.isReadOnly,
    isSearchable: row.isSearchable,
    isFilterable: row.isFilterable,
    isSortable: row.isSortable,
    isReportable: row.isReportable,
    isExportable: row.isExportable,
    sensitivity: row.sensitivity,
    visibleRoles: splitCsv(row.visibleRolesJson),
    editableRoles: splitCsv(row.editableRolesJson),
    deprecationReason: row.deprecationReason,
    version: row.version,
    createdById: row.createdById,
    createdByName: row.createdByName,
    updatedById: row.updatedById,
    updatedByName: row.updatedByName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    modules: usage.modules,
    assignmentCount: usage.assignments,
    valueCount: usage.values,
  };
}

function splitCsv(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Definitions — list / create / update / delete
// ---------------------------------------------------------------------------

export interface DictionaryQuery {
  q?: string;
  dataType?: string;
  categoryId?: string;
  status?: string;
  module?: string;
  unused?: boolean;
  sort?: string;
}

export async function listDefinitions(query: DictionaryQuery = {}): Promise<DictField[]> {
  const where: Prisma.CustomFieldDefinitionWhereInput = {
    ...(query.q
      ? {
          OR: [
            { label: { contains: query.q } },
            { name: { contains: query.q } },
            { fieldKey: { contains: query.q } },
            { description: { contains: query.q } },
          ],
        }
      : {}),
    ...(query.dataType ? { dataType: query.dataType } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.module ? { assignments: { some: { moduleKey: query.module } } } : {}),
  };

  const rows = await db.customFieldDefinition.findMany({
    where,
    include: { category: true, assignments: { select: { moduleKey: true } } },
    orderBy: labelSort(query.sort),
  });

  // value counts in ONE grouped query
  const grouped = await db.customFieldValue.groupBy({
    by: ["fieldDefinitionId"],
    _count: { _all: true },
  });
  const valueCountById = new Map(grouped.map((g) => [g.fieldDefinitionId, g._count._all]));

  let fields = rows.map((r) => {
    const modules = [...new Set(r.assignments.map((a) => a.moduleKey))];
    return toDictField(r, {
      modules,
      assignments: r.assignments.length,
      values: valueCountById.get(r.id) ?? 0,
    });
  });

  if (query.unused) fields = fields.filter((f) => f.assignmentCount === 0);
  return fields;
}

function labelSort(sort?: string): Prisma.CustomFieldDefinitionOrderByWithRelationInput {
  if (sort === "updated") return { updatedAt: "desc" };
  if (sort === "key") return { fieldKey: "asc" };
  if (sort === "type") return { dataType: "asc" };
  return { label: "asc" };
}

export async function getDefinition(id: string): Promise<DictField | null> {
  const row = await db.customFieldDefinition.findUnique({
    where: { id },
    include: { category: true, assignments: { select: { moduleKey: true } } },
  });
  if (!row) return null;
  const grouped = await db.customFieldValue.groupBy({
    by: ["fieldDefinitionId"],
    where: { fieldDefinitionId: id },
    _count: { _all: true },
  });
  return toDictField(row, {
    modules: [...new Set(row.assignments.map((a) => a.moduleKey))],
    assignments: row.assignments.length,
    values: grouped[0]?._count._all ?? 0,
  });
}

/** Same as getDefinition but keyed by the immutable fieldKey. */
/** Same as getDefinition but keyed by the immutable fieldKey. */
export async function getDefinitionByKey(fieldKey: string): Promise<DictField | null> {
  const row = await db.customFieldDefinition.findUnique({ where: { fieldKey } });
  return row ? getDefinition(row.id) : null;
}

// ---------------------------------------------------------------------------
// Assignments — hydrate per module
// ---------------------------------------------------------------------------

export async function listAssignments(moduleKey: string, opts: { includeHidden?: boolean } = {}): Promise<HydratedAssignment[]> {
  const rows = await db.moduleFieldAssignment.findMany({
    where: { moduleKey, ...(opts.includeHidden === false ? { isVisible: true } : {}) },
    include: { fieldDefinition: { include: { category: true } } },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
  });

  const valueCounts = await db.customFieldValue.groupBy({
    by: ["fieldDefinitionId"],
    where: { moduleKey },
    _count: { _all: true },
  });
  const counts = new Map(valueCounts.map((g) => [g.fieldDefinitionId, g._count._all]));

  return rows.map((r) => ({
    id: r.id,
    moduleKey: r.moduleKey,
    section: r.section,
    sortOrder: r.sortOrder,
    displayLabel: r.displayLabel,
    isRequired: r.isRequired,
    isReadOnly: r.isReadOnly,
    isVisible: r.isVisible,
    isInForm: r.isInForm,
    isInTable: r.isInTable,
    isInDetail: r.isInDetail,
    isFilterable: r.isFilterable,
    isSortable: r.isSortable,
    validationOverrides: r.validationOverridesJson ? (safeJson(r.validationOverridesJson) as FieldConfig | null) : null,
    field: toDictField(r.fieldDefinition, {
      modules: [],
      assignments: 0,
      values: counts.get(r.fieldDefinition.id) ?? 0,
    }),
  }));
}

function safeJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw; // Prisma Json column already parsed
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Values — bulk read + typed write
// ---------------------------------------------------------------------------

export type ValueMap = Record<string, Record<string, FieldValue>>; // recordId → fieldKey → value

export async function readValues(moduleKey: string, recordIds: string[]): Promise<ValueMap> {
  if (!recordIds.length) return {};
  const rows = await db.customFieldValue.findMany({
    where: { moduleKey, recordId: { in: recordIds } },
    include: { fieldDefinition: { include: { category: true } } },
  });
  const out: ValueMap = {};
  for (const row of rows) {
    const def = row.fieldDefinition;
    // Sensitivity gate is applied by the caller (needs the session); here we
    // simply expose the raw typed value keyed by the immutable field key.
    const value = unpackValue(row);
    if (!out[row.recordId]) out[row.recordId] = {};
    if (normalizeType(def.dataType) === "FORMULA") {
      const cached = safeJson(row.formulaResultJson) as { value?: number } | null;
      out[row.recordId][def.fieldKey] = typeof cached?.value === "number" ? cached.value : null;
    } else {
      out[row.recordId][def.fieldKey] = value;
    }
  }
  // Merge legacy Project.customData for the project module (v3.2 Tab Builder).
  if (moduleKey === "project") {
    const projects = await db.project.findMany({
      where: { id: { in: recordIds }, customData: { not: Prisma.DbNull } },
      select: { id: true, customData: true },
    });
    const defs = await db.customFieldDefinition.findMany({ select: { id: true, fieldKey: true } });
    const known = new Map(defs.map((d) => [d.fieldKey, d.id]));
    for (const p of projects) {
      const data = safeJson(p.customData as unknown as string) as Record<string, unknown> | null;
      if (!data || typeof data !== "object") continue;
      for (const [k, v] of Object.entries(data)) {
        if (!known.has(k)) continue;
        if (!out[p.id]) out[p.id] = {};
        if (out[p.id][k] === undefined) {
          out[p.id][k] = (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null)
            ? (v as FieldValue)
            : Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
        }
      }
    }
  }
  return out;
}

export interface WriteValueResult {
  ok: boolean;
  errors: string[];
  values: Record<string, FieldValue>;
}

/** Resolve a subject's role codes into a flat permission set (store-side RBAC). */
function permissionsForRoles(roles: string[], isSuperAdmin: boolean): string[] {
  if (isSuperAdmin) return ["*"];
  const set = new Set<string>();
  for (const role of roles) {
    const tpl = ROLE_TEMPLATES.find((r) => r.code === role);
    if (tpl) for (const p of tpl.permissions) set.add(p);
  }
  return [...set];
}

/** True when the subject may write values for this module (manage perm or admin.config). */
export function canManageModule(
  moduleKey: string,
  actor: { roles: string[]; isSuperAdmin: boolean; permissions?: string[] },
): boolean {
  const mod = getModule(moduleKey);
  if (!mod) return false;
  const perms = actor.permissions ?? permissionsForRoles(actor.roles, actor.isSuperAdmin);
  if (perms.includes("*")) return true;
  return perms.includes(mod.managePerm) || perms.includes("admin.config");
}

/**
 * Validate + persist custom field values for ONE business record.
 * - unknown / unassigned keys are hard errors (no silent data loss)
 * - module-level manage permission is enforced (defence in depth, the API
 *   route checks it too, but the store is the last line before persistence)
 * - assignment-level required rules are enforced for submitted keys
 * - DEPRECATED/ARCHIVED fields keep working for reads; writes are blocked
 * - formula fields are computed, never accepted from the client
 *
 * Pass `preAuthorized: true` when the caller has already satisfied an
 * ownership rule the store cannot evaluate (e.g. a user editing their own
 * timesheet via timesheet.own).
 */
export async function writeValues(
  moduleKey: string,
  recordId: string,
  incoming: Record<string, unknown>,
  actor: { id: string; roles: string[]; isSuperAdmin: boolean; permissions?: string[] },
  opts: { preAuthorized?: boolean } = {},
): Promise<WriteValueResult> {
  const mod = getModule(moduleKey);
  if (!mod) return { ok: false, errors: [`Unknown module "${moduleKey}"`], values: {} };
  if (!opts.preAuthorized && !canManageModule(moduleKey, actor)) {
    return { ok: false, errors: [`Permission denied: ${mod.managePerm} or admin.config required`], values: {} };
  }

  const assignments = await listAssignments(moduleKey);
  const byKey = new Map(assignments.map((a) => [a.field.fieldKey, a]));
  const errors: string[] = [];
  const values: Record<string, FieldValue> = {};

  for (const [key, raw] of Object.entries(incoming)) {
    const a = byKey.get(key);
    if (!a) { errors.push(`Field "${key}" is not configured for ${mod.label}`); continue; }
    const def = a.field;
    if (def.status === "ARCHIVED" || def.status === "INACTIVE") {
      errors.push(`Field "${def.label}" is ${def.status.toLowerCase()} and cannot be edited`);
      continue;
    }
    if (def.status === "DEPRECATED") {
      errors.push(`Field "${def.label}" is deprecated — new values are blocked, existing values are preserved`);
      continue;
    }
    // NOTE: canEditField expects CSV strings (visibleRolesJson/editableRolesJson),
    // while DictField exposes parsed arrays — convert before checking.
    if (!canEditField({
      sensitivity: def.sensitivity,
      visibleRolesJson: def.visibleRoles.join(","),
      editableRolesJson: def.editableRoles.join(","),
      isReadOnly: def.isReadOnly || a.isReadOnly,
    }, actor)) {
      errors.push(`You are not permitted to edit "${def.label}"`);
      continue;
    }
    if (normalizeType(def.dataType) === "FORMULA") {
      errors.push(`"${def.label}" is calculated and cannot be edited directly`);
      continue;
    }
    const packed = packValue({ label: def.label, dataType: def.dataType, options: def.options, config: def.config }, raw, a.validationOverrides);
    if (!packed.ok) { errors.push(packed.error); continue; }
    if (a.isRequired && (packed.value === null || packed.value === "")) {
      errors.push(`${a.displayLabel || def.label} is required`);
      continue;
    }
    values[key] = packed.value;
    await upsertValue(moduleKey, recordId, a, packed.packed, actor.id);
  }

  return { ok: errors.length === 0, errors, values };
}

/** Packed value → Prisma create/update input with a correctly-typed Json column. */
type ValueColumns = Pick<Prisma.CustomFieldValueUncheckedCreateInput, "valueText" | "valueNumber" | "valueDate" | "valueBool" | "valueJson">;

function valueInput(p: PackedValue): ValueColumns {
  return {
    valueText: p.valueText,
    valueNumber: p.valueNumber,
    valueDate: p.valueDate,
    valueBool: p.valueBool,
    valueJson: p.valueJson === null || p.valueJson === undefined ? Prisma.JsonNull : (p.valueJson as Prisma.InputJsonValue),
  };
}

async function upsertValue(
  moduleKey: string,
  recordId: string,
  a: HydratedAssignment,
  packed: PackedValue,
  userId: string,
): Promise<void> {
  const data = {
    ...valueInput(packed),
    assignmentId: a.id,
    updatedById: userId,
  };
  await db.customFieldValue.upsert({
    where: { fieldDefinitionId_moduleKey_recordId: { fieldDefinitionId: a.field.id, moduleKey, recordId } },
    create: {
      fieldDefinitionId: a.field.id,
      moduleKey,
      recordId,
      createdById: userId,
      ...data,
    },
    update: data,
  });
}

// ---------------------------------------------------------------------------
// Formula computation — recompute every FORMULA assignment for a record.
// ---------------------------------------------------------------------------

export async function computeFormulas(moduleKey: string, recordId: string): Promise<Record<string, FieldValue>> {
  const assignments = await listAssignments(moduleKey);
  const formulas = assignments.filter((a) => normalizeType(a.field.dataType) === "FORMULA");
  if (!formulas.length) return {};

  const stored = await readValues(moduleKey, [recordId]);
  const scope: Record<string, number> = {};
  const current = stored[recordId] ?? {};
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === "number") scope[k] = v;
  }

  const out: Record<string, FieldValue> = {};
  for (const a of formulas) {
    const expression = (a.field.config as { expression?: string } | null)?.expression ?? "";
    const res = evaluateFormula(expression, scope);
    const packed: PackedValue = res.ok
      ? { ...EMPTY_PACKED, valueNumber: res.value, valueText: String(res.value) }
      : EMPTY_PACKED;
    const resultJson = (res.ok
      ? { value: res.value, expression }
      : { error: res.error, expression }) as Prisma.InputJsonValue;
    await db.customFieldValue.upsert({
      where: { fieldDefinitionId_moduleKey_recordId: { fieldDefinitionId: a.field.id, moduleKey, recordId } },
      create: {
        fieldDefinitionId: a.field.id,
        moduleKey,
        recordId,
        ...valueInput(packed),
        formulaResultJson: resultJson,
      },
      update: {
        ...valueInput(packed),
        formulaResultJson: resultJson,
      },
    });
    out[a.field.fieldKey] = res.ok ? res.value : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assignment writes (transaction-safe bulk assign / update / remove)
// ---------------------------------------------------------------------------

export interface AssignEntry {
  fieldId: string;
  section?: string;
  sortOrder?: number;
  displayLabel?: string | null;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isVisible?: boolean;
  isInForm?: boolean;
  isInTable?: boolean;
  isInDetail?: boolean;
  isFilterable?: boolean;
  isSortable?: boolean;
}

export interface AssignResult {
  assigned: { id: string; fieldKey: string; label: string }[];
  skipped: { fieldKey: string; reason: string }[];
}

export async function assignFields(
  moduleKey: string,
  entries: AssignEntry[],
  actor: { id: string; name: string | null },
): Promise<AssignResult> {
  const mod = getModule(moduleKey);
  if (!mod) throw new Error(`Unknown module "${moduleKey}"`);

  const ids = entries.map((e) => e.fieldId);
  const defs = await db.customFieldDefinition.findMany({
    where: { id: { in: ids } },
    include: { assignments: { select: { moduleKey: true } } },
  });
  const byId = new Map(defs.map((d) => [d.id, d]));

  const assigned: AssignResult["assigned"] = [];
  const skipped: AssignResult["skipped"] = [];

  // De-duplicate within the request itself, then run one transaction so a
  // partial bulk assignment can never leave the module half-configured.
  const seen = new Set<string>();
  const creates: Prisma.ModuleFieldAssignmentCreateManyInput[] = [];
  for (const e of entries) {
    const def = byId.get(e.fieldId);
    if (!def) { skipped.push({ fieldKey: e.fieldId, reason: "Field not found" }); continue; }
    if (seen.has(def.id)) { skipped.push({ fieldKey: def.fieldKey, reason: "Duplicate in request" }); continue; }
    seen.add(def.id);
    if (def.status !== "ACTIVE") { skipped.push({ fieldKey: def.fieldKey, reason: `Field is ${def.status.toLowerCase()}` }); continue; }
    if (def.assignments.some((a) => a.moduleKey === moduleKey)) { skipped.push({ fieldKey: def.fieldKey, reason: "Already assigned to this module" }); continue; }
    creates.push({
      fieldDefinitionId: def.id,
      moduleKey,
      categoryId: def.categoryId,
      section: e.section || mod.sections[0],
      sortOrder: e.sortOrder ?? 100 + creates.length * 10,
      displayLabel: e.displayLabel ?? null,
      isRequired: e.isRequired ?? def.isRequired,
      isReadOnly: e.isReadOnly ?? def.isReadOnly,
      isVisible: e.isVisible ?? true,
      isInForm: e.isInForm ?? true,
      isInTable: e.isInTable ?? true,
      isInDetail: e.isInDetail ?? true,
      isFilterable: e.isFilterable ?? def.isFilterable,
      isSortable: e.isSortable ?? def.isSortable,
      createdById: actor.id,
      createdByName: actor.name,
    });
    assigned.push({ id: def.id, fieldKey: def.fieldKey, label: def.label });
  }

  if (creates.length) {
    await db.$transaction(async (tx) => {
      await tx.moduleFieldAssignment.createMany({ data: creates });
      for (const c of creates) {
        await tx.fieldAuditLog.create({
          data: {
            fieldDefinitionId: c.fieldDefinitionId,
            moduleKey,
            action: "ASSIGN",
            summary: `Assigned to ${mod.label}`,
            afterJson: toJson({ section: c.section, sortOrder: c.sortOrder, isRequired: c.isRequired, isReadOnly: c.isReadOnly }),
            userId: actor.id,
            userName: actor.name,
          },
        });
      }
    });
  }

  return { assigned, skipped };
}

export async function updateAssignment(
  assignmentId: string,
  patch: Partial<Omit<AssignEntry, "fieldId">>,
  actor: { id: string; name: string | null },
): Promise<HydratedAssignment | null> {
  const existing = await db.moduleFieldAssignment.findUnique({
    where: { id: assignmentId },
    include: { fieldDefinition: { include: { category: true } } },
  });
  if (!existing) return null;

  const data: Prisma.ModuleFieldAssignmentUpdateInput = {
    ...(patch.section !== undefined ? { section: patch.section } : {}),
    ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    ...(patch.displayLabel !== undefined ? { displayLabel: patch.displayLabel } : {}),
    ...(patch.isRequired !== undefined ? { isRequired: patch.isRequired } : {}),
    ...(patch.isReadOnly !== undefined ? { isReadOnly: patch.isReadOnly } : {}),
    ...(patch.isVisible !== undefined ? { isVisible: patch.isVisible } : {}),
    ...(patch.isInForm !== undefined ? { isInForm: patch.isInForm } : {}),
    ...(patch.isInTable !== undefined ? { isInTable: patch.isInTable } : {}),
    ...(patch.isInDetail !== undefined ? { isInDetail: patch.isInDetail } : {}),
    ...(patch.isFilterable !== undefined ? { isFilterable: patch.isFilterable } : {}),
    ...(patch.isSortable !== undefined ? { isSortable: patch.isSortable } : {}),
  };

  await db.$transaction(async (tx) => {
    await tx.moduleFieldAssignment.update({ where: { id: assignmentId }, data });
    await tx.fieldAuditLog.create({
      data: {
        fieldDefinitionId: existing.fieldDefinitionId,
        assignmentId,
        moduleKey: existing.moduleKey,
        action: "ASSIGNMENT_UPDATE",
        summary: `Module settings updated on ${existing.moduleKey}`,
        beforeJson: toJson({ section: existing.section, sortOrder: existing.sortOrder, displayLabel: existing.displayLabel, isRequired: existing.isRequired, isReadOnly: existing.isReadOnly, isVisible: existing.isVisible, isInForm: existing.isInForm, isInTable: existing.isInTable, isInDetail: existing.isInDetail }),
        afterJson: toJson(patch),
        userId: actor.id,
        userName: actor.name,
      },
    });
  });

  const list = await listAssignments(existing.moduleKey);
  return list.find((a) => a.id === assignmentId) ?? null;
}

/**
 * Remove a module assignment. Stored values are RETAINED (historical integrity)
 * but become orphaned from the form — they remain readable via the dictionary
 * impact view and in exports. Pass `purgeValues` to delete them explicitly.
 */
export async function removeAssignment(
  assignmentId: string,
  actor: { id: string; name: string | null },
  opts: { purgeValues?: boolean } = {},
): Promise<{ moduleKey: string; fieldKey: string; valuesRemoved: number } | null> {
  const existing = await db.moduleFieldAssignment.findUnique({
    where: { id: assignmentId },
    include: { fieldDefinition: true },
  });
  if (!existing) return null;

  const valuesRemoved = await db.customFieldValue.count({
    where: { moduleKey: existing.moduleKey, fieldDefinitionId: existing.fieldDefinitionId },
  });

  await db.$transaction(async (tx) => {
    if (opts.purgeValues) {
      await tx.customFieldValue.deleteMany({
        where: { moduleKey: existing.moduleKey, fieldDefinitionId: existing.fieldDefinitionId },
      });
    } else {
      await tx.customFieldValue.updateMany({
        where: { moduleKey: existing.moduleKey, fieldDefinitionId: existing.fieldDefinitionId },
        data: { assignmentId: null },
      });
    }
    await tx.moduleFieldAssignment.delete({ where: { id: assignmentId } });
    await tx.fieldAuditLog.create({
      data: {
        fieldDefinitionId: existing.fieldDefinitionId,
        moduleKey: existing.moduleKey,
        action: "UNASSIGN",
        summary: `Removed from ${existing.moduleKey}${opts.purgeValues ? " (values purged)" : " (values retained)"}`,
        beforeJson: toJson({ section: existing.section, sortOrder: existing.sortOrder }),
        userId: actor.id,
        userName: actor.name,
      },
    });
  });

  return { moduleKey: existing.moduleKey, fieldKey: existing.fieldDefinition.fieldKey, valuesRemoved: opts.purgeValues ? valuesRemoved : 0 };
}

// ---------------------------------------------------------------------------
// Impact analysis
// ---------------------------------------------------------------------------

export async function usageSnapshot(fieldId: string): Promise<FieldUsageSnapshot> {
  const assignments = await db.moduleFieldAssignment.findMany({
    where: { fieldDefinitionId: fieldId },
    select: { moduleKey: true, section: true },
  });
  const grouped = await db.customFieldValue.groupBy({
    by: ["moduleKey"],
    where: { fieldDefinitionId: fieldId, NOT: { valueText: null } },
    _count: { _all: true },
  });
  const allValues = await db.customFieldValue.count({ where: { fieldDefinitionId: fieldId } });

  const perModule = new Map<string, { count: number; sections: Set<string> }>();
  for (const a of assignments) {
    const cur = perModule.get(a.moduleKey) ?? { count: 0, sections: new Set<string>() };
    cur.count += 1;
    cur.sections.add(a.section);
    perModule.set(a.moduleKey, cur);
  }
  const valueCounts = new Map(grouped.map((g) => [g.moduleKey, g._count._all]));

  const list = [...perModule.entries()].map(([moduleKey, v]) => ({
    moduleKey,
    count: v.count,
    sections: [...v.sections],
    values: valueCounts.get(moduleKey) ?? 0,
  }));

  return {
    assignments: list.map(({ moduleKey, count, sections }) => ({ moduleKey, count, sections })),
    totalAssignments: assignments.length,
    totalValues: allValues,
    recordsWithValue: grouped.reduce((sum, g) => sum + g._count._all, 0),
    modulesWithValues: grouped.map((g) => g.moduleKey),
  };
}

export interface ImpactReport {
  field: DictField | null;
  usage: FieldUsageSnapshot;
  findings: ImpactFinding[];
  severity: string;
  recordCounts: Record<string, number>;
  incompatibleValues: { moduleKey: string; recordId: string; value: FieldValue }[];
}

export async function impactFor(fieldId: string, proposed: FieldChange = {}): Promise<ImpactReport> {
  const field = await getDefinition(fieldId);
  const usage = await usageSnapshot(fieldId);

  const before: FieldChange = field
    ? { fieldKey: field.fieldKey, dataType: field.dataType, options: field.options, isRequired: field.isRequired, isReadOnly: field.isReadOnly, status: field.status, sensitivity: field.sensitivity, label: field.label, description: field.description ?? undefined }
    : {};
  const findings = analyseImpact(before, proposed, usage);

  const recordCounts: Record<string, number> = {};
  for (const a of usage.assignments) {
    recordCounts[a.moduleKey] = await moduleRecordCount(a.moduleKey);
  }

  // Detect values that would become invalid under the proposed type/options.
  const incompatibleValues: ImpactReport["incompatibleValues"] = [];
  if (proposed.dataType || proposed.options) {
    const rows = await db.customFieldValue.findMany({
      where: { fieldDefinitionId: fieldId },
      take: 500,
    });
    const mockDef = {
      label: field?.label ?? "Field",
      dataType: proposed.dataType ?? field?.dataType ?? "TEXT",
      options: proposed.options ?? field?.options ?? [],
      config: null,
    };
    for (const row of rows) {
      const value = unpackValue(row);
      if (value === null) continue;
      const res = packValue(mockDef, value);
      if (!res.ok) incompatibleValues.push({ moduleKey: row.moduleKey, recordId: row.recordId, value });
    }
  }

  const order = ["none", "low", "medium", "high"];
  const severity = findings.reduce((acc, f) => (order.indexOf(f.severity) > order.indexOf(acc) ? f.severity : acc), "none");

  return { field, usage, findings, severity, recordCounts, incompatibleValues };
}

// ---------------------------------------------------------------------------
// Field audit log
// ---------------------------------------------------------------------------

export async function logFieldAudit(entry: {
  fieldDefinitionId?: string | null;
  assignmentId?: string | null;
  moduleKey?: string | null;
  recordId?: string | null;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  userId?: string | null;
  userName?: string | null;
  role?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await db.fieldAuditLog.create({
    data: {
      fieldDefinitionId: entry.fieldDefinitionId ?? null,
      assignmentId: entry.assignmentId ?? null,
      moduleKey: entry.moduleKey ?? null,
      recordId: entry.recordId ?? null,
      action: entry.action,
      summary: entry.summary,
      beforeJson: entry.before !== undefined ? toJson(entry.before) : null,
      afterJson: entry.after !== undefined ? toJson(entry.after) : null,
      userId: entry.userId ?? null,
      userName: entry.userName ?? null,
      role: entry.role ?? null,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

export async function listFieldAudit(opts: { fieldId?: string; moduleKey?: string; limit?: number } = {}) {
  return db.fieldAuditLog.findMany({
    where: {
      ...(opts.fieldId ? { fieldDefinitionId: opts.fieldId } : {}),
      ...(opts.moduleKey ? { moduleKey: opts.moduleKey } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 100, 500),
  });
}

// ---------------------------------------------------------------------------
// Sensitivity-filtered projection for API responses
// ---------------------------------------------------------------------------

/** Drop fields the subject may not see (sensitivity + role gates) + archived ones. */
export function filterVisibleFields<T extends { field: Pick<DictField, "sensitivity" | "visibleRoles" | "status"> }>(
  items: T[],
  subject: { roles: string[]; isSuperAdmin: boolean } | null,
): T[] {
  if (!subject) return [];
  return items.filter((i) =>
    canViewField({ sensitivity: i.field.sensitivity, visibleRolesJson: i.field.visibleRoles.join(",") }, subject)
    && i.field.status !== "ARCHIVED"
  );
}

export { canViewField, canEditField, FIELD_TYPE_META, deriveFieldKey };
