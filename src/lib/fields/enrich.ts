// PM CONTROL TOWER — Custom field enrichment for exports and search.
// Keeps the Field Dictionary out of the entity definitions themselves: the
// export route calls `withCustomFields()` after the core rows are produced, and
// global search calls `searchCustomValues()` for a "custom fields" group.
//
// Only fields flagged isExportable (exports) / isSearchable (search) and visible
// to the caller's sensitivity scope are included.

import type { CsvColumn } from "@/lib/csv";
import { db } from "@/lib/db";
import { formatValue, normalizeType } from "@/lib/engines/field-dictionary";
import { canViewField, listAssignments, readValues, type HydratedAssignment } from "./store";
import type { FieldValue } from "@/lib/engines/custom-fields";

/**
 * Export entity key → Field Dictionary module key.
 * One entry per supported module so every export gains custom columns.
 */
export const ENTITY_TO_MODULE: Record<string, string> = {
  portfolios: "portfolio",
  programs: "program",
  projects: "project",
  requirements: "requirement",
  "wbs-nodes": "wbs_node",
  tasks: "task",
  milestones: "milestone",
  baselines: "baseline",
  resources: "resource",
  timesheets: "timesheet",
  "timesheet-entries": "timesheet_entry",
  "budget-lines": "budget_line",
  "evm-periods": "evm_period",
  "health-snapshots": "health_snapshot",
  risks: "risk",
  issues: "issue",
  assumptions: "assumption",
  changes: "change_request",
  "stage-gates": "stage_gate",
  "governance-rules": "governance_rule",
  alerts: "governance_alert",
  users: "user",
  "audit-events": "audit_trail",
};

export interface CustomFieldEnrichment {
  /** Extra CSV columns, appended after the entity's core columns. */
  columns: CsvColumn[];
  /** Mutates rows in place: adds one key per eligible custom field. */
  apply: (rows: Record<string, unknown>[]) => void;
}

const EMPTY: CustomFieldEnrichment = { columns: [], apply: () => {} };

/**
 * Append custom field columns + values to an export's rows.
 * Core entity columns are never removed or reordered — custom fields append.
 */
export async function withCustomFields(
  entityKey: string,
  rows: Record<string, unknown>[],
  subject: { roles: string[]; isSuperAdmin: boolean } | null,
): Promise<CustomFieldEnrichment> {
  const moduleKey = ENTITY_TO_MODULE[entityKey];
  if (!moduleKey || !subject || rows.length === 0) return EMPTY;

  const assignments = await listAssignments(moduleKey, { includeHidden: true });
  const eligible = assignments.filter((a) =>
    a.isVisible
    && a.field.isExportable
    && a.field.status !== "ARCHIVED"
    && canViewField({ sensitivity: a.field.sensitivity, visibleRolesJson: a.field.visibleRoles.join(",") }, subject),
  );
  if (!eligible.length) return EMPTY;

  const recordIds = rows.map((r) => String(r.id ?? "")).filter(Boolean);
  if (!recordIds.length) return EMPTY;

  const values = await readValues(moduleKey, recordIds);
  const byKey = new Map(eligible.map((a) => [a.field.fieldKey, a]));

  const columns: CsvColumn[] = eligible.map((a) => ({
    key: `cf_${a.field.fieldKey}`,
    label: a.displayLabel || a.field.label,
  }));

  return {
    columns,
    apply: (target) => {
      for (const row of target) {
        const recordId = String(row.id ?? "");
        const stored = values[recordId] ?? {};
        for (const a of eligible) {
          const raw = stored[a.field.fieldKey];
          row[`cf_${a.field.fieldKey}`] = raw === undefined
            ? ""
            : formatValue(a.field, (raw ?? null) as FieldValue);
        }
      }
    },
  };
}

export interface CustomValueHit {
  fieldKey: string;
  label: string;
  moduleKey: string;
  recordId: string;
  value: string;
}

/**
 * Search text values of searchable dictionary fields.
 * Matches valueText (which denormalises multi-selects too) so a single indexed
 * LIKE covers text, select, user and email fields cheaply.
 */
export async function searchCustomValues(
  q: string,
  subject: { roles: string[]; isSuperAdmin: boolean } | null,
  take = 8,
): Promise<CustomValueHit[]> {
  if (!subject || q.length < 2) return [];

  const defs = await db.customFieldDefinition.findMany({
    where: { isSearchable: true, status: { in: ["ACTIVE", "DEPRECATED"] } },
    select: { id: true, fieldKey: true, label: true, sensitivity: true, visibleRolesJson: true },
  });

  const visible = defs.filter((d) =>
    canViewField({ sensitivity: d.sensitivity, visibleRolesJson: d.visibleRolesJson }, subject),
  );
  if (!visible.length) return [];

  const rows = await db.customFieldValue.findMany({
    where: {
      fieldDefinitionId: { in: visible.map((d) => d.id) },
      valueText: { contains: q },
    },
    select: { fieldDefinitionId: true, moduleKey: true, recordId: true, valueText: true },
    take: take * 3,
  });

  const labelById = new Map(visible.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const hits: CustomValueHit[] = [];
  for (const row of rows) {
    const def = labelById.get(row.fieldDefinitionId);
    if (!def) continue;
    const dedupe = `${def.fieldKey}:${row.moduleKey}:${row.recordId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    hits.push({
      fieldKey: def.fieldKey,
      label: def.label,
      moduleKey: row.moduleKey,
      recordId: row.recordId,
      value: row.valueText ?? "",
    });
    if (hits.length >= take) break;
  }
  return hits;
}

/** Types that produce a meaningful export/search string. Used for diagnostics. */
export function isTextSearchableType(dataType: string): boolean {
  return ["TEXT", "LONG_TEXT", "EMAIL", "URL", "PHONE", "SINGLE_SELECT", "USER_LOOKUP", "ENTITY_LOOKUP"]
    .includes(normalizeType(dataType));
}
