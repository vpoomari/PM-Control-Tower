"use client";
// PM CONTROL TOWER — INTELLIGENCE · Report library (executive summary, delivery performance, CSV exports)

import { toast } from "sonner";
import { useApi } from "@/lib/client";
import {
  PageHeader, StatCard, SectionCard, DataTable, Column, RagBadge, StatusChip,
  LoadingBlock, ErrorBlock, Metric, Button, Badge,
} from "@/components/pmct/kit";
import { money, num, fmtDate, fmtDateTime } from "@/lib/constants";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  FileText, Activity, Download, Printer, TrendingUp, ShieldCheck, Clock, Layers,
} from "lucide-react";

interface ProjectRow { id: string; code: string; name: string; status: string; ragStatus: string; currentBudget: number; actualCost: number; startDate: string | null; endDate: string | null; healthScore: number | null }

// ---------- API types ----------
interface ExecutiveReport {
  generatedAt: string;
  portfolios: Array<{
    id: string; code: string; name: string; status: string; ragStatus: string;
    healthScore: number; programCount: number; projectCount: number; budgetTarget: number;
    sums: { baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number };
  }>;
  projectKpis: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byRag: Array<{ rag: string; count: number }>;
    avgHealthScore: number;
  };
  financials: { baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number };
  evmAverages: {
    projectCount: number; meanCpi: number; meanSpi: number;
    perProject: Array<{ projectId: string; cpi: number; spi: number; project: { code: string; name: string } }>;
  };
  topRisks: Array<{ id: string; code: string; title: string; score: number; severity: string; status: string; projectCode: string }>;
  openAlerts: Array<{ id: string; severity: string; title: string; alertType: string; projectCode: string | null; createdAt: string }>;
  overdueMilestones: { count: number; list: Array<{ id: string; code: string; name: string; projectCode: string | null; dueDate: string | null }> };
  governanceQueue: {
    pendingGates: Array<{ id: string; code: string; name: string; projectCode: string | null }>;
    changeRequests: Array<{ id: string; code: string; title: string; status: string; priority: string; projectCode: string | null }>;
  };
}

interface AnalyticsReport {
  generatedAt: string;
  healthTimeline: Array<{ projectId: string; projectCode: string; projectName: string; snapshots: Array<{ capturedAt: string; healthScore: number; ragStatus: string }> }>;
  evmHistory: Array<{ projectId: string; projectCode: string; periods: Array<{ statusDate: string; cpi: number; spi: number }> }>;
  timesheetWeeks: Array<{ weekStart: string; totalHours: number; billableHours: number; timesheets: number }>;
  raidTrend: Array<{ month: string; risks: number; issues: number }>;
  throughput: Array<{ month: string; count: number }>;
}

interface TimesheetRow { id: string; weekStart: string; status: string; totalHours: number; billableHours: number; resource: { name: string; employeeCode: string } | null }

// ---------- CSV export (client-side Blob) ----------
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, label: string) {
  if (!rows.length) { toast.error(`No ${label} records to export`); return; }
  try {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(`${label} export downloaded (${rows.length} rows)`);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Export failed");
  }
}

// ---------- Report cards ----------
const REPORT_CARDS = [
  { id: "executive", icon: FileText, title: "Executive Portfolio Summary", desc: "Portfolio roll-ups, RAG distribution, EVM indices and the governance queue in a print-ready layout.", tone: "text-blue-600 bg-blue-50" },
  { id: "delivery", icon: Activity, title: "Delivery Performance", desc: "Task throughput, RAID creation trend and timesheet hours across the delivery engine.", tone: "text-emerald-600 bg-emerald-50" },
  { id: "exports", icon: Download, title: "Data Exports", desc: "Client-side CSV extracts of the project register and timesheet ledger for offline analysis.", tone: "text-amber-600 bg-amber-50" },
];

export default function ReportsView() {
  const exec = useApi<ExecutiveReport>("/api/reports/executive");
  const analytics = useApi<AnalyticsReport>("/api/reports/analytics");

  const ragTotal = exec.data ? exec.data.projectKpis.byRag.reduce((s, r) => s + r.count, 0) || 1 : 1;

  const projectsExport = useApi<{ items: ProjectRow[] }>("/api/projects?take=500");
  const timesheetsExport = useApi<{ timesheets: TimesheetRow[] }>("/api/timesheets?scope=all&take=500");

  const exportProjects = () => {
    const items = projectsExport.data?.items ?? [];
    downloadCsv(
      `pmct-projects-${new Date().toISOString().slice(0, 10)}.csv`,
      items.map((p) => ({
        code: p.code, name: p.name, status: p.status, rag: p.ragStatus,
        healthScore: p.healthScore, currentBudget: p.currentBudget, actualCost: p.actualCost,
        startDate: p.startDate ? fmtDate(p.startDate) : "", endDate: p.endDate ? fmtDate(p.endDate) : "",
      })),
      "Projects",
    );
  };
  const exportTimesheets = () => {
    const items = timesheetsExport.data?.timesheets ?? [];
    downloadCsv(
      `pmct-timesheets-${new Date().toISOString().slice(0, 10)}.csv`,
      items.map((t) => ({
        weekStart: fmtDate(t.weekStart), resource: t.resource?.name ?? "", employeeCode: t.resource?.employeeCode ?? "",
        status: t.status, totalHours: t.totalHours, billableHours: t.billableHours,
      })),
      "Timesheets",
    );
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (exec.loading && !exec.data) return <LoadingBlock label="Compiling executive report…" />;
  if (exec.error && !exec.data) return <ErrorBlock message={exec.error} onRetry={exec.refetch} />;

  const d = exec.data;
  const a = analytics.data;

  return (
    <div>
      <PageHeader
        title="Report Library"
        breadcrumb={["Intelligence", "Reports"]}
        subtitle="Governed, generated-on-demand reporting from the control tower data engine. Every figure below is rendered from live API data."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { toast.info("Opening print dialog — use the browser's \"Save as PDF\" option."); setTimeout(() => window.print(), 150); }}>
              <Printer className="h-4 w-4 mr-1.5" /> Print / PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => { exec.refetch(); analytics.refetch(); }}>Refresh data</Button>
          </>
        }
      />

      {/* Report cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-5">
        {REPORT_CARDS.map((c) => (
          <button
            key={c.id}
            onClick={() => scrollTo(c.id)}
            className="text-left rounded-lg border border-slate-200 bg-white shadow-sm p-4 hover:border-blue-300 hover:shadow transition-all"
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${c.tone}`}>
              <c.icon className="h-4.5 w-4.5" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{c.title}</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{c.desc}</p>
            <Badge variant="outline" className="mt-3 bg-slate-50 text-slate-500 border-slate-200">Jump to section</Badge>
          </button>
        ))}
      </div>

      {/* ===== Executive Portfolio Summary ===== */}
      <div id="executive" className="scroll-mt-20 space-y-4">
        <SectionCard
          title="Executive Portfolio Summary"
          description={`Generated ${d ? fmtDateTime(d.generatedAt) : "—"} — all values from the live portfolio ledger`}
        >
          {!d ? <LoadingBlock /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
                <StatCard label="Portfolios" value={d.portfolios.length} sub={`${d.projectKpis.total} projects under management`} />
                <StatCard label="Portfolio budget" value={money(d.financials.currentBudget)} sub={`Actuals ${money(d.financials.actualCost)}`} />
                <StatCard label="Forecast" value={money(d.financials.forecastCost)} sub={`vs baseline ${money(d.financials.baselineBudget)}`} tone={d.financials.forecastCost > d.financials.baselineBudget ? "warn" : "good"} />
                <StatCard label="Mean EVM" value={`CPI ${num(d.evmAverages.meanCpi, 2)} · SPI ${num(d.evmAverages.meanSpi, 2)}`} sub={`Across ${d.evmAverages.projectCount} executing projects`} />
              </div>

              {/* Portfolio table */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Portfolio register</h4>
                <DataTable
                  keyField="id"
                  rows={d.portfolios}
                  columns={[
                    { key: "code", header: "Portfolio", render: (r) => <div><p className="font-medium text-slate-800">{r.code}</p><p className="text-xs text-slate-500">{r.name}</p></div> },
                    { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
                    { key: "ragStatus", header: "RAG", render: (r) => <RagBadge rag={r.ragStatus} score={r.healthScore} /> },
                    { key: "projectCount", header: "Projects", className: "tabular-nums", render: (r) => `${r.projectCount} (${r.programCount} programs)` },
                    { key: "budget", header: "Budget", className: "tabular-nums", render: (r) => money(r.sums.currentBudget) },
                    { key: "actual", header: "Actuals", className: "tabular-nums", render: (r) => money(r.sums.actualCost) },
                    { key: "forecast", header: "Forecast", className: "tabular-nums", render: (r) => money(r.sums.forecastCost) },
                  ] as Column<(typeof d.portfolios)[number]>[]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-3 mb-5">
                {/* RAG distribution */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">RAG distribution</h4>
                  <div className="space-y-3">
                    {d.projectKpis.byRag.map((r) => (
                      <div key={r.rag}>
                        <div className="flex items-center justify-between mb-1">
                          <RagBadge rag={r.rag} />
                          <span className="text-xs tabular-nums text-slate-500">{r.count} of {d.projectKpis.total}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.rag === "GREEN" ? "bg-emerald-500" : r.rag === "AMBER" ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.round((r.count / ragTotal) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
                      <Metric label="Avg health" value={num(d.projectKpis.avgHealthScore, 1)} />
                      <Metric label="Active" value={d.projectKpis.byStatus.find((s) => s.status === "ACTIVE")?.count ?? 0} />
                    </div>
                  </div>
                </div>

                {/* EVM summary */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">EVM summary</h4>
                  <div className="space-y-2.5">
                    {d.evmAverages.perProject.map((p) => (
                      <div key={p.projectId} className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 truncate">{p.project.code}</span>
                        <span className="flex items-center gap-2 tabular-nums text-xs">
                          <span className={p.cpi >= 1 ? "text-emerald-600" : p.cpi >= 0.95 ? "text-amber-600" : "text-red-600"}>CPI {num(p.cpi, 2)}</span>
                          <span className="text-slate-300">|</span>
                          <span className={p.spi >= 1 ? "text-emerald-600" : p.spi >= 0.95 ? "text-amber-600" : "text-red-600"}>SPI {num(p.spi, 2)}</span>
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
                      <Metric label="Mean CPI" value={num(d.evmAverages.meanCpi, 2)} tone={d.evmAverages.meanCpi >= 1 ? "text-emerald-600" : "text-amber-600"} />
                      <Metric label="Mean SPI" value={num(d.evmAverages.meanSpi, 2)} tone={d.evmAverages.meanSpi >= 1 ? "text-emerald-600" : "text-amber-600"} />
                    </div>
                  </div>
                </div>

                {/* Governance queue */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Governance queue</h4>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600"><ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Stage gates pending decision</span>
                      <span className="font-semibold tabular-nums">{d.governanceQueue.pendingGates.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600"><Layers className="h-3.5 w-3.5 text-slate-400" /> Change requests in assessment / approval</span>
                      <span className="font-semibold tabular-nums">{d.governanceQueue.changeRequests.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600"><Clock className="h-3.5 w-3.5 text-slate-400" /> Overdue milestones</span>
                      <span className="font-semibold tabular-nums">{d.overdueMilestones.count}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {d.topRisks.slice(0, 3).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className={r.severity === "CRITICAL" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}>{r.code}</Badge>
                        <span className="truncate text-slate-600">{r.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Open alerts */}
              {d.openAlerts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Open alerts requiring attention</h4>
                  <div className="flex flex-wrap gap-2">
                    {d.openAlerts.slice(0, 8).map((al) => (
                      <Badge key={al.id} variant="outline" className={al.severity === "CRITICAL" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                        {al.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      {/* ===== Delivery Performance ===== */}
      <div id="delivery" className="scroll-mt-20 mt-5">
        <SectionCard
          title="Delivery Performance"
          description="Task throughput, RAID creation trend and timesheet effort — engine-computed from live delivery data"
          actions={analytics.loading ? <span className="text-xs text-slate-400">Refreshing…</span> : undefined}
        >
          {!a ? <LoadingBlock label="Compiling delivery metrics…" /> : (
            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-blue-500" /> Task throughput (completions by month)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={a.throughput} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" name="Tasks" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">RAID creation by month</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={a.raidTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="risks" name="Risks" fill="#d97706" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="issues" name="Issues" fill="#dc2626" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Timesheet hours by week</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={a.timesheetWeeks} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="weekStart" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="totalHours" name="Total h" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="billableHours" name="Billable h" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ===== Exports ===== */}
      <div id="exports" className="scroll-mt-20 mt-5">
        <SectionCard
          title="Data Exports"
          description="CSV extracts generated client-side in your browser — no data leaves the platform boundary"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-1.5">
                <Layers className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-slate-800">Project register</p>
              </div>
              <p className="text-xs text-slate-500 mb-3 flex-1">
                Code, name, status, RAG, health, budget, actuals and dates for the full project register (up to 500 records).
                {projectsExport.data ? <span className="ml-1 font-medium text-slate-600">{projectsExport.data.items.length} rows loaded.</span> : null}
              </p>
              <Button size="sm" className="self-start" onClick={exportProjects} disabled={projectsExport.loading || !projectsExport.data}>
                <Download className="h-4 w-4 mr-1.5" /> {projectsExport.loading ? "Loading…" : "Export projects CSV"}
              </Button>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-1.5">
                <Clock className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-slate-800">Timesheet ledger</p>
              </div>
              <p className="text-xs text-slate-500 mb-3 flex-1">
                Week, resource, status and hours for all timesheets in scope of the portfolio (up to 500 records).
                {timesheetsExport.data ? <span className="ml-1 font-medium text-slate-600">{timesheetsExport.data.timesheets.length} rows loaded.</span> : null}
              </p>
              <Button size="sm" className="self-start" onClick={exportTimesheets} disabled={timesheetsExport.loading || !timesheetsExport.data}>
                <Download className="h-4 w-4 mr-1.5" /> {timesheetsExport.loading ? "Loading…" : "Export timesheets CSV"}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
