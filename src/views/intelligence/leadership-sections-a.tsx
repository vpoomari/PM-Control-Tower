"use client";
// PM CONTROL TOWER — Leadership sections A: Control Tower, Portfolio, Status Reports

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SectionCard, StatCard, DataTable, Column, RagBadge, StatusChip, Button, Badge,
  Metric, ProgressBar, EmptyState, cn,
} from "@/components/pmct/kit";
import { fmtDate, fmtDateTime, money, num } from "@/lib/constants";
import type { LeadershipBundle, ExceptionItem, ProjectLeadRow } from "@/lib/engines/leadership";
import { RatingChip } from "./leadership";
import {
  AlertTriangle, Scale, Clock, TrendingUp, TrendingDown, ShieldAlert, Database,
  Printer, FileDown, ChevronRight, CircleCheck, Info,
} from "lucide-react";

// ================= CONTROL TOWER =================
const LEVEL_STYLE: Record<string, { cls: string; label: string }> = {
  CRITICAL: { cls: "bg-red-50 border-red-200 text-red-700", label: "CRITICAL" },
  DECISION_NOW: { cls: "bg-purple-50 border-purple-200 text-purple-700", label: "DECISION REQUIRED NOW" },
  AT_RISK: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "AT RISK" },
  OVERDUE: { cls: "bg-orange-50 border-orange-200 text-orange-700", label: "OVERDUE" },
  DUE_SOON: { cls: "bg-blue-50 border-blue-200 text-blue-700", label: "DUE SOON" },
  CHANGE: { cls: "bg-sky-50 border-sky-200 text-sky-700", label: "IMPORTANT CHANGE" },
};

export function ExceptionRow({ ex, onDrill }: { ex: ExceptionItem; onDrill?: (projectId: string) => void }) {
  const s = LEVEL_STYLE[ex.level] ?? LEVEL_STYLE.CHANGE;
  return (
    <button
      className={cn("w-full text-left rounded-lg border px-3.5 py-2.5 flex items-start gap-3 hover:shadow-sm transition-all", s.cls, "bg-opacity-60")}
      onClick={() => { /* drill-down handled via project link below */ }}
    >
      <span className={cn("mt-0.5 rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wide shrink-0 bg-white/70", s.cls)}>{s.label}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{ex.title}</span>
        <span className="block text-[11px] opacity-80 mt-0.5 leading-relaxed">{ex.detail}</span>
      </span>
      {ex.projectCode ? <span className="text-[10px] font-mono shrink-0 opacity-70">{ex.projectCode}</span> : null}
    </button>
  );
}

export function TowerSection({ d, onDrill, onGenerate }: { d: LeadershipBundle; onDrill: (projectId: string) => void; onGenerate: () => void }) {
  const t = d.tower;
  const [showAllExceptions, setShowAllExceptions] = useState(false);
  const exceptions = showAllExceptions ? d.exceptions : d.exceptions.slice(0, 8);
  const ragTotal = t.totalProjects || 1;

  return (
    <div className="space-y-5">
      {/* Answer strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects under management" value={t.totalProjects} sub={`${t.activeProjects} active · ${t.completionPct}% weighted completion`} />
        <StatCard label="On Track (GREEN)" value={t.onTrack} tone={t.onTrack >= t.totalProjects / 2 ? "good" : undefined} icon={<CircleCheck className="h-4 w-4" />} />
        <StatCard label="At Risk (AMBER)" value={t.atRisk} tone={t.atRisk ? "warn" : undefined} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Critical (RED)" value={t.critical} tone={t.critical ? "bad" : "good"} icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* RAG distribution incl GREY */}
        <SectionCard title="Portfolio health classification" description="GREEN on-track · AMBER at risk · RED critical · GREY insufficient data — Grey is never shown as Green">
          <div className="space-y-3">
            {([["GREEN", t.onTrack], ["AMBER", t.atRisk], ["RED", t.critical], ["GREY", t.insufficient]] as const).map(([k, v]) => (
              <div key={k}>
                <div className="flex items-center justify-between mb-1">
                  <RatingChip rating={k} />
                  <span className="text-xs tabular-nums text-slate-500">{v} of {t.totalProjects}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", k === "GREEN" ? "bg-emerald-500" : k === "AMBER" ? "bg-amber-500" : k === "RED" ? "bg-red-500" : "bg-slate-400")}
                    style={{ width: `${Math.round((v / ragTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
              <Metric label="Avg health score" value={num(t.avgHealth, 1)} />
              <Metric label="Pending decisions" value={t.pendingDecisions} tone={t.overdueDecisions ? "text-red-600" : undefined} />
            </div>
          </div>
        </SectionCard>

        {/* Financial & schedule answer cards */}
        <SectionCard title="Are we within budget?" description="Approved vs actual vs forecast — automatic overrun detection">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Approved budget</span><span className="font-semibold tabular-nums">{money(t.budget.approved)}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Actual expenditure</span><span className="font-semibold tabular-nums">{money(t.budget.actual)}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Committed costs</span><span className="font-semibold tabular-nums">{money(t.budget.committed)}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Forecast at completion</span><span className={cn("font-semibold tabular-nums", t.budget.variance > 0 && "text-red-600")}>{money(t.budget.forecast)}</span></div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Budget variance</span>
              <span className={cn("text-sm font-bold tabular-nums", t.budget.variance > 0 ? "text-red-600" : "text-emerald-600")}>
                {t.budget.variance >= 0 ? "+" : ""}{money(t.budget.variance)} ({t.budget.variancePct >= 0 ? "+" : ""}{t.budget.variancePct}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {t.budget.variance > 0
                ? `Forecast exceeds approved budget — ${t.budget.variancePct}% over. Action required from project owners.`
                : "Forecast is within approved budget. No overrun action required."}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Schedule position" description="SPI, overdue milestones and forecast movement">
          <div className="space-y-2.5">
            <Metric label="Average SPI" value={num(t.schedule.avgSpi, 2)} tone={t.schedule.avgSpi >= 0.95 ? "text-emerald-600" : "text-amber-600"} />
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Overdue milestones</span><span className={cn("font-semibold tabular-nums", t.schedule.overdueMilestones && "text-red-600")}>{t.schedule.overdueMilestones}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Delayed projects</span><span className="font-semibold tabular-nums">{t.schedule.delayedProjects}</span></div>
            <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Forecast vs baseline</span><span className="font-semibold tabular-nums">{t.schedule.forecastVsBaselineDays !== null ? `+${t.schedule.forecastVsBaselineDays} days` : "on baseline"}</span></div>
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
              <Metric label="Critical risks" value={t.openCriticalRisks} tone={t.openCriticalRisks ? "text-red-600" : "text-emerald-600"} />
              <Metric label="Critical issues" value={t.openCriticalIssues} tone={t.openCriticalIssues ? "text-red-600" : "text-emerald-600"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Pending approvals" value={t.pendingApprovals} />
              <Metric label="Resource bottlenecks" value={t.resourceBottlenecks} tone={t.resourceBottlenecks ? "text-amber-600" : undefined} />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Exception-first feed */}
      <SectionCard
        title="What needs my attention?"
        description={`Exceptions prioritized: Critical → Decision required → At risk → Overdue → Due soon → Important change (${d.exceptions.length} items)`}
        actions={<Button size="sm" variant="outline" onClick={onGenerate}><FileDown className="h-4 w-4 mr-1.5" /> Generate Leadership Pack</Button>}
      >
        {d.exceptions.length === 0 ? (
          <EmptyState title="No exceptions" description="Nothing requires leadership attention in the current data. Routine monitoring continues." />
        ) : (
          <div className="space-y-2">
            {exceptions.map((ex) => <ExceptionRow key={ex.id} ex={ex} onDrill={onDrill} />)}
            {d.exceptions.length > 8 && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllExceptions(!showAllExceptions)}>
                {showAllExceptions ? "Show fewer" : `Show all ${d.exceptions.length} exceptions`}
              </Button>
            )}
          </div>
        )}
      </SectionCard>

      {/* Auto insights */}
      <SectionCard title="Automatic executive insights" description="Every insight is computed from live project data — traceable, never invented; missing facts are stated as INSUFFICIENT DATA">
        <div className="space-y-1.5">
          {d.insights.map((ins) => (
            <div key={ins.id} className="flex items-start gap-2.5 rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
              {ins.severity === "CRITICAL" ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                : ins.severity === "WARNING" ? <TrendingUp className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                : <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />}
              <p className="text-xs text-slate-700 flex-1">{ins.text}</p>
              <Badge variant="outline" className="shrink-0 text-[9px] bg-white text-slate-500 border-slate-200">{ins.source.kind}{ins.source.code ? ` · ${ins.source.code}` : ""}</Badge>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Nothing-missed validation */}
      <SectionCard
        title="Nothing-missed validation"
        description={d.validation.passed ? "All pre-report checks passed — this report is complete." : `${d.validation.gaps} gap(s) found — flagged explicitly, never hidden behind a Green status.`}
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          {d.validation.checks.map((c) => (
            <div key={c.label} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5", c.ok ? "border-emerald-100 bg-emerald-50/50" : "border-red-200 bg-red-50")}>
              {c.ok ? <CircleCheck className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-slate-700">{c.label}</p>
                <p className="text-[10px] text-slate-500 leading-snug">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Upcoming events */}
      <SectionCard title="Upcoming important events" description="Steering committees, stage gates and key dates in the next period">
        {d.upcomingEvents.length === 0 ? <EmptyState title="No upcoming events" /> : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {d.upcomingEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 rounded-md border border-slate-100 px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700 truncate">{e.title}</p>
                  <p className="text-[10px] text-slate-400">{e.kind} · {fmtDateTime(e.date)}</p>
                </div>
                {e.projectCode ? <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500">{e.projectCode}</Badge> : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ================= PORTFOLIO =================
// Module-level filter select (static component — never create components during render)
function FilterSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function PortfolioSection({ d, onDrill }: { d: LeadershipBundle; onDrill: (projectId: string) => void }) {
  const [manager, setManager] = useState("");
  const [health, setHealth] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");

  const managers = [...new Set(d.portfolio.map((r) => r.managerName))];
  const rows = d.portfolio.filter((r) =>
    (!manager || r.managerName === manager) && (!health || r.health === health)
    && (!status || r.status === status) && (!priority || r.priority === priority)
    && (!q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <SectionCard title="Portfolio dashboard" description="Every project, every leadership dimension — filter by manager, health, status, priority or search">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="h-8 rounded-md border border-slate-200 px-2.5 text-xs w-44" />
        <FilterSelect value={manager} onChange={setManager} options={managers} placeholder="All managers" />
        <FilterSelect value={health} onChange={setHealth} options={["GREEN", "AMBER", "RED", "GREY"]} placeholder="All health" />
        <FilterSelect value={status} onChange={setStatus} options={["ACTIVE", "ON_HOLD", "DRAFT", "COMPLETED", "CANCELLED"]} placeholder="All status" />
        <FilterSelect value={priority} onChange={setPriority} options={["CRITICAL", "HIGH", "MEDIUM", "LOW"]} placeholder="All priority" />
        <span className="text-[11px] text-slate-400 ml-auto">{rows.length} of {d.portfolio.length} projects</span>
      </div>
      <DataTable<ProjectLeadRow & Record<string, unknown>>
        keyField="id"
        rows={rows as (ProjectLeadRow & Record<string, unknown>)[]}
        maxHeight="620px"
        onRowClick={(r) => onDrill(r.id)}
        columns={[
          { key: "name", header: "Project", render: (r) => (
            <div className="min-w-[190px]">
              <p className="font-medium text-slate-800 text-xs">{r.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">{r.code} · {r.portfolioName ?? "—"}</p>
            </div>
          ) },
          { key: "manager", header: "PM / Owner", render: (r) => (
            <div className="text-[11px]"><p className="text-slate-700">{r.managerName}</p><p className="text-slate-400">{r.businessOwnerName}</p></div>
          ) },
          { key: "health", header: "Health", render: (r) => <RagBadge rag={r.health === "GREY" ? "AMBER" : r.health} score={r.health === "GREY" ? undefined : r.healthScore} /> },
          { key: "greyFlag", header: "", render: (r) => r.health === "GREY" ? <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-500 border-slate-300">GREY · {r.dataGaps.length} gaps</Badge> : null },
          { key: "progress", header: "Progress", render: (r) => (
            <div className="w-24">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5"><span>{r.progress}%</span><span>plan {r.plannedProgress}%</span></div>
              <ProgressBar value={r.progress} />
            </div>
          ) },
          { key: "schedule", header: "Schedule", render: (r) => <StatusChip status={r.scheduleStatus} /> },
          { key: "budget", header: "Budget", render: (r) => (
            <div className="text-[11px] tabular-nums">
              <p className={cn(r.budgetStatus === "OVER" ? "text-red-600 font-semibold" : r.budgetStatus === "WATCH" ? "text-amber-600" : "text-slate-600")}>{r.budgetStatus} {r.budgetVariancePct > 0 ? `+${r.budgetVariancePct}%` : `${r.budgetVariancePct}%`}</p>
              <p className="text-slate-400">{money(r.forecastCost)}</p>
            </div>
          ) },
          { key: "risk", header: "Risk / Issue", render: (r) => (
            <div className="flex gap-1">
              <Badge variant="outline" className={cn("text-[9px]", r.riskStatus === "CRITICAL" ? "bg-red-50 text-red-600 border-red-200" : r.riskStatus === "NONE" ? "bg-slate-50 text-slate-400" : "bg-amber-50 text-amber-600")}>{r.riskStatus}</Badge>
              <Badge variant="outline" className={cn("text-[9px]", r.issueStatus === "CRITICAL" ? "bg-red-50 text-red-600 border-red-200" : r.issueStatus === "NONE" ? "bg-slate-50 text-slate-400" : "bg-amber-50 text-amber-600")}>{r.issueStatus}</Badge>
            </div>
          ) },
          { key: "milestone", header: "Milestone", render: (r) => <StatusChip status={r.milestoneStatus} /> },
          { key: "resource", header: "Resource", render: (r) => r.resourceStatus === "CONFLICT" ? <Badge variant="outline" className="text-[9px] bg-red-50 text-red-600 border-red-200">CONFLICT</Badge> : <span className="text-[10px] text-slate-400">OK</span> },
          { key: "decisions", header: "Decisions", render: (r) => r.pendingDecisions ? <span className="text-[11px] font-semibold text-purple-700 tabular-nums">{r.pendingDecisions} pending</span> : <span className="text-[10px] text-slate-300">—</span> },
          { key: "next", header: "Next milestone", render: (r) => r.nextMilestone ? <div className="text-[11px]"><p className="text-slate-700 truncate max-w-[150px]">{r.nextMilestone.name}</p><p className="text-slate-400">{fmtDate(r.nextMilestone.dueDate)}</p></div> : <span className="text-[10px] text-slate-300">—</span> },
          { key: "forecast", header: "Forecast finish", render: (r) => <span className="text-[11px] tabular-nums text-slate-600">{fmtDate(r.forecastFinish)}</span> },
          { key: "trend", header: "Trend", render: (r) => r.trend ? (
            <div className="flex items-center gap-1">
              {r.trend.label !== "Stable" ? (r.trend.label === "Improving" || r.trend.label === "Recovering" ? <TrendingDown className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingUp className="h-3.5 w-3.5 text-red-500" />) : null}
              <span className="text-[10px] text-slate-500">{r.trend.label}</span>
            </div>
          ) : <span className="text-[10px] text-slate-300">—</span> },
          { key: "updated", header: "Updated", render: (r) => <span className="text-[10px] text-slate-400 tabular-nums">{fmtDate(r.lastUpdated)}</span> },
          { key: "open", header: "", render: (r) => <span className="text-[10px] text-blue-600 flex items-center">Status report <ChevronRight className="h-3 w-3" /></span> },
        ] as Column<ProjectLeadRow & Record<string, unknown>>[]}
      />
      <p className="text-[10px] text-slate-400 mt-2">Click any row to open its Executive Status Report. GREY = insufficient data — do not treat as on-track.</p>
    </SectionCard>
  );
}

// ================= STATUS REPORTS =================
interface StatusReport {
  projectId: string; code: string; name: string; generatedAt: string; since: string;
  manager: string; businessOwner: string; sponsor: string; phase: string; status: string;
  executiveSummary: string[];
  currentStatus: { dimension: string; rating: string; basis: string }[];
  progress: { planned: number; actual: number; variance: number; spi: number; cpi: number; completedTasks: number; wipTasks: number; remainingTasks: number };
  upcoming: { milestones: { name: string; dueDate: string | null; critical: boolean }[]; deadlines: { name: string; date: string | null }[]; approvals: number; deliverables: { name: string; dueDate: string | null }[]; events: { title: string; date: string | null }[] };
  concerns: { risks: { code: string; title: string; severity: string; owner: string | null; mitigation: string | null }[]; issues: { code: string; title: string; severity: string; owner: string | null }[]; delays: string[]; dependencies: string[]; resourceConstraints: string[]; budgetConcerns: string[] };
  leadershipActions: { decision: string; who: string | null; byWhen: string | null; ifNoDecision: string | null; classification: string }[];
  whatChanged: LeadershipBundle["changed"];
  healthTrend: { prev: string; current: string; label: string } | null;
}

export function StatusReportSection({ d, projectId, onPick }: { d: LeadershipBundle; projectId: string | null; onPick: (id: string | null) => void }) {
  const active = projectId ?? d.portfolio.find((r) => r.status === "ACTIVE")?.id ?? d.portfolio[0]?.id ?? null;
  const [report, setReport] = useState<StatusReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const load = async (id: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/reports/leadership/status-report?projectId=${id}`);
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Failed to generate report");
      setReport(j.data as StatusReport); setLoadedFor(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setReport(null); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (active && loadedFor !== active && !loading) void load(active);
  }, [active, loadedFor, loading]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={active ?? ""} onChange={(e) => onPick(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs">
          {d.portfolio.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => active && load(active)}>Regenerate</Button>
        <Button size="sm" variant="outline" onClick={() => { toast.info("Opening print dialog — choose Save as PDF."); setTimeout(() => window.print(), 150); }}>
          <Printer className="h-3.5 w-3.5 mr-1" /> Print / PDF
        </Button>
      </div>

      {loading && <div className="py-10 text-center text-sm text-slate-400">Generating executive status report…</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {report && !loading && (
        <div className="space-y-4" id="executive-status-report">
          <SectionCard
            title={`${report.code} — Executive Project Status Report`}
            description={`Generated ${fmtDateTime(report.generatedAt)} · PM ${report.manager} · Business owner ${report.businessOwner} · Sponsor ${report.sponsor} · Phase ${report.phase}`}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive summary</h4>
                {report.executiveSummary.map((s, i) => <p key={i} className="text-xs leading-relaxed text-slate-700">{s}</p>)}
                {report.healthTrend && report.healthTrend.label !== "Stable" && (
                  <p className="text-xs font-medium text-amber-700">Health trend: {report.healthTrend.prev} → {report.healthTrend.current} ({report.healthTrend.label}).</p>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current status</h4>
                {report.currentStatus.map((s) => (
                  <div key={s.dimension} className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><RatingChip rating={s.rating} /><p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{s.basis}</p></div>
                    <span className="text-[11px] font-semibold text-slate-700 shrink-0">{s.dimension}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Progress" description="Planned vs actual with work breakdown">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Metric label="Planned progress" value={`${report.progress.planned}%`} />
                <Metric label="Actual progress" value={`${report.progress.actual}%`} tone={report.progress.variance < 0 ? "text-red-600" : "text-emerald-600"} />
                <Metric label="SPI / CPI" value={`${report.progress.spi} / ${report.progress.cpi}`} />
                <Metric label="Variance" value={`${report.progress.variance >= 0 ? "+" : ""}${report.progress.variance} pts`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Completed" value={report.progress.completedTasks} />
                <Metric label="In progress" value={report.progress.wipTasks} />
                <Metric label="Remaining" value={report.progress.remainingTasks} />
              </div>
            </SectionCard>

            <SectionCard title="Upcoming" description="Milestones, deadlines, approvals and deliverables">
              <div className="space-y-2 text-xs">
                {report.upcoming.milestones.slice(0, 5).map((m) => (
                  <div key={m.name} className="flex items-center justify-between"><span className="text-slate-600 truncate">{m.critical ? "🚩 " : ""}{m.name}</span><span className="tabular-nums text-slate-400">{fmtDate(m.dueDate)}</span></div>
                ))}
                {report.upcoming.deliverables.slice(0, 3).map((dl) => (
                  <div key={dl.name} className="flex items-center justify-between"><span className="text-slate-600 truncate">Deliverable: {dl.name}</span><span className="tabular-nums text-slate-400">{fmtDate(dl.dueDate)}</span></div>
                ))}
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500">Upcoming approvals</span><span className="font-semibold tabular-nums">{report.upcoming.approvals}</span>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Concerns" description="Risks, issues, delays, dependencies, resource and budget concerns">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
              <div>
                <h5 className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Top risks</h5>
                {report.concerns.risks.length ? report.concerns.risks.map((r) => (
                  <div key={r.code} className="mb-1.5"><p className="font-medium text-slate-700">{r.code} · {r.title}</p><p className="text-[10px] text-slate-400">{r.severity} · owner {r.owner ?? "unassigned"}{r.mitigation ? "" : " · NO MITIGATION"}</p></div>
                )) : <p className="text-slate-400">None open.</p>}
              </div>
              <div>
                <h5 className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Open issues</h5>
                {report.concerns.issues.length ? report.concerns.issues.map((r) => (
                  <div key={r.code} className="mb-1.5"><p className="font-medium text-slate-700">{r.code} · {r.title}</p><p className="text-[10px] text-slate-400">{r.severity} · owner {r.owner ?? "unassigned"}</p></div>
                )) : <p className="text-slate-400">None open.</p>}
              </div>
              <div>
                <h5 className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Delays / Dependencies / Constraints</h5>
                {[...report.concerns.delays, ...report.concerns.dependencies, ...report.concerns.resourceConstraints, ...report.concerns.budgetConcerns].slice(0, 8).map((s, i) => (
                  <p key={i} className="text-[11px] text-slate-600 mb-1">• {s}</p>
                ))}
                {!report.concerns.delays.length && !report.concerns.dependencies.length && <p className="text-slate-400">None recorded.</p>}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Leadership actions required" description="WHAT decision is required · WHO decides · BY WHEN · WHAT HAPPENS IF NO DECISION">
            {report.leadershipActions.length === 0 ? (
              <EmptyState title="No leadership decisions currently required" description="The project is not blocked on executive action." />
            ) : (
              <div className="space-y-2">
                {report.leadershipActions.map((a, i) => (
                  <div key={i} className={cn("rounded-lg border px-3.5 py-3", a.classification === "DECISION_REQUIRED_NOW" ? "border-red-200 bg-red-50" : a.classification === "DECISION_DUE_SOON" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50")}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="text-[9px] bg-white">{a.classification.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2 text-xs">
                      <p><span className="font-semibold text-slate-800">WHAT:</span> <span className="text-slate-700">{a.decision}</span></p>
                      <p><span className="font-semibold text-slate-800">WHO:</span> <span className="text-slate-700">{a.who ?? "Unassigned — flag to PMO"}</span></p>
                      <p><span className="font-semibold text-slate-800">BY WHEN:</span> <span className="text-slate-700">{fmtDate(a.byWhen)}</span></p>
                      <p><span className="font-semibold text-slate-800">IF NO DECISION:</span> <span className="text-slate-700">{a.ifNoDecision}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Since last report" description={`Delta versus ${fmtDate(report.since)}`}>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {report.whatChanged.map((c, i) => (
                <div key={i} className={cn("rounded-md border px-2.5 py-1.5 text-xs", c.tone === "good" ? "border-emerald-100 bg-emerald-50/60 text-emerald-800" : c.tone === "bad" ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
                  <span className="font-semibold">{c.label}:</span> {c.text}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
