"use client";
// PM CONTROL TOWER — Portfolio health wall: RAG score cards + per-project snapshot drilldown.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDateTime, money, num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, RagBadge, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, cn,
} from "@/components/pmct/kit";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { HeartPulse, RefreshCcw, ShieldAlert, Bug } from "lucide-react";

interface HealthProject {
  id: string; code: string; name: string; status: string;
  healthScore: number; ragStatus: string; progress: number;
}
interface Snapshot {
  id: string; projectId: string; capturedAt: string; healthScore: number; ragStatus: string;
  cpi: number; spi: number; costVariance: number; scheduleVariance: number; eac: number; bac: number;
  openRisks: number; openIssues: number; overdueMilestones: number; resourceUtilization: number;
  triggeredBy: string; notes: string | null;
}
interface HealthWallData { projects: HealthProject[]; snapshots: Snapshot[] }
interface HealthProjectData { project: HealthProject & { forecastCost: number; actualCost: number }; latest: Snapshot | null; snapshots: Snapshot[] }

const RAG_TEXT: Record<string, string> = { GREEN: "text-emerald-600", AMBER: "text-amber-600", RED: "text-red-600" };

export default function HealthView() {
  const wall = useApi<HealthWallData>("/api/health");
  useRealtimeRefetch(wall.refetch, ["project:health", "alert:created"]);

  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useApi<HealthProjectData>(openId ? `/api/health?projectId=${openId}` : null);
  const [recalcing, setRecalcing] = useState(false);

  const latestByProject = useMemo(() => {
    const m: Record<string, Snapshot> = {};
    (wall.data?.snapshots ?? []).forEach((s) => {
      if (!m[s.projectId]) m[s.projectId] = s; // list is newest-first
    });
    return m;
  }, [wall.data]);

  const recalc = async () => {
    if (!openId) return;
    setRecalcing(true);
    try {
      await api.post("/api/health", { projectId: openId });
      toast.success("Health recalculated from live factors");
      await Promise.all([detail.refetch(), wall.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculation failed");
    } finally {
      setRecalcing(false);
    }
  };

  if (wall.loading && !wall.data) return <LoadingBlock label="Surveying project health…" />;
  if (wall.error && !wall.data) return <ErrorBlock message={wall.error} onRetry={wall.refetch} />;

  const projects = wall.data?.projects ?? [];
  const ragCounts = projects.reduce<Record<string, number>>((acc, p) => { acc[p.ragStatus] = (acc[p.ragStatus] || 0) + 1; return acc; }, {});
  const avgScore = projects.length ? projects.reduce((s, p) => s + p.healthScore, 0) / projects.length : 0;

  const open = projects.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        io="health-snapshots"
        title="Portfolio Health"
        subtitle="Composite project health from cost, schedule, risk, governance and capacity factors."
        breadcrumb={["Home", "Control", "Health"]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Projects" value={projects.length} icon={<HeartPulse className="h-4 w-4" />} />
        <StatCard label="Green" value={ragCounts.GREEN ?? 0} tone="good" />
        <StatCard label="Amber" value={ragCounts.AMBER ?? 0} tone="warn" />
        <StatCard label="Red" value={ragCounts.RED ?? 0} tone="bad" sub={`Portfolio average ${num(avgScore, 0)}`} />
      </div>

      {projects.length === 0 ? (
        <EmptyState title="No projects to monitor" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const snap = latestByProject[p.id];
            return (
              <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left">
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 font-medium">{p.code}</p>
                      <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                    </div>
                    <RagBadge rag={p.ragStatus} />
                  </div>
                  <div className="flex items-end gap-3 mt-3">
                    <span className={cn("text-4xl font-bold tabular-nums leading-none", RAG_TEXT[p.ragStatus] || "text-slate-700")}>
                      {Math.round(p.healthScore)}
                    </span>
                    <div className="text-[11px] text-slate-500 space-y-0.5 pb-0.5">
                      <p>CPI <span className={cn("tabular-nums font-medium", (snap?.cpi ?? 1) < 0.95 ? "text-red-600" : "text-slate-700")}>{snap ? num(snap.cpi, 2) : "—"}</span></p>
                      <p>SPI <span className={cn("tabular-nums font-medium", (snap?.spi ?? 1) < 0.95 ? "text-red-600" : "text-slate-700")}>{snap ? num(snap.spi, 2) : "—"}</span></p>
                    </div>
                    <div className="ml-auto text-right text-[11px] text-slate-500 space-y-0.5 pb-0.5">
                      <p className="flex items-center gap-1 justify-end"><ShieldAlert className="h-3 w-3 text-amber-500" />{snap?.openRisks ?? 0} risks</p>
                      <p className="flex items-center gap-1 justify-end"><Bug className="h-3 w-3 text-red-400" />{snap?.openIssues ?? 0} issues</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3">
                    {snap ? `Last snapshot ${fmtDateTime(snap.capturedAt)} · ${snap.triggeredBy.toLowerCase()}` : "No snapshot yet"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      <Sheet open={Boolean(openId)} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{open ? `${open.code} — ${open.name}` : "Project health"}</SheetTitle>
            <SheetDescription>Composite score with full snapshot history.</SheetDescription>
          </SheetHeader>
          {detail.loading && !detail.data ? <LoadingBlock /> : detail.error ? <ErrorBlock message={detail.error} onRetry={detail.refetch} /> : detail.data ? (
            <div className="px-4 pb-8 space-y-5">
              <div className="flex flex-wrap items-center gap-6">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      data={[{ name: "score", value: detail.data.project.healthScore, fill: detail.data.project.ragStatus === "GREEN" ? "#16a34a" : detail.data.project.ragStatus === "AMBER" ? "#d97706" : "#dc2626" }]}
                      innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar background={{ fill: "#f1f5f9" }} dataKey="value" cornerRadius={10} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="-mt-28 text-center pointer-events-none">
                    <p className={cn("text-4xl font-bold tabular-nums", RAG_TEXT[detail.data.project.ragStatus])}>{Math.round(detail.data.project.healthScore)}</p>
                    <p className="text-[10px] uppercase text-slate-400 mt-1">health score</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm flex-1 min-w-52">
                  <div><p className="text-[10px] uppercase text-slate-400">RAG</p><RagBadge rag={detail.data.project.ragStatus} /></div>
                  <div><p className="text-[10px] uppercase text-slate-400">Status</p><StatusChip status={detail.data.project.status} /></div>
                  <div><p className="text-[10px] uppercase text-slate-400">CPI / SPI</p><p className="tabular-nums text-slate-700">{detail.data.latest ? `${num(detail.data.latest.cpi, 2)} / ${num(detail.data.latest.spi, 2)}` : "—"}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-400">EAC</p><p className="tabular-nums text-slate-700">{detail.data.latest ? money(detail.data.latest.eac) : "—"}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-400">Open risks / issues</p><p className="tabular-nums text-slate-700">{detail.data.latest?.openRisks ?? 0} / {detail.data.latest?.openIssues ?? 0}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-400">Progress</p><p className="tabular-nums text-slate-700">{num(detail.data.project.progress, 1)}%</p></div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Snapshot history</h4>
                <Button size="sm" variant="outline" disabled={recalcing} onClick={() => void recalc()}>
                  <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", recalcing && "animate-spin")} />Recalculate
                </Button>
              </div>

              {detail.data.snapshots.length === 0 ? <EmptyState title="No snapshots recorded" /> : (
                <div className="rounded-lg border border-slate-200 overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-[1]">
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {["Captured", "Score", "RAG", "CPI", "SPI", "EAC", "Risks", "Issues", "Trigger"].map((h) => (
                          <th key={h} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...detail.data.snapshots].reverse().map((s) => (
                        <tr key={s.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 tabular-nums">{fmtDateTime(s.capturedAt)}</td>
                          <td className={cn("px-3 py-2.5 tabular-nums font-semibold", RAG_TEXT[s.ragStatus])}>{s.healthScore}</td>
                          <td className="px-3 py-2.5"><RagBadge rag={s.ragStatus} /></td>
                          <td className={cn("px-3 py-2.5 tabular-nums", s.cpi >= 0.95 ? "text-slate-600" : "text-red-600")}>{num(s.cpi, 2)}</td>
                          <td className={cn("px-3 py-2.5 tabular-nums", s.spi >= 0.95 ? "text-slate-600" : "text-red-600")}>{num(s.spi, 2)}</td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">{money(s.eac)}</td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">{s.openRisks}</td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-600">{s.openIssues}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-400">{s.triggeredBy.replace(/_/g, " ").toLowerCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
