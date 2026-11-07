"use client";
// PM CONTROL TOWER — Planning Lab (Tools hub)
// Tabbed workbench hosting the MS-Project-grade additions:
//   Schedule Doctor | Constraints | Leveling | Work Calendar | Project Statistics

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, StatCard, SectionCard, LoadingBlock, ErrorBlock, EmptyState, StatusChip, Metric, ConfirmButton } from "@/components/pmct/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import { CONSTRAINT_TYPES } from "./shared/TaskForm";
import { num, fmtDate } from "@/lib/constants";

const toInput = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
import { Stethoscope, Pin, SlidersHorizontal, CalendarDays, LineChart, Activity, Save, Eraser, HeartPulse, AlertTriangle, Info, XCircle, Pencil } from "lucide-react";

type ConstraintFilter = "all" | "set" | "issues";

const TONE_MS: Record<string, string> = {
  UNRESOLVABLE_CONSTRAINT: "bg-red-50 text-red-700 border-red-200",
  DEADLINE_BREACH: "bg-red-50 text-red-700 border-red-200",
  PAST_DUE: "bg-red-50 text-red-700 border-red-200",
  NO_CONNECTION: "bg-amber-50 text-amber-700 border-amber-200",
  ZERO_DURATION: "bg-amber-50 text-amber-700 border-amber-200",
  FLOAT_POOR: "bg-amber-50 text-amber-700 border-amber-200",
  UNASSIGNED_EFFORT: "bg-amber-50 text-amber-700 border-amber-200",
  NONWORKING_START: "bg-sky-50 text-sky-700 border-sky-200",
  FLOAT_SUSPECT: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ToolsView() {
  const [projectId, setProjectId] = useStoredProjectId();
  // Controlled tabs so a Schedule Doctor finding can jump to the studio
  const [tab, setTab] = useState("doctor");
  const [constrQ, setConstrQ] = useState("");
  const [constrFilter, setConstrFilter] = useState<ConstraintFilter>("set");

  const editInStudio = (code: string) => {
    setConstrQ(code);
    setConstrFilter("all");
    setTab("constraints");
    toast.message(`Constraint studio — editing ${code}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        io="tools"
        title="Planning Lab"
        subtitle="Schedule Doctor, constraints, resource leveling, working-time calendar and schedule statistics — Microsoft-Project-grade levers, tuned for this control tower."
        breadcrumb={["Home", "Plan", "Planning Lab"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />
      {projectId ? (
        <Tabs key={projectId} value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="doctor" className="gap-1.5"><Stethoscope className="h-3.5 w-3.5" />Schedule Doctor</TabsTrigger>
            <TabsTrigger value="constraints" className="gap-1.5"><Pin className="h-3.5 w-3.5" />Constraints &amp; Deadlines</TabsTrigger>
            <TabsTrigger value="leveling" className="gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" />Leveling</TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Work Calendar</TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5"><LineChart className="h-3.5 w-3.5" />Project Statistics</TabsTrigger>
          </TabsList>
          <TabsContent value="doctor" className="space-y-4"><DoctorTab projectId={projectId} onEdit={editInStudio} /></TabsContent>
          <TabsContent value="constraints" className="space-y-4"><ConstraintsTab projectId={projectId} q={constrQ} setQ={setConstrQ} filter={constrFilter} setFilter={setConstrFilter} /></TabsContent>
          <TabsContent value="leveling" className="space-y-4"><LevelingTab projectId={projectId} /></TabsContent>
          <TabsContent value="calendar" className="space-y-4"><CalendarTab projectId={projectId} /></TabsContent>
          <TabsContent value="stats" className="space-y-4"><StatsTab projectId={projectId} /></TabsContent>
        </Tabs>
      ) : (
        <EmptyState title="No project selected" description="Pick a project above to open the Planning Lab." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Schedule Doctor

interface DiagBundle {
  doctor: { findings: { code: string; severity: string; items: { taskId: string; code: string; name: string; detail?: string }[] }[]; healthIndex: number; checkedAt: string };
  stats: { leafTasks: number; criticalCount: number; flaggedCount: number; constrainedCount: number; deadlinedCount: number; calendarName: string; calendarConfigured: boolean; projectStart: string | null; projectFinish: string | null };
}

function DoctorTab({ projectId, onEdit }: { projectId: string; onEdit: (code: string) => void }) {
  const { data, loading, error, refetch } = useApi<DiagBundle>(`/api/projects/${projectId}/tools/diagnostics`);
  useRealtimeRefetch(refetch, ["schedule:changed", "task:changed"]);
  if (loading) return <LoadingBlock label="Auditing the plan…" />;
  if (error) return <ErrorBlock message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No diagnostics" />;
  const { doctor, stats } = data;
  const tone = doctor.healthIndex >= 80 ? "text-emerald-600" : doctor.healthIndex >= 55 ? "text-amber-600" : "text-red-600";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Schedule Health Index" value={`${doctor.healthIndex}/100`} sub={doctor.healthIndex >= 80 ? "Healthy plan" : doctor.healthIndex >= 55 ? "Needs attention" : "Intervention advised"}
          icon={<HeartPulse className={`h-4 w-4 ${tone}`} />} />
        <StatCard label="Findings" value={stats.flaggedCount} sub={`${doctor.findings.length} active checks`} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
        <StatCard label="Critical tasks" value={stats.criticalCount} sub={`${stats.leafTasks} schedulable tasks`} icon={<Activity className="h-4 w-4 text-red-500" />} />
        <StatCard label="Calendar" value={stats.calendarName} sub={stats.calendarConfigured ? "active — drives CPM math" : "none saved — continuous 7-day math"} icon={<CalendarDays className="h-4 w-4 text-slate-400" />} />
      </div>
      {doctor.findings.length === 0 ? (
        <SectionCard title="Diagnosis" description="Run completed">
          <EmptyState title="All checks pass" description="No findings across connections, constraints, deadlines, float, staffing or calendar alignment." />
        </SectionCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {doctor.findings.map((f) => (
            <SectionCard key={f.code} title={f.code.toLowerCase().replaceAll("_", " ")}
              description={`${f.items.length} ${f.items.length === 1 ? "task" : "tasks"}`}
              actions={<span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_MS[f.code] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{f.severity}</span>}>
              <div className="max-h-56 space-y-1.5 overflow-auto pr-1">
                {f.items.slice(0, 40).map((it) => (
                  <div key={it.taskId} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500">{it.code}</span>
                      <span className="truncate font-medium text-slate-800">{it.name}</span>
                      <button type="button" onClick={() => onEdit(it.code)} title={`Edit ${it.code} in the constraint studio`}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700">
                        <Pencil className="h-2.5 w-2.5" />Edit
                      </button>
                    </div>
                    {it.detail && <div className="mt-0.5 text-slate-500">{it.detail}</div>}
                  </div>
                ))}
                {f.items.length > 40 && <div className="text-[11px] text-slate-400">+{f.items.length - 40} more…</div>}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">Checked {new Date(doctor.checkedAt).toLocaleTimeString("en-US")} — plan window {fmtDate(stats.projectStart)} → {fmtDate(stats.projectFinish)}. Audit only — use Edit on a finding to fix it in the constraint studio.</p>
    </div>
  );
}

// ------------------------------------------------------- Constraints & Deadlines

interface TaskRow {
  id: string; code: string; name: string; status: string; progress: number;
  constraintType: string; constraintDate?: string | null; deadline?: string | null;
  earliestStart?: string | null; earliestFinish?: string | null; totalFloat?: number; isCritical?: boolean;
}

function ConstraintsTab({ projectId, q, setQ, filter, setFilter }: {
  projectId: string;
  q: string; setQ: (v: string) => void;
  filter: ConstraintFilter; setFilter: (v: ConstraintFilter) => void;
}) {
  const { data, loading, error, refetch } = useApi<{ items: TaskRow[] }>(`/api/projects/${projectId}/tasks`);
  if (loading) return <LoadingBlock label="Loading task register…" />;
  if (error) return <ErrorBlock message={error} onRetry={refetch} />;
  const items = data?.items ?? [];
  const filtered = items.filter((t) => {
    const constrained = (t.constraintType || "ASAP") !== "ASAP" || !!t.constraintDate;
    if (filter === "set" && !constrained && !t.deadline) return false;
    if (filter === "issues" && (!constrained || (t.constraintType !== "MSO" && t.constraintType !== "FNLT"))) return false;
    if (q && !`${t.code} ${t.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="space-y-4">
      <SectionCard
        title="Constraint studio"
        description="Pin task starts and finishes the MS-Project way. Inflexible constraints that fight the network are flagged red by the Schedule Doctor."
        actions={
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-8 w-44 rounded-md border border-slate-300 px-2 text-xs" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-8 rounded-md border border-slate-300 px-2 text-xs">
              <option value="set">With constraints/deadlines</option>
              <option value="issues">Rigid only</option>
              <option value="all">All tasks</option>
            </select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState title="No tasks here yet" description="Switch the filter to “All tasks” or import — constraints saved here feed straight into CPM." />
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((t) => <ConstraintRow key={t.id} projectId={projectId} task={t} onSaved={refetch} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ConstraintRow({ projectId, task, onSaved }: { projectId: string; task: TaskRow; onSaved: () => void }) {
  const [ctype, setCtype] = useState(task.constraintType || "ASAP");
  const [cdate, setCdate] = useState(task.constraintDate ? toInput(task.constraintDate) : "");
  const [dl, setDl] = useState(task.deadline ? toInput(task.deadline) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rigid = ctype === "MSO";
  const save = async (clear: boolean) => {
    setBusy(true); setMsg(null);
    try {
      await api.patch(`/api/projects/${projectId}/tasks/${task.id}`, {
        constraintType: clear ? "ASAP" : ctype,
        constraintDate: clear ? null : (ctype === "ASAP" ? null : cdate || null),
        deadline: clear ? null : (dl || null),
      });
      setMsg(clear ? "Constraint cleared" : "Saved — plan rescheduled");
      toast.success(clear ? `${task.code} — constraint cleared, plan rescheduled` : `${task.code} — ${ctype} saved, plan rescheduled`);
      onSaved();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Save failed";
      setMsg(m);
      toast.error(`${task.code} — ${m}`);
    }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
      <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{task.code}</span>
      <span className="min-w-40 flex-1 truncate font-medium text-slate-800" title={task.name}>{task.name}</span>
      {task.isCritical && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">CRITICAL</span>}
      <StatusChip status={task.status} />
      <span className="w-14 text-right text-xs tabular-nums text-slate-400">{num(task.totalFloat ?? 0)}d float</span>
      <select value={ctype} onChange={(e) => setCtype(e.target.value)} className={`h-8 rounded-md border px-2 text-xs ${rigid ? "border-red-300 bg-red-50" : "border-slate-300"}`}>
        {CONSTRAINT_TYPES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
      </select>
      <input type="date" value={cdate} disabled={ctype === "ASAP"} onChange={(e) => setCdate(e.target.value)} className="h-8 rounded-md border border-slate-300 px-2 text-xs disabled:opacity-40" />
      <span className="text-[10px] uppercase tracking-wide text-slate-400">deadline</span>
      <input type="date" value={dl} onChange={(e) => setDl(e.target.value)} className="h-8 rounded-md border border-slate-300 px-2 text-xs" />
      <button disabled={busy} onClick={() => save(false)} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-xs font-medium text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />Save</button>
      <ConfirmButton onConfirm={() => save(true)} title="Clear constraint" description="Reset to ASAP and clear the deadline.">
        <Eraser className="h-3.5 w-3.5" />Clear
      </ConfirmButton>
      {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
    </div>
  );
}

// ------------------------------------------------------------------- Leveling

interface LevBundle {
  summary: { resourcesLoaded: number; overallocatedDays: number; overloadedResources: number; prescriptions: number; workloadDays: number };
  resources: { id: string; name: string; employeeCode: string | null }[];
  series: { resourceId: string; resourceName: string; days: { day: string; hours: number; capacity: number }[] }[];
  over: { day: string; resourceId: string; resourceName: string; hours: number; capacity: number; taskNames: string[] }[];
  prescriptions: { taskId: string; code: string; taskName?: string; shiftDays: number; floatBefore: number; reason: string; currentStart: string | null }[];
}

function LevelingTab({ projectId }: { projectId: string }) {
  const { data, loading, error, refetch } = useApi<LevBundle>(`/api/projects/${projectId}/tools/leveling`);
  const [busy, setBusy] = useState<string | null>(null);
  const apply = async (actions: { taskId: string; shiftDays: number }[]) => {
    setBusy(actions.map((a) => a.taskId).join(","));
    try {
      const res = await api.post<{ applied: { code: string; newStart: string }[] }>(`/api/projects/${projectId}/tools/leveling`, { actions });
      toast.success(`Leveled ${res.applied.length} task${res.applied.length === 1 ? "" : "s"} — plan rescheduled`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Leveling failed");
    } finally { setBusy(null); }
  };
  if (loading) return <LoadingBlock label="Computing day-level resource load…" />;
  if (error) return <ErrorBlock message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="No leveling data" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Overloaded days" value={data.summary.overallocatedDays} sub={`${data.summary.overloadedResources} resources affected`} icon={<AlertTriangle className="h-4 w-4 text-red-500" />} />
        <StatCard label="Prescriptions" value={data.summary.prescriptions} sub="float-safe slide suggestions" icon={<SlidersHorizontal className="h-4 w-4 text-blue-500" />} />
        <StatCard label="Loaded resources" value={data.summary.resourcesLoaded} sub={`${data.summary.workloadDays} tracked days`} icon={<Activity className="h-4 w-4 text-emerald-500" />} />
        <StatCard label="Engine" value="Level 1" sub="day resolution — critical path never moves" icon={<Info className="h-4 w-4 text-slate-400" />} />
      </div>

      {data.over.length > 0 && (
        <SectionCard title="Over-allocated days" description="A resource's assigned hours for the day exceed their weekly capacity spread. Red cells are the leveling targets.">
          <div className="max-h-64 space-y-1.5 overflow-auto pr-1">
            {data.over.slice(0, 30).map((h) => (
              <div key={`${h.resourceId}-${h.day}`} className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50/60 px-2.5 py-1.5 text-xs">
                <span className="font-medium text-slate-800">{h.resourceName}</span>
                <span className="font-mono text-slate-500">{h.day}</span>
                <span className="rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white">{Math.round(h.hours)}h vs {h.capacity}h</span>
                <span className="truncate text-slate-600">{h.taskNames.join(", ")}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Capacity heat strips"
        description="Assigned hours vs capacity per working day (calendar-aware). Hover a bar for detail."
        actions={data.prescriptions.length > 0 ? (
          <button disabled={busy !== null} onClick={() => apply(data.prescriptions.map((p) => ({ taskId: p.taskId, shiftDays: p.shiftDays })))}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-50">
            <SlidersHorizontal className="h-3.5 w-3.5" />Apply all prescriptions
          </button>
        ) : undefined}
      >
        {data.series.length === 0 ? (
          <EmptyState title="No active task assignments" description="Assign people to tasks in Resources to see day-level load." />
        ) : (
          <div className="space-y-3">
            {data.series.slice(0, 12).map((s) => {
              const days = s.days;
              const maxHours = Math.max(1, ...days.map((d) => Math.max(d.hours, d.capacity)));
              return (
                <div key={s.resourceId} className="rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="font-medium text-slate-800">{s.resourceName}</span>
                    <span className="text-slate-400">{days[0] && fmtDate(days[0].day)} → {days.length} working days</span>
                  </div>
                  <div className="flex items-end gap-[3px]">
                    {days.map((d) => {
                      const overDay = d.hours > d.capacity + 0.001;
                      const pct = Math.round((d.hours / maxHours) * 78) + 4;
                      return (
                        <div key={d.day} title={`${s.resourceName} · ${d.day}: ${d.hours}h (capacity ${d.capacity}h)`}
                          className={`w-full min-w-[14px] rounded-sm ${overDay ? "bg-red-500" : d.hours > d.capacity * 0.85 ? "bg-amber-400" : "bg-sky-400/70"}`}
                          style={{ height: `${pct}px` }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Leveling prescriptions" description="Float-safe moves: push the later task of the collision right within its float. Critical tasks are never moved. Apply anchors the new start as an SNET constraint.">
        {data.prescriptions.length === 0 ? (
          <EmptyState title="Nothing to level" description="No float-safe conflicts detected on this plan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-1.5 pr-3 font-medium">Task</th><th className="py-1.5 pr-3 font-medium">Current start</th><th className="py-1.5 pr-3 font-medium">Slide</th><th className="py-1.5 pr-3 font-medium">Float budget</th><th className="py-1.5 pr-3 font-medium">Reason</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.prescriptions.map((p) => (
                  <tr key={p.taskId}>
                    <td className="py-2 pr-3"><span className="font-mono text-xs text-slate-500">{p.code}</span> <span className="font-medium text-slate-800">{p.taskName}</span></td>
                    <td className="py-2 pr-3 tabular-nums text-xs">{fmtDate(p.currentStart)}</td>
                    <td className="py-2 pr-3"><span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">+{p.shiftDays}d working</span></td>
                    <td className="py-2 pr-3 text-xs tabular-nums text-slate-500">{p.floatBefore}d available</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{p.reason}</td>
                    <td className="py-2 text-right">
                      <button disabled={busy !== null} onClick={() => apply([{ taskId: p.taskId, shiftDays: p.shiftDays }])}
                        className="h-7 rounded-md bg-slate-900 px-2.5 text-xs font-medium text-white disabled:opacity-50">{busy === p.taskId ? "Applying…" : "Apply"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ------------------------------------------------------------------ Work calendar

interface CalBundle {
  configured: boolean;
  calendar: { calendarName: string; workingDays: number[]; hoursPerDay: number; holidays: string[] };
  preview: { date: string; dow: string; working: boolean }[];
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarTab({ projectId }: { projectId: string }) {
  const { data, loading, error, refetch } = useApi<CalBundle>(`/api/projects/${projectId}/calendar`);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [days, setDays] = useState<number[] | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [holidays, setHolidays] = useState<string[] | null>(null);

  const draft = useMemo(() => {
    if (!data) return null;
    return {
      calendarName: name ?? data.calendar.calendarName,
      workingDays: days ?? data.calendar.workingDays,
      hoursPerDay: hours ?? data.calendar.hoursPerDay,
      holidays: holidays ?? data.calendar.holidays,
    };
  }, [data, name, days, hours, holidays]);

  if (loading) return <LoadingBlock label="Loading calendar…" />;
  if (error) return <ErrorBlock message={error} onRetry={refetch} />;
  if (!data || !draft) return <EmptyState title="No calendar" />;

  const dirty = name !== null || days !== null || hours !== null || holidays !== null;
  const setDay = (dow: number, on: boolean) => {
    const cur = new Set(draft.workingDays);
    if (on) cur.add(dow); else cur.delete(dow);
    setDays([...cur].sort());
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await api.put<{ reschedule: { criticalCount: number; projectFinish: string | null; violationCount: number } }>(`/api/projects/${projectId}/calendar`, draft);
      setName(null); setDays(null); setHours(null); setHolidays(null);
      const r = res.reschedule;
      setMsg(`Calendar saved & plan rescheduled — ${r.criticalCount} critical, finish ${r.projectFinish ? fmtDate(r.projectFinish) : "n/a"}, ${r.violationCount} constraint conflicts.`);
      await refetch();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const holidaysText = draft.holidays.join("\n");
  return (
    <div className="space-y-4">
      <SectionCard
        title="Working-time calendar"
        description="Controls what a 'day' means: CPM durations, constraint dates and leveling math all count these working days only. Leave everything on to keep the historic continuous (7-day) plan."
        actions={
          <div className="flex items-center gap-2">
            <span className={`text-[11px] ${dirty ? "font-medium text-blue-600" : "text-slate-400"}`}>{data.configured ? "Saved" : "Default (not configured)"}{dirty ? " · unsaved edits" : ""}</span>
            <button disabled={saving || !dirty || draft.workingDays.length === 0} onClick={save}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50">
              <Save className="h-3.5 w-3.5" />{saving ? "Rescheduling…" : "Save & reschedule"}
            </button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Calendar name</label>
              <input value={draft.calendarName} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Working days</label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const on = draft.workingDays.includes(dow);
                  return (
                    <button key={dow} onClick={() => setDay(dow, !on)}
                      className={`h-8 w-14 rounded-md border text-xs font-medium ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-500"}`}>
                      {DOW_LABELS[dow]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Hours per working day</label>
              <input type="number" min={0.5} max={24} step={0.5} value={draft.hoursPerDay} onChange={(e) => setHours(Number(e.target.value))}
                className="h-9 w-32 rounded-md border border-slate-300 px-2.5 text-sm tabular-nums" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Holiday exceptions (one ISO date per line)</label>
              <textarea value={holidaysText} onChange={(e) => setHolidays(e.target.value.split("\n").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)))}
                rows={4} placeholder={"2026-12-25\n2027-01-01"} className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Preview — next 90 days ({draft.workingDays.length}-day week)</label>
            <div className="grid grid-cols-7 gap-1">
              {data.preview.map((p) => (
                <div key={p.date} title={`${p.date} · ${p.dow} · ${p.working ? "working" : "off"}`}
                  className={`flex h-11 flex-col items-center justify-center rounded text-[10px] leading-none ${p.working ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400 line-through"}`}>
                  <span className="font-semibold">{p.date.slice(8)}</span>
                  <span className="mt-0.5">{p.dow[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><XCircle className="h-4 w-4 shrink-0" />{msg}</div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Statistics

interface SchedBundle { summary: Record<string, number> & { criticalPath?: string[] }; tasks: { earliestStart: string | null }[]; dependencies: unknown[] }
interface ProjBundle { project: { code: string; name: string; status: string; progress: number; plannedHours: number; actualHours: number; plannedCost: number; actualCost: number; currentBudget: number | null; baselineBudget: number | null; forecastCost: number | null; startDate: string | null; endDate: string | null; statusDate: string | null } }

function StatsTab({ projectId }: { projectId: string }) {
  const sched = useApi<SchedBundle>(`/api/projects/${projectId}/schedule`);
  const proj = useApi<ProjBundle>(`/api/projects/${projectId}`);
  // Inline edit for the project-owned inputs (everything else is engine-derived)
  const [form, setForm] = useState<{ statusDate: string; currentBudget: string; baselineBudget: string } | null>(null);
  const [saving, setSaving] = useState(false);
  if (sched.loading || proj.loading) return <LoadingBlock label="Collecting schedule statistics…" />;
  if (sched.error) return <ErrorBlock message={sched.error} onRetry={sched.refetch} />;
  if (proj.error) return <ErrorBlock message={proj.error} onRetry={proj.refetch} />;
  const s = sched.data, p = proj.data;
  if (!s || !p) return <EmptyState title="No statistics" />;
  const project = p.project;
  const crit = s.summary?.criticalCount ?? 0;
  const dur = project.startDate && project.endDate
    ? Math.max(1, Math.round((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / 86_400_000) + 1)
    : null;

  const startEdit = () => setForm({
    statusDate: project.statusDate ? toInput(project.statusDate) : "",
    currentBudget: String(project.currentBudget ?? 0),
    baselineBudget: String(project.baselineBudget ?? 0),
  });
  const saveEdit = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.patch(`/api/projects/${projectId}`, {
        statusDate: form.statusDate ? new Date(form.statusDate).toISOString() : null,
        currentBudget: form.currentBudget === "" ? undefined : Number(form.currentBudget),
        baselineBudget: form.baselineBudget === "" ? undefined : Number(form.baselineBudget),
      });
      toast.success("Project statistics inputs saved");
      setForm(null);
      await Promise.all([proj.refetch(), sched.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Schedule statistics"
        description="MS-Project-style project statistics card, live from the CPM engine. Status date and budgets are project inputs you can edit here."
        actions={form ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setForm(null)} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button disabled={saving} onClick={saveEdit} className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50">
              <Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <button onClick={startEdit} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
            <Pencil className="h-3.5 w-3.5" />Edit inputs
          </button>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Scheduled start" value={fmtDate(project.startDate)} />
          <Metric label="Scheduled finish" value={fmtDate(project.endDate)} />
          <Metric label="Span" value={dur ? `${dur}d` : "—"} />
          {form ? (
            <div className="grid gap-1.5">
              <label htmlFor="st-status-date" className="text-[11px] uppercase tracking-wide text-slate-400">Status date</label>
              <input id="st-status-date" type="date" value={form.statusDate} onChange={(e) => setForm({ ...form, statusDate: e.target.value })}
                className="h-8 rounded-md border border-slate-300 px-2 text-xs" />
            </div>
          ) : (
            <Metric label="Status date" value={fmtDate(project.statusDate)} />
          )}
          <Metric label="Critical tasks" value={crit} />
          <Metric label="Planned effort" value={`${num(project.plannedHours)}h`} />
          <Metric label="Actual effort" value={`${num(project.actualHours)}h`} />
          <Metric label="Progress" value={`${num(project.progress)}%`} />
          <Metric label="Planned cost" value={num(project.plannedCost)} />
          <Metric label="Actual cost" value={num(project.actualCost)} />
          {form ? (
            <>
              <div className="grid gap-1.5">
                <label htmlFor="st-budget" className="text-[11px] uppercase tracking-wide text-slate-400">Budget</label>
                <input id="st-budget" type="number" min={0} value={form.currentBudget} onChange={(e) => setForm({ ...form, currentBudget: e.target.value })}
                  className="h-8 rounded-md border border-slate-300 px-2 text-xs tabular-nums" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="st-baseline-budget" className="text-[11px] uppercase tracking-wide text-slate-400">Baseline budget</label>
                <input id="st-baseline-budget" type="number" min={0} value={form.baselineBudget} onChange={(e) => setForm({ ...form, baselineBudget: e.target.value })}
                  className="h-8 rounded-md border border-slate-300 px-2 text-xs tabular-nums" />
              </div>
            </>
          ) : (
            <>
              <Metric label="Budget" value={num(project.currentBudget ?? 0)} />
              <Metric label="Baseline budget" value={num(project.baselineBudget ?? 0)} />
            </>
          )}
        </div>
      </SectionCard>
      <p className="text-[11px] text-slate-400">Dates, effort, cost, progress and critical counts are derived from the last reschedule — change a constraint or save a calendar in this lab and watch these numbers move. Edit inputs updates the project's own fields via the same API the edit dialogs use.</p>
    </div>
  );
}
