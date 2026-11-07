// PM CONTROL TOWER — Schedule (CPM) bundle types — mirrors GET /api/projects/[id]/schedule

export interface ScheduleTask {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  criticality: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  progress: number;
  plannedHours: number;
  actualHours: number;
  remainingHours: number;
  plannedCost: number;
  actualCost: number;
  isCritical: boolean;
  isSummary: boolean;
  earliestStart: string | null;
  earliestFinish: string | null;
  latestStart: string | null;
  latestFinish: string | null;
  totalFloat: number;
  freeFloat: number;
  constraintType: string;
  constraintDate: string | null;
  deadline: string | null;
  parentId: string | null;
  wbsId: string | null;
  notes: string | null;
  wbs: { id: string; code: string; name: string } | null;
  assignee: { id: string; name: string } | null;
}

export interface ScheduleDep {
  id: string;
  predecessorId: string;
  successorId: string;
  depType: string;
  lagDays: number;
  isExternal: boolean;
  predecessor: { id: string; code: string; name: string };
  successor: { id: string; code: string; name: string };
}

export interface ScheduleSummary {
  taskCount: number;
  leafTaskCount: number;
  dependencyCount: number;
  criticalCount: number;
  projectStart: string | null;
  projectFinish: string | null;
  totalDuration: number | null;
  criticalTasks: { id: string; code: string; name: string; startDate: string | null; endDate: string | null; durationDays: number }[];
}

export interface ScheduleBundle {
  projectId: string;
  summary: ScheduleSummary;
  tasks: ScheduleTask[];
  dependencies: ScheduleDep[];
}

// ---- Presentation helpers shared by the Gantt, the network and the dialog ----

export const STATUS_META: Record<string, { dot: string; bar: string; text: string; ring: string }> = {
  NOT_STARTED: { dot: "#94a3b8", bar: "#64748b", text: "text-slate-500", ring: "border-slate-300" },
  IN_PROGRESS: { dot: "#3b82f6", bar: "#2563eb", text: "text-blue-600", ring: "border-blue-300" },
  COMPLETED: { dot: "#10b981", bar: "#059669", text: "text-emerald-600", ring: "border-emerald-300" },
  BLOCKED: { dot: "#ef4444", bar: "#dc2626", text: "text-red-600", ring: "border-red-300" },
  CANCELLED: { dot: "#cbd5e1", bar: "#94a3b8", text: "text-slate-400", ring: "border-slate-200" },
};

export const statusMeta = (status: string) => STATUS_META[status] ?? STATUS_META.NOT_STARTED;

/** Total-float tone: red = none (critical), amber = tight, emerald = healthy. */
export function floatTone(totalFloat: number, isCritical: boolean): { bg: string; fg: string; border: string; label: string } {
  if (isCritical || totalFloat <= 0.001) return { bg: "bg-red-50", fg: "text-red-700", border: "border-red-200", label: "CRIT" };
  if (totalFloat <= 5) return { bg: "bg-amber-50", fg: "text-amber-700", border: "border-amber-200", label: `${Math.round(totalFloat)}d` };
  return { bg: "bg-emerald-50", fg: "text-emerald-700", border: "border-emerald-200", label: `${Math.round(totalFloat)}d` };
}

/** Optional tile shown in tooltips/dialogs: ES/EF/LS/LF formatted. */
export const shortDate = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : "—");
