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
import { Camera, Info, FileText, Gauge } from "lucide-react";
import { Input } from "@/components/pmct/kit";
import { Label } from "@/components/ui/label";

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
  const [tab, setTab] = useState<"cockpit" | "form" | "about">("cockpit");

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

      <div className="flex flex-wrap items-center gap-2">
        {([["cockpit", "Cockpit", Gauge], ["form", "Full form — all fields", FileText], ["about", "What is EVM?", Info]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${tab === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === "form" ? <EvmFormTab projectId={projectId} onSaved={() => void evm.refetch()} /> : tab === "about" ? <EvmAboutTab /> : !projectId ? (
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

// ================= FULL FORM — every EVM field =================
function EvmFormTab({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [f, setF] = useState({ statusDate: new Date().toISOString().slice(0, 10), periodStart: "", periodEnd: "", bac: "", pv: "", ev: "", ac: "", cpi: "", spi: "", eac: "", etc: "", vac: "", tcpi: "", costVariance: "", scheduleVariance: "", percentComplete: "" });
  const [saving, setSaving] = useState(false);
  const n = (x: string) => (x === "" ? undefined : Number(x));
  const bac = n(f.bac) ?? 0, pv = n(f.pv) ?? 0, ev = n(f.ev) ?? 0, ac = n(f.ac) ?? 0;
  const eacCalc = ac > 0 && ev / ac > 0 ? bac / (ev / ac) : bac;
  const d = {
    cpi: n(f.cpi) ?? (ac > 0 ? ev / ac : 1),
    spi: n(f.spi) ?? (pv > 0 ? ev / pv : 1),
    eac: n(f.eac) ?? eacCalc,
    etc: n(f.etc) ?? Math.max(0, eacCalc - ac),
    vac: n(f.vac) ?? bac - eacCalc,
    tcpi: n(f.tcpi) ?? (bac - ac !== 0 ? (bac - ev) / (bac - ac) : 1),
    costVariance: n(f.costVariance) ?? ev - ac,
    scheduleVariance: n(f.scheduleVariance) ?? ev - pv,
    percentComplete: n(f.percentComplete) ?? (bac > 0 ? (ev / bac) * 100 : 0),
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!bac && !pv && !ev && !ac) { toast.error("Enter at least one of BAC, PV, EV or AC"); return; }
    setSaving(true);
    try {
      await api.post("/api/evm", {
        projectId, statusDate: f.statusDate || undefined,
        periodStart: f.periodStart || undefined, periodEnd: f.periodEnd || undefined,
        bac: n(f.bac), pv: n(f.pv), ev: n(f.ev), ac: n(f.ac),
        cpi: n(f.cpi), spi: n(f.spi), eac: n(f.eac), etc: n(f.etc), vac: n(f.vac), tcpi: n(f.tcpi),
        costVariance: n(f.costVariance), scheduleVariance: n(f.scheduleVariance), percentComplete: n(f.percentComplete),
      });
      toast.success("Manual EVM period saved (source: MANUAL_PERIOD, audited) — health recalculated");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };

  const field = (label: string, k: keyof typeof f, hint?: string, type = "number") => (
    <div className="space-y-1" title={hint}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} step="any" className="h-9" value={f[k]} onChange={set(k)} />
    </div>
  );
  const derived = (label: string, value: number, hint: string) => (
    <div className="space-y-1" title={hint}>
      <Label className="text-xs text-slate-500">{label} (computed)</Label>
      <div className="h-9 rounded-md border bg-slate-50 px-3 flex items-center text-sm tabular-nums text-slate-700">{num(value, 2)}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard title="Period-close form — every EVM field" description="Enter the reporting period and the four base inputs; every derived metric computes live. Override a derived field only if you can defend it — the snapshot is tagged MANUAL_PERIOD and audited.">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reporting period</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {field("Status date *", "statusDate", "The as-of date for this snapshot", "date")}
          {field("Period start", "periodStart", "Optional reporting window start", "date")}
          {field("Period end", "periodEnd", "Optional reporting window end", "date")}
        </div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Base inputs (from your baseline and cost ledger)</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {field("BAC - budget at completion", "bac", "Total approved budget for the work")}
          {field("PV - planned value", "pv", "Budgeted cost of work scheduled to date")}
          {field("EV - earned value", "ev", "Budgeted cost of work actually performed")}
          {field("AC - actual cost", "ac", "Real cost incurred to date")}
        </div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Derived metrics (live-computed - override only deliberately)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          {derived("CPI - cost performance", d.cpi, "EV / AC - value earned per dollar spent")}
          {derived("SPI - schedule performance", d.spi, "EV / PV - progress vs plan")}
          {derived("EAC - estimate at completion", d.eac, "BAC / CPI (assuming current efficiency continues)")}
          {derived("ETC - estimate to complete", d.etc, "EAC - AC")}
          {derived("VAC - variance at completion", d.vac, "BAC - EAC (negative = forecast overrun)")}
          {derived("TCPI", d.tcpi, "Efficiency needed on remaining work to land on budget")}
          {derived("CV - cost variance", d.costVariance, "EV - AC")}
          {derived("SV - schedule variance", d.scheduleVariance, "EV - PV")}
          {derived("% complete", d.percentComplete, "EV / BAC")}
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={saving} onClick={() => void save()}><Camera className="h-4 w-4 mr-1.5" />{saving ? "Saving…" : "Save EVM period"}</Button>
          <p className="text-xs text-slate-400">Saving triggers the cascade: EVM → health recalc → realtime refresh. Manual periods are flagged in the audit trail.</p>
        </div>
      </SectionCard>
    </div>
  );
}

// ================= WHAT IS EVM =================
function EvmAboutTab() {
  return (
    <div className="space-y-4">
      <SectionCard title="What is Earned Value Management?" description="The one method that answers all three questions at once: where did the plan say we should be, where are we really, and what does that mean for the end date and budget?">
        <p className="text-sm text-slate-600">EVM compares three curves: the <b>planned value (PV)</b> you budgeted for the work scheduled so far, the <b>earned value (EV)</b> of the work actually finished, and the <b>actual cost (AC)</b> you really paid. Together they expose what raw spend and percent-complete never can: whether you are behind, over cost, or both — and what the numbers say about the finish.</p>
      </SectionCard>
      <SectionCard title="The four base inputs" description="Everything else is math — never an opinion">
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-600">
          <p><b>BAC — Budget at Completion.</b> The approved total budget for the project. Comes from the financial baseline.</p>
          <p><b>PV — Planned Value.</b> How much work the schedule says should be done by the status date, valued at budgeted rates.</p>
          <p><b>EV — Earned Value.</b> How much work is actually done, valued at the same budgeted rates. In this platform EV flows from approved timesheets through the signature cascade.</p>
          <p><b>AC — Actual Cost.</b> What the work really cost — the labour cost ledger plus other actuals.</p>
        </div>
      </SectionCard>
      <SectionCard title="The derived metrics and their formulas" description="Computed, never typed (unless a MANUAL_PERIOD override is deliberately taken — and then it is audited)">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">
          <p><b>CPI = EV / AC.</b> Value per dollar spent. Below 1.00 = over cost.</p>
          <p><b>SPI = EV / PV.</b> Progress vs schedule. Below 1.00 = behind.</p>
          <p><b>EAC = BAC / CPI.</b> Expected total cost if current efficiency holds.</p>
          <p><b>ETC = EAC - AC.</b> Budget still needed from today.</p>
          <p><b>VAC = BAC - EAC.</b> Forecast surplus (positive) or overrun (negative) at completion.</p>
          <p><b>TCPI = (BAC - EV) / (BAC - AC).</b> The efficiency the remaining work must achieve to still land on budget — above ~1.1 is a warning.</p>
          <p><b>CV = EV - AC.</b> Cost variance in currency.</p>
          <p><b>SV = EV - PV.</b> Schedule variance in currency.</p>
          <p><b>% complete = EV / BAC.</b> Objective progress measured in earned dollars, not optimism.</p>
        </div>
      </SectionCard>
      <SectionCard title="How this platform keeps EVM honest" description="Integrity Layer rules apply here too">
        <div className="space-y-2 text-sm text-slate-600">
          <p>• The <b>Cockpit tab</b> always computes EVM live from tasks, actuals and the baseline — the same numbers the executive tower uses.</p>
          <p>• The <b>Full form tab</b> exists for governed period closes where the finance-recognised figures differ from the live computation: the snapshot is tagged <b>MANUAL_PERIOD</b>, audited with your identity, and health recalculates through the normal cascade.</p>
          <p>• Every snapshot feeds the trend lines, the governance thresholds (CPI/SPI rules raise alerts), and the P80 Monte Carlo cost model.</p>
        </div>
      </SectionCard>
    </div>
  );
}
