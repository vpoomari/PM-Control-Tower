"use client";
// PM CONTROL TOWER — Workspace EVM tab: earned value metric cards, CPI/SPI history, snapshot action

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatCard, Button } from "@/components/pmct/kit";
import { money, num, fmtDate } from "@/lib/constants";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid,
} from "recharts";
import { Camera } from "lucide-react";

interface EvmPoint {
  id: string;
  statusDate: string;
  bac: number; pv: number; ev: number; ac: number;
  cpi: number; spi: number; eac: number; etc: number; vac: number; tcpi: number;
  costVariance: number; scheduleVariance: number; percentComplete: number; source: string;
}
/** Live computation (computeEVM) — no statusDate/source; snapshots carry those. */
type EvmLive = Omit<EvmPoint, "id" | "statusDate" | "source">;
interface EvmBundle {
  evm: EvmLive;
  current: EvmLive;
  latestSnapshot: EvmPoint | null;
  history: EvmPoint[];
  project: { id: string; code: string; name: string };
}

function evmTone(v: number, lowerBad = true): "good" | "warn" | "bad" | "default" {
  if (lowerBad) return v >= 1 ? "good" : v >= 0.95 ? "warn" : "bad";
  return v <= 0 ? "good" : "bad";
}

export default function EvmTab({ projectId }: { projectId: string }) {
  const evm = useApi<EvmBundle>(`/api/evm?projectId=${projectId}`);
  useRealtimeRefetch(evm.refetch, ["evm:changed", "project:updated", "timesheet:changed"]);
  const [snapshotting, setSnapshotting] = useState(false);

  const snapshot = async () => {
    setSnapshotting(true);
    try {
      await api.post("/api/evm", { projectId });
      toast.success("EVM snapshot persisted");
      await evm.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setSnapshotting(false);
    }
  };

  if (evm.loading) return <LoadingBlock label="Computing earned value…" />;
  if (evm.error || !evm.data) return <ErrorBlock message={evm.error || "EVM unavailable"} onRetry={evm.refetch} />;

  const m = evm.data.evm;
  const history = (evm.data.history || []).map((h) => ({
    date: fmtDate(h.statusDate),
    CPI: Math.round(h.cpi * 100) / 100,
    SPI: Math.round(h.spi * 100) / 100,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="BAC" value={money(m.bac)} sub="Budget at completion" />
        <StatCard label="PV" value={money(m.pv)} sub="Planned value" />
        <StatCard label="EV" value={money(m.ev)} sub="Earned value" />
        <StatCard label="AC" value={money(m.ac)} sub="Actual cost" />
        <StatCard label="CPI" value={num(m.cpi, 2)} sub="EV / AC" tone={evmTone(m.cpi)} />
        <StatCard label="SPI" value={num(m.spi, 2)} sub="EV / PV" tone={evmTone(m.spi)} />
        <StatCard label="EAC" value={money(m.eac)} sub="Estimate at completion" tone={m.eac > m.bac ? "bad" : "good"} />
        <StatCard label="ETC" value={money(m.etc)} sub="Estimate to complete" />
        <StatCard label="VAC" value={money(m.vac)} sub="BAC − EAC" tone={evmTone(m.vac, false)} />
        <StatCard label="TCPI" value={num(m.tcpi, 2)} sub="Work remaining / funds remaining" tone={m.tcpi > 1.1 ? "warn" : "default"} />
        <StatCard label="CV" value={money(m.costVariance)} sub="EV − AC" tone={evmTone(m.costVariance, false)} />
        <StatCard label="SV" value={money(m.scheduleVariance)} sub="EV − PV" tone={evmTone(m.scheduleVariance, false)} />
      </div>

      <SectionCard
        title="CPI / SPI history"
        description={`${history.length} status periods · latest status date ${fmtDate(evm.data.latestSnapshot?.statusDate)}${evm.data.latestSnapshot?.source ? ` · source ${evm.data.latestSnapshot.source.replace("_", " ").toLowerCase()}` : " · no snapshot yet"}`}
        actions={(
          <Button size="sm" className="h-8" onClick={snapshot} disabled={snapshotting}>
            <Camera className="h-3.5 w-3.5 mr-1" /> {snapshotting ? "Snapshotting…" : "Create snapshot"}
          </Button>
        )}
      >
        {history.length < 2 ? (
          <p className="text-sm text-slate-400 py-10 text-center">Not enough status periods for a trend — snapshots appear as periods close.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 1.4]} ticks={[0, 0.25, 0.5, 0.75, 1, 1.25]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <RTooltip />
                <Legend iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="CPI" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="SPI" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Thresholds: CPI/SPI ≥ 1.00 on-track (green), 0.95–1.00 watch (amber), &lt; 0.95 intervention (red). Manual snapshots freeze the current computation for governance reporting.
        </p>
      </SectionCard>
    </div>
  );
}
