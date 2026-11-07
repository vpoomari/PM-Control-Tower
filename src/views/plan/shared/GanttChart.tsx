"use client";
// PM CONTROL TOWER — Enterprise Schedule (CPM network + Gantt)
// Two views: Timeline (split-panel Gantt with bars, float bars, dependency
// arrows, today marker, weekend shading, task-path tracing) and Network
// (layered PERT graph). Every task/dependency change triggers a realtime
// refetch so early dates, total float and the critical path are always fresh.
// Click any row/bar/node → task inspector (detail, linked items, edit, link).

import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, EmptyState, cn } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import {
  ChevronRight, ChevronDown, ZoomIn, ZoomOut, Link2, Route, Search,
  AlertTriangle, Activity, CalendarClock, Network, RefreshCw, Pencil, Gauge, Layers,
} from "lucide-react";
import { fmtDate } from "@/lib/constants";
import { statusMeta, type ScheduleBundle, type ScheduleDep, type ScheduleTask } from "./schedule-types";
import ScheduleTaskDialog from "./ScheduleTaskDialog";
import CpmNetwork from "./CpmNetwork";

const CRIT = "#e74c3c";
const TODAY = "#e74c3c";
const WKND = "#f1f5f9";
const GROUP_COLORS = ["#1999b8", "#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#3b82f6", "#14b8a6"];

type View = "timeline" | "network";
type Scope = "all" | "critical" | "near";
type Zoom = "day" | "week" | "month";

const PXD: Record<Zoom, number> = { day: 36, week: 14, month: 5 };

// ---- colorful stat card ----
function Stat({ icon, label, value, sub, cls }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; cls: string }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", cls)}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">{icon}{label}</p>
      <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
      {sub && <p className="text-[10px] opacity-70 truncate">{sub}</p>}
    </div>
  );
}

export default function GanttChart({ projectId }: { projectId: string }) {
  const data = useApi<ScheduleBundle>(`/api/projects/${projectId}/schedule`);
  // "updated on every plan change" — any task/dependency/schedule mutation refetches
  useRealtimeRefetch(data.refetch, ["task:changed", "schedule:changed", "dependency:changed", "project:updated"]);

  const [view, setView] = useState<View>("timeline");
  const [zoom, setZoom] = useState<Zoom>("week");
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showCrit, setShowCrit] = useState(true);
  const [showDep, setShowDep] = useState(true);
  const [showFloat, setShowFloat] = useState(true);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailEdit, setDetailEdit] = useState(false); // open the inspector directly in Edit mode
  const [recalc, setRecalc] = useState(false);
  // Three separate refs: the timescale header, the left task list and the
  // chart canvas scroll together, so each pane needs its own live reference
  // (a single ref shared by two divs only ever points at the last one mounted).
  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  useEffect(() => () => { if (clickTimer.current !== null) window.clearTimeout(clickTimer.current); }, []);

  // Single click → view the task; double click → straight into Edit mode.
  // The first click defers briefly so a fast second click can cancel it.
  const openDetail = (id: string) => { setDetailId(id); setDetailEdit(false); };
  const openEdit = (id: string) => { setDetailId(id); setDetailEdit(true); };
  const rowClick = (id: string) => {
    if (clickTimer.current !== null) { window.clearTimeout(clickTimer.current); clickTimer.current = null; openEdit(id); return; }
    clickTimer.current = window.setTimeout(() => { clickTimer.current = null; openDetail(id); }, 220);
  };

  // Task-path tracing (MS "Task Path"): transitive predecessor chain of the traced task.
  // NOTE: hooks stay above the early returns — Rules of Hooks.
  const depList: ScheduleDep[] = Array.isArray(data.data?.dependencies) ? data.data.dependencies : [];
  const predChain = useMemo(() => {
    const set = new Set<string>();
    if (!traceId) return set;
    const stack = [traceId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const p of depList.filter((d) => d.successorId === cur)) {
        if (!set.has(p.predecessorId)) { set.add(p.predecessorId); stack.push(p.predecessorId); }
      }
    }
    return set;
  }, [traceId, depList]);

  if (data.loading && !data.data) return <LoadingBlock label="Loading schedule network…" />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.refetch} />;

  const allTasks: ScheduleTask[] = Array.isArray(data.data?.tasks) ? data.data.tasks : [];
  const dependencies = depList;
  const summary = data.data?.summary;
  if (allTasks.length === 0) {
    return <EmptyState title="No tasks in the schedule" description="Add tasks in the WBS or Tasks view — the CPM network builds itself from there." />;
  }

  const toggleTrace = () => setTraceId((p) => (p ? null : (allTasks.find((t) => t.isCritical)?.id ?? allTasks[0]?.id ?? null)));
  const toggles = {
    showCrit, setShowCrit, showDep, setShowDep, showFloat, setShowFloat, traceId, toggleTrace,
  };

  // ---------- filtering (search + scope) ----------
  const search = q.trim().toLowerCase();
  const tasks = allTasks.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search) && !t.code.toLowerCase().includes(search)) return false;
    if (scope === "critical") return t.isCritical;
    if (scope === "near") return t.totalFloat <= 5;
    return true;
  });

  // ---------- headline stats (colorful) ----------
  const leafCount = summary?.leafTaskCount ?? allTasks.filter((t) => !t.isSummary).length;
  const criticalCount = summary?.criticalCount ?? allTasks.filter((t) => t.isCritical).length;
  const nearCount = allTasks.filter((t) => !t.isSummary && !t.isCritical && t.totalFloat <= 5).length;
  const avgProgress = tasks.length ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / tasks.length) : 0;

  const recalculate = async () => {
    setRecalc(true);
    try {
      const res = await api.post<{ criticalCount: number }>(`/api/projects/${projectId}/schedule`, { action: "reschedule" });
      toast.success(`CPM recalculated — ${res.criticalCount} critical tasks`);
      await data.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculation failed");
    } finally { setRecalc(false); }
  };

  // =====================================================================
  // NETWORK VIEW
  // =====================================================================
  if (view === "network") {
    return (
      <div className="space-y-3">
        <Toolbar
          view={view} setView={setView} zoom={zoom} setZoom={setZoom} scope={scope} setScope={setScope}
          q={q} setQ={setQ} recalculate={recalculate} recalc={recalc} toggles={toggles}
        />
        <CpmNetwork tasks={allTasks} dependencies={dependencies} onOpenTask={openDetail} onEditTask={openEdit} />
        {detailId && (
          <ScheduleTaskDialog
            projectId={projectId} taskId={detailId} tasks={allTasks} dependencies={dependencies}
            onClose={() => setDetailId(null)} onChanged={data.refetch} onOpenTask={openDetail}
            startInEdit={detailEdit}
            onTrace={(id) => { setTraceId(id); setView("timeline"); }}
          />
        )}
      </div>
    );
  }

  // =====================================================================
  // TIMELINE VIEW geometry
  // =====================================================================
  const pxD = PXD[zoom];
  let origin = Date.now();
  let lastDate = Date.now() + 30 * 86400000;
  try {
    const starts = tasks.map((t) => new Date(t.earliestStart || t.startDate || Date.now()).getTime()).filter(Number.isFinite);
    const ends = tasks.map((t) => new Date(t.earliestFinish || t.endDate || Date.now()).getTime()).filter(Number.isFinite);
    if (starts.length) origin = Math.min(...starts) - 2 * 86400000;
    if (ends.length) lastDate = Math.max(...ends) + 2 * 86400000;
  } catch { /* fallbacks above */ }
  const totalDays = Math.max(1, Math.ceil((lastDate - origin) / 86400000));
  const chartW = totalDays * pxD;
  const toX = (d: string | null | undefined) => { if (!d) return 0; const t = new Date(d).getTime(); return Number.isFinite(t) ? Math.max(0, ((t - origin) / 86400000)) * pxD : 0; };
  const todayX = ((Date.now() - origin) / 86400000) * pxD;

  // group by WBS prefix (rainbow accents)
  const groups: { key: string; label: string; items: ScheduleTask[]; color: string }[] = [];
  const seen = new Set<string>();
  let ci = 0;
  for (const t of tasks) {
    const gk = t.wbs?.code?.split(".").slice(0, 2).join(".") || "root";
    if (!seen.has(gk)) { seen.add(gk); groups.push({ key: gk, label: gk, items: [], color: GROUP_COLORS[ci % GROUP_COLORS.length] }); ci++; }
    groups.find((x) => x.key === gk)?.items.push(t);
  }

  // dependency arrows geometry
  const geom = new Map<string, { x1: number; y: number; x2: number }>();
  let rowIdx = 0;
  for (const g of groups) {
    rowIdx += 1; // each group's header lane occupies a row, as in the task list
    if (collapsed.has(g.key)) continue;
    for (const item of g.items) { geom.set(item.id, { x1: toX(item.earliestStart), y: rowIdx * 36 + 18, x2: toX(item.earliestFinish) }); rowIdx++; }
  }
  const arrows: { d: string; crit: boolean; traced: boolean }[] = [];
  if (showDep) {
    for (const dep of dependencies) {
      const from = geom.get(dep.predecessorId);
      const to = geom.get(dep.successorId);
      if (!from || !to) continue;
      const traced = !!traceId && (dep.successorId === traceId || predChain.has(dep.successorId)) && predChain.has(dep.predecessorId);
      arrows.push({
        d: `M ${from.x2} ${from.y} L ${from.x2 + 8} ${from.y} L ${from.x2 + 8} ${to.y} L ${to.x1 - 5} ${to.y}`,
        crit: allTasks.find((t) => t.id === dep.successorId)?.isCritical || false,
        traced,
      });
    }
  }

  const totalRows = groups.reduce((s, g) => s + (collapsed.has(g.key) ? 1 : g.items.length + 1), 0);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)));

  // Scroll sync — each pane reports its own scroll (src) and its siblings adopt
  // it: the header timescale follows the chart horizontally, the task list
  // follows the chart vertically. Assigning an offset that is already current
  // never fires another scroll event, so the chain always settles.
  const syncScroll = (src: "header" | "list" | "chart") => {
    const h = headerRef.current;
    const l = listRef.current;
    const c = chartRef.current;
    if (!h || !l || !c) return;
    if (src === "chart") { h.scrollLeft = c.scrollLeft; l.scrollTop = c.scrollTop; }
    else if (src === "header") { c.scrollLeft = h.scrollLeft; }
    else c.scrollTop = l.scrollTop; // "list"
  };

  // timeline header cells (one label per day/week/month block)
  const stepDays = zoom === "day" ? 1 : zoom === "week" ? 7 : 28;
  const labelW = pxD * stepDays;
  const cellCount = Math.ceil(totalDays / stepDays);

  return (
    <div className="space-y-3">
      <Toolbar
        view={view} setView={setView} zoom={zoom} setZoom={setZoom} scope={scope} setScope={setScope}
        q={q} setQ={setQ} recalculate={recalculate} recalc={recalc} toggles={toggles}
      />

      {/* colorful headline stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat cls="border-indigo-200 bg-indigo-50/70 text-indigo-700" icon={<Layers className="h-3 w-3" />} label="Tasks" value={summary?.taskCount ?? allTasks.length} sub={`${leafCount} leaf · ${dependencies.length} links`} />
        <Stat cls="border-red-300 bg-red-50 text-red-700" icon={<AlertTriangle className="h-3 w-3" />} label="Critical path" value={criticalCount} sub={`${leafCount ? Math.round((criticalCount / leafCount) * 100) : 0}% of leaf tasks`} />
        <Stat cls="border-amber-200 bg-amber-50/80 text-amber-700" icon={<Gauge className="h-3 w-3" />} label="Near-critical" value={nearCount} sub="≤ 5 days of float" />
        <Stat cls="border-sky-200 bg-sky-50/70 text-sky-700" icon={<Link2 className="h-3 w-3" />} label="Links" value={summary?.dependencyCount ?? dependencies.length} sub="FS · SS · FF · SF" />
        <Stat cls="border-emerald-200 bg-emerald-50/70 text-emerald-700" icon={<CalendarClock className="h-3 w-3" />} label="Span" value={summary?.totalDuration != null ? `${summary.totalDuration}d` : "—"} sub={summary?.projectStart ? `${String(summary.projectStart).slice(0, 10)} → ${String(summary.projectFinish ?? "").slice(0, 10)}` : ""} />
        <Stat cls="border-violet-200 bg-violet-50/70 text-violet-700" icon={<Activity className="h-3 w-3" />} label="Avg progress" value={`${avgProgress}%`} sub={`shown: ${tasks.length}/${allTasks.length}`} />
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks match the filter" description="Clear the search or widen the scope." />
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm bg-white">
          {/* header: group col + time scale */}
          <div className="flex bg-slate-50 border-b border-slate-200">
            <div className="w-80 shrink-0 border-r border-slate-200 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Task</span>
              <button onClick={toggleAll} className="text-[10px] font-medium text-blue-600 hover:text-blue-800">{allCollapsed ? "Expand all" : "Collapse all"}</button>
            </div>
            <div ref={headerRef} className="flex-1 overflow-hidden" onScroll={() => syncScroll("header")}>
              <div style={{ width: chartW }} className="relative h-6">
                {Array.from({ length: cellCount }).map((_, i) => {
                  const d = new Date(origin + i * stepDays * 86400000);
                  const isWknd = zoom === "day" && (d.getDay() === 0 || d.getDay() === 6);
                  const monthEdge = zoom === "month" || (zoom !== "day" && (i === 0 || new Date(origin + (i - 1) * stepDays * 86400000).getMonth() !== d.getMonth()));
                  return (
                    <div key={i} className={cn("absolute top-0 h-full flex items-center justify-center text-[9px] border-r border-slate-100", isWknd ? "text-slate-300" : "text-slate-500", monthEdge && "font-bold text-slate-600")} style={{ left: i * labelW, width: labelW }}>
                      {zoom === "day" ? d.getDate() : zoom === "week" ? d.toLocaleDateString("en", { month: "short", day: "numeric" }) : d.toLocaleDateString("en", { month: "short" })}
                    </div>
                  );
                })}
                {todayX > 0 && todayX < chartW && (
                  <div className="absolute top-0 h-full z-10" style={{ left: todayX }}>
                    <div className="h-full w-0.5" style={{ backgroundColor: TODAY }} />
                    <span className="absolute -top-0.5 left-1 text-[8px] font-bold px-1 rounded text-white" style={{ backgroundColor: TODAY }}>TODAY</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* body: list + chart */}
          <div className="flex" style={{ maxHeight: 540 }}>
            {/* ---- left list ---- */}
            <div ref={listRef} className="w-80 shrink-0 border-r border-slate-200 overflow-y-auto bg-white" onScroll={() => syncScroll("list")}>
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="flex h-9 items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2" style={{ borderLeft: `4px solid ${g.color}` }}>
                    <button onClick={() => setCollapsed((p) => { const n = new Set(p); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
                      {collapsed.has(g.key) ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                    <span className="text-xs font-semibold text-slate-700 truncate">{g.label}</span>
                    <span className="ml-auto text-[10px] text-slate-400">{g.items.length}</span>
                  </div>
                  {!collapsed.has(g.key) && g.items.map((item) => {
                    const ft = statusMeta(item.status);
                    const tf = item.totalFloat;
                    const tfCls = item.isCritical ? "border-red-200 bg-red-50 text-red-700" : tf <= 5 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
                    return (
                      <div
                        key={item.id}
                        onClick={() => rowClick(item.id)}
                        onDoubleClick={() => openEdit(item.id)}
                        className={cn(
                          "group flex h-9 cursor-pointer items-center gap-1.5 border-b border-slate-50 px-2 text-xs hover:bg-blue-50/60",
                          item.isCritical && showCrit && "bg-red-50/40",
                          traceId === item.id && "bg-violet-50/60",
                        )}
                        title={`${item.code} · ${item.name} — click to view · double-click to edit`}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.isCritical ? CRIT : ft.dot }} title={item.status.replace("_", " ").toLowerCase()} />
                        <span className="font-mono text-[9px] text-slate-400 shrink-0">{item.code}</span>
                        <span className="flex-1 truncate text-slate-700">{item.name}</span>
                        <span className={cn("shrink-0 rounded border px-1 py-px text-[9px] font-bold tabular-nums", tfCls)} title="Total float">
                          {item.isCritical ? "CRIT" : `${Math.round(tf)}d`}
                        </span>
                        <span className="w-8 shrink-0 text-right text-slate-400 tabular-nums">{Math.round(item.progress || 0)}%</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setTraceId((p) => (p === item.id ? null : item.id)); }}
                          className={cn("shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100", traceId === item.id ? "text-violet-600 opacity-100" : "text-slate-400 hover:text-violet-600")}
                          title="Trace driving predecessor chain"
                        >
                          <Route className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(item.id); }}
                          className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-blue-600"
                          title="Edit task (double-click a row)"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* match the chart's trailing gap so both panes scroll the same distance */}
              <div className="h-9" aria-hidden="true" />
            </div>

            {/* ---- chart ---- */}
            <div ref={chartRef} className="flex-1 overflow-x-auto overflow-y-auto relative" onScroll={() => syncScroll("chart")}>
              <div style={{ width: chartW, minHeight: totalRows * 36 + 36 }} className="relative">
                {/* weekend shading */}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = new Date(origin + i * 86400000);
                  return day.getDay() === 0 || day.getDay() === 6
                    ? <div key={"w" + i} className="absolute top-0 bottom-0" style={{ left: i * pxD, width: pxD, backgroundColor: WKND }} />
                    : null;
                })}

                {/* dependency arrows */}
                {showDep && (
                  <svg className="absolute top-0 left-0 pointer-events-none z-10" style={{ width: chartW, height: "100%" }}>
                    <defs>
                      <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#94a3b8" strokeWidth="1.5" /></marker>
                      <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#dc2626" strokeWidth="1.8" /></marker>
                      <marker id="gantt-arrow-trace" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#8b5cf6" strokeWidth="2" /></marker>
                    </defs>
                    {arrows.map((a, i) => (
                      <path key={i} d={a.d} stroke={a.traced ? "#8b5cf6" : a.crit ? "#dc262699" : "#94a3b866"} strokeWidth={a.traced ? 2.5 : 1.5} fill="none" markerEnd={a.traced ? "url(#gantt-arrow-trace)" : a.crit ? "url(#gantt-arrow-crit)" : "url(#gantt-arrow)"} />
                    ))}
                  </svg>
                )}

                {/* bars */}
                {groups.map((g, gi) => {
                  // rows run header lane first, then item lanes — same order as the task list
                  const baseRow = 1 + groups.slice(0, gi).reduce((s, pg) => s + (collapsed.has(pg.key) ? 1 : pg.items.length + 1), 0);
                  if (collapsed.has(g.key)) return null;
                  return g.items.map((item, idx) => {
                    const x = toX(item.earliestStart);
                    const w = Math.max(pxD * 0.5, (item.durationDays || 1) * pxD);
                    const crit = item.isCritical && showCrit;
                    const sm = statusMeta(item.status);
                    const inPath = !!traceId && (item.id === traceId || predChain.has(item.id));
                    const constraint = (item.constraintType || "ASAP") !== "ASAP" && item.constraintDate ? item.constraintType : null;
                    const deadlineX = item.deadline ? toX(item.deadline) : null;
                    const lfX = item.latestFinish ? toX(item.latestFinish) : x + w;
                    const floatW = showFloat && !item.isCritical && item.totalFloat > 0.5 ? Math.max(0, lfX - (x + w)) : 0;
                    const cpmTitle = `${item.code} · ${item.name}\nES ${String(item.earliestStart ?? "—").slice(0, 10)} → EF ${String(item.earliestFinish ?? "—").slice(0, 10)}\nLS ${String(item.latestStart ?? "—").slice(0, 10)} → LF ${String(item.latestFinish ?? "—").slice(0, 10)}\nFloat ${Math.round(item.totalFloat)}d · ${item.status.replace("_", " ").toLowerCase()}\nClick to view · double-click to edit`;
                    return (
                      <div
                        key={item.id}
                        className={cn("absolute flex items-center cursor-pointer", crit && "bg-red-50/20", inPath && "bg-violet-50/40")}
                        style={{ top: (baseRow + idx) * 36, height: 36, left: 0, right: 0 }}
                        onClick={() => rowClick(item.id)}
                        onDoubleClick={() => openEdit(item.id)}
                        title={cpmTitle}
                      >
                        {/* float bar (EF → LF) */}
                        {floatW > 1 && (
                          <div className="absolute rounded-sm border border-dashed border-amber-400/80 bg-amber-100/40"
                            style={{ left: x + w + 1, width: floatW - 2, height: 10, top: 13 }} title={`${Math.round(item.totalFloat)}d of total float (EF → LF)`} />
                        )}
                        <div
                          className="relative rounded-md shadow-sm flex items-center overflow-visible"
                          style={{ left: x, width: w, height: 16, backgroundColor: crit ? CRIT : sm.bar, outline: inPath ? "2px solid #8b5cf6" : undefined, outlineOffset: "1px" }}
                        >
                          {(item.progress || 0) > 0 && <div className="h-full rounded-l-md bg-white/40" style={{ width: `${Math.min(100, item.progress)}%` }} />}
                          {crit && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rotate-45 bg-red-700 ring-2 ring-white" title="Critical" />}
                          {constraint && (
                            <span className="absolute -top-2 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full border text-white"
                              style={{ backgroundColor: constraint === "MSO" ? "#dc2626" : "#7c3aed", borderColor: "white" }} title={`Constraint ${constraint}`}>
                              <span className="text-[8px] font-bold">!</span>
                            </span>
                          )}
                          {item.status === "COMPLETED" && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90">✓</span>}
                        </div>
                        {deadlineX !== null && (
                          <div className="absolute z-10" style={{ left: deadlineX - 5, top: 12 }} title={`Deadline ${String(item.deadline).slice(0, 10)}`}>
                            <div className="h-2.5 w-2.5 rotate-45 border-2 bg-white" style={{ borderColor: item.deadline && item.earliestFinish && new Date(item.earliestFinish) > new Date(item.deadline) ? "#dc2626" : "#0284c7" }} />
                          </div>
                        )}
                        <span className="absolute text-[10px] text-slate-500 whitespace-nowrap" style={{ left: x + w + (floatW > 1 ? floatW + 6 : 6) }}>
                          {item.name}
                          <span className="ml-1.5 text-slate-300">{fmtDate(item.earliestStart)}</span>
                        </span>
                      </div>
                    );
                  });
                })}

                {todayX > 0 && todayX < chartW && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: todayX }}>
                    <div className="h-full w-0.5" style={{ backgroundColor: TODAY, opacity: 0.6 }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* legend — colorful key */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded" style={{ backgroundColor: CRIT }} />Critical path</span>
        {(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5"><span className="w-4 h-3 rounded" style={{ backgroundColor: statusMeta(s).bar }} />{s.replace("_", " ").toLowerCase()}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded border border-dashed border-amber-400 bg-amber-100/50" />Total float (EF→LF)</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-4" style={{ backgroundColor: TODAY }} />Today</span>
        <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3 text-slate-400" />Dependency</span>
        <span className="flex items-center gap-1.5"><span className="-rotate-45 border-2 border-sky-600 bg-white" style={{ width: 9, height: 9 }} />Deadline</span>
        <span className="flex items-center gap-1.5"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-600 text-white text-[8px] font-bold">!</span>Constraint</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded" style={{ outline: "2px solid #8b5cf6" }} />Traced path</span>
        <span className="ml-auto text-slate-400">Click a bar or row to view · double-click to edit</span>
      </div>

      {/* task inspector (detail / edit / link) — double-click opens straight into Edit */}
      {detailId && (
        <ScheduleTaskDialog
          projectId={projectId}
          taskId={detailId}
          tasks={allTasks}
          dependencies={dependencies}
          onClose={() => setDetailId(null)}
          onChanged={data.refetch}
          onOpenTask={openDetail}
          startInEdit={detailEdit}
          onTrace={(id) => setTraceId(id)}
        />
      )}
    </div>
  );
}

// ============================ shared toolbar ============================
function Toolbar({ view, setView, zoom, setZoom, scope, setScope, q, setQ, recalculate, recalc, toggles }: {
  view: View; setView: (v: View) => void;
  zoom: Zoom; setZoom: (z: Zoom) => void;
  scope: Scope; setScope: (s: Scope) => void;
  q: string; setQ: (v: string) => void;
  recalculate: () => void; recalc: boolean;
  toggles: {
    showCrit: boolean; setShowCrit: (v: boolean) => void;
    showDep: boolean; setShowDep: (v: boolean) => void;
    showFloat: boolean; setShowFloat: (v: boolean) => void;
    traceId: string | null; toggleTrace: () => void;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* view switch */}
      <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
        <button onClick={() => setView("timeline")} className={cn("flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium", view === "timeline" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:text-slate-700")}>
          <CalendarClock className="h-3.5 w-3.5" />Timeline
        </button>
        <button onClick={() => setView("network")} className={cn("flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium", view === "network" ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:text-slate-700")}>
          <Network className="h-3.5 w-3.5" />Network
        </button>
      </div>

      {view === "timeline" && (
        <>
          {/* search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…"
              className="h-8 w-44 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* scope */}
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
            {([["all", "All"], ["critical", "Critical"], ["near", "≤5d float"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setScope(id)} className={cn("rounded px-2 py-1 text-[11px] font-medium", scope === id ? (id === "critical" ? "bg-red-600 text-white" : id === "near" ? "bg-amber-500 text-white" : "bg-slate-700 text-white") : "text-slate-500 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>

          {/* layer toggles */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => toggles.setShowCrit(!toggles.showCrit)} className={cn("px-2 py-1 rounded text-xs font-medium border", toggles.showCrit ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-slate-400 border-slate-200")}>Critical</button>
            <button onClick={() => toggles.setShowDep(!toggles.showDep)} className={cn("px-2 py-1 rounded text-xs font-medium border flex items-center gap-1", toggles.showDep ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-400 border-slate-200")}><Link2 className="h-3 w-3" />Links</button>
            <button onClick={() => toggles.setShowFloat(!toggles.showFloat)} className={cn("px-2 py-1 rounded text-xs font-medium border", toggles.showFloat ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-slate-400 border-slate-200")}>Float</button>
            <button onClick={toggles.toggleTrace} className={cn("px-2 py-1 rounded text-xs font-medium border flex items-center gap-1", toggles.traceId ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-white text-slate-400 border-slate-200")}>
              <Route className="h-3 w-3" />Task path{toggles.traceId ? " on" : ""}
            </button>
          </div>
        </>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {view === "timeline" && (
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5">
            {(["day", "week", "month"] as const).map((z) => (
              <button key={z} onClick={() => setZoom(z)} className={cn("flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium capitalize", zoom === z ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
                {z === "day" ? <ZoomIn className="h-3 w-3" /> : z === "month" ? <ZoomOut className="h-3 w-3" /> : null}{z}
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" className="h-8" onClick={recalculate} disabled={recalc} title="Recompute early/late dates and the critical path now">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", recalc && "animate-spin")} />{recalc ? "Recalculating…" : "Recalculate CPM"}
        </Button>
      </div>
    </div>
  );
}
