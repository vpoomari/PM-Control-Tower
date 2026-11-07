"use client";
// PM CONTROL TOWER — board widgets
// Right rail (Today's Tasks · Upcoming · Priority Overview) and bottom row
// (Task Timeline · Team Workload) derived from the same Task collection the
// board/list views render. Flat SVG donut — no chart library.

import type { ReactNode } from "react";
import { SectionCard, EmptyState } from "@/components/pmct/kit";
import { fmtDate } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Avatar, PRIORITY_CHIP, PRIORITY_DOT, presentationOf, shortDate,
  type KanbanTask,
} from "./shared/KanbanBoard";
import { CheckCircle2 } from "lucide-react";

const isOpenTask = (t: KanbanTask) => t.status !== "COMPLETED" && t.status !== "CANCELLED";
const todayKey = () => new Date().toISOString().slice(0, 10);

// ---- Flat SVG donut ----
export function MiniDonut({ slices, size = 84, thickness = 11, center, sub }: {
  slices: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  sub?: string;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        {total > 0 && slices.map((s, i) => {
          if (s.value <= 0) return null;
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      {(center || sub) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          {center}
          {sub && <span className="text-[9px] text-slate-400">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : fmtDate(iso);
}

// ---- Right rail: Today's Tasks ----
export function TodaysTasks({ tasks, onOpen, onComplete }: {
  tasks: KanbanTask[];
  onOpen: (task: KanbanTask) => void;
  onComplete: (task: KanbanTask) => void;
}) {
  const today = todayKey();
  const items = tasks.filter((t) => t.endDate && t.endDate.slice(0, 10) === today && isOpenTask(t)).slice(0, 8);
  return (
    <SectionCard title="Today's Tasks" description={items.length ? `${items.length} due today` : "Nothing due today"} bodyClass="p-2">
      {items.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-3 text-xs text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> You're clear for today.
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((t) => (
            <div key={t.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors">
              <Checkbox
                aria-label={`Mark ${t.code} done`}
                onCheckedChange={() => onComplete(t)}
                className="shrink-0"
              />
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onOpen(t)}>
                <p className="text-xs font-medium text-slate-700 truncate group-hover:text-blue-700">{t.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{t.code} · {presentationOf(t.status).label}</p>
              </button>
              <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[t.priority] || "bg-slate-300")} title={`${t.priority} priority`} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Right rail: Upcoming (next 7 days) ----
export function UpcomingTasks({ tasks, onOpen }: { tasks: KanbanTask[]; onOpen: (task: KanbanTask) => void }) {
  const today = todayKey();
  const horizon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const items = tasks
    .filter((t) => {
      if (!t.endDate || !isOpenTask(t)) return false;
      const due = t.endDate.slice(0, 10);
      return due > today && due <= horizon;
    })
    .sort((a, b) => (a.endDate || "").localeCompare(b.endDate || ""))
    .slice(0, 6);

  return (
    <SectionCard title="Upcoming" description="Due in the next 7 days" bodyClass="p-2">
      {items.length === 0 ? (
        <EmptyState title="Nothing upcoming" description="No open tasks are due in the next 7 days." />
      ) : (
        <div className="space-y-0.5">
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t)}
              className="group w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-700 truncate group-hover:text-blue-700">{t.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{t.code}</p>
              </div>
              <span className={cn("text-[10px] font-semibold border rounded-full px-1.5 py-0.5", PRIORITY_CHIP[t.priority] || "bg-slate-50 text-slate-500 border-slate-200")}>
                {t.priority}
              </span>
              <span className="text-[10px] text-slate-400 tabular-nums w-12 text-right">{t.endDate ? shortDate(t.endDate.slice(0, 10)) : ""}</span>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Right rail: Priority Overview (tiles + stacked bar, click = filter) ----
const PRIORITY_GROUPS: { key: string; label: string; members: string[]; color: string; tile: string }[] = [
  { key: "HIGH", label: "High", members: ["CRITICAL", "HIGH"], color: "#ef4444", tile: "bg-rose-50/70 border-rose-200 text-rose-700" },
  { key: "MEDIUM", label: "Medium", members: ["MEDIUM"], color: "#f59e0b", tile: "bg-amber-50/70 border-amber-200 text-amber-700" },
  { key: "LOW", label: "Low", members: ["LOW"], color: "#38bdf8", tile: "bg-sky-50/70 border-sky-200 text-sky-700" },
];

export function PriorityOverview({ tasks, active, onToggleGroup }: {
  tasks: KanbanTask[];
  active: Set<string>;
  onToggleGroup: (group: "HIGH" | "MEDIUM" | "LOW") => void;
}) {
  const open = tasks.filter(isOpenTask);
  const counts = PRIORITY_GROUPS.map((g) => ({
    ...g,
    count: open.filter((t) => g.members.includes(t.priority)).length,
  }));
  const total = open.length || 1;
  const anyActive = active.size > 0;

  return (
    <SectionCard title="Priority Overview" description="Open tasks by priority — click a tile to filter">
      <div className="grid grid-cols-3 gap-2">
        {counts.map((g) => {
          const isActive = anyActive && g.members.every((m) => active.has(m));
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onToggleGroup(g.key as "HIGH" | "MEDIUM" | "LOW")}
              aria-pressed={isActive}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-all",
                g.tile,
                isActive ? "ring-2 ring-slate-400/70 shadow-md" : "hover:shadow-sm"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide">{g.label}</p>
              <p className="text-xl font-semibold tabular-nums leading-tight">{g.count}</p>
              <p className="text-[10px] opacity-75 tabular-nums">{Math.round((g.count / total) * 100)}% of open</p>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Priority distribution">
        {counts.map((g) => (
          <div
            key={g.key}
            className="h-full transition-all"
            style={{ width: `${(g.count / total) * 100}%`, backgroundColor: g.color }}
            title={`${g.label}: ${g.count}`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{open.length} open tasks</span>
        <span>{tasks.length} total</span>
      </div>
    </SectionCard>
  );
}

// ---- Bottom row: Task Timeline (recently updated) ----
export function TaskTimeline({ tasks, onOpen }: { tasks: KanbanTask[]; onOpen: (task: KanbanTask) => void }) {
  const items = [...tasks]
    .filter((t) => t.updatedAt)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 7);

  return (
    <SectionCard title="Task Timeline" description="Most recently updated tasks">
      {items.length === 0 ? (
        <EmptyState title="No activity yet" description="Task updates will appear here as the team works." />
      ) : (
        <div className="space-y-1">
          {items.map((t) => {
            const p = presentationOf(t.status);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t)}
                className="group w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 transition-colors"
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", p.dot)} />
                <span className="text-[11px] font-mono text-slate-400 shrink-0">{t.code}</span>
                <span className="text-xs text-slate-700 truncate flex-1 group-hover:text-blue-700">{t.name}</span>
                <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">{relTime(t.updatedAt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ---- Bottom row: Team Workload (bars + share donut) ----
const WORKLOAD_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#94a3b8"];

export function TeamWorkload({ tasks }: { tasks: KanbanTask[] }) {
  const open = tasks.filter(isOpenTask);
  const groups = new Map<string, { id: string; name: string; color: string | null; url: string | null; count: number; points: number }>();
  for (const t of open) {
    const id = t.assignee?.id ?? "none";
    const g = groups.get(id) ?? { id, name: t.assignee?.name ?? "Unassigned", color: t.assignee?.avatarColor ?? null, url: t.assignee?.avatarUrl ?? null, count: 0, points: 0 };
    g.count += 1;
    g.points += t.storyPoints || 0;
    groups.set(id, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  const max = rows[0]?.count || 1;
  const top = rows.slice(0, 5);
  const topCount = top.reduce((s, r) => s + r.count, 0);
  const otherCount = open.length - topCount;
  const slices = top.map((r, i) => ({ value: r.count, color: WORKLOAD_COLORS[i % WORKLOAD_COLORS.length] }));
  if (otherCount > 0) slices.push({ value: otherCount, color: "#cbd5e1" });

  return (
    <SectionCard title="Team Workload" description="Open tasks by assignee">
      {rows.length === 0 ? (
        <EmptyState title="No open tasks" description="Everything is done or cancelled." />
      ) : (
        <div className="flex items-center gap-5">
          <div className="flex-1 min-w-0 space-y-2.5">
            {top.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <Avatar name={r.id === "none" ? null : r.name} color={r.color} url={r.id === "none" ? null : r.url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 truncate">{r.name}</span>
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{r.count} tasks · {r.points} pts</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(r.count / max) * 100}%`, backgroundColor: WORKLOAD_COLORS[i % WORKLOAD_COLORS.length] }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {otherCount > 0 && (
              <p className="text-[10px] text-slate-400 pl-7">+{otherCount} more with other assignees</p>
            )}
          </div>
          <MiniDonut
            slices={slices}
            size={92}
            thickness={12}
            center={<span className="text-base font-semibold text-slate-900 tabular-nums">{open.length}</span>}
            sub="open"
          />
        </div>
      )}
    </SectionCard>
  );
}
