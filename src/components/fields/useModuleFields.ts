"use client";
// PM CONTROL TOWER — useModuleFields hook
// One hook for every module: loads the module's field assignments and bulk
// values for the visible records, and exposes a typed save for one record.

import { useCallback, useMemo, useState } from "react";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import type { FieldValue } from "@/lib/engines/custom-fields";
import type { AssignmentLite, ModuleLite, ValueMap } from "./types";

export interface ModuleFieldsResult {
  module: ModuleLite | null;
  assignments: AssignmentLite[];
  sections: string[];
  loading: boolean;
  error: string | null;
  values: ValueMap;
  /** Assignments grouped by section, in display order. */
  bySection: { section: string; items: AssignmentLite[] }[];
  /** Custom columns only (assignments flagged isInTable && isVisible). */
  tableColumns: AssignmentLite[];
  refetch: () => void;
  saveValues: (recordId: string, values: Record<string, FieldValue>) => Promise<{ saved: string[] }>;
  saving: boolean;
}

export function useModuleFields(moduleKey: string, recordIds: string[] = []): ModuleFieldsResult {
  const assignmentsPath = `/api/modules/${moduleKey}/fields?includeHidden=true`;
  const defs = useApi<{ module: ModuleLite; assignments: AssignmentLite[]; sections: string[] }>(assignmentsPath);

  const idsKey = recordIds.filter(Boolean).join(",");
  const valuesPath = idsKey ? `/api/modules/${moduleKey}/values?recordIds=${encodeURIComponent(idsKey)}` : null;
  const valuesRes = useApi<{ assignments: AssignmentLite[]; values: ValueMap }>(valuesPath, [idsKey]);

  const [saving, setSaving] = useState(false);
  const refetch = useCallback(() => {
    defs.refetch();
    valuesRes.refetch();
  }, [defs.refetch, valuesRes.refetch]);

  useRealtimeRefetch(refetch, ["field:changed", "data:imported"]);

  const assignments = defs.data?.assignments ?? [];
  const values = valuesRes.data?.values ?? {};

  const bySection = useMemo(() => {
    const map = new Map<string, AssignmentLite[]>();
    for (const a of assignments) {
      if (!a.isVisible || !a.isInForm) continue;
      const list = map.get(a.section) ?? [];
      list.push(a);
      map.set(a.section, list);
    }
    return [...map.entries()].map(([section, items]) => ({ section, items }));
  }, [assignments]);

  const tableColumns = useMemo(
    () => assignments.filter((a) => a.isVisible && a.isInTable),
    [assignments],
  );

  const saveValues = useCallback(async (recordId: string, vals: Record<string, FieldValue>) => {
    setSaving(true);
    try {
      const res = await api.put<{ saved: string[] }>(`/api/modules/${moduleKey}/${recordId}/values`, { values: vals });
      valuesRes.refetch();
      return res;
    } finally {
      setSaving(false);
    }
  }, [moduleKey, valuesRes.refetch]);

  return {
    module: defs.data?.module ?? null,
    assignments,
    sections: defs.data?.sections ?? [],
    loading: defs.loading || valuesRes.loading,
    error: defs.error || valuesRes.error,
    values,
    bySection,
    tableColumns,
    refetch,
    saveValues,
    saving,
  };
}
