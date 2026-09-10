"use client";
// PM CONTROL TOWER — Workspace Health tab: score gauge, snapshot history, manual recalculation

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, RagBadge, Button } from "@/components/pmct/kit";
import { money, num, fmtDateTime } from "@/lib/constants";
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { RefreshCw } from "lucide-react";

interface HealthSnapshot {
  id: string;
  capturedAt: string;
  healthScore: number;
  ragStatus: string;
  cpi: number;
  spi: number;
  costVariance: number;
  scheduleVariance: number;
  eac: number;
  bac: number;
  openRisks: number;
  openIssues: number;
  overdueMilestones: number;
  resourceUtilization: number;
  triggeredBy: string;
  notes: string | null;
}
interface HealthBundle {
  project: { id: string; code: string; name: string; status: string; healthScore: number; ragStatus: string; progress: number; forecastCost: number; actualCost: number };
  latest: HealthSnapshot | null;
  snapshots: HealthSnapshot[];
}

export default function HealthTab({ projectId }: { projectId: string }) {
  const health = useApi<HealthBundle>(`/api/health?projectId=${projectId}`);
  useRealtimeRefetch(health.refetch, ["project:health", "evm:changed", "raid:changed"]);
  const [recalcing, setRecalcing] = useState(false);

  const recalc = async () => {
    setRecalcing(true);
    try {
      await api.post("/api/health", { projectId });
      toast.success("Health recalculated");
      await health.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculation failed");
    } finally {
      setRecalcing(false);
    }
  };

  if (health.loading) return <LoadingBlock label="Loading health telemetry…" />;
  if (health.error || !health.data) return <ErrorBlock message={health.error || "Health unavailable"} onRetry={health.refetch} />;

  const latest = health.data.latest;
  const score = health.data.latest ? health.data.latest.healthScore : health.data.project.healthScore;
  const rag = health.data.latest ? health.data.latest.ragStatus : health.data.project.ragStatus;
  const gaugeColor = score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : "#dc2626";
  const snapshots = [...(health.data.snapshots || [])].reverse(); // newest first for the list

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Health score" description="Composite of schedule, cost, risk and delivery signals" bodyClass="p-4 pt-2">
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="66%" outerRadius="100%" data={[{ name: "health", value: Math.max(score, 0), fill: gaugeColor }]} startAngle={210} endAngle={-30}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background={{ fill: "#f1f5f9" }} dataKey="value" cornerRadius={10} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-semibold tabular-nums" style={{ color: gaugeColor }}>{Math.round(score)}</span>
              <RagBadge rag={rag} />
            </div>
          </div>
          <div className="flex justify-center">
            <Button size="sm" variant="outline" className="h-8" onClick={recalc} disabled={recalcing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recalcing ? "animate-spin" : ""}`} /> {recalcing ? "Recalculating…" : "Recalculate now"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Current factor readout" description="Latest snapshot detail" className="lg:col-span-2" bodyClass="p-4 pt-2">
          {latest ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">CPI</p><p className="text-lg font-semibold tabular-nums">{num(latest.cpi, 2)}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">SPI</p><p className="text-lg font-semibold tabular-nums">{num(latest.spi, 2)}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">EAC</p><p className="text-lg font-semibold tabular-nums">{money(latest.eac)}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Open risks</p><p className="text-lg font-semibold">{latest.openRisks}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Open issues</p><p className="text-lg font-semibold">{latest.openIssues}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Overdue milestones</p><p className="text-lg font-semibold">{latest.overdueMilestones}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Cost variance</p><p className={`text-sm font-semibold tabular-nums ${latest.costVariance < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(latest.costVariance)}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Schedule variance</p><p className={`text-sm font-semibold tabular-nums ${latest.scheduleVariance < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(latest.scheduleVariance)}</p></div>
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Triggered by</p><p className="text-sm font-medium">{latest.triggeredBy.replace("_", " ").toLowerCase()}</p></div>
              {latest.notes && <p className="col-span-2 sm:col-span-3 text-xs text-slate-500 border-t border-slate-100 pt-2">{latest.notes}</p>}
            </div>
          ) : <p className="text-sm text-slate-400 py-8 text-center">No snapshots yet — recalculate to generate the first one.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Snapshot history" description={`${snapshots.length} recorded evaluations (newest first)`}>
        {!snapshots.length ? <p className="text-sm text-slate-400 py-8 text-center">No history recorded.</p> : (
          <div className="rounded-lg border border-slate-200 overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Captured</th>
                  <th className="px-3 py-2.5 font-medium">Score</th>
                  <th className="px-3 py-2.5 font-medium">RAG</th>
                  <th className="px-3 py-2.5 font-medium text-right">CPI</th>
                  <th className="px-3 py-2.5 font-medium text-right">SPI</th>
                  <th className="px-3 py-2.5 font-medium text-right">EAC</th>
                  <th className="px-3 py-2.5 font-medium text-right">Risks</th>
                  <th className="px-3 py-2.5 font-medium text-right">Issues</th>
                  <th className="px-3 py-2.5 font-medium">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtDateTime(s.capturedAt)}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{Math.round(s.healthScore)}</td>
                    <td className="px-3 py-2"><StatusChip status={s.ragStatus} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{num(s.cpi, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{num(s.spi, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{money(s.eac)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{s.openRisks}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{s.openIssues}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{s.triggeredBy.replace("_", " ").toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
