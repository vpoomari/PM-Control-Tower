"use client";
// PM CONTROL TOWER — EXECUTIVE CONTROL TOWER (dashboard)
// One source of truth: every figure originates from operational project data.
// Futuristic command-center presentation: glass/HUD surfaces, pure-SVG 3D charts
// (isometric bars, extruded donut, perspective area, radial gauges), live telemetry.

import React, { useMemo } from "react";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import { PageHeader, StatusChip, LoadingBlock, ErrorBlock, ProgressBar, SeverityDot, EmptyState, Button, LiveBadge } from "@/components/pmct/kit";
import { Panel, HoloStat, Bar3D, Donut3D, Area3D, Gauge3D, shade } from "@/components/pmct/charts3d";
import { AiOverdueBrief } from "@/views/dashboard/ai-overdue-brief";
import { money, num, fmtDate } from "@/lib/constants";
import {
  FolderKanban, Wallet, TrendingUp, AlertTriangle, CalendarClock, Landmark, ArrowUpRight, ArrowDownRight, Crown, ShieldAlert, Inbox as InboxIcon,
  Radar, Activity, Boxes, Gauge as GaugeIcon, Waves,
} from "lucide-react";

interface ExecutiveBundle {
  generatedAt?: string;
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
  timesheetWeeks: { weekStart: string; totalHours: number; billableHours: number }[];
  raidTrend: { month: string; count: number }[];
  throughput: { month: string; completed: number }[];
}

const RAG_COLORS = { GREEN: "#10b981", AMBER: "#f59e0b", RED: "#f43f5e", GREY: "#94a3b8" };
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
    return ["GREEN", "AMBER", "RED"].map((k) => ({ name: k, value: countOf(data.projectKpis.byRag, k) })).filter((x) => x.value > 0);
  }, [data]);

  // Aggregated trend series (portfolio-level, last 12 points)
  const spark = useMemo(() => {
    const a = analytics.data;
    if (!a) return { health: [] as number[], cpi: [] as number[], hours: [] as number[] };
    const byDate = new Map<string, number[]>();
    for (const tl of a.healthTimeline) for (const p of tl.points ?? []) {
      const arr = byDate.get(p.capturedAt) ?? []; arr.push(p.healthScore); byDate.set(p.capturedAt, arr);
    }
    const health = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]))
      .map(([, v]) => v.reduce((s, n) => s + n, 0) / v.length).slice(-12);
    const cpiByDate = new Map<string, number[]>();
    for (const ev of a.evmHistory) for (const p of ev.points ?? []) {
      const arr = cpiByDate.get(p.statusDate) ?? []; arr.push(p.cpi); cpiByDate.set(p.statusDate, arr);
    }
    const cpi = [...cpiByDate.entries()].sort((x, y) => x[0].localeCompare(y[0]))
      .map(([, v]) => v.reduce((s, n) => s + n, 0) / v.length).slice(-12);
    const hours = a.timesheetWeeks.map((w) => w.totalHours).slice(-12);
    return { health, cpi, hours };
  }, [analytics.data]);

  // 3D chart series
  const investmentGroups = useMemo(() => {
    if (!data) return [];
    return data.portfolios.map((p) => ({
      label: p.code.replace(/^PRJ-|^CZR-/, "").slice(0, 10) || p.name.slice(0, 10),
      sublabel: p.name,
      values: [p.sums.currentBudget, p.sums.actualCost, p.sums.forecastCost],
      onClick: () => { window.location.hash = "/portfolios"; },
    }));
  }, [data]);

  const evmGroups = useMemo(() => {
    if (!data) return [];
    return data.evmAverages.perProject.slice(0, 8).map((p) => ({
      label: (p.project?.code ?? p.projectId.slice(-4)).replace(/^PRJ-/, ""),
      sublabel: p.project?.name ?? p.project?.code ?? p.projectId,
      values: [p.cpi, p.spi],
      onClick: () => { window.location.hash = `/projects/${p.projectId}`; },
    }));
  }, [data]);

  const hoursPoints = useMemo(() => {
    const w = analytics.data?.timesheetWeeks ?? [];
    return w.slice(-14).map((x) => ({ label: String(x.weekStart).slice(5, 10), value: x.totalHours }));
  }, [analytics.data]);

  const goTo = (hash: string) => { window.location.hash = hash; };

  if (exec.loading) return <LoadingBlock label="Assembling the control tower…" />;
  if (exec.error && /permission denied/i.test(exec.error)) {
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
  const meanCpi = Number(data.evmAverages.meanCpi) || 0;
  const meanSpi = Number(data.evmAverages.meanSpi) || 0;

  return (
    <div className="space-y-5">
      {/* ============ COMMAND HEADER ============ */}
      <PageHeader
        title="Executive Control Tower"
        subtitle="One source of truth across portfolios, programs and projects — schedule, cost, risk and governance in real time."
        breadcrumb={["Home", "Executive Control Tower"]}
        actions={
          <div className="flex items-center gap-2">
            {data.generatedAt && <LiveBadge at={data.generatedAt} />}
            <Button size="sm" variant="outline" onClick={() => window.location.assign("#/reports/leadership")}>
              <Crown className="h-4 w-4 mr-1.5" /> Leadership Control Tower
            </Button>
          </div>
        }
      />

      {/* ============ LIVE TELEMETRY STRIP (HUD) ============ */}
      <div className="relative overflow-hidden rounded-xl border border-slate-700/70 bg-gradient-to-r from-[#071429] via-[#0b1f3a] to-[#0a1a33] text-white shadow-[0_20px_50px_-25px_rgba(2,6,23,0.9)]">
        {/* grid + glow decoration */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: "linear-gradient(rgba(56,189,248,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.12) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-14 -bottom-24 h-52 w-52 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="relative grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: <Boxes className="h-4 w-4" />, label: "Portfolio", value: String(data.projectKpis.total), sub: `${countOf(data.projectKpis.byStatus, "ACTIVE")} active · ${countOf(data.projectKpis.byStatus, "DRAFT")} draft`, tone: "text-cyan-300" },
            { icon: <Activity className="h-4 w-4" />, label: "Health score", value: `${Math.round(data.projectKpis.avgHealthScore || 0)}`, sub: "Portfolio average / 100", tone: "text-emerald-300" },
            { icon: <GaugeIcon className="h-4 w-4" />, label: "EVM indices", value: `${meanCpi.toFixed(2)} / ${meanSpi.toFixed(2)}`, sub: "CPI / SPI", tone: meanCpi < 0.95 || meanSpi < 0.95 ? "text-amber-300" : "text-emerald-300" },
            { icon: <Wallet className="h-4 w-4" />, label: "Forecast", value: money(f.forecastCost), sub: `${budgetVariance > 0 ? "+" : ""}${money(budgetVariance)} vs budget`, tone: budgetVariance > 0 ? "text-rose-300" : "text-emerald-300" },
            { icon: <ShieldAlert className="h-4 w-4" />, label: "Alerts", value: String(data.openAlerts.length), sub: `${data.overdueMilestones.count} overdue milestones`, tone: data.openAlerts.length ? "text-amber-300" : "text-emerald-300" },
            { icon: <Radar className="h-4 w-4" />, label: "Governance", value: String(data.governanceQueue.pendingGates.length + data.governanceQueue.changeRequests.length), sub: `${data.governanceQueue.pendingGates.length} gates · ${data.governanceQueue.changeRequests.length} CRs`, tone: "text-sky-300" },
          ].map((t) => (
            <div key={t.label} className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm">
              <span className={`mt-0.5 ${t.tone}`}>{t.icon}</span>
              <div className="min-w-0">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t.label}</p>
                <p className={`text-lg font-semibold leading-tight tabular-nums ${t.tone}`}>{t.value}</p>
                <p className="truncate text-[10px] text-slate-400">{t.sub}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Plan → Execute → Monitor → Control → Govern → Deliver</p>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-400/80">One Platform · Complete Project Intelligence · Greater Outcomes</p>
        </div>
      </div>

      {/* ============ KPI HOLO TILES — every card drills into its source ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <HoloStat label="Portfolio Projects" value={data.projectKpis.total}
          sub={`${countOf(data.projectKpis.byStatus, "ACTIVE")} active · ${countOf(data.projectKpis.byStatus, "DRAFT")} draft`}
          icon={<FolderKanban className="h-3.5 w-3.5" />} accent="#2563eb"
          spark={spark.health.length > 1 ? spark.health : undefined} hint="Open the project register"
          onClick={() => goTo("/projects")} />
        <HoloStat label="Current Budget" value={money(f.currentBudget)} sub={`Baseline ${money(f.baselineBudget)}`}
          icon={<Wallet className="h-3.5 w-3.5" />} accent="#0ea5e9" hint="Open financials"
          onClick={() => goTo("/financials")} />
        <HoloStat label="Actual Cost" value={money(f.actualCost)} sub={`${utilPct}% of budget`}
          icon={<Wallet className="h-3.5 w-3.5" />} accent={f.actualCost > f.currentBudget ? "#f43f5e" : "#10b981"}
          spark={spark.hours.length > 1 ? spark.hours : undefined} hint="Open financials"
          onClick={() => goTo("/financials")} />
        <HoloStat label="Forecast (EAC)" value={money(f.forecastCost)}
          sub={
            <span className={budgetVariance > 0 ? "inline-flex items-center gap-0.5 text-rose-600" : "inline-flex items-center gap-0.5 text-emerald-600"}>
              {budgetVariance > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {money(Math.abs(budgetVariance))} {budgetVariance > 0 ? "over" : "under"}
            </span>
          }
          icon={<TrendingUp className="h-3.5 w-3.5" />} accent={budgetVariance > 0 ? "#f43f5e" : "#10b981"}
          delta={data.evmAverages.projectCount ? { value: Number(num(((f.forecastCost - f.currentBudget) / (f.currentBudget || 1)) * 100, 1)), unit: "%", good: budgetVariance <= 0, label: "Forecast vs current budget" } : undefined}
          hint="Open EVM control" onClick={() => goTo("/evm")} />
        <HoloStat label="Portfolio CPI / SPI" value={`${meanCpi.toFixed(2)} / ${meanSpi.toFixed(2)}`}
          sub="Cost / schedule performance"
          icon={<TrendingUp className="h-3.5 w-3.5" />} accent={meanCpi < 0.95 || meanSpi < 0.95 ? "#f59e0b" : "#10b981"}
          spark={spark.cpi.length > 1 ? spark.cpi : undefined} hint="Open EVM control"
          onClick={() => goTo("/evm")} />
      </div>

      {/* ============ 3D HEALTH + INVESTMENT ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Project Health Matrix" subtitle="Extruded 3D RAG distribution — click a slice to open projects"
          accent="#10b981" icon={<Radar className="h-3.5 w-3.5" />}>
          {ragData.length === 0 ? <EmptyState title="No projects yet" /> : (
            <Donut3D
              slices={ragData.map((r) => ({
                label: r.name.charAt(0) + r.name.slice(1).toLowerCase(),
                value: r.value,
                color: RAG_COLORS[r.name as keyof typeof RAG_COLORS] ?? "#94a3b8",
                onClick: () => goTo("/projects"),
              }))}
              centerValue={String(data.projectKpis.total)}
              centerLabel="projects"
              className="pt-1"
            />
          )}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Avg health score</span>
            <span className="text-sm font-semibold tabular-nums text-slate-800">{Math.round(data.projectKpis.avgHealthScore || 0)}<span className="text-[10px] font-normal text-slate-400"> / 100</span></span>
          </div>
        </Panel>

        <Panel title="Portfolio Investment Matrix" subtitle="Isometric 3D — budget · actual · forecast by portfolio (click a cluster)"
          accent="#38bdf8" className="xl:col-span-2" icon={<Boxes className="h-3.5 w-3.5" />}>
          {investmentGroups.length === 0 ? <EmptyState title="No portfolios yet" /> : (
            <Bar3D
              groups={investmentGroups}
              series={[
                { label: "Budget", color: "#2563eb" },
                { label: "Actual", color: "#06b6d4" },
                { label: "Forecast", color: "#f59e0b" },
              ]}
              format={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v))}
              height={264}
            />
          )}
        </Panel>
      </div>

      {/* ============ EVM GAUGES + 3D EVM BARS + 3D HOURS AREA ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="EVM Performance Dials" subtitle="CPI / SPI from the latest period close" accent="#10b981" icon={<GaugeIcon className="h-3.5 w-3.5" />}>
          <div className="flex items-start justify-around gap-2 pt-1">
            <Gauge3D value={meanCpi} max={1.5} label="CPI" goodAt={0.95} sublabel="Cost performance" />
            <Gauge3D value={meanSpi} max={1.5} label="SPI" goodAt={0.95} sublabel="Schedule performance" />
          </div>
          <div className="mt-2 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              {meanCpi >= 0.95 && meanSpi >= 0.95 ? "Delivery on plan — indices healthy" : "Indices below 0.95 — corrective control advised"}
            </p>
          </div>
        </Panel>

        <Panel title="Earned Value by Project" subtitle="3D CPI / SPI columns — click a cluster to open the workspace"
          accent="#2563eb" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          {evmGroups.length === 0 ? <EmptyState title="No EVM periods yet" /> : (
            <Bar3D
              groups={evmGroups}
              series={[
                { label: "CPI", color: "#2563eb" },
                { label: "SPI", color: "#22d3ee" },
              ]}
              yMax={1.5}
              format={(v) => v.toFixed(2)}
              height={236}
            />
          )}
        </Panel>

        <Panel title="Effort Telemetry" subtitle="Perspective 3D — approved hours by week (effort feeds cost & EVM)"
          accent="#22d3ee" icon={<Waves className="h-3.5 w-3.5" />}>
          {hoursPoints.length < 2 ? <EmptyState title="No approved hours yet" /> : (
            <Area3D points={hoursPoints} color="#06b6d4" color2="#2563eb" label="Total hours / week" format={(v) => String(Math.round(v))} height={236} />
          )}
        </Panel>
      </div>

      {/* ============ RISKS / ALERTS / CAPACITY ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Top Risks" subtitle="Highest scored exposures" accent="#f43f5e"
          actions={<a href="#/raid" className="text-[11px] text-blue-600 hover:underline">Open RAID</a>} icon={<ShieldAlert className="h-3.5 w-3.5" />}>
          {data.topRisks.length === 0 ? <EmptyState title="No open risks" /> : (
            <div className="space-y-2.5">
              {data.topRisks.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 rounded-lg border border-slate-200/70 bg-white/60 px-2.5 py-2 transition-colors hover:border-rose-200 hover:bg-rose-50/40">
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
        </Panel>

        <Panel title="Governance Alerts" subtitle="Automated threshold breaches" accent="#f59e0b"
          actions={<a href="#/governance" className="text-[11px] text-blue-600 hover:underline">Open queue</a>} icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          {data.openAlerts.length === 0 ? <EmptyState title="No active alerts" /> : (
            <div className="space-y-2.5">
              {data.openAlerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 rounded-lg border border-slate-200/70 bg-white/60 px-2.5 py-2 transition-colors hover:border-amber-200 hover:bg-amber-50/40">
                  <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${a.severity === "CRITICAL" ? "text-rose-500" : "text-amber-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 leading-snug">{a.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(a.createdAt)} · {a.alertType.toLowerCase().replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Capacity & Milestones" subtitle="Resource load and schedule pressure" accent="#0ea5e9"
          actions={<a href="#/resources" className="text-[11px] text-blue-600 hover:underline">Resources</a>} icon={<CalendarClock className="h-3.5 w-3.5" />}>
          {data.capacityHotSpots.length === 0 ? (
            <p className="text-xs text-slate-400 mb-3">No over-allocated resources.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {data.capacityHotSpots.map((c) => (
                <div key={c.resourceId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{c.name}</span>
                    <span className={`text-xs tabular-nums font-semibold ${c.allocatedPercent > 100 ? "text-rose-600" : "text-slate-600"}`}>{num(c.allocatedPercent, 0)}%</span>
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
                    <span className="text-rose-600 tabular-nums ml-2 shrink-0">{fmtDate(m.dueDate)}</span>
                  </div>
                ))}
              </div>
            )}
            {/* AI executive brief over the same overdue list (BYOK server action) */}
            <AiOverdueBrief items={data.overdueMilestones.list} />
          </div>
        </Panel>
      </div>

      {/* ============ GOVERNANCE QUEUE + INTEGRITY CORE ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Governance Queue" subtitle="Decisions awaiting the enterprise" accent="#8b5cf6" className="xl:col-span-2" icon={<Landmark className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-violet-200/60 bg-violet-50/40 p-3">
              <p className="text-xs font-semibold text-violet-800 mb-2">Stage gates pending ({data.governanceQueue.pendingGates.length})</p>
              {data.governanceQueue.pendingGates.slice(0, 4).map((g) => (
                <div key={g.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate text-slate-600">{g.name}</span>
                  <span className="text-slate-400 ml-2 shrink-0">{g.projectCode}</span>
                </div>
              ))}
              {data.governanceQueue.pendingGates.length === 0 && <p className="text-xs text-slate-400">Queue clear.</p>}
            </div>
            <div className="rounded-lg border border-sky-200/60 bg-sky-50/40 p-3">
              <p className="text-xs font-semibold text-sky-800 mb-2">Change requests in flight ({data.governanceQueue.changeRequests.length})</p>
              {data.governanceQueue.changeRequests.slice(0, 4).map((cr) => (
                <div key={cr.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate text-slate-600">{cr.code} — {cr.title}</span>
                  <StatusChip status={cr.status} className="ml-2 shrink-0" />
                </div>
              ))}
              {data.governanceQueue.changeRequests.length === 0 && <p className="text-xs text-slate-400">Queue clear.</p>}
            </div>
          </div>
        </Panel>

        <div className="relative overflow-hidden rounded-xl border border-slate-700/70 bg-gradient-to-br from-[#071429] via-[#0b1f3a] to-[#0d2447] text-white p-5 flex flex-col justify-between shadow-[0_20px_50px_-25px_rgba(2,6,23,0.9)]">
          <div className="pointer-events-none absolute inset-0 opacity-30"
            style={{ backgroundImage: "radial-gradient(circle at 20% 10%, rgba(34,211,238,0.25), transparent 45%), radial-gradient(circle at 85% 90%, rgba(59,130,246,0.25), transparent 45%)" }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300"><Landmark className="h-4 w-4" /></span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Integrity core</p>
            </div>
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
          <div className="mt-6">
            <RailErrorBoundary><FreshnessRail /></RailErrorBoundary>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mt-4">One Platform · Complete Project Intelligence · Greater Outcomes</p>
        </div>
      </div>
    </div>
  );
}

// ---- Integrity Layer: live data-freshness rail (worst feed dominates) ----
function FreshnessRail() {
  const fresh = useApi<{ projects: { project: { id: string; code: string; name: string }; score: number; level: string; worstFeed: string }[] }>("/api/integrity/freshness");
  useRealtimeRefetch(fresh.refetch, ["freshness:changed", "timesheet:approved"]);
  if (fresh.error || !fresh.data) return null;
  const rows = [...fresh.data.projects].sort((a, b) => a.score - b.score).slice(0, 6);
  const levelColor = (lvl: string) => lvl === "CRITICAL" ? "#f43f5e" : lvl === "DEGRADE" ? "#fb923c" : lvl === "WARN" ? "#f59e0b" : "#10b981";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.05] p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">Data freshness</p>
        <a href="#/integrity" className="text-[10px] text-cyan-400 hover:underline">Integrity Layer →</a>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.project.id} className="flex items-center gap-2.5">
            <span className="w-24 truncate text-slate-300 font-medium text-xs">{r.project.code}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: Math.max(4, r.score) + "%", background: `linear-gradient(90deg, ${shade(levelColor(r.level), -0.2)}, ${levelColor(r.level)})`, boxShadow: `0 0 8px ${levelColor(r.level)}80` }} />
            </div>
            <span className="text-xs tabular-nums w-8 text-right font-semibold" style={{ color: r.score < 40 ? "#f43f5e" : "#94a3b8" }}>{r.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

class RailErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null };
  static getDerivedStateFromError(e: unknown) { return { err: e instanceof Error ? e.message : String(e) }; }
  componentDidCatch(e: unknown) { console.error('[FreshnessRail] suppressed render error:', e); }
  render() { return this.state.err ? null : this.props.children; }
}
