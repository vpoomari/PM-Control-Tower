"use client";
// PM CONTROL TOWER — Administration → Settings → AI Agents.
// The activation + configuration home for the 14-agent runtime:
//   • roster grouped by phase (monitors → approval-gated drafters → autonomous)
//   • per-agent activation, cadence, thresholds and lifetime token budget
//   • Run now (with free-text input for the natural-language agents)
//   • approval queue for proposed actions + full run history ledger
// Everything is admin.config, audited server-side, and pushed live over the
// "agent:run" realtime event.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingBlock, ErrorBlock } from "@/components/pmct/kit";
import {
  Bot, Check, ChevronRight, Clock, FileSearch, History, Pause, Play, Save, ShieldAlert, Sparkles, X,
} from "lucide-react";

interface Threshold { key: string; label: string; min: number; max: number; step: number }

interface AgentEntry {
  key: string;
  name: string;
  family: string;
  phase: number;
  role: string;
  description: string;
  cadence: string;
  thresholds: Threshold[];
  defaults: Record<string, number>;
  requiresApproval: boolean;
  raiseAlerts: boolean;
  status: "ACTIVE" | "PAUSED";
  config: Record<string, number | string | boolean>;
  budgetTokens: number;
  runCount: number;
  lastRunAt: string | null;
}

interface RosterPayload {
  agents: AgentEntry[];
  runtimeEnabled: boolean;
  pendingApprovals: number;
  phases: Record<string, number>;
}

/** One finding inside a run (payload of AgentRun.findingsJson). */
interface RunFinding {
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  detail?: string;
  projectId?: string;
  ref?: string;
  metricValue?: number;
}

interface RunItem {
  id: string;
  agentKey: string;
  trigger: string;
  status: string;
  summary: string;
  findingCount: number;
  findings?: RunFinding[];
  actionType: string | null;
  actionLabel: string | null;
  narrationSource: "AI" | "HEURISTIC";
  tokens: number;
  durationMs: number;
  actorName: string | null;
  errorMessage: string | null;
  approvedBy?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
}

interface RunsPayload { items: RunItem[] }

interface Draft {
  status: "ACTIVE" | "PAUSED";
  cadence: string;
  budgetTokens: number;
  config: Record<string, number>;
}

const CADENCES = ["MANUAL", "HOURLY", "DAILY", "WEEKLY"] as const;

const PHASE_META: Record<number, { title: string; blurb: string }> = {
  1: { title: "Phase 1 · Read-only monitors", blurb: "Watch live data and raise findings — zero writes to business records." },
  2: { title: "Phase 2 · Approval-gated drafters", blurb: "Draft a proposed action; nothing executes until an admin approves it here." },
  3: { title: "Phase 3 · Autonomous (hard limits)", blurb: "Execute inside catalogue-defined limits — capped recipients, add-only writes, full audit." },
};

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  APPLIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NO_FINDINGS: "bg-slate-50 text-slate-600 border-slate-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  REJECTED: "bg-orange-50 text-orange-700 border-orange-200",
  SKIPPED: "bg-slate-50 text-slate-500 border-slate-200",
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "border-red-200 bg-red-50 text-red-700",
  WARNING: "border-amber-200 bg-amber-50 text-amber-700",
  INFO: "border-slate-200 bg-slate-50 text-slate-600",
};

const fmtWhen = (iso: string | null): string => {
  if (!iso) return "never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
};

function draftFrom(a: AgentEntry): Draft {
  const config: Record<string, number> = {};
  for (const t of a.thresholds) {
    const v = a.config[t.key];
    config[t.key] = typeof v === "number" ? v : (a.defaults[t.key] ?? t.min);
  }
  return {
    status: a.status,
    cadence: typeof a.config.cadence === "string" ? a.config.cadence : a.cadence,
    budgetTokens: a.budgetTokens,
    config,
  };
}

const isDirty = (a: AgentEntry, d: Draft | undefined): boolean => {
  if (!d) return false;
  const server = draftFrom(a);
  if (server.status !== d.status || server.cadence !== d.cadence || server.budgetTokens !== d.budgetTokens) return true;
  return a.thresholds.some((t) => server.config[t.key] !== d.config[t.key]);
};

export default function AgentsSettingsView() {
  const roster = useApi<RosterPayload>("/api/agents");
  const runs = useApi<RunsPayload>("/api/agents/runs?take=25");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [detailRun, setDetailRun] = useState<RunItem | null>(null);

  useRealtimeRefetch(() => { roster.refetch(); runs.refetch(); }, ["agent:run"]);

  // Seed drafts from the server once — never clobber unsaved admin edits after.
  useEffect(() => {
    if (!roster.data || Object.keys(drafts).length) return;
    const seeded: Record<string, Draft> = {};
    for (const a of roster.data.agents) seeded[a.key] = draftFrom(a);
    setDrafts(seeded);
  }, [roster.data, drafts]);

  const agents = roster.data?.agents ?? [];
  const byPhase = useMemo(() => ({
    1: agents.filter((a) => a.phase === 1),
    2: agents.filter((a) => a.phase === 2),
    3: agents.filter((a) => a.phase === 3),
  }), [agents]);

  const pendingRuns = useMemo(
    () => (runs.data?.items ?? []).filter((r) => r.status === "PENDING_APPROVAL"),
    [runs.data]
  );
  const history = useMemo(
    () => (runs.data?.items ?? []).filter((r) => historyFilter === "all" || r.agentKey === historyFilter),
    [runs.data, historyFilter]
  );

  if (roster.loading && !roster.data) return <LoadingBlock label="Loading agent roster…" />;
  if (roster.error) return <ErrorBlock message={roster.error} />;

  const patchDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? draftFrom(agents.find((a) => a.key === key)!)), ...patch } }));

  const patchThreshold = (key: string, tKey: string, value: number) =>
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? draftFrom(agents.find((a) => a.key === key)!)), config: { ...(prev[key]?.config ?? {}), [tKey]: value } },
    }));

  const save = async (a: AgentEntry) => {
    const d = drafts[a.key];
    if (!d || savingKey) return;
    setSavingKey(a.key);
    try {
      await api.patch("/api/agents", {
        key: a.key,
        status: d.status,
        cadence: d.cadence,
        budgetTokens: d.budgetTokens,
        config: d.config,
      });
      toast.success(`${a.name} saved — ${d.status === "ACTIVE" ? "active" : "paused"}`);
      roster.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  };

  const runNow = async (a: AgentEntry) => {
    if (runningKey) return;
    setRunningKey(a.key);
    try {
      const input = inputs[a.key]?.trim();
      const outcome = await api.post<{ status: string; summary: string; findingCount: number; error?: string }>(
        `/api/agents/${a.key}`,
        input ? { input } : {}
      );
      const label = outcome.status === "APPLIED" || outcome.status === "PENDING_APPROVAL"
        ? `${a.name}: ${outcome.status} — ${outcome.summary}`
        : outcome.status === "SKIPPED" || outcome.status === "FAILED"
          ? `${a.name}: ${outcome.status} — ${outcome.error ?? outcome.summary}`
          : `${a.name}: ${outcome.status} (${outcome.findingCount} finding(s))`;
      if (outcome.status === "FAILED" || outcome.status === "SKIPPED") toast.warning(label);
      else toast.success(label);
      roster.refetch();
      runs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunningKey(null);
    }
  };

  const decide = async (runId: string, decision: "APPROVE" | "REJECT") => {
    if (decidingId) return;
    setDecidingId(runId);
    try {
      const res = await api.post<{ status: string; detail?: string }>(`/api/agents/runs/${runId}`, { decision });
      if (res.status === "APPLIED") toast.success(`Approved — ${res.detail ?? "action executed"}`);
      else if (res.status === "REJECTED") toast.info("Proposal rejected — nothing was written");
      else toast.error(res.detail ?? "Action failed");
      runs.refetch();
      roster.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setDecidingId(null);
    }
  };

  const runtimeEnabled = roster.data?.runtimeEnabled ?? true;

  return (
    <div className="space-y-5">
      {/* Status band */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-slate-800">
              14 agents · {roster.data?.phases?.["1"] ?? 0} monitors · {roster.data?.phases?.["2"] ?? 0} drafters · {roster.data?.phases?.["3"] ?? 0} autonomous
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Activation, cadence, thresholds and budget live here. Every run is ledgered on AgentRun and audited.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={runtimeEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${runtimeEnabled ? "bg-emerald-500" : "bg-red-500"}`} />
            Runtime {runtimeEnabled ? "enabled" : "disabled"}
          </Badge>
          {pendingRuns.length > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              <ShieldAlert className="mr-1 h-3 w-3" /> {pendingRuns.length} pending approval(s)
            </Badge>
          )}
        </div>
      </div>

      {!runtimeEnabled && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Agent runtime is off</p>
            <p className="mt-0.5 text-red-700">
              The AGENT_RUNTIME feature flag is disabled (Control Center → Feature flags). Runs and approvals are blocked until it is re-enabled.
            </p>
          </div>
        </div>
      )}

      {/* Approval queue */}
      {pendingRuns.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Awaiting your approval
          </h2>
          {pendingRuns.map((r) => (
            <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">{r.agentKey}</Badge>
                    <Badge variant="outline" className={STATUS_STYLE[r.status] ?? ""}>{r.status}</Badge>
                    <span className="text-xs text-slate-500">{fmtWhen(r.createdAt)} · {r.findingCount} finding(s)</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{r.summary}</p>
                  {r.actionLabel && (
                    <p className="mt-1 text-xs font-medium text-slate-600">Proposed action: {r.actionLabel}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={decidingId === r.id}
                    onClick={() => decide(r.id, "APPROVE")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Approve & run
                  </Button>
                  <Button size="sm" variant="outline" disabled={decidingId === r.id} onClick={() => decide(r.id, "REJECT")}>
                    <X className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Roster by phase */}
      {([1, 2, 3] as const).map((phase) => {
        const list = byPhase[phase];
        if (!list.length) return null;
        const meta = PHASE_META[phase];
        return (
          <section key={phase} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{meta.title}</h2>
              <p className="mt-0.5 text-xs text-slate-400">{meta.blurb}</p>
            </div>
            <div className="space-y-3">
              {list.map((a) => {
                const d = drafts[a.key];
                const dirty = isDirty(a, d);
                const isActive = d?.status === "ACTIVE";
                const isManual = (d?.cadence ?? a.cadence) === "MANUAL";
                return (
                  <div key={a.key} className={`rounded-lg border bg-white p-4 transition-colors ${isActive ? "border-violet-200" : "border-slate-200"}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      {/* Identity + activation */}
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{a.name}</span>
                            <Badge variant="outline" className="text-[10px]">{a.family}</Badge>
                            <Badge variant="outline" className="text-[10px]">{a.role}</Badge>
                            {a.requiresApproval && (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">approval gate</Badge>
                            )}
                            {a.raiseAlerts && (
                              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">raises alerts</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">{a.description}</p>
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            {a.runCount} run(s) · last {fmtWhen(a.lastRunAt)}
                          </p>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-col gap-3 lg:w-[560px]">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={isActive}
                              onCheckedChange={(v) => patchDraft(a.key, { status: v ? "ACTIVE" : "PAUSED" })}
                            />
                            <span className="text-xs font-medium text-slate-600">{isActive ? "Active" : "Paused"}</span>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wide text-slate-400">Cadence</Label>
                            <Select value={d?.cadence ?? a.cadence} onValueChange={(v) => patchDraft(a.key, { cadence: v })}>
                              <SelectTrigger className="h-8 w-[118px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CADENCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wide text-slate-400">Token budget (0 = ∞)</Label>
                            <Input
                              type="number" min={0} max={10_000_000} step={1000}
                              className="h-8 w-[130px] text-xs"
                              value={d?.budgetTokens ?? a.budgetTokens}
                              onChange={(e) => patchDraft(a.key, { budgetTokens: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-8" disabled={!dirty || savingKey === a.key} onClick={() => save(a)}>
                              <Save className="mr-1 h-3.5 w-3.5" /> {savingKey === a.key ? "Saving…" : "Save"}
                            </Button>
                            <Button size="sm" className="h-8" disabled={runningKey === a.key || !isActive}
                              title={isActive ? "Run this agent now" : "Activate the agent first"}
                              onClick={() => runNow(a)}>
                              <Play className="mr-1 h-3.5 w-3.5" /> {runningKey === a.key ? "Running…" : "Run now"}
                            </Button>
                          </div>
                        </div>

                        {/* Thresholds */}
                        {a.thresholds.length > 0 && (
                          <div className="flex flex-wrap gap-3 rounded-md bg-slate-50 p-2.5">
                            {a.thresholds.map((t) => (
                              <div key={t.key} className="space-y-1">
                                <Label className="text-[10px] text-slate-500">{t.label}</Label>
                                <Input
                                  type="number" min={t.min} max={t.max} step={t.step}
                                  className="h-7 w-[104px] text-xs"
                                  value={d?.config?.[t.key] ?? a.defaults[t.key] ?? t.min}
                                  onChange={(e) => patchThreshold(a.key, t.key, Number(e.target.value))}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Natural-language input for MANUAL agents */}
                        {isManual && (
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wide text-slate-400">Request text (for Run now)</Label>
                            <Input
                              className="h-8 text-xs"
                              placeholder={a.key === "cr-intake"
                                ? "e.g. PRJ-001 client wants the reporting module extended to add a regional roll-up"
                                : "e.g. export all open risks and overdue tasks for PRJ-001 to CSV"}
                              value={inputs[a.key] ?? ""}
                              onChange={(e) => setInputs((prev) => ({ ...prev, [a.key]: e.target.value }))}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Run history */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <History className="h-4 w-4 text-slate-400" /> Run history
          </h2>
          <Select value={historyFilter} onValueChange={setHistoryFilter}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="Filter by agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agents.map((a) => <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {runs.loading && !runs.data ? (
          <LoadingBlock label="Loading run ledger…" />
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center">
            <Clock className="mx-auto h-5 w-5 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No runs yet — activate an agent and press Run now.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Summary</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2 text-right font-medium">When</th>
                  <th className="px-2 py-2"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer align-top hover:bg-slate-50/70"
                    onDoubleClick={() => setDetailRun(r)}
                    title="Double-click to open the findings summary"
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-700">{agents.find((a) => a.key === r.agentKey)?.name ?? r.agentKey}</span>
                      <span className="ml-1.5 text-[10px] text-slate-400">{r.trigger}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</Badge>
                    </td>
                    <td className="max-w-[420px] px-3 py-2 text-slate-600">
                      {r.summary}
                      {r.errorMessage && <span className="mt-0.5 block text-[10px] text-red-600">{r.errorMessage}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${r.narrationSource === "AI" ? "border-violet-200 bg-violet-50 text-violet-700" : ""}`}>
                        <Sparkles className={`mr-1 h-2.5 w-2.5 ${r.narrationSource === "AI" ? "" : "opacity-40"}`} />
                        {r.narrationSource}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.tokens}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{fmtWhen(r.createdAt)}</td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        size="sm" variant="ghost" className="h-6 w-6 p-0"
                        title="Open run details"
                        onClick={() => setDetailRun(r)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          Double-click a row — or tap <ChevronRight className="inline h-3 w-3 align-[-2px]" /> — to open its full findings summary.
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Pause className="h-3 w-3" /> Paused agents never run — not even on schedule. MANUAL cadence agents only run when you press Run now.
        </p>
      </section>

      {/* Run detail — opens on double-click (or the › button) of a history row */}
      <Dialog open={!!detailRun} onOpenChange={(open) => { if (!open) setDetailRun(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {detailRun && (() => {
            const findings = Array.isArray(detailRun.findings) ? detailRun.findings : [];
            const agentName = agents.find((a) => a.key === detailRun.agentKey)?.name ?? detailRun.agentKey;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <FileSearch className="h-4 w-4 shrink-0 text-violet-600" />
                    {agentName}
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[detailRun.status] ?? ""}`}>
                      {detailRun.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {detailRun.trigger} run · {fmtWhen(detailRun.createdAt)} · narrated {detailRun.narrationSource}
                  </DialogDescription>
                </DialogHeader>

                {/* Meta strip */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{findings.length} finding(s)</Badge>
                  <Badge variant="outline" className="text-[10px]">{detailRun.tokens} token(s)</Badge>
                  <Badge variant="outline" className="text-[10px]">{detailRun.durationMs} ms</Badge>
                  {detailRun.actorName && (
                    <Badge variant="outline" className="text-[10px]">by {detailRun.actorName}</Badge>
                  )}
                  {detailRun.approvedBy && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                      {detailRun.status === "REJECTED" ? "decided by" : "approved by"} {detailRun.approvedBy}
                    </Badge>
                  )}
                </div>

                {/* Summary */}
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                  {detailRun.summary}
                </div>

                {detailRun.actionLabel && (
                  <p className="text-xs font-medium text-slate-600">
                    Proposed action: {detailRun.actionLabel}
                  </p>
                )}
                {detailRun.errorMessage && (
                  <p className="text-xs text-red-600">{detailRun.errorMessage}</p>
                )}
                {detailRun.rejectedReason && (
                  <p className="text-xs text-orange-600">Rejected: {detailRun.rejectedReason}</p>
                )}

                {/* Findings */}
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Findings ({findings.length})
                  </h3>
                  {findings.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">
                      No findings recorded for this run.
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-[45vh] divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                      {findings.map((f, i) => (
                        <li key={`${detailRun.id}-${i}`} className="px-3 py-2">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className={`mt-0.5 shrink-0 text-[10px] ${SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.INFO}`}>
                              {f.severity}
                            </Badge>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug text-slate-800">{f.title}</p>
                              {f.detail && (
                                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{f.detail}</p>
                              )}
                              {(f.ref || typeof f.metricValue === "number") && (
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {[f.ref ? `ref ${f.ref}` : "", typeof f.metricValue === "number" ? `metric ${f.metricValue}` : ""]
                                    .filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
