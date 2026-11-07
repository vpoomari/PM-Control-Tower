"use client";
// PM CONTROL TOWER — Prioritized Task Dashboard (role-based landing for PMO & PM).
//
// Four widgets, measured against the current system date:
//   Overdue (Last 7 Days) — due date in the past 7 days, status still active
//   Due Today             — due date is today
//   Upcoming (Next 7 Days) — due date between tomorrow and day+7
//   Action Not Taken      — stalled work: awaiting approval, unassigned,
//                            blocked, unread
//
// The whole surface forces the app's dark theme (`.dark` wrapper → Tailwind
// `@custom-variant dark` + the dark CSS-variable scope in globals.css) with a
// deliberately high-contrast palette so it stays readable in a NOC / control
// room setting regardless of the user's theme preference.

import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarX2, ClockAlert, Inbox, ListChecks, RefreshCw, UserX, Ban } from "lucide-react";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import type { ActionNotTaken, PrioritiesPayload, PriorityInboxItem, PriorityTask } from "@/lib/priorities/dashboard";

// ---------------------------------------------------------------------------
// Theme atoms (high-contrast dark)
// ---------------------------------------------------------------------------

const STATUS_PILL: Record<string, string> = {
  NOT_STARTED: "border-slate-500/70 text-slate-300 bg-slate-700/50",
  IN_PROGRESS: "border-sky-400/70 text-sky-300 bg-sky-900/60",
  BLOCKED: "border-rose-400/70 text-rose-300 bg-rose-900/60",
  ON_HOLD: "border-violet-400/70 text-violet-300 bg-violet-900/60",
  COMPLETED: "border-emerald-400/70 text-emerald-300 bg-emerald-900/60",
  CANCELLED: "border-slate-500/70 text-slate-400 bg-slate-800/70",
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-rose-400",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-amber-300",
  LOW: "bg-sky-400",
};

function WidgetCard({
  label,
  hint,
  icon,
  count,
  accent,
  countTone,
  children,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  count: number;
  accent: string;
  countTone: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-900/70 shadow-[0_0_0_1px_rgba(15,23,42,.6),0_18px_40px_-24px_rgba(0,0,0,.9)] overflow-hidden">
      <header className={`flex items-center gap-3 border-b border-slate-700/80 bg-slate-950/70 px-4 py-3 border-l-4`} style={{ borderLeftColor: accent }}>
        <span className="shrink-0" style={{ color: accent }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-bold uppercase tracking-[.14em] text-white">{label}</h2>
          <p className="truncate text-[11px] text-slate-400">{hint}</p>
        </div>
        <span className={`text-3xl font-black tabular-nums leading-none ${countTone}`}>{count}</span>
      </header>
      <div className="max-h-[26rem] overflow-y-auto">{children}</div>
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-6 text-center text-[13px] text-slate-500">{text}</div>
  );
}

function dueBadge(task: PriorityTask, tone: "late" | "today" | "soon"): ReactNode {
  const d = task.dayDelta;
  if (d === null) return null;
  if (tone === "today") {
    return <Chip className="border-amber-400/70 bg-amber-900/70 text-amber-200">due today</Chip>;
  }
  if (tone === "late") {
    return <Chip className="border-rose-400/70 bg-rose-900/70 text-rose-200">{Math.max(d, 0)}d late</Chip>;
  }
  return <Chip className="border-cyan-400/70 bg-cyan-900/70 text-cyan-200">in {Math.max(-d, 0)}d</Chip>;
}

function Chip({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function openTask(task: PriorityTask): void {
  window.location.hash = `/tasks?focus=${task.id}`;
}

function TaskRow({ task, badge }: { task: PriorityTask; badge: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => openTask(task)}
      className="group flex w-full items-start gap-3 border-b border-slate-800/90 px-4 py-2.5 text-left transition-colors hover:bg-slate-800/70 focus:bg-slate-800/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? "bg-slate-400"}`} title={`${task.priority} priority`} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-cyan-300">{task.code}</span>
          <span className="truncate text-[13px] font-semibold text-slate-100">{task.name}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
          <span className="truncate">{task.project ? `${task.project.code} · ${task.project.name}` : "No project"}</span>
          <span className={`rounded border px-1.5 py-[0px] text-[10px] font-semibold uppercase ${STATUS_PILL[task.status] ?? "border-slate-500 text-slate-300"}`}>
            {task.status.replace(/_/g, " ").toLowerCase()}
          </span>
          <span className="text-slate-500">due {task.endDate ? task.endDate.slice(0, 10) : "—"}</span>
          {task.assignee ? <span className="truncate text-slate-500">· {task.assignee.name}</span> : <span className="font-semibold text-orange-300">· unassigned</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
        {badge}
        <ArrowRight className="h-3.5 w-3.5 text-slate-600 transition-colors group-hover:text-cyan-300" />
      </span>
    </button>
  );
}

function InboxRow({ item, onOpen }: { item: PriorityInboxItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-3 border-b border-slate-800/90 px-4 py-2.5 text-left transition-colors hover:bg-slate-800/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority] ?? "bg-slate-400"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-slate-100">{item.title}</span>
        <span className="mt-0.5 block text-[11px] text-slate-400">
          {item.category.replace(/_/g, " ").toLowerCase()} · opened {item.createdAt.slice(0, 10)}
          {item.dueDate ? ` · due ${item.dueDate.slice(0, 10)}` : ""}
        </span>
      </span>
      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600 transition-colors group-hover:text-cyan-300" />
    </button>
  );
}

function openInboxItem(item: PriorityInboxItem): void {
  const url = item.actionUrl;
  window.location.hash = url && url.startsWith("/") ? url : "/inbox";
}

// ---------------------------------------------------------------------------
// Action Not Taken — four disjoint facets
// ---------------------------------------------------------------------------

function FacetHeader({ icon, label, count, accent }: { icon: ReactNode; label: string; count: number; accent: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/60 px-4 py-2">
      <span style={{ color: accent }}>{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-300">{label}</span>
      <span className="ml-auto rounded-full border border-slate-600 bg-slate-800 px-2 text-[11px] font-bold tabular-nums text-slate-200">{count}</span>
    </div>
  );
}

function ActionNotTakenBody({ data }: { data: ActionNotTaken }) {
  const total =
    data.awaitingApproval.length + data.unread.length + data.unassigned.length + data.blocked.length;
  if (total === 0) {
    return <EmptyRow text="No stalled work — every item has an owner and nothing is waiting on you." />;
  }
  return (
    <div>
      {data.awaitingApproval.length > 0 && (
        <>
          <FacetHeader icon={<ListChecks className="h-3.5 w-3.5" />} label="Awaiting approval" count={data.awaitingApproval.length} accent="#c4b5fd" />
          {data.awaitingApproval.map((i) => <InboxRow key={i.id} item={i} onOpen={() => openInboxItem(i)} />)}
        </>
      )}
      {data.unassigned.length > 0 && (
        <>
          <FacetHeader icon={<UserX className="h-3.5 w-3.5" />} label="Unassigned" count={data.unassigned.length} accent="#fdba74" />
          {data.unassigned.map((t) => <TaskRow key={t.id} task={t} badge={<Chip className="border-orange-400/70 bg-orange-900/70 text-orange-200">no owner</Chip>} />)}
        </>
      )}
      {data.blocked.length > 0 && (
        <>
          <FacetHeader icon={<Ban className="h-3.5 w-3.5" />} label="Blocked" count={data.blocked.length} accent="#fda4af" />
          {data.blocked.map((t) => <TaskRow key={t.id} task={t} badge={<Chip className="border-rose-400/70 bg-rose-900/70 text-rose-200">blocked</Chip>} />)}
        </>
      )}
      {data.unread.length > 0 && (
        <>
          <FacetHeader icon={<Inbox className="h-3.5 w-3.5" />} label="Unread inbox" count={data.unread.length} accent="#7dd3fc" />
          {data.unread.map((i) => <InboxRow key={i.id} item={i} onOpen={() => openInboxItem(i)} />)}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function PrioritiesView() {
  const board = useApi<PrioritiesPayload>("/api/dashboard/priorities");
  useRealtimeRefetch(board.refetch, ["task:changed", "inbox:changed", "notification:changed"]);

  const data = board.data;
  const weekday = data
    ? new Date(`${data.today}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })
    : "";

  return (
    <div className="dark min-h-full bg-[#070b14] pb-10 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 pt-5">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Prioritized Task Dashboard</h1>
            <p className="mt-1 text-[13px] text-slate-400">
              {data ? (
                <>
                  <span className="font-semibold text-slate-200">{weekday}, {data.today}</span>
                  {" · "}
                  {data.scope === "PMO" ? "Organisation-wide view (PMO)" : "Your assignments & owned projects (PM)"}
                  {" · "}generated {new Date(data.generatedAt).toLocaleTimeString()}
                </>
              ) : (
                "Loading prioritized work for your role…"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => board.refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-[12px] font-semibold text-slate-200 transition-colors hover:border-cyan-400 hover:text-cyan-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${board.loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* States */}
        {board.error && (
          <div className="mb-5 rounded-lg border border-rose-500/60 bg-rose-950/60 px-4 py-3 text-[13px] text-rose-200">
            {board.error}{" "}
            <button type="button" onClick={() => board.refetch()} className="font-bold underline underline-offset-2">
              Retry
            </button>
          </div>
        )}
        {board.loading && !data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60" />
            ))}
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {/* 1 — Overdue (last 7 days) */}
            <WidgetCard
              label="Overdue (last 7 days)"
              hint="Due date in the past 7 days · status still active"
              icon={<CalendarX2 className="h-5 w-5" />}
              count={data.counts.overdue}
              accent="#fb7185"
              countTone="text-rose-300"
            >
              {data.overdue.length === 0 ? (
                <EmptyRow text="Nothing became overdue in the last 7 days." />
              ) : (
                data.overdue.map((t) => <TaskRow key={t.id} task={t} badge={dueBadge(t, "late")} />)
              )}
            </WidgetCard>

            {/* 2 — Due Today */}
            <WidgetCard
              label="Due Today"
              hint="Due date matches the current system date"
              icon={<ClockAlert className="h-5 w-5" />}
              count={data.counts.dueToday}
              accent="#fbbf24"
              countTone="text-amber-200"
            >
              {data.dueToday.length === 0 ? (
                <EmptyRow text="No tasks are due today." />
              ) : (
                data.dueToday.map((t) => <TaskRow key={t.id} task={t} badge={dueBadge(t, "today")} />)
              )}
            </WidgetCard>

            {/* 3 — Upcoming (next 7 days) */}
            <WidgetCard
              label="Upcoming (next 7 days)"
              hint="Due tomorrow through the next 7 days"
              icon={<CalendarClock className="h-5 w-5" />}
              count={data.counts.upcoming}
              accent="#22d3ee"
              countTone="text-cyan-200"
            >
              {data.upcoming.length === 0 ? (
                <EmptyRow text="Nothing falls due in the next 7 days." />
              ) : (
                data.upcoming.map((t) => <TaskRow key={t.id} task={t} badge={dueBadge(t, "soon")} />)
              )}
            </WidgetCard>

            {/* 4 — Action Not Taken */}
            <WidgetCard
              label="Action not taken"
              hint="Awaiting approval · unassigned · blocked · unread"
              icon={<AlertTriangle className="h-5 w-5" />}
              count={data.counts.actionNotTaken}
              accent="#c084fc"
              countTone="text-violet-300"
            >
              <ActionNotTakenBody data={data.actionNotTaken} />
            </WidgetCard>
          </div>
        )}

        {/* Footer note */}
        <p className="mt-5 text-[11px] text-slate-500">
          Windows are measured against the current system date. Overdue items receive a daily escalation e-mail
          until they are Completed, Cancelled or On Hold; due-today items trigger a single e-mail on their due
          date. Scope: PMO administrators see the whole organisation, project managers see their own work.
        </p>
      </div>
    </div>
  );
}
