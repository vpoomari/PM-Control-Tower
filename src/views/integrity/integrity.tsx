"use client";
// PM CONTROL TOWER — Data Integrity & Foresight hub (The Integrity Layer)
// Freshness (honest staleness) · Evidence bundles · P80 simulations · Calibration ·
// Scenario sandbox · AI actions (draft-first) · Benefits realization.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { useMe } from "@/views/execute/shared/pickers";
import { hasPerm } from "@/views/execute/shared/pickers";
import { money, num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Badge, Input, cn,
} from "@/components/pmct/kit";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, FileCheck2, Target, Gauge, GitBranch, Sparkles, Trophy, ShieldCheck, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, Cell as BarCell } from "recharts";

interface ProjectLite { id: string; code: string; name: string; ragStatus: string; healthScore: number }
interface FreshnessRow { project: ProjectLite; score: number; level: string; worstFeed: string; feeds: { feed: string; ageDays: number; staleness: number; level: string }[] }
interface Bundle { id: string; projectId: string; createdByName: string; docCount: number; manifestHash: string; status: string; verifiedAt: string | null; createdAt: string; project: { code: string; name: string } }
interface SimRun { id: string; seed: number; iterations: number; stale: boolean; createdAt: string; status: string; error?: string | null; result: SimResult | null }
interface SimResult {
  runId: string; seed: number; iterations: number; prng: string; deterministicFinishDay: number;
  finish: { p10: number; p50: number; p80: number; p90: number };
  cost: { p50: number; p80: number }; criticality: Record<string, number>;
  milestones: Record<string, { name: string; p50: number; p80: number }>;
  projectName: string; projectCode: string;
  projectStart?: string;
}
interface CalFactor { id: string; scopeType: string; label: string; factor: number; sampleSize: number; mad: number; confident: boolean }
interface ScenarioRow { id: string; name: string; projectId: string; status: string; createdByName: string; createdAt: string; changeRequestId: string | null; project: { code: string; name: string } }
interface AiActionRow { id: string; type: string; title: string; status: string; trigger: string | null; humanReviewer: string | null; createdAt: string; contentJson: string; project: { code: string; name: string } | null }
interface BenefitProfileRow { id: string; name: string; type: string; baselineValue: number; targetValue: number; active: boolean; owner: string; actuals: { value: number; period: string }[] }
interface BenefitProjectRow { project: ProjectLite; profiles: BenefitProfileRow[]; rollup: { promised: number; delivered: number; realizationPct: number; atRiskProfiles: string[]; activeProfiles: number }; strategic: { rag: string; note: string } }
interface DqRow { project: { id: string; code: string; name: string; ragStatus: string; healthScore: number }; score: number; issues: { check: string; detail: string }[]; riskTotals: { open: number; noOwner: number; noMitigation: number }; unassignedTasks: number }
interface ScenarioDiff { baseFinishDay: number; simulatedFinishDay: number; finishDeltaDays: number; budgetDelta: number; applied: string[]; affectedTasks: string[] }

const HATCH = { backgroundImage: "repeating-linear-gradient(45deg, rgba(15,23,42,0.07) 0 6px, transparent 6px 12px)" };
const dayToDate = (startISO: string, day: number) => new Date(new Date(startISO).getTime() + day * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const LEVEL_TONE: Record<string, string> = { CURRENT: "bg-emerald-50 text-emerald-700 border-emerald-200", WARN: "bg-amber-50 text-amber-700 border-amber-200", DEGRADE: "bg-orange-50 text-orange-700 border-orange-200", CRITICAL: "bg-red-50 text-red-700 border-red-200" };
const TABS = ["Freshness", "Evidence", "Simulations", "Calibration", "Scenarios", "AI Actions", "Benefits", "Data Quality"] as const;

export default function IntegrityView() {
  const me = useMe();
  const canManage = hasPerm(me, "integrity.manage");
  const canScenario = hasPerm(me, "scenario.manage");
  const canBenefits = hasPerm(me, "benefits.manage");

  const [tab, setTab] = useState<(typeof TABS)[number]>("Freshness");
  const projects = useApi<{ items: ProjectLite[] }>("/api/projects");
  const projectList = projects.data?.items ?? [];
  const [projectId, setProjectId] = useState<string>("");

  const fresh = useApi<{ projects: FreshnessRow[] }>(tab === "Freshness" ? "/api/integrity/freshness" : null);
  const bundles = useApi<{ bundles: Bundle[] }>(tab === "Evidence" ? "/api/integrity/evidence" : null);
  const calib = useApi<{ factors: CalFactor[]; advisory: string }>(tab === "Calibration" ? "/api/integrity/calibration" : null);
  const scenarios = useApi<{ scenarios: ScenarioRow[] }>(tab === "Scenarios" ? "/api/integrity/scenarios" : null);
  const aiActions = useApi<{ actions: AiActionRow[] }>(tab === "AI Actions" ? "/api/integrity/ai-actions" : null);
  const benefits = useApi<{ projects: BenefitProjectRow[]; totals: { promised: number; delivered: number; realizationPct: number } }>(tab === "Benefits" ? "/api/integrity/benefits" : null);
  const dq = useApi<{ projects: DqRow[]; averageScore: number; resourceIssues: { total: number; withoutSkills: number; names: string[] } }>(tab === "Data Quality" ? "/api/integrity/data-quality" : null);
  const runs = useApi<{ runs: SimRun[] }>(tab === "Simulations" && projectId ? `/api/integrity/simulate?projectId=${projectId}` : null);

  const [sim, setSim] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<ScenarioDiff | null>(null);
  const activeScenario = useMemo(() => scenarios.data?.scenarios.find((s) => s.status === "SANDBOX") ?? null, [scenarios.data]);
  const effProjectId = projectId || projectList[0]?.id || "";

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const run = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const res = await api.post<{ runId: string; status: string }>("/api/integrity/simulate", { projectId: effProjectId, iterations: 1000 });
      toast.success("Simulation queued — the async worker will complete it shortly");
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const r = await api.get<{ runs: SimRun[] }>(`/api/integrity/simulate?projectId=${effProjectId}`);
        runs.refetch();
        const done = r.runs.find((x) => x.id === res.runId);
        if (done && done.status === "COMPLETE" && done.result) {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
          setSim({ runId: done.id, seed: done.result.seed ?? done.seed, iterations: done.result.iterations ?? done.iterations, prng: done.result.prng ?? "mulberry32", deterministicFinishDay: done.result.deterministicFinishDay, finish: done.result.finish, cost: done.result.cost, criticality: done.result.criticality ?? {}, milestones: done.result.milestones ?? {}, projectName: "", projectCode: "", projectStart: done.result.projectStart });
          toast.success(`Simulation complete — P50 ${done.result.finish.p50}, P80 ${done.result.finish.p80}`);
        }
        if (done && done.status === "FAILED") { if (pollRef.current) clearInterval(pollRef.current); setBusy(false); toast.error("Simulation failed: " + (done.result as unknown as string) ); }
      }, 2000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Queueing failed"); setBusy(false); }
  };
  const exportBundle = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const res = await api.post<{ bundleId: string; docCount: number }>("/api/integrity/evidence", { projectId: effProjectId });
      toast.success(`Evidence bundle exported — ${res.docCount} documents chained`); bundles.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); } finally { setBusy(false); }
  };
  const verifyBundle = async (id: string) => {
    try {
      const res = await api.post<{ pass: boolean; firstBrokenRef: string | null }>(`/api/integrity/evidence/${id}/verify`, {});
      if (res.pass) toast.success("Chain integrity: PASS — every document verified");
      else toast.error(`Chain integrity: FAIL — altered document: ${res.firstBrokenRef}`);
      bundles.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verify failed"); }
  };
  const recomputeCalib = async () => {
    setBusy(true);
    try { const r = await api.post<{ recomputed: number }>("/api/integrity/calibration", {}); toast.success(`${r.recomputed} calibration factors recomputed`); calib.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Recompute failed"); } finally { setBusy(false); }
  };
  const forkScenario = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const r = await api.post<{ scenarioId: string }>("/api/integrity/scenarios", { projectId: effProjectId, name: `What-if ${new Date().toLocaleDateString()}` });
      toast.success("Sandbox branched — production is untouched"); scenarios.refetch(); setDiff(null); setProjectId(effProjectId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Fork failed"); } finally { setBusy(false); }
  };
  const simulateScenario = async (stress: boolean) => {
    if (!activeScenario) return;
    setBusy(true);
    try {
      const list = await api.get<{ scenarios: { id: string; summary: { tasks: { id: string; name: string; durationDays: number }[]; assignments: { id: string; resourceName: string }[] } }[] }>("/api/integrity/scenarios");
      const s = list.scenarios.find((x) => x.id === activeScenario.id);
      const overrides: { durationChanges?: Record<string, number>; removeAssignments?: string[] } = {};
      if (stress && s && s.summary.tasks.length) {
        const longest = [...s.summary.tasks].sort((a, b) => b.durationDays - a.durationDays)[0];
        overrides.durationChanges = { [longest.id]: Math.round(longest.durationDays * 1.5 * 10) / 10 };
      }
      const r = await api.patch<{ diff: ScenarioDiff }>("/api/integrity/scenarios", { id: activeScenario.id, overrides });
      setDiff(r.diff); scenarios.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Simulate failed"); } finally { setBusy(false); }
  };
  const mergeScenario = async () => {
    if (!activeScenario) return;
    setBusy(true);
    try {
      const r = await api.post<{ changeRequest: { code: string } }>(`/api/integrity/scenarios/${activeScenario.id}/merge`, {});
      toast.success(`Merged as ${r.changeRequest.code} — production updated with full audit`); scenarios.refetch(); setDiff(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Merge failed"); } finally { setBusy(false); }
  };
  const discardScenario = async () => {
    if (!activeScenario) return;
    try { await api.del(`/api/integrity/scenarios?id=${activeScenario.id}`); toast.success("Scenario discarded"); scenarios.refetch(); setDiff(null); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Discard failed"); }
  };
  const draftPack = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const r = await api.post<{ title: string; needsRePlan: boolean }>("/api/integrity/ai-actions", { projectId: effProjectId, type: "STEERING_PACK" });
      toast.success(`${r.title} drafted${r.needsRePlan ? " — re-plan proposal included (SPI < 0.9 ×3)" : ""}`); aiActions.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Draft failed"); } finally { setBusy(false); }
  };
  const [approvalLink, setApprovalLink] = useState<{ url: string; expiresAt: string; title: string } | null>(null);
  const createApprovalLink = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const res = await api.post<{ url: string; expiresAt: string; title: string }>("/api/integrity/approvals", { projectId: effProjectId });
      setApprovalLink(res); toast.success("Signed link created — decision via the link is audited");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Link failed"); } finally { setBusy(false); }
  };
  const decide = async (id: string, status: "APPROVED" | "REJECTED") => {
    try { await api.patch("/api/integrity/ai-actions", { id, status }); toast.success(`Human decision recorded: ${status}`); aiActions.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Decision failed"); }
  };

  const projectSelect = (
    <Select value={effProjectId} onValueChange={setProjectId}>
      <SelectTrigger className="bg-white h-9 w-full sm:w-64" aria-label="Project"><SelectValue placeholder="Select project" /></SelectTrigger>
      <SelectContent className="max-h-72">{projectList.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        io="governance"
        title="Data Integrity & Foresight"
        subtitle="The Integrity Layer — the tower tells you when it lies, the forecast admits uncertainty, decisions are tested first, and value is tracked after go-live."
        breadcrumb={["Home", "Control", "Data Integrity"]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
              tab === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
            {t}
          </button>
        ))}
      </div>

      {(tab === "Simulations" || tab === "Evidence" || tab === "AI Actions") && (
        <div className="flex flex-wrap items-center gap-3">
          {projectSelect}
          {tab === "Simulations" && canManage && <Button size="sm" disabled={busy || !effProjectId} onClick={() => void run()}><RefreshCw className="h-4 w-4 mr-1.5" />Run Monte Carlo (1,000 iters)</Button>}
          {tab === "Evidence" && canManage && <Button size="sm" disabled={busy || !effProjectId} onClick={() => void exportBundle()}><FileCheck2 className="h-4 w-4 mr-1.5" />Export evidence bundle</Button>}
          {tab === "AI Actions" && canManage && <Button size="sm" disabled={busy || !effProjectId} onClick={() => void draftPack()}><Sparkles className="h-4 w-4 mr-1.5" />Draft steering pack</Button>}
        </div>
      )}

      {/* FRESHNESS */}
      {tab === "Freshness" && (fresh.loading && !fresh.data ? <LoadingBlock label="Computing live freshness…" /> : fresh.error ? <ErrorBlock message={fresh.error} onRetry={fresh.refetch} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Projects" value={fresh.data!.projects.length} />
            <StatCard label="Current" value={fresh.data!.projects.filter((p) => p.level === "CURRENT").length} tone="good" />
            <StatCard label="Degrading" value={fresh.data!.projects.filter((p) => p.level === "DEGRADE" || p.level === "WARN").length} tone="warn" sub="1.0×–2.5× cadence" />
            <StatCard label="Critical" value={fresh.data!.projects.filter((p) => p.level === "CRITICAL").length} tone="bad" sub="Dashboard may be lying" />
          </div>
          {fresh.data!.projects.map((row) => (
            <SectionCard key={row.project.id} title={`${row.project.code} — ${row.project.name}`}
              description={`worst feed: ${row.worstFeed}`}
              actions={<span className={cn("px-2 py-0.5 rounded-full border text-xs font-semibold", LEVEL_TONE[row.level])}>DATA AS OF {row.feeds.length ? Math.round(row.feeds.reduce((s, f) => Math.max(s, f.ageDays), 0) * 10) / 10 : 0}d · {row.score}/100</span>}>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {row.feeds.map((f) => (
                  <div key={f.feed} className={cn("rounded-lg border p-2.5", f.level === "CURRENT" ? "border-slate-200 bg-white" : f.level === "WARN" ? "border-amber-200 bg-amber-50" : f.level === "DEGRADE" ? "border-orange-300 bg-orange-50" : "border-red-300 bg-red-50")}>
                    <p className="text-[11px] uppercase text-slate-400 font-semibold">{f.feed}</p>
                    <p className="text-sm font-semibold text-slate-700 tabular-nums">{f.ageDays}d old</p>
                    <p className="text-[11px] text-slate-500">{f.staleness}× cadence · {f.level}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Hatching rule: tiles degrade visually when a feed breaches 1.5× its cadence — staleness is never silent.</p>
            </SectionCard>
          ))}
        </div>
      ))}

      {/* EVIDENCE */}
      {tab === "Evidence" && (bundles.loading && !bundles.data ? <LoadingBlock /> : bundles.error ? <ErrorBlock message={bundles.error} onRetry={bundles.refetch} /> : (
        <SectionCard title="Evidence bundle registry" description="SHA-256 hash chain across every baseline, decision, timesheet and audit record — tampering breaks the chain visibly.">
          {bundles.data!.bundles.length === 0 ? <EmptyState title="No bundles yet" description="Export a bundle to create an audit-grade, tamper-evident record." /> : (
            <div className="space-y-2">
              {bundles.data!.bundles.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <FileCheck2 className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{b.project.code} — {b.project.name}</p>
                    <p className="text-xs text-slate-400 truncate">{b.docCount} docs · manifest {b.manifestHash.slice(0, 16)}… · by {b.createdByName}</p>
                  </div>
                  <Badge variant="outline" className={b.status === "VALID" ? "border-emerald-200 text-emerald-700" : "border-red-300 text-red-700"}>{b.status}</Badge>
                  <Button variant="outline" size="sm" onClick={() => void verifyBundle(b.id)}><ShieldCheck className="h-3.5 w-3.5 mr-1" />Verify chain</Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ))}

      {/* SIMULATIONS */}
      {tab === "Simulations" && (
        <div className="space-y-3">
          {sim ? (
            <SectionCard title={`P80 probabilistic forecast — ${sim.projectCode}`} description={`seed ${sim.seed} · ${sim.iterations} iterations · PRNG ${sim.prng} (reproducible)`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <StatCard label="Deterministic finish" value={sim.projectStart ? dayToDate(sim.projectStart, sim.deterministicFinishDay) : `day ${sim.deterministicFinishDay}`} sub="assumes everything goes to plan" />
                <StatCard label="P50 finish" value={sim.projectStart ? dayToDate(sim.projectStart, sim.finish.p50) : `day ${sim.finish.p50}`} sub="P50" tone="good" />
                <StatCard label="P80 finish" value={sim.projectStart ? dayToDate(sim.projectStart, sim.finish.p80) : `day ${sim.finish.p80}`} tone="warn" sub="plan for this date" />
                <StatCard label="P10 – P90 spread" value={`${sim.finish.p10} – ${sim.finish.p90}`} />
              </div>
              {(() => {
                const fan = [
                  { name: "P10", p10: sim.finish.p10, band: 0, p50: sim.finish.p10 },
                  { name: "P50", p10: sim.finish.p10, band: sim.finish.p80 - sim.finish.p10, p50: sim.finish.p50 },
                  { name: "P80", p10: sim.finish.p10, band: sim.finish.p80 - sim.finish.p10, p50: sim.finish.p50 },
                  { name: "P90", p10: sim.finish.p10, band: sim.finish.p90 - sim.finish.p10, p50: sim.finish.p50 },
                ];
                return (
                  <div className="rounded-lg border border-slate-200 p-3 mb-3">
                    <p className="font-semibold text-slate-700 text-sm mb-1">Confidence band (P10–P90 envelope, P50 line)</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={fan} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <ChartTooltip formatter={(val: number | string) => String(val)} />
                        <Area dataKey="p10" stackId="band" stroke="none" fill="transparent" />
                        <Area dataKey="band" stackId="band" stroke="none" fill="#1d4ed8" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="p50" stroke="#1d4ed8" fill="none" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-700 mb-1.5">Cost confidence</p>
                  <p className="text-slate-600 tabular-nums">P50 ${money(sim.cost.p50)} · P80 ${money(sim.cost.p80)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-700 mb-1.5">Criticality index (top tasks)</p>
                  {Object.entries(sim.criticality).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tid, pct]) => (
                    <div key={tid} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="truncate flex-1">{tid.slice(-8)}</span>
                      <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                      <span className="tabular-nums w-10 text-right">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Honest label: the deterministic date assumes everything goes to plan. The P50–P80 band is what the dependencies actually support.</p>
            </SectionCard>
          ) : <EmptyState title="No simulation in view" description="Pick a project and run a seeded Monte Carlo — same seed always reproduces the same percentiles." />}
          {runs.data && runs.data.runs.length > 0 && (
            <SectionCard title="Run history" description="Older runs are flagged stale when the schedule changes — stale results are never served silently.">
              <div className="space-y-1.5">
                {runs.data.runs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <span className="text-slate-600">seed {r.seed} · {r.iterations} iters · {new Date(r.createdAt).toLocaleString()}</span>
                    {r.stale ? <Badge variant="outline" className="border-amber-200 text-amber-700">STALE — schedule changed</Badge> : <Badge variant="outline" className="border-emerald-200 text-emerald-700">CURRENT</Badge>}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* CALIBRATION */}
      {tab === "Calibration" && (calib.loading && !calib.data ? <LoadingBlock /> : calib.error ? <ErrorBlock message={calib.error} onRetry={calib.refetch} /> : (
        <div className="space-y-3">
          <SectionCard title="Say/Do reliability — the organizational memory of estimation bias" description={calib.data!.advisory}
            actions={canManage && <Button variant="outline" size="sm" disabled={busy} onClick={() => void recomputeCalib()}><RefreshCw className="h-3.5 w-3.5 mr-1" />Recompute</Button>}>
            {calib.data!.factors.length === 0 ? <EmptyState title="Not enough completed work yet" description="Factors appear after 5+ completed tasks per scope." /> : (
              <div className="space-y-1.5">
                {calib.data!.factors.slice(0, 12).map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{f.label}</p>
                      <p className="text-[11px] text-slate-400">{f.scopeType} · {f.sampleSize} samples · MAD {f.mad}</p>
                    </div>
                    <Badge variant="outline" className={cn("tabular-nums", f.factor > 1.2 ? "border-red-200 text-red-700" : f.factor < 0.85 ? "border-blue-200 text-blue-700" : "border-emerald-200 text-emerald-700")}>
                      {f.factor}× planned
                    </Badge>
                    {!f.confident && <Badge variant="outline" className="border-slate-200 text-slate-400">low confidence</Badge>}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-2">Planning overlays suggest “UAT tasks in this team historically take 1.8× planned — suggested duration 9d instead of 5d”. Advisory only; applying is always a human choice.</p>
          </SectionCard>
        </div>
      ))}

      {/* SCENARIOS */}
      {tab === "Scenarios" && (scenarios.loading && !scenarios.data ? <LoadingBlock /> : scenarios.error ? <ErrorBlock message={scenarios.error} onRetry={scenarios.refetch} /> : (
        <div className="space-y-3">
          {canScenario && (
            <SectionCard title="Scenario sandbox — test decisions on a clone before committing" description="Fork a project, change it, watch the quantified trade-off. Production dashboards never read sandbox rows.">
              <div className="flex flex-wrap items-center gap-3">
                {projectSelect}
                <Button size="sm" disabled={busy || !effProjectId} onClick={() => void forkScenario()}><GitBranch className="h-4 w-4 mr-1.5" />Branch sandbox</Button>
              </div>
            </SectionCard>
          )}
          {activeScenario && (
            <SectionCard title={`Active sandbox: ${activeScenario.name}`} description={`${activeScenario.project.code} — branched by ${activeScenario.createdByName}`}
              actions={canScenario && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void simulateScenario(true)}><Target className="h-3.5 w-3.5 mr-1" />Re-simulate</Button>
                  <Button size="sm" disabled={busy || !diff} onClick={() => void mergeScenario()}>Merge as Change Request</Button>
                  <Button variant="ghost" size="sm" onClick={() => void discardScenario()}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}>
              {diff ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="Finish before" value={`day ${diff.baseFinishDay}`} />
                  <StatCard label="Finish after" value={`day ${diff.simulatedFinishDay}`} tone={diff.finishDeltaDays > 0 ? "bad" : "good"} />
                  <StatCard label="Schedule delta" value={`${diff.finishDeltaDays >= 0 ? "+" : ""}${diff.finishDeltaDays}d`} tone={diff.finishDeltaDays > 0 ? "bad" : "good"} />
                  <StatCard label="Budget delta" value={money(diff.budgetDelta)} />
                  <div className="col-span-2 lg:col-span-4 text-xs text-slate-500">{diff.applied.length ? `Applied: ${diff.applied.join(" · ")}` : "No overrides applied yet — adjust durations or assignments, then re-simulate."}</div>
                </div>
              ) : <EmptyState title="No simulation yet" description="Change the sandbox (task durations, assignments, budget) and re-simulate to see the quantified trade-off." />}
            </SectionCard>
          )}
          <SectionCard title="Scenario log">
            {scenarios.data!.scenarios.length === 0 ? <EmptyState title="No scenarios yet" /> : (
              <div className="space-y-1.5">
                {scenarios.data!.scenarios.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <GitBranch className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-700 flex-1 truncate">{s.name} <span className="text-slate-400 font-normal">· {s.project.code}</span></span>
                    <StatusChip status={s.status} />
                    {s.changeRequestId && <Badge variant="outline" className="border-blue-200 text-blue-700">{s.changeRequestId.slice(0, 10)}…</Badge>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ))}

      {/* AI ACTIONS */}
      {tab === "AI Actions" && (aiActions.loading && !aiActions.data ? <LoadingBlock /> : aiActions.error ? <ErrorBlock message={aiActions.error} onRetry={aiActions.refetch} /> : (
        <SectionCard title="Agentic work products — drafted by AI, decided by humans" description="Every draft records its trigger; every decision records its reviewer. Nothing auto-executes."
        actions={canManage && effProjectId && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void createApprovalLink()}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" />Create signed approval link
          </Button>
        )}>
        {approvalLink && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">Signed approval link (HMAC-SHA256, expiring) — status: CONFIGURED</p>
            <p className="text-xs text-amber-700 break-all mt-1">{approvalLink.title} · expires {new Date(approvalLink.expiresAt).toLocaleString()}</p>
            <a className="text-xs text-blue-700 underline break-all" href={approvalLink.url} target="_blank" rel="noreferrer">{approvalLink.url.slice(0, 72)}…</a>
          </div>
        )}
          {aiActions.data!.actions.length === 0 ? <EmptyState title="No drafts yet" description="Draft a steering pack to see the human-gated flow." /> : (
            <div className="space-y-2">
              {aiActions.data!.actions.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-sm font-medium text-slate-800 flex-1 truncate">{a.title}</p>
                    {a.trigger && a.trigger !== "MANUAL" && <Badge variant="outline" className="border-amber-200 text-amber-700">{a.trigger}</Badge>}
                    <StatusChip status={a.status} />
                    {a.status === "DRAFTED" && canManage && (
                      <span className="flex gap-1.5">
                        <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => void decide(a.id, "APPROVED")}><CheckCircle2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => void decide(a.id, "REJECTED")}><XCircle className="h-4 w-4" /></Button>
                      </span>
                    )}
                  </div>
                  {a.humanReviewer && <p className="text-[11px] text-slate-400 mt-1">Reviewer: {a.humanReviewer}</p>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ))}

      {/* BENEFITS */}
      {tab === "Benefits" && (benefits.loading && !benefits.data ? <LoadingBlock /> : benefits.error ? <ErrorBlock message={benefits.error} onRetry={benefits.refetch} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Value promised" value={money(benefits.data!.totals.promised)} icon={<Trophy className="h-4 w-4" />} />
            <StatCard label="Value delivered" value={money(benefits.data!.totals.delivered)} tone="good" />
            <StatCard label="Realization" value={`${benefits.data!.totals.realizationPct}%`} tone={benefits.data!.totals.realizationPct < 50 ? "warn" : "good"} />
          </div>
          {benefits.data!.totals.promised > 0 && (
            <SectionCard title="Value waterfall — promised vs delivered vs remaining">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[
                  { name: "Promised", base: 0, value: benefits.data!.totals.promised, fill: "#1d4ed8" },
                  { name: "Delivered", base: 0, value: benefits.data!.totals.delivered, fill: "#0e9f6e" },
                  { name: "Remaining", base: benefits.data!.totals.delivered, value: Math.max(0, benefits.data!.totals.promised - benefits.data!.totals.delivered), fill: "#f59e0b" },
                ]} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <ChartTooltip formatter={(val: number | string) => "$" + Number(val).toLocaleString()} />
                  <Bar dataKey="base" stackId="w" fill="transparent" />
                  <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]}>
                    {benefits.data && [[0, "#1d4ed8"], [1, "#0e9f6e"], [2, "#f59e0b"]].map(([i, c]) => <BarCell key={i} fill={c as string} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
          {benefits.data!.projects.length === 0 ? <EmptyState title="No benefits profiled yet" description="Profile benefits on a project, then pass its final gate to activate value tracking." /> : benefits.data!.projects.map((row) => (
            <SectionCard key={row.project.id} title={`${row.project.code} — ${row.project.name}`}
              description={`delivery health ${row.project.ragStatus} · ${row.rollup.activeProfiles} active benefit profile(s)`}
              actions={<Badge variant="outline" className={row.strategic.rag === "GREEN" ? "border-emerald-200 text-emerald-700" : "border-amber-300 text-amber-700"}>Strategic: {row.strategic.rag}</Badge>}>
              <p className="text-xs text-slate-500 mb-2">{row.strategic.note}</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <StatCard label="Promised" value={money(row.rollup.promised)} />
                <StatCard label="Delivered" value={money(row.rollup.delivered)} tone="good" />
                <StatCard label="Realization" value={`${row.rollup.realizationPct}%`} tone={row.rollup.realizationPct < 50 ? "warn" : "good"} />
              </div>
              <div className="space-y-1.5">
                {row.profiles.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-700 flex-1 truncate">{p.name}</span>
                    <Badge variant="outline" className="border-slate-200 text-slate-500">{p.type}</Badge>
                    <span className="text-xs text-slate-500 tabular-nums">target {money(p.targetValue)}</span>
                    <span className="text-xs tabular-nums font-medium text-slate-700">latest {money(p.actuals.length ? p.actuals[p.actuals.length - 1].value : 0)}</span>
                    {p.active ? <Badge variant="outline" className="border-emerald-200 text-emerald-700">TRACKING</Badge> : <Badge variant="outline" className="border-slate-200 text-slate-400">awaiting go-live gate</Badge>}
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      ))}

      {/* DATA QUALITY */}
      {tab === "Data Quality" && (dq.loading && !dq.data ? <LoadingBlock /> : dq.error ? <ErrorBlock message={dq.error} onRetry={dq.refetch} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Average data quality" value={dq.data!.averageScore + "/100"} tone={dq.data!.averageScore >= 80 ? "good" : dq.data!.averageScore >= 60 ? "warn" : "bad"} />
            <StatCard label="Projects audited" value={dq.data!.projects.length} />
            <StatCard label="Projects with gaps" value={dq.data!.projects.filter((p) => p.issues.length > 0).length} tone="warn" />
            <StatCard label="Resources without skills" value={dq.data!.resourceIssues.withoutSkills + "/" + dq.data!.resourceIssues.total} tone={dq.data!.resourceIssues.withoutSkills > 0 ? "warn" : "good"} sub={dq.data!.resourceIssues.names.slice(0, 3).join(", ")} />
          </div>
          {dq.data!.projects.map((row) => (
            <SectionCard key={row.project.id} title={row.project.code + " — " + row.project.name}
              description={"delivery health " + row.project.ragStatus + " · " + row.riskTotals.open + " open risk(s) · " + row.unassignedTasks + " unassigned task(s)"}
              actions={<span className={cn("px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums", row.score >= 80 ? "border-emerald-200 text-emerald-700 bg-emerald-50" : row.score >= 60 ? "border-amber-200 text-amber-700 bg-amber-50" : "border-red-200 text-red-700 bg-red-50")}>DQ {row.score}/100</span>}>
              {row.issues.length === 0 ? (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />No data-quality gaps — owner, sponsor, dates, budget and RAID hygiene all present.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {row.issues.map((iss, i) => (
                    <span key={i} title={iss.detail} className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">{iss.check}</span>
                  ))}
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      ))}
    </div>
  );
}

