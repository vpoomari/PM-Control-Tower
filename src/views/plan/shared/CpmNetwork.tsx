"use client";
// PM CONTROL TOWER — CPM Network view (PERT-style layered graph)
// Nodes are layered into columns by early-start week and stacked per column;
// edges are bezier arrows colored red on the critical path, labeled FS/SS/FF/SF + lag.
// Clicking a node opens the task inspector. Scope: critical / near-critical / all.

import { useMemo, useState } from "react";
import { EmptyState, cn } from "@/components/pmct/kit";
import { Search, AlertTriangle, Network, Clock, Filter } from "lucide-react";
import { shortDate, statusMeta, type ScheduleDep, type ScheduleTask } from "./schedule-types";

type Scope = "critical" | "near" | "all";

const NODE_W = 168;
const NODE_H = 66;
const COL_GAP = 56;
const ROW_GAP = 14;

function weekIndex(iso: string | null | undefined, originMs: number): number {
  const t = iso ? new Date(iso).getTime() : originMs;
  return Math.max(0, Math.floor((t - originMs) / (7 * 86400000)));
}

export default function CpmNetwork({ tasks, dependencies, onOpenTask, onEditTask }: {
  tasks: ScheduleTask[];
  dependencies: ScheduleDep[];
  onOpenTask: (id: string) => void;
  /** Double-click a node → open the task inspector directly in Edit mode. */
  onEditTask?: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("critical");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const search = q.trim().toLowerCase();
    let list = tasks.filter((t) => !t.isSummary);
    if (scope === "critical") list = list.filter((t) => t.isCritical);
    else if (scope === "near") list = list.filter((t) => t.totalFloat <= 5);
    if (search) list = list.filter((t) => t.name.toLowerCase().includes(search) || t.code.toLowerCase().includes(search));
    list.sort((a, b) => (new Date(a.earliestStart ?? 0).getTime() - new Date(b.earliestStart ?? 0).getTime()) || a.code.localeCompare(b.code));
    return list.slice(0, 240); // hard cap keeps the SVG responsive on giant plans
  }, [tasks, scope, q]);

  // ---- layered layout: column = early-start week, row = stack within column ----
  const layout = useMemo(() => {
    if (!visible.length) return null;
    const times = visible.map((t) => new Date(t.earliestStart ?? t.startDate ?? Date.now()).getTime());
    const originMs = Math.min(...times);
    const colOf = new Map<string, number>();
    const rowOf = new Map<string, number>();
    const rowFill: number[] = []; // nodes placed in the current column while iterating
    let maxRows = 1;
    let maxCol = 0;
    let lastCol = -1;
    for (const t of visible) {
      const c = weekIndex(t.earliestStart ?? t.startDate, originMs);
      if (c !== lastCol) { rowFill.length = 0; lastCol = c; }
      const r = rowFill.length;
      rowFill.push(1);
      colOf.set(t.id, c);
      rowOf.set(t.id, r);
      maxCol = Math.max(maxCol, c);
      maxRows = Math.max(maxRows, r + 1);
    }
    const colW = NODE_W + COL_GAP;
    const pos = (id: string) => {
      const c = colOf.get(id) ?? 0;
      const r = rowOf.get(id) ?? 0;
      return { x: c * colW, y: r * (NODE_H + ROW_GAP) + 8 };
    };
    const idSet = new Set(visible.map((t) => t.id));
    const edges = dependencies
      .filter((d) => idSet.has(d.predecessorId) && idSet.has(d.successorId))
      .map((d) => {
        const from = pos(d.predecessorId);
        const to = pos(d.successorId);
        const x1 = from.x + NODE_W;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_H / 2;
        const dx = Math.max(36, (x2 - x1) / 2);
        return {
          dep: d,
          d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
          mx: (x1 + x2) / 2,
          my: (y1 + y2) / 2 - 6,
          crit: visible.find((t) => t.id === d.successorId)?.isCritical ?? false,
        };
      });
    return {
      pos, edges,
      width: (maxCol + 1) * colW + 8,
      height: maxRows * (NODE_H + ROW_GAP) + 40,
      originMs,
      maxCol,
    };
  }, [visible, dependencies]);

  const scopes: { id: Scope; label: string; count: number; cls: string }[] = [
    { id: "critical", label: "Critical path", count: tasks.filter((t) => t.isCritical && !t.isSummary).length, cls: "border-red-300 bg-red-600 text-white" },
    { id: "near", label: "Near-critical (≤5d)", count: tasks.filter((t) => !t.isSummary && t.totalFloat <= 5).length, cls: "border-amber-300 bg-amber-500 text-white" },
    { id: "all", label: "All tasks", count: tasks.filter((t) => !t.isSummary).length, cls: "border-blue-300 bg-blue-600 text-white" },
  ];

  if (!visible.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">{scopeChips(scopes, scope, setScope)}</div>
        <EmptyState title="No tasks match" description={scope === "critical" ? "The plan has no critical tasks in this filter." : "Adjust the scope or search."} />
      </div>
    );
  }

  const monthLabel = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Find task…" className="h-9 w-52 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        {scopeChips(scopes, scope, setScope)}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <Network className="h-3.5 w-3.5" /> {visible.length} node{visible.length === 1 ? "" : "s"} · {layout?.edges.length ?? 0} links
        </span>
      </div>

      {/* diagram */}
      <div className="rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm overflow-auto" style={{ maxHeight: 560 }}>
        <div className="relative" style={{ width: layout!.width, minHeight: layout!.height }}>
          {/* week scale header */}
          <div className="sticky top-0 z-20 h-7 border-b border-slate-200/80 bg-white/95 backdrop-blur">
            {Array.from({ length: layout!.maxCol + 1 }).map((_, c) => {
              const d = new Date(layout!.originMs + c * 7 * 86400000);
              const monthStart = c === 0 || new Date(layout!.originMs + (c - 1) * 7 * 86400000).getUTCMonth() !== d.getUTCMonth();
              return (
                <div key={c} className="absolute top-0 h-7 border-r border-slate-100 px-1.5 pt-1.5 text-[9px] text-slate-400" style={{ left: c * (NODE_W + COL_GAP), width: NODE_W + COL_GAP }}>
                  {monthStart && <span className="mr-1 font-bold text-slate-500">{d.toLocaleString("en", { month: "short" })}</span>}
                  {d.toLocaleDateString("en", { month: "short", day: "numeric" })}
                </div>
              );
            })}
          </div>

          {/* edges */}
          <svg className="pointer-events-none absolute left-0 top-7 z-0" width={layout!.width} height={layout!.height}>
            <defs>
              <marker id="net-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8" fill="none" stroke="#64748b" strokeWidth="1.6" />
              </marker>
              <marker id="net-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8" fill="none" stroke="#dc2626" strokeWidth="1.8" />
              </marker>
            </defs>
            {layout!.edges.map((e, i) => (
              <g key={i}>
                <path d={e.d} fill="none" stroke={e.crit ? "#dc2626" : "#94a3b8"} strokeOpacity={e.crit ? 0.85 : 0.55} strokeWidth={e.crit ? 2 : 1.4} markerEnd={e.crit ? "url(#net-arrow-crit)" : "url(#net-arrow)"} />
                <text x={e.mx} y={e.my} textAnchor="middle" className="pointer-events-none" style={{ fontSize: 8.5, fill: e.crit ? "#b91c1c" : "#64748b", paintOrder: "stroke", stroke: "white", strokeWidth: 3, fontWeight: 700 }}>
                  {e.dep.depType}{e.dep.lagDays ? `+${e.dep.lagDays}d` : ""}
                </text>
              </g>
            ))}
          </svg>

          {/* nodes */}
          {visible.map((t) => {
            const p = layout!.pos(t.id);
            const sm = statusMeta(t.status);
            const crit = t.isCritical;
            return (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                onDoubleClick={() => (onEditTask ?? onOpenTask)(t.id)}
                title={`${t.code} · ${t.name}\nES ${shortDate(t.earliestStart)} → EF ${shortDate(t.earliestFinish)}\nLS ${shortDate(t.latestStart)} → LF ${shortDate(t.latestFinish)}\nTotal float ${Math.round(t.totalFloat)}d · ${t.status.replace("_", " ").toLowerCase()}\nClick to view · double-click to edit`}
                className={cn(
                  "absolute z-10 flex flex-col rounded-lg border bg-white px-2.5 py-1.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                  crit ? "border-red-400 ring-1 ring-red-200 shadow-[0_0_10px_rgba(239,68,68,0.25)]" : "border-slate-200 hover:border-blue-300",
                )}
                style={{ left: p.x, top: p.y + 28, width: NODE_W, height: NODE_H, borderLeftWidth: 5, borderLeftColor: crit ? "#dc2626" : sm.bar }}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[9px] font-bold text-slate-400">{t.code}</span>
                  {crit && <AlertTriangle className="h-3 w-3 text-red-500" />}
                </span>
                <span className="truncate text-[11px] font-semibold text-slate-800">{t.name}</span>
                <span className="mt-auto flex items-center justify-between text-[9px] tabular-nums text-slate-500">
                  <span>{shortDate(t.earliestStart)} → {shortDate(t.earliestFinish)}</span>
                  <span className={cn("rounded border px-1 font-bold", crit ? "border-red-200 bg-red-50 text-red-700" : t.totalFloat <= 5 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                    {crit ? "TF 0" : `TF ${Math.round(t.totalFloat)}d`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-red-500 bg-red-100" />Critical node</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-red-600" />Critical link</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-slate-400" />Normal link</span>
        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />Columns = early-start week</span>
        <span className="flex items-center gap-1.5"><Filter className="h-3 w-3" />Scope controls which nodes render (max 240)</span>
        <span className="ml-auto text-slate-400">Click a node to view · double-click to edit · {monthLabel}</span>
      </div>
    </div>
  );
}

function scopeChips(scopes: { id: Scope; label: string; count: number; cls: string }[], scope: Scope, set: (s: Scope) => void) {
  return scopes.map((s) => (
    <button
      key={s.id}
      onClick={() => set(s.id)}
      className={cn(
        "h-8 rounded-md border px-2.5 text-xs font-medium transition-colors",
        scope === s.id ? s.cls : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
      )}
    >
      {s.label} <span className="ml-1 tabular-nums opacity-75">{s.count}</span>
    </button>
  ));
}
