"use client";
// PM CONTROL TOWER — EVM cockpit: earned value metrics, CPI/SPI history, manual snapshots.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDate, money, num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, LoadingBlock, ErrorBlock, EmptyState, Button, Metric,
} from "@/components/pmct/kit";
import { ProjectPicker, useControlProjectId, useControlProjectOptions } from "@/views/control/shared/pickers";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { Camera } from "lucide-react";

interface EvmBlock {
  bac: number; pv: number; ev: number; ac: number; cpi: number; spi: number;
  eac: number; etc: number; vac: number; tcpi: number;
  costVariance: number; scheduleVariance: number; percentComplete: number;
}
interface EvmSnapshot extends EvmBlock {
  id: string; statusDate: string; periodStart: string | null; periodEnd: string | null; source: string;
}
interface EvmData { evm: EvmBlock; current: EvmBlock; latestSnapshot: EvmSnapshot | null; history: EvmSnapshot[] }

function ratioTone(v: number): "good" | "warn" | "bad" | "default" {
  if (v >= 1) return "good";
  if (v >= 0.85) return "warn";
  return "bad";
}

export default function EvmView() {
  const { options, loading: optionsLoading } = useControlProjectOptions();
  const [projectId, setProjectId] = useControlProjectId(options);

  const evm = useApi<EvmData>(projectId ? `/api/evm?projectId=${projectId}` : null);
  useRealtimeRefetch(evm.refetch, ["evm:changed", "actuals:changed"]);
  const [snapshotting, setSnapshotting] = useState(false);

  const historyData = useMemo(() =>
    (evm.data?.history ?? []).map((h) => ({
      statusDate: h.statusDate.slice(0, 10),
      cpi: h.cpi,
      spi: h.spi,
      eac: h.eac,
    })),
  [evm.data]);

  const createSnapshot = async () => {
    if (!projectId) return;
    setSnapshotting(true);
    try {
      await api.post("/api/evm", { projectId });
      toast.success("EVM snapshot captured");
      await evm.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setSnapshotting(false);
    }
  };

  const selected = options.find((o) => o.id === projectId);

  return (
    <div className="space-y-5">
      <PageHeader
        io="evm-periods"
        title="Earned Value Management"
        subtitle="Cost and schedule performance from real baseline, actuals and approved progress."
        breadcrumb={["Home", "Control", "EVM"]}
        actions={
          <>
            <ProjectPicker value={projectId} onChange={setProjectId} options={options} />
            <Button size="sm" variant="outline" disabled={!projectId || snapshotting || optionsLoading} onClick={() => void createSnapshot()}>
              <Camera className="h-4 w-4 mr-1.5" />Create snapshot
            </Button>
          </>
        }
      />

      {!projectId ? (
        optionsLoading ? <LoadingBlock label="Loading projects…" /> : <EmptyState title="No projects available" />
      ) : evm.loading && !evm.data ? (
        <LoadingBlock label="Computing earned value…" />
      ) : evm.error && !evm.data ? (
        <ErrorBlock message={evm.error} onRetry={evm.refetch} />
      ) : evm.data ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-800">{selected ? `${selected.code} — ${selected.name}` : "Project"}</h2>
            {evm.data.latestSnapshot && (
              <span className="text-xs text-slate-400">
                Latest snapshot {fmtDate(evm.data.latestSnapshot.statusDate)} · source {evm.data.latestSnapshot.source.replace(/_/g, " ").toLowerCase()} · {evm.data.history.length} periods on record
              </span>
            )}
          </div>

          {/* 12 metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="BAC" value={money(evm.data.evm.bac)} sub="Budget at completion" />
            <StatCard label="PV" value={money(evm.data.evm.pv)} sub="Planned value" />
            <StatCard label="EV" value={money(evm.data.evm.ev)} sub={`${num(evm.data.evm.percentComplete, 1)}% complete`} />
            <StatCard label="AC" value={money(evm.data.evm.ac)} sub="Actual cost" tone="info" />
            <StatCard label="CPI" value={num(evm.data.evm.cpi, 2)} tone={ratioTone(evm.data.evm.cpi)} sub="EV ÷ AC" />
            <StatCard label="SPI" value={num(evm.data.evm.spi, 2)} tone={ratioTone(evm.data.evm.spi)} sub="EV ÷ PV" />
            <StatCard label="EAC" value={money(evm.data.evm.eac)} tone={evm.data.evm.eac > evm.data.evm.bac ? "bad" : "good"} sub="Estimate at completion" />
            <StatCard label="ETC" value={money(evm.data.evm.etc)} sub="Estimate to complete" />
            <StatCard label="VAC" value={money(evm.data.evm.vac)} tone={evm.data.evm.vac >= 0 ? "good" : "bad"} sub="BAC − EAC" />
            <StatCard label="TCPI" value={num(evm.data.evm.tcpi, 2)} tone={evm.data.evm.tcpi <= 1 ? "good" : evm.data.evm.tcpi <= 1.1 ? "warn" : "bad"} sub="To-complete performance" />
            <StatCard label="CV" value={money(evm.data.evm.costVariance)} tone={evm.data.evm.costVariance >= 0 ? "good" : "bad"} sub="Cost variance" />
            <StatCard label="SV" value={money(evm.data.evm.scheduleVariance)} tone={evm.data.evm.scheduleVariance >= 0 ? "good" : "bad"} sub="Schedule variance" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <SectionCard title="CPI / SPI history" description="Performance indices across reporting periods" className="xl:col-span-2">
              {historyData.length === 0 ? <EmptyState title="No EVM periods yet" description="Create the first snapshot to start the trend." /> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="statusDate" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0.5, 1.2]} />
                      <RTooltip />
                      <Legend iconType="circle" iconSize={8} />
                      <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="cpi" name="CPI" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="spi" name="SPI" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Variance analysis" description="Where the project stands against baseline">
              <div className="space-y-4">
                {([
                  ["Cost variance (CV)", evm.data.evm.costVariance, "EV − AC", evm.data.evm.pv ? (evm.data.evm.costVariance / evm.data.evm.ev) * 100 : 0],
                  ["Schedule variance (SV)", evm.data.evm.scheduleVariance, "EV − PV", evm.data.evm.pv ? (evm.data.evm.scheduleVariance / evm.data.evm.pv) * 100 : 0],
                  ["Variance at completion (VAC)", evm.data.evm.vac, "BAC − EAC", evm.data.evm.bac ? (evm.data.evm.vac / evm.data.evm.bac) * 100 : 0],
                ] as const).map(([label, value, formula, pct]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{label}</p>
                      <p className="text-[11px] text-slate-400">{formula}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${value >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(value)}</p>
                      <p className="text-[11px] tabular-nums text-slate-400">{pct >= 0 ? "+" : ""}{num(pct, 1)}%</p>
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3">
                  <Metric label="Planned value" value={money(evm.data.evm.pv)} />
                  <Metric label="Earned value" value={money(evm.data.evm.ev)} />
                  <Metric label="% complete" value={`${num(evm.data.evm.percentComplete, 1)}%`} />
                  <Metric label="TCPI" value={num(evm.data.evm.tcpi, 2)} />
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Snapshot history table */}
          <SectionCard title="Snapshot history" description={`${evm.data.history.length} reporting periods`}>
            {evm.data.history.length === 0 ? <EmptyState title="No snapshots" /> : (
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1]">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {["Status date", "PV", "EV", "AC", "CPI", "SPI", "EAC", "VAC", "Source"].map((h) => (
                        <th key={h} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...evm.data.history].reverse().map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 tabular-nums">{fmtDate(h.statusDate)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-500">{money(h.pv)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700">{money(h.ev)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700">{money(h.ac)}</td>
                        <td className={`px-3 py-2.5 tabular-nums font-medium ${h.cpi >= 1 ? "text-emerald-600" : h.cpi >= 0.85 ? "text-amber-600" : "text-red-600"}`}>{num(h.cpi, 2)}</td>
                        <td className={`px-3 py-2.5 tabular-nums font-medium ${h.spi >= 1 ? "text-emerald-600" : h.spi >= 0.85 ? "text-amber-600" : "text-red-600"}`}>{num(h.spi, 2)}</td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700">{money(h.eac)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${h.vac >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(h.vac)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-400">{h.source.replace(/_/g, " ").toLowerCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
