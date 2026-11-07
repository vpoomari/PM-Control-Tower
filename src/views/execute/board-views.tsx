"use client";
// PM CONTROL TOWER — Boards: task surface (Command Center v3.0)
// One Task entity rendered as a drag-and-drop kanban OR dense list view (toggle),
// with search + filter dropdown + sort, a slide-over task panel, and the kit's
// KPI cards, right rail (Today / Upcoming / Priority) and bottom widgets
// (Task Timeline / Team Workload). Calendar + Workload stay as extra segments.

import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { PageHeader, StatCard, SectionCard, LoadingBlock, ErrorBlock, EmptyState, SearchInput } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "@/views/plan/shared/ProjectPicker";
import { KanbanBoard, presentationOf, type KanbanTask } from "./shared/KanbanBoard";
import { MiniDonut, PriorityOverview, TaskTimeline, TeamWorkload, TodaysTasks, UpcomingTasks } from "./board-widgets";
import { TaskListView } from "./task-list";
import { TaskSlideOver } from "./task-slideover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PRIORITY, TASK_STATUS } from "@/lib/constants";
import {
  ArrowUpDown, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Columns3,
  Filter, Layers, List, Plus, Users, X,
} from "lucide-react";

interface AgileBoard {
  projects: { id: string; code: string; name: string; status?: string }[];
  tasks: KanbanTask[];
  summary: { sprintCount: number; backlogCards: number; totalPoints: number };
}
interface CapacityRow {
  resource: { id: string; name: string; employeeCode: string; department: string | null; capacityHoursPerWeek: number };
  cells: { week: string; allocated: number; capacity: number; utilizationPct: number; overallocated: boolean }[];
  totalAllocated: number;
  totalCapacity: number;
  avgUtilizationPct: number;
  peakUtilizationPct: number;
  overallocatedWeeks: number;
}
interface MeetingItem { id: string; title: string; scheduledAt: string; meetingType: string; status: string }

type ViewKey = "list" | "kanban" | "calendar" | "workload";

const KANBAN_ORDER = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_ORDER: Record<string, number> = Object.fromEntries(TASK_STATUS.map((s, i) => [s, i]));

const COMPARATORS: Record<string, (a: KanbanTask, b: KanbanTask) => number> = {
  priority: (a, b) =>
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31"),
  due: (a, b) => (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31"),
  name: (a, b) => a.name.localeCompare(b.name),
  status: (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  progress: (a, b) => a.progress - b.progress,
  updated: (a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""),
};

const SORT_LABELS: Record<string, string> = {
  priority: "Priority (urgent first)",
  due: "Due date (soonest)",
  name: "Name (A–Z)",
  status: "Status",
  progress: "Progress (least done)",
  updated: "Recently updated",
};

function toggleSet(set: Set<string>, key: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

function IconSq({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>{children}</span>;
}

// ---------- KPI row: Task Completion donut card ----------
function CompletionCard({ tasks }: { tasks: KanbanTask[] }) {
  const defs = [
    { status: "COMPLETED", label: "Done", color: "#10b981" },
    { status: "IN_PROGRESS", label: "In Progress", color: "#3b82f6" },
    { status: "NOT_STARTED", label: "To Do", color: "#64748b" },
    { status: "BLOCKED", label: "Blocked", color: "#ef4444" },
    { status: "CANCELLED", label: "Cancelled", color: "#cbd5e1" },
  ].map((d) => ({ ...d, count: tasks.filter((t) => (t.status || "NOT_STARTED") === d.status).length }));
  const total = tasks.length;
  const done = defs[0].count;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const shown = defs.filter((d) => d.count > 0 || d.status === "COMPLETED" || d.status === "IN_PROGRESS");

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Task Completion</p>
        <div className="flex items-center gap-4 mt-2">
          <MiniDonut
            slices={defs.map((d) => ({ value: d.count, color: d.color }))}
            size={88}
            thickness={11}
            center={<span className="text-lg font-semibold text-slate-900 tabular-nums leading-none">{pct}%</span>}
            sub="done"
          />
          <div className="flex-1 min-w-0 space-y-1">
            {shown.map((d) => (
              <div key={d.status} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-slate-600 flex-1 truncate">{d.label}</span>
                <span className="text-slate-400 tabular-nums">{d.count}</span>
                <span className="text-slate-500 font-semibold tabular-nums w-8 text-right">{total ? Math.round((d.count / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Filter dropdown (status · priority · assignee) ----------
function FilterPopover({
  statusCounts, priorityCounts, assignees, unassignedCount,
  statusFilter, setStatusFilter, priorityFilter, setPriorityFilter, assigneeFilter, setAssigneeFilter, onClear,
}: {
  statusCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  assignees: { id: string; name: string; count: number }[];
  unassignedCount: number;
  statusFilter: Set<string>;
  setStatusFilter: (s: Set<string>) => void;
  priorityFilter: Set<string>;
  setPriorityFilter: (s: Set<string>) => void;
  assigneeFilter: Set<string>;
  setAssigneeFilter: (s: Set<string>) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = statusFilter.size + priorityFilter.size + assigneeFilter.size;
  const sectionTitle = "text-[10px] font-semibold uppercase tracking-wide text-slate-400";
  const rowCls = "flex items-center gap-2 py-1 text-xs text-slate-700 hover:bg-slate-50 rounded px-1 -mx-1 cursor-pointer";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Filter
          {activeCount > 0 && (
            <Badge className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] tabular-nums">{activeCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 space-y-3">
        <div>
          <p className={sectionTitle + " mb-1"}>Status</p>
          {TASK_STATUS.map((s) => (
            <label key={s} className={rowCls}>
              <Checkbox checked={statusFilter.has(s)} onCheckedChange={(c) => setStatusFilter(toggleSet(statusFilter, s, c === true))} />
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColorOf(s) }} />
              <span className="flex-1">{presentationOf(s).label}</span>
              <span className="text-slate-400 tabular-nums">{statusCounts[s] ?? 0}</span>
            </label>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-2">
          <p className={sectionTitle + " mb-1"}>Priority</p>
          {PRIORITY.map((p) => (
            <label key={p} className={rowCls}>
              <Checkbox checked={priorityFilter.has(p)} onCheckedChange={(c) => setPriorityFilter(toggleSet(priorityFilter, p, c === true))} />
              <span className="flex-1">{p}</span>
              <span className="text-slate-400 tabular-nums">{priorityCounts[p] ?? 0}</span>
            </label>
          ))}
        </div>
        <div className="border-t border-slate-100 pt-2">
          <p className={sectionTitle + " mb-1"}>Assignee</p>
          <div className="max-h-40 overflow-y-auto pr-1">
            {assignees.map((a) => (
              <label key={a.id} className={rowCls}>
                <Checkbox checked={assigneeFilter.has(a.id)} onCheckedChange={(c) => setAssigneeFilter(toggleSet(assigneeFilter, a.id, c === true))} />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-slate-400 tabular-nums">{a.count}</span>
              </label>
            ))}
            {unassignedCount > 0 && (
              <label className={rowCls}>
                <Checkbox checked={assigneeFilter.has("none")} onCheckedChange={(c) => setAssigneeFilter(toggleSet(assigneeFilter, "none", c === true))} />
                <span className="flex-1 text-slate-500">Unassigned</span>
                <span className="text-slate-400 tabular-nums">{unassignedCount}</span>
              </label>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={onClear} disabled={activeCount === 0}>Clear all</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function dotColorOf(status: string): string {
  const map: Record<string, string> = {
    NOT_STARTED: "#3b82f6", IN_PROGRESS: "#f59e0b", COMPLETED: "#10b981", BLOCKED: "#ef4444", CANCELLED: "#94a3b8",
  };
  return map[status] || "#94a3b8";
}

// ---------- View toggle (List · Kanban · Calendar · Workload) ----------
const VIEW_OPTIONS = [
  { key: "list", label: "List", icon: List },
  { key: "kanban", label: "Kanban", icon: Columns3 },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "workload", label: "Workload", icon: Users },
] as const;

function ViewToggle({ value, onChange }: { value: ViewKey; onChange: (v: ViewKey) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5" role="tablist" aria-label="Board view">
      {VIEW_OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Calendar month grid (kept from v3.0) ----------
function WorkCalendar({ tasks, meetings }: { tasks: KanbanTask[]; meetings: MeetingItem[] }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const monthEnd = new Date(view.getFullYear(), view.getMonth() + 1, 0);
  const startPad = (monthStart.getDay() + 6) % 7; // Monday-first
  const days: { date: Date; inMonth: boolean }[] = [];
  for (let i = startPad; i > 0; i--) days.push({ date: new Date(monthStart.getTime() - i * 86_400_000), inMonth: false });
  for (let d = 1; d <= monthEnd.getDate(); d++) days.push({ date: new Date(view.getFullYear(), view.getMonth(), d), inMonth: true });
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    days.push({ date: new Date(last.getTime() + 86_400_000), inMonth: false });
  }

  const dueByDay = new Map<string, KanbanTask[]>();
  for (const t of tasks) {
    if (!t.endDate) continue;
    const key = t.endDate.slice(0, 10);
    dueByDay.set(key, [...(dueByDay.get(key) || []), t]);
  }
  const meetByDay = new Map<string, MeetingItem[]>();
  for (const m of meetings) {
    const key = (m.scheduledAt || "").slice(0, 10);
    if (!key) continue;
    meetByDay.set(key, [...(meetByDay.get(key) || []), m]);
  }
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <SectionCard
      title={view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      description="Task due dates and meetings on one calendar. Switch to List or Kanban with the toggle above."
      actions={
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonthOffset((o) => o - 1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMonthOffset(0)}>Today</Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setMonthOffset((o) => o + 1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500 text-center py-1.5">{d}</div>
        ))}
        {days.map(({ date, inMonth }, i) => {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          const due = dueByDay.get(key) || [];
          const meets = meetByDay.get(key) || [];
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div key={i} className={cn("min-h-24 bg-white p-1.5 space-y-1", !inMonth && "bg-slate-50/70", isWeekend && inMonth && "bg-slate-50/50")}>
              <p className={cn("text-[10px] font-semibold tabular-nums text-right", key === todayKey ? "bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center ml-auto" : inMonth ? "text-slate-500" : "text-slate-300")}>
                {date.getDate()}
              </p>
              {meets.slice(0, 1).map((m) => (
                <div key={m.id} className="rounded bg-purple-50 border border-purple-200 px-1 py-0.5 text-[9px] text-purple-800 truncate" title={`${m.title} (${m.meetingType})`}>📅 {m.title}</div>
              ))}
              {due.slice(0, 3).map((t) => (
                <div key={t.id} className={cn("rounded px-1 py-0.5 text-[9px] truncate border",
                  t.status === "COMPLETED" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : t.status === "BLOCKED" ? "bg-red-50 border-red-200 text-red-800"
                      : "bg-blue-50 border-blue-200 text-blue-800")}
                  title={`${t.code} — ${t.name}`}>
                  {t.code} {t.name}
                </div>
              ))}
              {due.length > 3 && <p className="text-[9px] text-slate-400 pl-1">+{due.length - 3} more</p>}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ---------- Workload heatmap (kept from v3.0) ----------
function WorkloadHeatmap() {
  const [weeks, setWeeks] = useState("8");
  const capacity = useApi<{ rows: CapacityRow[]; summary: Record<string, number> }>(`/api/capacity?weeks=${weeks}`, [weeks]);

  if (capacity.loading) return <LoadingBlock label="Computing capacity…" />;
  if (capacity.error) return <ErrorBlock message={capacity.error} onRetry={capacity.refetch} />;
  const rows = capacity.data?.rows || [];
  if (!rows.length) return <EmptyState title="No active resources" description="Add resources in the Execute module to see the workload heatmap." />;

  const weekHeaders = rows[0]?.cells.map((c) => c.week) || [];
  return (
    <SectionCard
      title="Resource workload heatmap"
      description="Allocated hours vs weekly capacity. Red cells are over-allocated."
      actions={
        <Select value={weeks} onValueChange={setWeeks}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["4", "8", "12", "16", "26"].map((w) => <SelectItem key={w} value={w}>{w} weeks</SelectItem>)}
          </SelectContent>
        </Select>
      }
      bodyClass="p-0"
    >
      <div className="overflow-auto p-4">
        <table className="text-xs border-separate border-spacing-0.5">
          <thead>
            <tr>
              <th className="text-left pr-3 pb-1 text-[10px] uppercase text-slate-400 sticky left-0 bg-white">Resource</th>
              {weekHeaders.map((w) => (
                <th key={w} className="pb-1 text-[9px] font-medium text-slate-400 w-14">{w.slice(5)}</th>
              ))}
              <th className="pb-1 text-[10px] uppercase text-slate-400 pl-2">Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.resource.id}>
                <td className="pr-3 whitespace-nowrap sticky left-0 bg-white">
                  <span className="font-medium text-slate-700">{r.resource.name}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{r.resource.employeeCode}</span>
                </td>
                {r.cells.map((c) => (
                  <td key={c.week} className="p-0">
                    <div
                      className={cn("h-7 rounded flex items-center justify-center text-[10px] font-semibold tabular-nums", heatColor(c.utilizationPct, c.overallocated))}
                      title={`${r.resource.name} · week of ${c.week}: ${c.allocated}h of ${c.capacity}h (${c.utilizationPct}%)`}
                    >
                      {c.allocated > 0 ? c.allocated : ""}
                    </div>
                  </td>
                ))}
                <td className="pl-2 text-right font-semibold tabular-nums">
                  <span className={r.avgUtilizationPct > 100 ? "text-red-600" : r.avgUtilizationPct > 85 ? "text-amber-600" : "text-slate-700"}>{r.avgUtilizationPct}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

const heatColor = (pct: number, over: boolean) => {
  if (over) return "bg-red-500/85 text-white";
  if (pct >= 90) return "bg-orange-400/80 text-white";
  if (pct >= 70) return "bg-amber-300/80 text-slate-900";
  if (pct >= 40) return "bg-emerald-300/70 text-slate-900";
  if (pct > 0) return "bg-sky-200/70 text-slate-900";
  return "bg-slate-100 text-slate-400";
};

// ---------- Main view ----------
export default function BoardViews() {
  const [view, setView] = useState<ViewKey>("kanban");
  const [projectId, setProjectId] = useStoredProjectId();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set());
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", priority: "MEDIUM", status: "NOT_STARTED", endDate: "", description: "" });

  const board = useApi<AgileBoard>(projectId ? `/api/agile?projectId=${projectId}` : "/api/agile");
  const meetings = useApi<{ meetings: MeetingItem[] }>(`/api/meetings?from=${new Date().toISOString().slice(0, 10)}&to=${new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)}`);
  useRealtimeRefetch(board.refetch, ["agile:changed", "task:changed"]);

  const allTasks = useMemo(() => board.data?.tasks || [], [board.data]);

  // ---- Derived: counts, filter options ----
  const { statusCounts, priorityCounts, assignees, unassignedCount } = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const byAssignee = new Map<string, { id: string; name: string; count: number }>();
    let unassigned = 0;
    for (const t of allTasks) {
      statusCounts[t.status || "NOT_STARTED"] = (statusCounts[t.status || "NOT_STARTED"] || 0) + 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
      if (t.assignee) {
        const g = byAssignee.get(t.assignee.id) || { id: t.assignee.id, name: t.assignee.name, count: 0 };
        g.count += 1;
        byAssignee.set(t.assignee.id, g);
      } else unassigned += 1;
    }
    return {
      statusCounts, priorityCounts,
      assignees: [...byAssignee.values()].sort((a, b) => b.count - a.count),
      unassignedCount: unassigned,
    };
  }, [allTasks]);

  // ---- Derived: filtered + sorted ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTasks.filter((t) =>
      (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) &&
      (statusFilter.size === 0 || statusFilter.has(t.status || "NOT_STARTED")) &&
      (priorityFilter.size === 0 || priorityFilter.has(t.priority)) &&
      (assigneeFilter.size === 0 || assigneeFilter.has(t.assignee?.id ?? "none"))
    );
  }, [allTasks, search, statusFilter, priorityFilter, assigneeFilter]);

  const sorted = useMemo(() => [...filtered].sort(COMPARATORS[sort] || COMPARATORS.priority), [filtered, sort]);

  // ---- Derived: KPIs ----
  const kpi = useMemo(() => {
    const total = allTasks.length;
    const completed = allTasks.filter((t) => t.status === "COMPLETED").length;
    const inProgress = allTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const blocked = allTasks.filter((t) => t.status === "BLOCKED").length;
    const points = allTasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
    return {
      total, completed, inProgress, blocked, points,
      donePct: total ? Math.round((completed / total) * 100) : 0,
      wipPct: total ? Math.round((inProgress / total) * 100) : 0,
    };
  }, [allTasks]);

  const filterActive = statusFilter.size + priorityFilter.size + assigneeFilter.size > 0 || search.trim().length > 0;

  const clearFilters = () => {
    setStatusFilter(new Set());
    setPriorityFilter(new Set());
    setAssigneeFilter(new Set());
    setSearch("");
  };

  const togglePriorityGroup = (group: "HIGH" | "MEDIUM" | "LOW") => {
    const members = group === "HIGH" ? ["CRITICAL", "HIGH"] : group === "MEDIUM" ? ["MEDIUM"] : ["LOW"];
    setPriorityFilter((prev) => {
      const next = new Set(prev);
      const allIn = members.every((m) => next.has(m));
      for (const m of members) {
        if (allIn) next.delete(m);
        else next.add(m);
      }
      return next;
    });
  };

  const openTask = (t: KanbanTask) => setOpenTaskId(t.id);

  const completeTask = async (t: KanbanTask) => {
    const previous = t.status;
    t.status = "COMPLETED";
    try {
      await api.patch("/api/agile", { taskId: t.id, status: "COMPLETED" });
      toast.success(`${t.code} done`);
      board.refetch();
    } catch (err) {
      t.status = previous;
      toast.error(err instanceof Error ? err.message : "Could not complete task");
    }
  };

  const createTask = async () => {
    const pid = projectId || board.data?.projects[0]?.id;
    const name = addForm.name.trim();
    if (!name) { toast.error("Task name is required"); return; }
    if (!pid) { toast.error("No project available — create a project first"); return; }
    setAddBusy(true);
    try {
      await api.post(`/api/projects/${pid}/tasks`, {
        name,
        priority: addForm.priority,
        status: addForm.status,
        endDate: addForm.endDate ? addForm.endDate : null,
        description: addForm.description.trim() || null,
      });
      toast.success(`Task “${name}” created`);
      setAddOpen(false);
      setAddForm({ name: "", priority: "MEDIUM", status: "NOT_STARTED", endDate: "", description: "" });
      board.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Task creation failed");
    } finally {
      setAddBusy(false);
    }
  };

  // Active filter chips (search + each selected value)
  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    if (search.trim()) out.push({ key: "q", label: `“${search.trim()}”`, clear: () => setSearch("") });
    for (const s of statusFilter) out.push({ key: `s-${s}`, label: presentationOf(s).label, clear: () => setStatusFilter((p) => toggleSet(p, s, false)) });
    for (const p of priorityFilter) out.push({ key: `p-${p}`, label: p, clear: () => setPriorityFilter((p2) => toggleSet(p2, p, false)) });
    for (const a of assigneeFilter) {
      const name = a === "none" ? "Unassigned" : assignees.find((x) => x.id === a)?.name || "Assignee";
      out.push({ key: `a-${a}`, label: name, clear: () => setAssigneeFilter((p) => toggleSet(p, a, false)) });
    }
    return out;
  }, [search, statusFilter, priorityFilter, assigneeFilter, assignees]);

  const selectedTask = openTaskId ? allTasks.find((t) => t.id === openTaskId) : undefined;

  const filteredMeetings = useMemo(() => meetings.data?.meetings || [], [meetings.data]);

  if (board.error) return <ErrorBlock message={board.error} onRetry={board.refetch} />;

  const emptyBlock = (
    <EmptyState
      title={filterActive ? "No tasks match your filters" : "No task cards"}
      description={filterActive ? "Adjust or clear the filters above to see tasks." : "Create tasks with “Add Task”, or pick another project."}
      action={filterActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
    />
  );

  const renderContent = () => {
    if (board.loading && !board.data) return <LoadingBlock label="Loading board…" />;
    if (filtered.length === 0) return emptyBlock;
    if (view === "list") return <TaskListView tasks={sorted} onOpen={openTask} onMoved={board.refetch} showProject={!projectId} />;
    if (view === "calendar") return <WorkCalendar tasks={filtered} meetings={filteredMeetings} />;
    if (view === "workload") return <WorkloadHeatmap />;
    return (
      <KanbanBoard
        tasks={sorted}
        onMoved={board.refetch}
        showProject={!projectId}
        onCardClick={openTask}
        order={KANBAN_ORDER}
      />
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Board — Manage and track your team's work"
        subtitle="Drag-and-drop kanban or dense list view, filters and sort, a slide-over task panel, and live team widgets — all over one Task entity."
        breadcrumb={["Home", "Execute", "Boards"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total tasks"
          value={kpi.total}
          sub={`${kpi.points} story points · ${kpi.blocked} blocked`}
          icon={<IconSq tone="bg-blue-50 text-blue-600"><Layers className="h-4 w-4" /></IconSq>}
          onClick={clearFilters}
          hint="Clear all filters"
        />
        <StatCard
          label="In progress"
          value={kpi.inProgress}
          tone="info"
          sub={`${kpi.wipPct}% of all tasks`}
          icon={<IconSq tone="bg-amber-50 text-amber-600"><Clock className="h-4 w-4" /></IconSq>}
          onClick={() => setStatusFilter(new Set(["IN_PROGRESS"]))}
          hint="Filter to In Progress"
        />
        <StatCard
          label="Completed"
          value={kpi.completed}
          tone="good"
          sub={`${kpi.donePct}% completion`}
          icon={<IconSq tone="bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></IconSq>}
          onClick={() => setStatusFilter(new Set(["COMPLETED"]))}
          hint="Filter to Completed"
        />
        <CompletionCard tasks={allTasks} />
      </div>

      {/* Toolbar: filter · sort · search · view toggle · add task */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPopover
          statusCounts={statusCounts}
          priorityCounts={priorityCounts}
          assignees={assignees}
          unassignedCount={unassignedCount}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          onClear={clearFilters}
        />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-auto min-w-44 text-xs gap-1.5 bg-white" title="Sort tasks">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search tasks…" className="w-52" />
          <ViewToggle value={view} onChange={setView} />
          <Button size="sm" className="h-9 text-xs gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Task
          </Button>
        </div>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-2.5 pr-1.5 py-1 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              title="Remove filter"
            >
              {c.label}
              <X className="h-3 w-3 text-slate-400 group-hover:text-slate-600" />
            </button>
          ))}
          <button type="button" onClick={clearFilters} className="px-1.5 text-[11px] font-medium text-blue-600 hover:underline">
            Clear all
          </button>
        </div>
      )}

      {/* Main area: view + right rail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 min-w-0">
          {renderContent()}
        </div>

        <div className="space-y-4">
          <TodaysTasks tasks={allTasks} onOpen={openTask} onComplete={completeTask} />
          <UpcomingTasks tasks={allTasks} onOpen={openTask} />
          <PriorityOverview tasks={allTasks} active={priorityFilter} onToggleGroup={togglePriorityGroup} />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TaskTimeline tasks={allTasks} onOpen={openTask} />
        <TeamWorkload tasks={allTasks} />
      </div>

      {/* Slide-over task panel */}
      <TaskSlideOver
        projectId={selectedTask?.projectId ?? null}
        taskId={openTaskId}
        projectLabel={selectedTask?.project ? `${selectedTask.project.code} — ${selectedTask.project.name}` : null}
        onClose={() => setOpenTaskId(null)}
        onChanged={board.refetch}
      />

      {/* Add Task dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add Task</DialogTitle>
            <DialogDescription>
              Creates a task{projectId ? "" : " in the first available project"} and reschedules the plan automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="add-name" className="text-xs font-medium text-slate-600 block mb-1">Task name</label>
              <Input
                id="add-name"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Draft stakeholder update"
                className="h-9"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void createTask(); }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="add-priority" className="text-xs font-medium text-slate-600 block mb-1">Priority</label>
                <Select value={addForm.priority} onValueChange={(v) => setAddForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger id="add-priority" className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="add-status" className="text-xs font-medium text-slate-600 block mb-1">Status</label>
                <Select value={addForm.status} onValueChange={(v) => setAddForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger id="add-status" className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS.map((s) => <SelectItem key={s} value={s} className="text-xs">{presentationOf(s).label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="add-due" className="text-xs font-medium text-slate-600 block mb-1">Due date</label>
                <Input id="add-due" type="date" value={addForm.endDate} onChange={(e) => setAddForm((f) => ({ ...f, endDate: e.target.value }))} className="h-9 text-xs" />
              </div>
            </div>
            <div>
              <label htmlFor="add-desc" className="text-xs font-medium text-slate-600 block mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <Textarea
                id="add-desc"
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What needs to be done?"
                rows={3}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setAddOpen(false)} disabled={addBusy}>Cancel</Button>
            <Button size="sm" className="h-9 text-xs" onClick={() => void createTask()} disabled={addBusy}>
              {addBusy ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
