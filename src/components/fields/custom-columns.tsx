"use client";
// PM CONTROL TOWER — custom field table columns
// Builds kit DataTable columns from a module's table-enabled dictionary fields
// and the bulk values map, so any list view gains custom columns in one line.

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Column } from "@/components/pmct/kit";
import { formatValue, normalizeType } from "@/lib/engines/field-dictionary";
import type { FieldValue } from "@/lib/engines/custom-fields";
import type { AssignmentLite } from "./types";

export function customFieldColumns<T extends Record<string, unknown>>(
  tableColumns: AssignmentLite[],
  values: Record<string, Record<string, FieldValue>>,
  opts: { keyField?: keyof T & string; currency?: string } = {},
): Column<T>[] {
  const keyField = (opts.keyField ?? "id") as string;
  const currency = opts.currency ?? "USD";
  return tableColumns.map((a) => ({
    key: `cf_${a.field.fieldKey}`,
    header: a.displayLabel || a.field.label,
    render: (row: T): ReactNode => {
      const recordId = row[keyField];
      if (recordId === null || recordId === undefined) return <span className="text-slate-300">—</span>;
      const v = values[String(recordId)]?.[a.field.fieldKey];
      return <CustomFieldValueCell assignment={a} value={v ?? null} currency={currency} />;
    },
  }));
}

export function CustomFieldValueCell({ assignment, value, currency = "USD" }: {
  assignment: AssignmentLite; value: FieldValue; currency?: string;
}) {
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) return <span className="text-slate-300">—</span>;

  const type = normalizeType(assignment.field.dataType);
  if (type === "CHECKBOX") {
    return (
      <Badge variant="outline" className={value === true ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}>
        {value === true ? "Yes" : "No"}
      </Badge>
    );
  }
  if (type === "SINGLE_SELECT") {
    return <Badge variant="outline" className="bg-blue-50 text-blue-700">{String(value)}</Badge>;
  }
  if (type === "MULTI_SELECT" && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.slice(0, 3).map((m) => <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>)}
        {value.length > 3 && <span className="text-[10px] text-slate-400">+{value.length - 3}</span>}
      </span>
    );
  }
  if (type === "USER_LOOKUP" || type === "ENTITY_LOOKUP") {
    return <code className="text-[11px] text-slate-500">{String(value).slice(0, 12)}…</code>;
  }
  const text = formatValue(assignment.field, value, currency);
  return <span className={type === "CURRENCY" || type === "INTEGER" || type === "DECIMAL" || type === "PERCENTAGE" ? "tabular-nums" : ""}>{text}</span>;
}

/** Client-side filter predicate for a custom column (used by advanced filters). */
export function matchesCustomFilter(value: FieldValue, filter: { op?: string; value?: unknown }): boolean {
  const op = filter.op ?? "contains";
  const target = filter.value;
  if (target === undefined || target === null || target === "") return true;
  const empty = value === null || value === undefined || value === "";
  switch (op) {
    case "empty": return empty;
    case "notEmpty": return !empty;
    case "eq": return String(value) === String(target);
    case "neq": return String(value) !== String(target);
    case "gt": return Number(value) > Number(target);
    case "lt": return Number(value) < Number(target);
    case "gte": return Number(value) >= Number(target);
    case "lte": return Number(value) <= Number(target);
    case "before": return String(value) < String(target);
    case "after": return String(value) > String(target);
    case "is": return value === target;
    case "isNot": return value !== target;
    case "includes": return Array.isArray(value) ? value.includes(String(target)) : String(value).includes(String(target));
    default: return String(value ?? "").toLowerCase().includes(String(target).toLowerCase());
  }
}

/** Sort comparator honouring the field's data type (numbers, dates, text). */
export function compareCustomValues(a: FieldValue, b: FieldValue, dataType: string): number {
  const type = normalizeType(dataType);
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1; // empties last
  if (emptyB) return -1;
  if (type === "INTEGER" || type === "DECIMAL" || type === "CURRENCY" || type === "PERCENTAGE" || type === "FORMULA") {
    return Number(a) - Number(b);
  }
  if (type === "CHECKBOX") return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  if (Array.isArray(a) || Array.isArray(b)) {
    return String(Array.isArray(a) ? a.join(",") : a).localeCompare(String(Array.isArray(b) ? b.join(",") : b));
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
