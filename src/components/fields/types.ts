"use client";
// PM CONTROL TOWER — Field Dictionary client types.
// Structurally mirrors the server shapes in @/lib/fields/store (kept separate so
// Prisma never enters the client bundle).

import type { FieldValue } from "@/lib/engines/custom-fields";

// NOTE: these are `type` aliases (not interfaces) so they satisfy the
// `Record<string, unknown>` constraint used by the kit's DataTable generics.
export type FieldLite = {
  id: string;
  fieldKey: string;
  name: string;
  label: string;
  dataType: string;
  options: string[];
  config: { min?: number; max?: number; step?: number; integer?: boolean; unit?: string; minLength?: number; maxLength?: number; multiline?: boolean; placeholder?: string; defaultValue?: FieldValue; expression?: string } | null;
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
  createdAt: string;
  updatedAt: string;
  modules: string[];
  assignmentCount: number;
  valueCount: number;
};

export type AssignmentLite = {
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
  validationOverrides: { min?: number; max?: number; minLength?: number; maxLength?: number } | null;
  field: FieldLite;
};

export type CategoryLite = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  fieldCount: number;
  assignmentCount: number;
};

export type ModuleLite = {
  key: string;
  label: string;
  singular: string;
  area: string;
  viewPerm: string;
  managePerm: string;
  sections: string[];
  recordNoun: string;
  projectScoped: boolean;
};

export type ValueMap = Record<string, Record<string, FieldValue>>;

export const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INTERNAL: "bg-slate-50 text-slate-600 border-slate-200",
  CONFIDENTIAL: "bg-amber-50 text-amber-700 border-amber-200",
  RESTRICTED: "bg-red-50 text-red-700 border-red-200",
};
