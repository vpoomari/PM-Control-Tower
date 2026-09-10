"use client";
// PM CONTROL TOWER — EXECUTIVE CONTROL TOWER (dashboard)
// One source of truth: every figure originates from operational project data.

import { useMemo } from "react";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import { PageHeader, StatCard, SectionCard, StatusChip, LoadingBlock, ErrorBlock, ProgressBar, SeverityDot, EmptyState, RagBadge, Button } from "@/components/pmct/kit";
import { money, num, fmtDate } from "@/lib/constants";
import {
  ResponsiveContainer, PieChart, Pie, Cell, XAxis, YAxis, Tooltip as RTooltip,
  CartesianGrid, LineChart, Line, Legend, BarChart, Bar,
} from "recharts";
import { FolderKanban, Wallet, TrendingUp, AlertTriangle, CalendarClock, Landmark, ArrowUpRight, ArrowDownRight, Crown, ShieldAlert, Inbox as InboxIcon } from "lucide-react";

interface ExecutiveBundle {
  portfolios: { id: string; code: string; name: string; programCount: number; projectCount: number; budgetTarget: number; sums: { baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number } }[];
  projectKpis: { total: number; byStatus: { status: string; count: number }[]; byRag: { rag: string; count: number }[]; avgHealthScore: number };
  financials: { baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number };
  evmAverages: { projectCount: number; meanCpi: number; meanSpi: number; perProject: { projectId: string; cpi: number; spi: number; source: string; project?: { id: string; code: string; name: string } }[] };
  topRisks: { id: string; code: string; title: string; severity: string; score: number; status: string; projectCode?: string; projectName?: string }[];
  openAlerts: { id: string; title: string; severity: string; alertType: string; createdAt: string; projectCode?: string }[];
  overdueMilestones: { count: number; list: { id: string; name: string; dueDate: string; projectCode?: string }[] };
  capacityHotSpots: { resourceId: string; name: string; allocatedPercent: number; overAllocatedPercent: number }[];
  recentHealthChanges: { projectId: string; projectCode: string; projectName: string; capturedAt: string; ragStatus: string; previousRag: string; healthScore: number }[];
  governanceQueue: { pendingGates: { id: string; code: string; name: string; projectCode: string }[]; changeRequests: { id: string; code: string; title: string; status: string; projectCode: string }[] };
}
interface AnalyticsBundle {
  healthTimeline: { projectId: string; projectCode?: string; points?: { capturedAt: string; healthScore: number }[] }[];
  evmHistory: { projectId: string; projectCode?: string; points?: { statusDate: string; cpi: number; spi: number }[] }[];
  timesheetWeeks: { weekStart: string; hours: number }[];
  raidTrend: { month: string; count: number }[];
  throughput: { month: string; completed: number }[];
}

const RAG_COLORS = { GREEN: "#16a34a", AMBER: "#d97706", RED: "#dc2626" };
const countOf = (arr: { status?: string; rag?: string; count: number }[], key: string) =>
  arr.find((x) => x.status === key || x.rag === key)?.count ?? 0;

export default function Dashboard() {
  const exec = useApi<ExecutiveBundle>("/api/reports/executive");
  const analytics = useApi<AnalyticsBundle>("/api/reports/analytics");
  const refetchAll = () => { exec.refetch(); analytics.refetch(); };
  useRealtimeRefetch(refetchAll, ["project:health", "actuals:changed", "alert:created", "governance:changed", "evm:changed", "project:updated"]);

  const { data: data } = exec;
  const ragData = useMemo(() => {
    if (!data) return [];
    return ["GREEN", "AMBER", "RED"].map((k) => ({ name: k, value: countOf(data.projectKpis.byRag, k) }));
  }, [data]);

  if (exec.loading) return <LoadingBlock label="Assembling the control tower…" />;
  if (exec.error && /permission denied/i.test(exec.error)) {
    // Restricted role reached the Executive Control Tower directly (deep link).
    // Show a polished access panel instead of a raw permission error.
    return (
      <div className="space-y-5">
        <PageHeader
          title="Executive Control Tower"
          subtitle="Portfolio-wide oversight across programs, projects, finances and governance."
          breadcrumb={["Home", "Executive Control Tower"]}
        />
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-slate-200 bg-white">
          <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
          </div>
          <p className="text-sm font-semibold text-slate-800">Restricted area — executive clearance required</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-md leading-relaxed">
            The Executive Control Tower consolidates portfolio financials, EVM and governance queues and is
            available to roles holding the <span className="font-mono text-[11px] bg-slate-100 rounded px-1">executive.view</span> permission.
            Your current role does not include it — head to your workspace or contact your PMO administrator to request access.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => window.location.assign("#/inbox")}>
              <InboxIcon className="h-4 w-4 mr-1.5" /> Go to My Workspace
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.assign("#/projects")}>My Projects</Button>
          </div>
        </div>
      </div>
    );
  }
  if (exec.error || !data) return <ErrorBlock message={exec.error || "Executive bundle unavailable"} onRetry={exec.refetch} />;

  const f = data.financials;
  const budgetVariance = f.forecastCost - f.currentBudget;
  const utilPct = num((f.actualCost / (f.currentBudget || 1)) * 100, 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Control Tower"
        subtitle="One source of truth across portfolios, programs and projects — schedule, cost, risk and governance in real time."
        breadcrumb={["Home", "Executive Control Tower"]}
        actions={
          <Button size="sm" variant="outline" onClick={() => window.location.assign("#/reports/leadership")}>
            <Crown className="h-4 w-4 mr-1.5" /> Leadership Control Tower
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Portfolio Projects" value={data.projectKpis.total} sub={`${countOf(data.projectKpis.byStatus, "ACTIVE")} active · ${countOf(data.projectKpis.byStatus, "DRAFT")} draft`} icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Current Budget" value={money(f.currentBudget)} sub={`Baseline ${money(f.baselineBudget)}`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Actual Cost" value={money(f.actualCost)} sub={`${utilPct}% of budget`} tone={f.actualCost > f.currentBudget ? "bad" : "default"} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Forecast (EAC)" value={money(f.forecastCost)} sub={
          <span className={budgetVariance > 0 ? "inline-flex items-center gap-0.5 text-red-600" : "inline-flex items-center gap-0.5 text-emerald-600"}>
            {budgetVariance > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {money(Math.abs(budgetVariance))} {budgetVariance > 0 ? "over" : "under"}
          </span>
        } icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Portfolio CPI / SPI" value={`${data.evmAverages.meanCpi} / ${data.evmAverages.meanSpi}`} sub="Cost / schedule performance" tone={data.evmAverages.meanCpi < 0.95 || data.evmAverages.meanSpi < 0.95 ? "warn" : "good"} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* RAG distribution */}
        <SectionCard title="Project Health Distribution" description="Live RAG across the portfolio">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ragData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                  {ragData.map((entry) => <Cell key={entry.name} fill={RAG_COLORS[entry.name as keyof typeof RAG_COLORS]} />)}
                </Pie>
                <RTooltip />
                <Legend formatter={(v: string) => v.charAt(0) + v.slice(1).toLowerCase()} iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Portfolio investment */}
        <SectionCard title="Portfolio Investment View" description="Budget vs actual vs forecast" className="xl:col-span-2">
          {data.portfolios.length === 0 ? <EmptyState title="No portfolios yet" /> : (
            <div className="space-y-4">
              {data.portfolios.map((p) => {
                const rows = [
                  { label: "Current budget", value: p.sums.currentBudget, color: "#2563eb" },
                  { label: "Actual cost", value: p.sums.actualCost, color: "#0ea5e9" },
                  { label: "Forecast", value: p.sums.forecastCost, color: p.sums.forecastCost > p.sums.currentBudget ? "#dc2626" : "#94a3b8" },
                ];
                const max = Math.max(...rows.map((r) => r.value), 1);
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <a href={`#/portfolios`} className="text-sm font-medium text-slate-800 hover:text-blue-700">{p.name}</a>
                        <span className="text-xs text-slate-400">{p.code}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{p.projectCount} projects · {p.programCount} programs</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((r) => (
                        <div key={r.label} className="flex items-center gap-2">
                          <span className="w-24 text-[11px] text-slate-500">{r.label}</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color }} />
                          </div>
                          <span className="w-20 text-right text-[11px] tabular-nums text-slate-600">{money(r.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Top risks */}
        <SectionCard title="Top Risks" description="Highest scored exposures" actions={<a href="#/raid" className="text-xs text-blue-600 hover:underline">Open RAID</a>}>
          {data.topRisks.length === 0 ? <EmptyState title="No open risks" /> : (
            <div className="space-y-2.5">
              {data.topRisks.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5">
                  <SeverityDot severity={r.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 leading-snug truncate">{r.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.projectCode} · score {r.score} · {r.status.toLowerCase()}</p>
                  </div>
                  <StatusChip status={r.severity} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Governance alerts */}
        <SectionCard title="Governance Alerts" description="Automated threshold breaches" actions={<a href="#/governance" className="text-xs text-blue-600 hover:underline">Open queue</a>}>
          {data.openAlerts.length === 0 ? <EmptyState title="No active alerts" /> : (
            <div className="space-y-2.5">
              {data.openAlerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${a.severity === "CRITICAL" ? "text-red-500" : "text-amber-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 leading-snug">{a.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(a.createdAt)} · {a.alertType.toLowerCase().replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Capacity + milestones */}
        <SectionCard title="Capacity & Milestones" description="Resource load and schedule pressure" actions={<a href="#/resources" className="text-xs text-blue-600 hover:underline">Resources</a>}>
          {data.capacityHotSpots.length === 0 ? (
            <p className="text-xs text-slate-400 mb-3">No over-allocated resources.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {data.capacityHotSpots.map((c) => (
                <div key={c.resourceId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{c.name}</span>
                    <span className={`text-xs tabular-nums font-semibold ${c.allocatedPercent > 100 ? "text-red-600" : "text-slate-600"}`}>{num(c.allocatedPercent, 0)}%</span>
                  </div>
                  <ProgressBar value={Math.min(100, c.allocatedPercent)} tone={c.allocatedPercent > 100 ? undefined : "blue"} />
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Overdue milestones ({data.overdueMilestones.count})</p>
            {data.overdueMilestones.list.length === 0 ? <p className="text-xs text-slate-400">None — schedule is healthy.</p> : (
              <div className="space-y-1.5">
                {data.overdueMilestones.list.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-700">{m.name} <span className="text-slate-400">{m.projectCode}</span></span>
                    <span className="text-red-600 tabular-nums ml-2 shrink-0">{fmtDate(m.dueDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* EVM per project + delivery trend */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Earned Value by Project" description="CPI / SPI from the latest period close">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.evmAverages.perProject.map((p) => ({ name: p.project?.code ?? p.projectId.slice(-4), CPI: p.cpi, SPI: p.spi }))} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis domain={[0, 1.5]} tick={{ fontSize: 10, fill: "#64748b" }} width={30} />
                <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span className="text-xs text-slate-600">{v}</span>} />
                <Bar dataKey="CPI" fill="#2563eb" radius={[3, 3, 0, 0]} />
                <Bar dataKey="SPI" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Actual Hours Trend" description="Approved timesheet hours by week — effort feeds cost and EVM">
          {!analytics.data || analytics.data.timesheetWeeks.length === 0 ? <EmptyState title="No approved hours yet" /> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.data.timesheetWeeks.map((w) => ({ week: String(w.weekStart).slice(5, 10), hours: w.hours }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={34} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line name="Approved hours" dataKey="hours" type="monotone" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Governance queue + motto */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Governance Queue" description="Decisions awaiting the enterprise" className="xl:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Stage gates pending ({data.governanceQueue.pendingGates.length})</p>
              {data.governanceQueue.pendingGates.slice(0, 4).map((g) => (
                <div key={g.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate text-slate-600">{g.name}</span>
                  <span className="text-slate-400 ml-2 shrink-0">{g.projectCode}</span>
                </div>
              ))}
              {data.governanceQueue.pendingGates.length === 0 && <p className="text-xs text-slate-400">Queue clear.</p>}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Change requests in flight ({data.governanceQueue.changeRequests.length})</p>
              {data.governanceQueue.changeRequests.slice(0, 4).map((cr) => (
                <div key={cr.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate text-slate-600">{cr.code} — {cr.title}</span>
                  <StatusChip status={cr.status} className="ml-2 shrink-0" />
                </div>
              ))}
              {data.governanceQueue.changeRequests.length === 0 && <p className="text-xs text-slate-400">Queue clear.</p>}
            </div>
          </div>
        </SectionCard>
        <div className="rounded-lg bg-[#0b1f3a] text-white p-5 flex flex-col justify-between">
          <div>
            <Landmark className="h-5 w-5 text-sky-300 mb-2" />
            <p className="text-sm font-semibold leading-relaxed">PLAN → EXECUTE → MONITOR<br />→ CONTROL → GOVERN → DELIVER</p>
            {data.recentHealthChanges.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Recent health changes</p>
                {data.recentHealthChanges.slice(0, 3).map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-300 truncate">{h.projectCode}</span>
                    <StatusChip status={h.previousRag} />
                    <span className="text-slate-500">→</span>
                    <StatusChip status={h.ragStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mt-4">One Platform · Complete Project Intelligence · Greater Outcomes</p>
        </div>
      </div>
    </div>
  );
}
