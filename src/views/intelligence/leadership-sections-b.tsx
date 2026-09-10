"use client";
// PM CONTROL TOWER — Leadership sections B: What Changed, Risk, Issue, Milestone,
// Financial, Resource, Schedule, Dependency reports

import {
  SectionCard, StatCard, DataTable, Column, StatusChip, Badge, Metric, EmptyState, cn,
} from "@/components/pmct/kit";
import { fmtDate, money, num } from "@/lib/constants";
import type { LeadershipBundle } from "@/lib/engines/leadership";
import {
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Clock, Wallet, Users, CalendarClock,
  Network, Flag, ShieldAlert,
} from "lucide-react";

const tone = (t: "good" | "bad" | "neutral") => t === "good" ? "border-emerald-100 bg-emerald-50/60 text-emerald-800" : t === "bad" ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600";
const Count = ({ v, good }: { v: number; good?: boolean }) => (
  <span className={cn("tabular-nums font-semibold", v === 0 ? "text-slate-400" : good ? "text-emerald-600" : "text-red-600")}>{v}</span>
);

// ================= WHAT CHANGED =================
export function WhatChangedSection({ d }: { d: LeadershipBundle }) {
  return (
    <SectionCard
      title="Since Last Report — what changed"
      description={d.sinceLabel}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {d.changed.map((c, i) => (
          <div key={i} className={cn("rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2", tone(c.tone))}>
            {c.tone === "good" ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              : c.tone === "bad" ? <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              : <MinusCircle className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />}
            <div><span className="font-semibold">{c.label}</span><p className="mt-0.5 opacity-90">{c.text}</p></div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ================= RISK DASHBOARD =================
export function RiskSection({ d }: { d: LeadershipBundle }) {
  const r = d.risks;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Open risks" value={r.total} />
        <StatCard label="Critical" value={r.bySeverity.CRITICAL ?? 0} tone={r.bySeverity.CRITICAL ? "bad" : "good"} />
        <StatCard label="New (14d)" value={r.newCount} tone={r.newCount ? "warn" : undefined} />
        <StatCard label="Escalated" value={r.escalated} tone={r.escalated ? "warn" : undefined} />
        <StatCard label="No mitigation" value={r.noMitigation} tone={r.noMitigation ? "bad" : "good"} />
        <StatCard label="No owner" value={r.noOwner} tone={r.noOwner ? "bad" : "good"} />
      </div>
      <SectionCard title="Critical risks — full detail" description="Probability × impact × exposure × owner × mitigation × target resolution × potential project impact. Critical risks escalate automatically.">
        {r.critical.length === 0 ? <EmptyState title="No critical risks open" /> : (
          <div className="space-y-2">
            {r.critical.map((k) => (
              <div key={k.code} className="rounded-lg border border-red-200 bg-red-50/60 px-3.5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] bg-white border-red-200 text-red-700 font-mono">{k.code}</Badge>
                  <Badge variant="outline" className="text-[9px] bg-red-600 text-white border-0">SCORE {k.score}</Badge>
                  <span className="text-xs font-semibold text-slate-800">{k.title}</span>
                  <span className="ml-auto text-[10px] text-slate-500">{k.projectCode} · {k.status}</span>
                </div>
                <div className="grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <span>Probability <b>{k.probability}/5</b> · Impact <b>{k.impact}/5</b></span>
                  <span>Exposure <b>{k.score * 1000}</b></span>
                  <span>Owner <b>{k.owner ?? "UNASSIGNED"}</b></span>
                  <span>Target resolution <b>{fmtDate(k.dueDate)}</b></span>
                  <span className="sm:col-span-2 lg:col-span-4">Mitigation: <b>{k.mitigation ?? "NONE — unmanaged exposure"}</b>{k.impactNote ? ` — ${k.impactNote}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Aging risks (>60d)" value={r.aging} tone={r.aging ? "text-amber-600" : undefined} />
        <Metric label="Trigger/review within 14d" value={r.triggerApproaching} tone={r.triggerApproaching ? "text-amber-600" : undefined} />
        <Metric label="High severity" value={r.bySeverity.HIGH ?? 0} />
      </div>
    </div>
  );
}

// ================= ISSUE & ESCALATION =================
export function IssueSection({ d }: { d: LeadershipBundle }) {
  const i = d.issues;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Open issues" value={i.total} />
        <StatCard label="Critical" value={i.critical} tone={i.critical ? "bad" : "good"} />
        <StatCard label="Aging (>30d)" value={i.aging} tone={i.aging ? "warn" : undefined} />
        <StatCard label="Overdue" value={i.overdue} tone={i.overdue ? "bad" : "good"} />
        <StatCard label="No owner" value={i.noOwner} tone={i.noOwner ? "bad" : "good"} />
        <StatCard label="Leadership escalation" value={i.leadershipIntervention} tone={i.leadershipIntervention ? "warn" : undefined} />
      </div>
      <SectionCard title="Issue register — Problem → Impact → Owner → Action → Deadline → Escalation → Resolution">
        <DataTable
          keyField="code"
          rows={i.list as never[]}
          maxHeight="480px"
          columns={[
            { key: "code", header: "Issue", render: (r: never) => { const x = r as LeadershipBundle["issues"]["list"][number]; return <div><p className="text-xs font-medium text-slate-800">{x.code} · {x.title}</p><p className="text-[10px] text-slate-400">{x.projectCode}</p></div>; } },
            { key: "severity", header: "Severity", render: (r: never) => <StatusChip status={(r as LeadershipBundle["issues"]["list"][number]).severity} /> },
            { key: "owner", header: "Owner", render: (r: never) => <span className="text-[11px]">{(r as LeadershipBundle["issues"]["list"][number]).owner ?? <span className="text-red-500 font-semibold">UNASSIGNED</span>}</span> },
            { key: "impact", header: "Impact", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[200px] block">{(r as LeadershipBundle["issues"]["list"][number]).impact ?? "—"}</span> },
            { key: "action", header: "Action / Resolution", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[200px] block">{(r as LeadershipBundle["issues"]["list"][number]).action ?? "pending"}</span> },
            { key: "dueDate", header: "Deadline", render: (r: never) => <span className={cn("text-[11px] tabular-nums", (r as LeadershipBundle["issues"]["list"][number]).overdue && "text-red-600 font-semibold")}>{fmtDate((r as LeadershipBundle["issues"]["list"][number]).dueDate)}</span> },
            { key: "age", header: "Age", render: (r: never) => <span className="text-[11px] tabular-nums text-slate-500">{(r as LeadershipBundle["issues"]["list"][number]).ageDays}d</span> },
          ] as Column<never>[]}
        />
      </SectionCard>
    </div>
  );
}

// ================= MILESTONES =================
export function MilestoneSection({ d }: { d: LeadershipBundle }) {
  const m = d.milestones;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Completed" value={m.completed} />
        <StatCard label="Upcoming" value={m.upcoming} />
        <StatCard label="Delayed" value={m.delayed} tone={m.delayed ? "bad" : "good"} />
        <StatCard label="At risk (30d)" value={m.atRisk} tone={m.atRisk ? "warn" : undefined} />
        <StatCard label="Gate-linked" value={m.requiringApproval} />
        <StatCard label="Requiring approval" value={m.requiringApproval} />
      </div>
      <SectionCard title="Milestone control report" description="Original date vs forecast vs variance vs reason vs recovery — at-risk and delayed milestones first">
        {m.list.length === 0 ? <EmptyState title="No delayed or at-risk milestones" /> : (
          <DataTable
            keyField="code"
            rows={m.list as never[]}
            maxHeight="480px"
            columns={[
              { key: "name", header: "Milestone", render: (r: never) => { const x = r as LeadershipBundle["milestones"]["list"][number]; return <div><p className="text-xs font-medium text-slate-800">{x.name}{x.critical ? " 🚩" : ""}</p><p className="text-[10px] text-slate-400 font-mono">{x.projectCode} · {x.code}</p></div>; } },
              { key: "status", header: "Status", render: (r: never) => <StatusChip status={(r as LeadershipBundle["milestones"]["list"][number]).status} /> },
              { key: "baseline", header: "Original", render: (r: never) => <span className="text-[11px] tabular-nums">{fmtDate((r as LeadershipBundle["milestones"]["list"][number]).baselineDate)}</span> },
              { key: "forecast", header: "Forecast", render: (r: never) => <span className="text-[11px] tabular-nums">{fmtDate((r as LeadershipBundle["milestones"]["list"][number]).forecastDate)}</span> },
              { key: "variance", header: "Variance", render: (r: never) => { const x = r as LeadershipBundle["milestones"]["list"][number]; return <span className={cn("text-[11px] font-semibold tabular-nums", (x.varianceDays ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>{x.varianceDays !== null ? `${x.varianceDays > 0 ? "+" : ""}${x.varianceDays}d` : "—"}</span>; } },
              { key: "reason", header: "Reason / recovery", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[240px] block">{(r as LeadershipBundle["milestones"]["list"][number]).reason ?? "—"}</span> },
            ] as Column<never>[]}
          />
        )}
      </SectionCard>
    </div>
  );
}

// ================= FINANCIAL =================
export function FinancialSection({ d }: { d: LeadershipBundle }) {
  const f = d.financial;
  const t = d.tower.budget;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Approved budget" value={money(t.approved)} sub={`Baseline ${money(t.baseline)}`} />
        <StatCard label="Actual expenditure" value={money(t.actual)} sub={`Committed ${money(t.committed)}`} />
        <StatCard label="Forecast at completion" value={money(t.forecast)} tone={t.variance > 0 ? "bad" : "good"} sub={`Variance ${t.variancePct >= 0 ? "+" : ""}${t.variancePct}%`} />
        <StatCard label="Overruns / deteriorating" value={`${f.overruns} / ${f.deteriorating}`} tone={f.overruns ? "bad" : undefined} sub={`Thresholds near: ${f.thresholdsBreached}`} />
      </div>
      <SectionCard title="Executive financial dashboard" description="Are we within budget? If not, why? What is the forecast? What action is required? — trend compares against the previous report snapshot">
        <DataTable
          keyField="code"
          rows={f.rows as never[]}
          maxHeight="480px"
          columns={[
            { key: "code", header: "Project", render: (r: never) => { const x = r as LeadershipBundle["financial"]["rows"][number]; return <div><p className="text-xs font-medium text-slate-800">{x.code}</p><p className="text-[10px] text-slate-400 truncate max-w-[180px]">{x.name}</p></div>; } },
            { key: "status", header: "Status", render: (r: never) => <StatusChip status={(r as LeadershipBundle["financial"]["rows"][number]).status} /> },
            { key: "approved", header: "Approved", render: (r: never) => <span className="text-[11px] tabular-nums">{money((r as LeadershipBundle["financial"]["rows"][number]).approved)}</span> },
            { key: "actual", header: "Actual", render: (r: never) => <span className="text-[11px] tabular-nums">{money((r as LeadershipBundle["financial"]["rows"][number]).actual)}</span> },
            { key: "committed", header: "Committed", render: (r: never) => <span className="text-[11px] tabular-nums text-slate-500">{money((r as LeadershipBundle["financial"]["rows"][number]).committed)}</span> },
            { key: "forecast", header: "Forecast", render: (r: never) => <span className="text-[11px] tabular-nums font-medium">{money((r as LeadershipBundle["financial"]["rows"][number]).forecast)}</span> },
            { key: "variance", header: "Variance", render: (r: never) => { const x = r as LeadershipBundle["financial"]["rows"][number]; return <span className={cn("text-[11px] font-semibold tabular-nums", x.variance > 0 ? "text-red-600" : "text-emerald-600")}>{x.variancePct >= 0 ? "+" : ""}{x.variancePct}%</span>; } },
            { key: "trend", header: "Trend vs last report", render: (r: never) => { const x = r as LeadershipBundle["financial"]["rows"][number]; return x.trendPct === null ? <span className="text-[10px] text-slate-300">no prior</span> : <span className={cn("text-[11px] font-medium tabular-nums", x.trendPct > 5 ? "text-red-600" : x.trendPct < -5 ? "text-emerald-600" : "text-slate-500")}>{x.trendPct >= 0 ? "+" : ""}{x.trendPct}%</span>; } },
          ] as Column<never>[]}
        />
      </SectionCard>
    </div>
  );
}

// ================= RESOURCES =================
export function ResourceSection({ d }: { d: LeadershipBundle }) {
  const r = d.resources;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Portfolio utilization" value={`${r.utilizationPct}%`} sub={`${num(r.allocatedHours)} of ${num(r.capacityHours)} hrs/week`} />
        <StatCard label="Over-allocated" value={r.over.length} tone={r.over.length ? "bad" : "good"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Underutilized" value={r.under.length} tone="good" />
        <StatCard label="Skill bottlenecks" value={r.shortages.length} tone={r.shortages.length ? "warn" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Over-allocated resources" description="Over 100% allocation — may affect tasks, milestones, schedule, quality and budget">
          {r.over.length === 0 ? <EmptyState title="No over-allocation" /> : (
            <div className="space-y-1.5">
              {r.over.map((o) => (
                <div key={o.employeeCode} className="flex items-center gap-3 rounded-md border border-red-100 bg-red-50/60 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-800">{o.name}</p><p className="text-[10px] text-slate-500">{o.department ?? "—"} · {o.primarySkill ?? "—"} · {o.projects.length} project(s)</p></div>
                  <span className="text-sm font-bold text-red-600 tabular-nums">{o.allocatedPct}%</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Capacity concerns" description="Conflicts and shortages that leadership may need to arbitrate">
          {r.conflicts.length === 0 && r.shortages.length === 0 ? <EmptyState title="No resource conflicts" /> : (
            <div className="space-y-1.5 text-xs">
              {r.conflicts.map((c) => <p key={c.employeeCode} className="text-slate-600">• <b>{c.name}</b> split across {c.projects.length} projects at {c.allocatedPct}% total</p>)}
              {r.shortages.map((s) => <p key={s} className="text-slate-600">• Critical skill shortage: <b>{s}</b></p>)}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ================= SCHEDULE =================
export function ScheduleSection({ d }: { d: LeadershipBundle }) {
  const s = d.scheduleReport;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Baseline vs forecast" value={`${s.rows.filter((r) => (r.varianceDays ?? 0) > 0).length} slipped`} tone={s.criticalConcerns ? "warn" : "good"} />
        <StatCard label="Critical path concerns" value={s.criticalConcerns} tone={s.criticalConcerns ? "bad" : "good"} icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Milestone movements" value={s.rows.reduce((a, r) => a + r.milestoneMoves, 0)} />
      </div>
      <SectionCard title="Schedule performance — baseline vs current vs forecast" description="Projects where delays may affect business commitments are flagged automatically">
        <DataTable
          keyField="code"
          rows={s.rows as never[]}
          maxHeight="480px"
          columns={[
            { key: "code", header: "Project", render: (r: never) => { const x = r as LeadershipBundle["scheduleReport"]["rows"][number]; return <div><p className="text-xs font-medium text-slate-800">{x.code}</p><p className="text-[10px] text-slate-400 truncate max-w-[160px]">{x.name}</p></div>; } },
            { key: "baseline", header: "Baseline finish", render: (r: never) => <span className="text-[11px] tabular-nums">{fmtDate((r as LeadershipBundle["scheduleReport"]["rows"][number]).baselineFinish)}</span> },
            { key: "current", header: "Current finish", render: (r: never) => <span className="text-[11px] tabular-nums">{fmtDate((r as LeadershipBundle["scheduleReport"]["rows"][number]).currentFinish)}</span> },
            { key: "forecast", header: "Forecast finish", render: (r: never) => <span className="text-[11px] tabular-nums font-medium">{fmtDate((r as LeadershipBundle["scheduleReport"]["rows"][number]).forecastFinish)}</span> },
            { key: "variance", header: "Variance", render: (r: never) => { const x = r as LeadershipBundle["scheduleReport"]["rows"][number]; return <span className={cn("text-[11px] font-semibold tabular-nums", (x.varianceDays ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>{x.varianceDays !== null ? `${x.varianceDays > 0 ? "+" : ""}${x.varianceDays}d` : "—"}</span>; } },
            { key: "delayed", header: "Delayed activities", render: (r: never) => <Count v={(r as LeadershipBundle["scheduleReport"]["rows"][number]).delayedActivities} good /> },
            { key: "moves", header: "Milestone moves", render: (r: never) => <Count v={(r as LeadershipBundle["scheduleReport"]["rows"][number]).milestoneMoves} good /> },
            { key: "risk", header: "Business commitment", render: (r: never) => { const x = r as LeadershipBundle["scheduleReport"]["rows"][number]; return x.businessCommitmentRisk ? <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200">AT RISK</Badge> : <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-600 border-emerald-200">SECURE</Badge>; } },
          ] as Column<never>[]}
        />
      </SectionCard>
    </div>
  );
}

// ================= DEPENDENCIES =================
export function DependencySection({ d }: { d: LeadershipBundle }) {
  const dep = d.dependencies;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open dependencies" value={dep.open} icon={<Network className="h-4 w-4" />} />
        <StatCard label="Blocked" value={dep.blocked} tone={dep.blocked ? "bad" : "good"} />
        <StatCard label="Overdue" value={dep.overdue} tone={dep.overdue ? "bad" : "good"} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Affecting critical paths" value={dep.affectingMilestones} tone={dep.affectingMilestones ? "warn" : undefined} />
      </div>
      <SectionCard title="Cross-project & external dependencies" description="Downstream impact calculated automatically — delays propagate along the critical path">
        {dep.crossProject.length === 0 ? <EmptyState title="No cross-project dependencies" /> : (
          <div className="space-y-2">
            {dep.crossProject.map((x) => (
              <div key={x.id} className={cn("rounded-lg border px-3.5 py-2.5", x.status === "BLOCKED" ? "border-red-200 bg-red-50" : x.status === "OVERDUE" ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-white")}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] font-mono bg-white">{x.fromProject} → {x.toProject}</Badge>
                  <StatusChip status={x.status} />
                  <span className="text-[10px] text-slate-400">{x.depType}</span>
                </div>
                <p className="text-xs text-slate-700">{x.predecessor} <span className="text-slate-400">→</span> {x.successor}</p>
                <p className="text-[11px] text-slate-500 mt-1"><b>Downstream impact:</b> {x.downstreamImpact}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
