"use client";
// PM CONTROL TOWER — INTELLIGENCE · Analytics workspace (health timeline, EVM history, delivery trends)

import { useMemo, useState } from "react";
import { useApi } from "@/lib/client";
import {
  PageHeader, StatCard, SectionCard, LoadingBlock, ErrorBlock, RagBadge,
} from "@/components/pmct/kit";
import { num } from "@/lib/constants";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Activity, HeartPulse, Gauge, Clock, FolderOpen } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ---------- API types ----------
interface AnalyticsReport {
  generatedAt: string;
  healthTimeline: Array<{
    projectId: string; projectCode: string; projectName: string;
    snapshots: Array<{ capturedAt: string; healthScore: number; ragStatus: string }>;
  }>;
  evmHistory: Array<{ projectId: string; projectCode: string; periods: Array<{ statusDate: string; cpi: number; spi: number }> }>;
  timesheetWeeks: Array<{ weekStart: string; totalHours: number; billableHours: number; timesheets: number }>;
  raidTrend: Array<{ month: string; risks: number; issues: number }>;
  throughput: Array<{ month: string; count: number }>;
}
interface ExecutiveKpis {
  projectKpis: { total: number; byStatus: Array<{ status: string; count: number }>; byRag: Array<{ rag: string; count: number }>; avgHealthScore: number };
  evmAverages: { meanCpi: number; meanSpi: number };
}

// Consistent enterprise palette — blue-led, RAG accents for state only (no indigo/purple)
const PALETTE = ["#2563eb", "#38bdf8", "#0b1f3a", "#16a34a", "#d97706", "#dc2626", "#64748b", "#0e7490"];

const AXIS = { tick: { fontSize: 10, fill: "#64748b" }, axisLine: false, tickLine: false } as const;
const GRID = <CartesianGrid stroke="#e2e8f0" vertical={false} />;
const TIP = { fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" };
const LEGEND = { wrapperStyle: { fontSize: 11 } };

function fmtTick(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AnalyticsView() {
  const analytics = useApi<AnalyticsReport>("/api/reports/analytics");
  const exec = useApi<ExecutiveKpis>("/api/reports/executive");
  const [evmProject, setEvmProject] = useState<string>("ALL");

  const k = exec.data?.projectKpis;

  // Health timeline — merge snapshots into one row per capturedAt, one line per project
  const healthData = useMemo(() => {
    if (!analytics.data) return [];
    const byKey = new Map<string, Record<string, number | string>>();
    analytics.data.healthTimeline.forEach((p) => {
      p.snapshots.forEach((s) => {
        const key = s.capturedAt;
        if (!byKey.has(key)) byKey.set(key, { t: fmtTick(key), label: key });
        byKey.get(key)![p.projectCode] = s.healthScore;
      });
    });
    return Array.from(byKey.values()).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [analytics.data]);

  const healthProjects = analytics.data?.healthTimeline ?? [];

  // EVM history — filtered by project, or portfolio mean across projects per statusDate
  const evmSeries = analytics.data?.evmHistory ?? [];
  const evmData = useMemo(() => {
    if (evmProject !== "ALL") {
      const p = evmSeries.find((x) => x.projectCode === evmProject);
      return (p?.periods ?? []).map((per) => ({ t: fmtTick(per.statusDate), cpi: per.cpi, spi: per.spi }));
    }
    const byDate = new Map<string, { cpi: number; spi: number; n: number }>();
    evmSeries.forEach((p) => p.periods.forEach((per) => {
      const cur = byDate.get(per.statusDate) || { cpi: 0, spi: 0, n: 0 };
      cur.cpi += per.cpi; cur.spi += per.spi; cur.n += 1;
      byDate.set(per.statusDate, cur);
    }));
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ t: fmtTick(date), cpi: +(v.cpi / v.n).toFixed(3), spi: +(v.spi / v.n).toFixed(3) }));
  }, [evmProject, evmSeries]);

  if (analytics.loading && !analytics.data) return <LoadingBlock label="Crunching analytics engine…" />;
  if (analytics.error && !analytics.data) return <ErrorBlock message={analytics.error} onRetry={analytics.refetch} />;

  const a = analytics.data;
  if (!a) return null;

  const totalTsHours = a.timesheetWeeks.reduce((s, w) => s + w.totalHours, 0);
  const totalRaids = a.raidTrend.reduce((s, m) => s + m.risks + m.issues, 0);
  const totalThroughput = a.throughput.reduce((s, m) => s + m.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics Workspace"
        breadcrumb={["Intelligence", "Analytics"]}
        subtitle={`Engine-computed trends across delivery, schedule, effort and RAID signals — generated ${new Date(a.generatedAt).toISOString().slice(0, 16).replace("T", " ")}`}
        actions={
          <Select value={evmProject} onValueChange={setEvmProject}>
            <SelectTrigger className="h-9 w-[240px] bg-white">
              <SelectValue placeholder="Filter EVM by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">EVM — All projects (mean)</SelectItem>
              {evmSeries.map((p) => (
                <SelectItem key={p.projectId} value={p.projectCode}>{p.projectCode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Projects analysed"
          value={k?.total ?? "—"}
          sub={`${k?.byStatus.find((s) => s.status === "ACTIVE")?.count ?? 0} active · ${k?.byStatus.find((s) => s.status === "DRAFT")?.count ?? 0} draft`}
          icon={<FolderOpen className="h-4 w-4" />}
        />
        <StatCard
          label="Avg health score"
          value={k ? num(k.avgHealthScore, 1) : "—"}
          sub={k ? `${k.byRag.find((r) => r.rag === "RED")?.count ?? 0} red · ${k.byRag.find((r) => r.rag === "AMBER")?.count ?? 0} amber · ${k.byRag.find((r) => r.rag === "GREEN")?.count ?? 0} green` : undefined}
          tone={k && k.avgHealthScore >= 80 ? "good" : k && k.avgHealthScore >= 60 ? "warn" : "bad"}
          icon={<HeartPulse className="h-4 w-4" />}
        />
        <StatCard
          label="Portfolio EVM mean"
          value={exec.data ? `CPI ${num(exec.data.evmAverages.meanCpi, 2)} · SPI ${num(exec.data.evmAverages.meanSpi, 2)}` : "—"}
          sub="Latest engine-computed period per project"
          icon={<Gauge className="h-4 w-4" />}
        />
        <StatCard
          label="28d effort logged"
          value={num(totalTsHours, 0)}
          sub={`${num(totalRaids, 0)} RAID items · ${num(totalThroughput, 0)} tasks delivered in trend window`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Health timeline */}
      <SectionCard
        title="Health timeline"
        description="Health score snapshots per project over time — one line per project"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {healthProjects.map((p, i) => (
              <span key={p.projectId} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                {p.projectCode}
              </span>
            ))}
          </div>
        }
      >
        {healthData.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No health snapshots captured yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={healthData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="t" {...AXIS} />
              <YAxis domain={[0, 100]} {...AXIS} />
              <Tooltip contentStyle={TIP} />
              <Legend {...LEGEND} />
              {healthProjects.map((p, i) => (
                <Line
                  key={p.projectId}
                  type="monotone"
                  dataKey={p.projectCode}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* EVM history */}
      <SectionCard
        title="EVM history — CPI / SPI"
        description={evmProject === "ALL" ? "Portfolio mean of the latest engine periods per status date" : `Cost & schedule performance index for ${evmProject}`}
      >
        {evmData.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No EVM periods recorded for this selection.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={evmData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} domain={[0.6, 1.1]} />
              <Tooltip contentStyle={TIP} />
              <Legend {...LEGEND} />
              <Line type="monotone" dataKey="cpi" name="CPI" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="spi" name="SPI" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Delivery trend trio */}
      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Timesheet hours by week" description="Approved, submitted and reviewed effort">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.timesheetWeeks} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="weekStart" {...AXIS} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={TIP} />
              <Legend {...LEGEND} />
              <Bar dataKey="totalHours" name="Total h" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar dataKey="billableHours" name="Billable h" fill="#38bdf8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="RAID creation by month" description="New risks and issues raised">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.raidTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="month" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip contentStyle={TIP} />
              <Legend {...LEGEND} />
              <Bar dataKey="risks" name="Risks" fill="#d97706" radius={[3, 3, 0, 0]} />
              <Bar dataKey="issues" name="Issues" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Task throughput by month" description="Completed tasks per month">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={a.throughput} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              {GRID}
              <XAxis dataKey="month" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip contentStyle={TIP} />
              <Bar dataKey="count" name="Tasks" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* RAG strip */}
      {k && (
        <SectionCard title="Project RAG mix" description="Live distribution from the executive roll-up">
          <div className="flex flex-wrap items-center gap-3">
            {k.byRag.map((r) => (
              <span key={r.rag} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
                <RagBadge rag={r.rag} />
                <span className="text-xs font-semibold tabular-nums text-slate-700">{r.count}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 ml-1">
              <Activity className="h-3.5 w-3.5" /> engine window: last 12 snapshots / 6 months
            </span>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
