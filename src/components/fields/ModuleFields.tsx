"use client";
// PM CONTROL TOWER — ModuleFields
// The one-line integration point for any module view: renders a "Fields"
// button (Configure Fields) and an "Add Field" button, and keeps the module's
// assignments + values fresh. Views compose it into their PageHeader actions
// and read `fields.values` / `fields.tableColumns` for their grid.

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Layers, SlidersHorizontal } from "lucide-react";
import AddFieldFromDictionary from "./AddFieldFromDictionary";
import ConfigureFieldsDialog from "./ConfigureFieldsDialog";
import { useModuleFields } from "./useModuleFields";
import type { FieldValue } from "@/lib/engines/custom-fields";
import type { AssignmentLite, ModuleLite } from "./types";

export interface ModuleFieldsHandle {
  module: ModuleLite | null;
  assignments: AssignmentLite[];
  tableColumns: AssignmentLite[];
  bySection: { section: string; items: AssignmentLite[] }[];
  values: Record<string, Record<string, FieldValue>>;
  loading: boolean;
  refetch: () => void;
  /** Render the two buttons into a PageHeader/Toolbar. */
  actions: React.ReactNode;
}

export function useModuleFieldsHandle(moduleKey: string, recordIds: string[] = []): ModuleFieldsHandle {
  const fields = useModuleFields(moduleKey, recordIds);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const onChanged = useCallback(() => fields.refetch(), [fields.refetch]);

  const actions = useMemo(() => (
    <>
      <Button variant="outline" size="sm" onClick={() => setConfigureOpen(true)} title={`Configure fields for ${fields.module?.label ?? moduleKey}`}>
        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
        Fields{fields.assignments.length ? ` (${fields.assignments.length})` : ""}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} title="Add a field from the Field Dictionary">
        <Layers className="mr-1.5 h-3.5 w-3.5" />
        Add Field
      </Button>
      <ConfigureFieldsDialog
        moduleKey={moduleKey} open={configureOpen} onOpenChange={setConfigureOpen}
        assignments={fields.assignments} sections={fields.sections} module={fields.module}
        loading={fields.loading} onChanged={onChanged} onAdd={() => { setConfigureOpen(false); setAddOpen(true); }}
      />
      <AddFieldFromDictionary
        moduleKey={moduleKey} open={addOpen} onOpenChange={setAddOpen} onAdded={onChanged}
      />
    </>
  ), [addOpen, configureOpen, fields, moduleKey, onChanged]);

  return {
    module: fields.module,
    assignments: fields.assignments,
    tableColumns: fields.tableColumns,
    bySection: fields.bySection,
    values: fields.values,
    loading: fields.loading,
    refetch: fields.refetch,
    actions,
  };
}

export { useModuleFields };
export type { AssignmentLite, ModuleLite };
