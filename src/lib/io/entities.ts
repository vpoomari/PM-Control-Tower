// PM CONTROL TOWER — Import/Export entity registry. Single source of truth for every
// entity the platform can exchange as CSV/JSON. Export = full-fidelity (all fields);
// Import = governed upsert for master-data entities where it is safe.

import type { EntityDef } from "./shared";
import { portfolios, programs, projects, requirements, tasks, milestones } from "./importable-a";
import { resources, risks, issues, assumptions, changes, budgetLines, users } from "./importable-b";
import {
  timesheets, timesheetEntries, evmPeriods, stageGates, baselines, wbsNodes,
  healthSnapshots, governanceRules, alerts, auditEvents,
} from "./exportable";

export const ENTITIES: Record<string, EntityDef> = {
  portfolios, programs, projects, requirements, tasks, milestones,
  resources, risks, issues, assumptions, changes, "budget-lines": budgetLines, users,
  timesheets, "timesheet-entries": timesheetEntries, "evm-periods": evmPeriods,
  "stage-gates": stageGates, baselines, "wbs-nodes": wbsNodes,
  "health-snapshots": healthSnapshots, "governance-rules": governanceRules,
  alerts, "audit-events": auditEvents,
};

export function getEntity(key: string): EntityDef | null {
  return ENTITIES[key] ?? null;
}

export type { EntityDef } from "./shared";
export { runImport, IMPORT_MAX_ROWS } from "./shared";
export type { RowResult } from "./shared";
