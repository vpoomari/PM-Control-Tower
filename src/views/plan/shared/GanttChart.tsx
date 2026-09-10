"use client";
// PM CONTROL TOWER — Shared CPM Gantt chart (pure divs, no chart library)
// Renders schedule tasks with CPM geometry: earliest start/finish bars, critical path in red,
// summary rows in dark bold, total-float as a thin outlined extension, today marker, week/month
// time axis, predecessors column and hover tooltips (ES/EF/LS/LF/float).

import { memo, useMemo, useState } from "react";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, EmptyState, StatCard } from "@/components/pmct/kit";
import { DAY_MS, fmtDate, num } from "@/lib/constants";
import { CalendarClock, GitBranch, Route, Flag } from "lucide-react";

// ---- Domain types (mirrors /api/projects/[id]/schedule) ----
interface GanttTask {
  id: string;
  code: string;
  name: string;
  status: string;
  durationDays: number;
  progress: number;
  isCritical: boolean;
  isSummary: boolean;
  totalFloat: number;
  earliestStart: string | null;
  earliestFinish: string | null;
  latestStart: string | null;
  latestFinish: string | null;
  startDate: string | null;
  endDate: string | null;
  wbs?: { id: string; code: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
}
interface GanttDep {
  id: string;
  predecessorId: string;
  successorId: string;
  depType: string;
  lagDays: number;
  predecessor: { id: string; code: string; name: string };
  successor: { id: string; code: string; name: string };
}
export interface ScheduleBundle {
  projectId: string;
  tasks: GanttTask[];
  dependencies: GanttDep[];
  summary: {
    taskCount: number;
    leafTaskCount: number;
    dependencyCount: number;
    criticalCount: number;
    projectStart: string | null;
    projectFinish: string | null;
    totalDuration: number;
    criticalTasks: { id: string; code: string; name: string; startDate: string | null; endDate: string | null; durationDays: number }[];
  };
}

// ---- Geometry constants ----
const PX_PER_DAY = 22;
const ROW_H = 34;
const INFO_W = 420; // sticky info columns total width
const CRITICAL = "#dc2626";
const NORMAL = "#2563eb";
const SUMMARY = "#0f172a";

const toDay = (t: number, origin: number) => Math.floor((t - origin) / DAY_MS);
const ts = (d: string | null | undefined) => (d ? new Date(d).getTime() : NaN);

interface BarGeom { left: number; width: number; floatLeft: number; floatWidth: number; rowTop: number }

// ---- One row: sticky info + bar track (memoized) ----
const GanttRow = memo(function GanttRow({ task, indent, preds, geom, onHover, onLeave }: {
  task: GanttTask;
  indent: number;
  preds: string;
  geom: BarGeom;
  onHover: (t: GanttTask, g: BarGeom) => void;
  onLeave: () => void;
}) {
  const barColor = task.isSummary ? SUMMARY : task.isCritical ? CRITICAL : NORMAL;
  return (
    <div className="flex group" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center bg-white group-hover:bg-blue-50/60 border-b border-r border-slate-100"
        style={{ width: INFO_W }}
      >
        <div className="min-w-0 flex-1 pl-2 pr-1" style={{ paddingLeft: 8 + indent }}>
          <span className="text-[11px] font-mono text-slate-400 mr-1.5">{task.code}</span>
          <span className={`text-xs truncate align-middle ${task.isSummary ? "font-semibold text-slate-900" : "text-slate-700"}`}>
            {task.name}
          </span>
        </div>
        <div className="w-12 shrink-0 text-right text-[11px] text-slate-500 tabular-nums pr-2">{num(task.durationDays, 0)}d</div>
        <div className="w-40 shrink-0 text-[10px] text-slate-500 truncate px-2" title={preds}>{preds || "—"}</div>
      </div>
      <div className="relative shrink-0 border-b border-slate-100 group-hover:bg-blue-50/20" style={{ flex: 1 }}>
        {/* total-float extension */}
        {geom.floatWidth > 0 && !task.isSummary && (
          <div
            className="absolute rounded-sm border border-dashed border-slate-400 bg-slate-50/80"
            style={{ left: geom.floatLeft, width: geom.floatWidth, top: ROW_H / 2 - 3, height: 6 }}
            aria-hidden
          />
        )}
        {/* bar */}
        <div
          className="absolute rounded-md cursor-pointer shadow-sm transition-transform hover:scale-y-110"
          style={{ left: geom.left, width: Math.max(geom.width, 4), top: ROW_H / 2 - 9, height: 18, backgroundColor: barColor }}
          onMouseEnter={() => onHover(task, geom)}
          onMouseLeave={onLeave}
          role="img"
          aria-label={`${task.code} ${task.name}: ${fmtDate(task.earliestStart)} to ${fmtDate(task.earliestFinish)}${task.isCritical ? " (critical)" : ""}`}
        >
          {!task.isSummary && task.progress > 0 && (
            <div className="h-full rounded-l-md bg-white/30" style={{ width: `${Math.min(100, task.progress)}%` }} />
          )}
          {task.isSummary && <div className="h-full rounded-md" style={{ boxShadow: "inset 0 -4px 0 rgba(255,255,255,0.25)" }} />}
        </div>
      </div>
    </div>
  );
});

export default function GanttChart({ projectId }: { projectId: string }) {
  const schedule = useApi<ScheduleBundle>(`/api/projects/${projectId}/schedule`);
  useRealtimeRefetch(schedule.refetch, ["schedule:changed", "task:changed", "dependency:changed", "project:updated"]);
  const [hover, setHover] = useState<{ task: GanttTask; geom: BarGeom } | null>(null);

  const model = useMemo(() => {
    const d = schedule.data;
    if (!d) return null;
    const tasks = d.tasks || [];
    if (!tasks.length) return null;

    const starts = tasks.map((t) => ts(t.earliestStart ?? t.startDate)).filter(Number.isFinite);
    const finishes = tasks.map((t) => ts(t.latestFinish ?? t.earliestFinish ?? t.endDate)).filter(Number.isFinite);
    if (!starts.length || !finishes.length) return null;

    const origin = Math.min(...starts) - 3 * DAY_MS;
    const end = Math.max(...finishes) + 5 * DAY_MS;
    const totalDays = Math.max(Math.ceil((end - origin) / DAY_MS), 14);
    const chartW = totalDays * PX_PER_DAY;

    // Week ticks (Mondays) + month bands
    const weeks: { x: number; label: string; time: number }[] = [];
    const firstMonday = new Date(origin);
    firstMonday.setUTCHours(0, 0, 0, 0);
    firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7));
    for (let t = firstMonday.getTime(); t <= end; t += 7 * DAY_MS) {
      weeks.push({ x: toDay(t, origin) * PX_PER_DAY, label: new Date(t).toISOString().slice(5, 10).replace("-", "/"), time: t });
    }
    const months: { x: number; width: number; label: string }[] = [];
    const cur = new Date(origin);
    cur.setUTCDate(1); cur.setUTCHours(0, 0, 0, 0);
    while (cur.getTime() <= end) {
      const next = new Date(cur); next.setUTCMonth(next.getUTCMonth() + 1);
      const segStart = Math.max(cur.getTime(), origin);
      const segEnd = Math.min(next.getTime(), end);
      const days = Math.ceil((segEnd - segStart) / DAY_MS);
      if (days > 0) months.push({ x: toDay(segStart, origin) * PX_PER_DAY, width: days * PX_PER_DAY, label: cur.toISOString().slice(0, 7) });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    // Rows sorted by WBS code order, then start date
    const predsByTask = new Map<string, string[]>();
    for (const dep of d.dependencies || []) {
      const list = predsByTask.get(dep.successorId) || [];
      list.push(`${dep.predecessor.code} ${dep.depType}${dep.lagDays ? `+${num(dep.lagDays, 0)}` : ""}`);
      predsByTask.set(dep.successorId, list);
    }
    const sorted = [...tasks].sort((a, b) => {
      const wa = a.wbs?.code ?? "zzzz", wb = b.wbs?.code ?? "zzzz";
      if (wa !== wb) return wa.localeCompare(wb, undefined, { numeric: true });
      const sa = ts(a.earliestStart ?? a.startDate) || 0, sb = ts(b.earliestStart ?? b.startDate) || 0;
      return sa - sb || a.code.localeCompare(b.code, undefined, { numeric: true });
    });

    const now = Date.now();
    const todayX = now >= origin && now <= end ? toDay(now, origin) * PX_PER_DAY : null;

    const geoms = new Map<string, BarGeom>();
    sorted.forEach((t, i) => {
      const es = ts(t.earliestStart ?? t.startDate);
      const ef = ts(t.earliestFinish ?? t.endDate);
      const lf = ts(t.latestFinish ?? t.earliestFinish ?? t.endDate);
      const left = Math.max(toDay(es, origin), 0) * PX_PER_DAY;
      const width = Math.max(toDay(ef, origin) - toDay(es, origin) + 1, 1) * PX_PER_DAY;
      const floatWidth = Number.isFinite(lf) && t.totalFloat > 0
        ? Math.max(toDay(lf, origin) - toDay(ef, origin), 0) * PX_PER_DAY
        : 0;
      geoms.set(t.id, { left, width, floatLeft: left + width, floatWidth, rowTop: i * ROW_H });
    });

    return { tasks: sorted, deps: d.dependencies || [], summary: d.summary, origin, chartW, weeks, months, todayX, geoms, predsByTask };
  }, [schedule.data]);

  if (schedule.loading) return <LoadingBlock label="Computing CPM network…" />;
  if (schedule.error) return <ErrorBlock message={schedule.error} onRetry={schedule.refetch} />;
  if (!model) return <EmptyState title="No scheduled tasks" description="Add tasks with WBS assignments to build the schedule network." />;

  const s = model.summary;
  const hovered = hover;
  const tooltipLeft = hovered ? Math.min(Math.max(hovered.geom.left + hovered.geom.width / 2, 110), model.chartW - 110) : 0;
  const tooltipAbove = hovered ? hovered.geom.rowTop > 120 : true;

  return (
    <div className="space-y-3">
      {/* CPM summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Critical Tasks" value={s.criticalCount} sub={`${s.leafTaskCount} leaf tasks · ${s.dependencyCount} dependencies`} tone={s.criticalCount > 0 ? "bad" : "good"} icon={<Route className="h-4 w-4" />} />
        <StatCard label="Project Finish" value={fmtDate(s.projectFinish)} sub={`Start ${fmtDate(s.projectStart)}`} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Network Duration" value={`${num(s.totalDuration, 0)} days`} sub="Critical path length" icon={<Flag className="h-4 w-4" />} />
        <StatCard label="Tasks in Network" value={s.taskCount} sub={`${model.tasks.filter((t) => t.isCritical).length} on critical path`} icon={<GitBranch className="h-4 w-4" />} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: CRITICAL }} /> Critical path</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: NORMAL }} /> Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: SUMMARY }} /> Summary</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-6 border border-dashed border-slate-400 rounded-sm" /> Total float</span>
        <span className="flex items-center gap-1.5"><span className="h-3.5 border-l-2 border-dashed border-red-500" /> Today</span>
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-auto max-h-[540px]" data-testid="gantt-scroll">
        <div className="relative" style={{ width: INFO_W + model.chartW }}>
          {/* Header: sticky info corner + time axis */}
          <div className="flex sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
            <div className="sticky left-0 z-30 shrink-0 bg-slate-50 border-r border-slate-200 flex items-center px-3" style={{ width: INFO_W, height: 48 }}>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Task / Duration / Predecessors</span>
            </div>
            <div className="relative shrink-0" style={{ width: model.chartW, height: 48 }}>
              {model.months.map((m) => (
                <div key={`m-${m.x}`} className="absolute top-0 h-5 flex items-center border-l border-slate-200 text-[10px] font-medium text-slate-500 pl-1.5" style={{ left: m.x, width: m.width }}>
                  {m.label}
                </div>
              ))}
              {model.weeks.map((w) => (
                <div key={`w-${w.time}`} className="absolute top-5 h-7 flex items-end border-l border-slate-200 pb-1 text-[10px] text-slate-400 pl-1" style={{ left: w.x }}>
                  {w.label}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            {/* week gridlines */}
            <div className="absolute inset-y-0 pointer-events-none" style={{ left: INFO_W, width: model.chartW }}>
              {model.weeks.map((w) => (
                <div key={`g-${w.time}`} className="absolute inset-y-0 border-l border-slate-100" style={{ left: w.x }} />
              ))}
            </div>

            {model.tasks.map((t) => (
              <GanttRow
                key={t.id}
                task={t}
                indent={Math.max((t.wbs?.code ?? "").split(".").length - 1, 0) * 14}
                preds={(model.predsByTask.get(t.id) || []).join(", ")}
                geom={model.geoms.get(t.id) as BarGeom}
                onHover={(task, geom) => setHover({ task, geom })}
                onLeave={() => setHover(null)}
              />
            ))}

            {/* today marker */}
            {model.todayX !== null && (
              <div className="absolute inset-y-0 pointer-events-none z-[15]" style={{ left: INFO_W + model.todayX }} aria-hidden>
                <div className="h-full border-l-2 border-dashed border-red-500" />
              </div>
            )}
          </div>

          {/* Tooltip */}
          {hovered && (
            <div
              className="absolute z-40 pointer-events-none w-60 rounded-lg border border-slate-200 bg-white shadow-lg p-3"
              style={{
                left: INFO_W + tooltipLeft,
                top: tooltipAbove ? hovered.geom.rowTop : hovered.geom.rowTop + ROW_H + 6,
                transform: tooltipAbove ? "translate(-50%, calc(-100% - 8px))" : "translateX(-50%)",
              }}
            >
              <p className="text-xs font-semibold text-slate-800 truncate">
                <span className="font-mono text-slate-400 mr-1">{hovered.task.code}</span>
                {hovered.task.name}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                <span>ES <b className="tabular-nums">{fmtDate(hovered.task.earliestStart)}</b></span>
                <span>EF <b className="tabular-nums">{fmtDate(hovered.task.earliestFinish)}</b></span>
                <span>LS <b className="tabular-nums">{fmtDate(hovered.task.latestStart)}</b></span>
                <span>LF <b className="tabular-nums">{fmtDate(hovered.task.latestFinish)}</b></span>
                <span>Float <b className={hovered.task.totalFloat > 0 ? "text-emerald-600" : "text-red-600"}>{num(hovered.task.totalFloat, 0)}d</b></span>
                <span>Dur <b className="tabular-nums">{num(hovered.task.durationDays, 0)}d</b></span>
                <span>Progress <b>{Math.round(hovered.task.progress)}%</b></span>
                <span>Status <b>{hovered.task.status.replace("_", " ").toLowerCase()}</b></span>
              </div>
              {hovered.task.isCritical && <p className="mt-1.5 text-[10px] font-medium text-red-600">On critical path</p>}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Bars use CPM early dates (ES→EF). Float extension shows latest finish minus earliest finish. Red bars are zero-float critical activities.
      </p>
    </div>
  );
}
