"use client";
// PM CONTROL TOWER — AI · AI Hub (the "AI" tab)
// One place that gathers every AI feed in the platform: provider status + token
// meter, the live execution feed, and permission-aware launch cards into each
// existing AI surface. The existing surfaces keep their own routes and nav
// entries — this hub only links to them, nothing is moved or replaced.

import { useEffect, useMemo, useState } from "react";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { getAiSettings } from "@/lib/ai/ai-service";
import type { AiSettingsStatus } from "@/lib/ai/shared";
import {
  PageHeader, SectionCard, StatusChip, Button, Badge, LoadingBlock, ErrorBlock,
  EmptyState, Metric, DataTable, Column, ProgressBar,
} from "@/components/pmct/kit";
import { fmtDateTime, num } from "@/lib/constants";
import {
  Sparkles, RefreshCw, Bot, Gauge, Wand2, BrainCircuit, Settings2, FileUp, FileDown,
  ShieldCheck, ArrowRight, Activity, Clock, Users, BarChart3, Landmark,
} from "lucide-react";

interface AiExecution {
  id: string; prompt: string; response: string | null; tokens: number; durationMs: number;
  status: string; dataScopeUsed: string | null; createdAt: string; userName: string | null;
}
interface SessionPayload { user: { isSuperAdmin: boolean; permissions: string[] } }

interface Feed {
  id: string; title: string; description: string; href: string;
  icon: typeof Sparkles; perm?: string; tag: string;
}

/** Every AI surface in the platform — linked, never moved. */
const FEEDS: Feed[] = [
  {
    id: "assistant", title: "AI PM Assistant", href: "/assistant", icon: Sparkles, perm: "ai.use", tag: "Live Q&A",
    description: "Ask governed natural-language questions over live project, schedule, resource, financial, EVM, RAID and governance data.",
  },
  {
    id: "agents", title: "AI Agents", href: "/admin/settings?tab=agents", icon: Bot, perm: "admin.config", tag: "14 agents",
    description: "Activate and tune the 14-agent workforce — monitors, approval-gated drafters and bounded autonomous workers with a full run ledger.",
  },
  {
    id: "studio", title: "AI Feature Studio", href: "/ai-features", icon: Wand2, perm: "ai.use", tag: "100 features",
    description: "One-press AI features across the delivery lifecycle — status reports, PERT estimates, critical path, RACI, change impact and more.",
  },
  {
    id: "gateway", title: "AI Connector Gateway", href: "/ai-gateway", icon: BrainCircuit, perm: "integration.view", tag: "Governance",
    description: "The governed model connector: policy panel, permitted data scope and the full execution audit trail.",
  },
  {
    id: "settings", title: "AI Provider Settings", href: "/admin/settings", icon: Settings2, perm: "admin.config", tag: "BYOK",
    description: "Bring-your-own-key provider, masked key status, token quota and the usage meter.",
  },
  {
    id: "import", title: "AI Import", href: "/data/import", icon: FileUp, perm: "project.view", tag: "Auto-pilot",
    description: "AI column mapping, linkage validation and dependency-ordered apply — dry-run first, nothing breaks.",
  },
  {
    id: "export", title: "AI Export", href: "/data/export", icon: FileDown, perm: "project.view", tag: "NL export",
    description: "One-click Export everything across all datasets, plus natural-language export requests.",
  },
  {
    id: "integrity", title: "AI Actions", href: "/integrity", icon: ShieldCheck, perm: "integrity.view", tag: "Integrity",
    description: "The governance feed of AI actions — approvals, evidence and integrity checks under Data Integrity.",
  },
  {
    id: "executive", title: "Executive AI Brief", href: "/dashboard", icon: Gauge, perm: "executive.view", tag: "Briefing",
    description: "AI overdue brief and prioritised actions rendered on the Executive Control Tower.",
  },
];

/** Role playbooks — the operating procedures live in docs/ (see below). */
const ROLES = [
  {
    icon: Bot, role: "Project Managers",
    points: "Predictive AI & scenario modeling, hybrid Kanban→Gantt rollups, automated dependency ripple recalculation, and the integrated scope / change-request hub with budget impact + sign-off.",
    where: "Planning Lab · Schedule · Change Control",
  },
  {
    icon: Users, role: "Resource Managers",
    points: "AI-powered capacity forecasting across projects, skill-gap mapping and dynamic workload heatmaps that recalculate bandwidth the moment a dependent task slips.",
    where: "Resources · AI Feature Studio (f012, f021)",
  },
  {
    icon: Landmark, role: "Delivery Managers & PMO",
    points: "Live BI-grade baseline vs. actual financial tracking, end-to-end value-stream metrics (cycle time, throughput) and trigger-based governance workflows.",
    where: "EVM · Analytics · Governance · Automations",
  },
];

export default function AiHubView() {
  const { navigate } = useRoute();
  const session = useApi<SessionPayload>("/api/auth/me");
  const executions = useApi<{ executions: AiExecution[]; scope: string }>("/api/assistant");
  useRealtimeRefetch(executions.refetch, ["automation:executed", "agent:run"]);

  const [status, setStatus] = useState<AiSettingsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const permissions = session.data?.user.permissions ?? [];
  const isSuperAdmin = session.data?.user.isSuperAdmin ?? false;
  const can = (perm?: string) => {
    if (!perm) return true;
    if (!session.data) return false;                 // hidden until the session is known
    if (isSuperAdmin || permissions.includes("*")) return true;
    return permissions.includes(perm);
  };
  const isAdmin = can("admin.config");

  // Provider status is admin-only (server action enforces admin.config too).
  useEffect(() => {
    if (!isAdmin || status || statusError) return;
    let alive = true;
    getAiSettings()
      .then((r) => {
        if (!alive) return;
        if (r && typeof r === "object" && "status" in r) setStatus(r.status);
        else if (r && typeof r === "object" && "error" in r) setStatusError(String((r as { error: unknown }).error));
      })
      .catch(() => alive && setStatusError("Provider status unavailable."));
    return () => { alive = false; };
  }, [isAdmin, status, statusError]);

  const runs = useMemo(
    () => [...(executions.data?.executions ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [executions.data]
  );
  const totalTokens = runs.reduce((s, e) => s + e.tokens, 0);
  const successRuns = runs.filter((e) => e.status === "SUCCESS").length;
  const successPct = runs.length ? Math.round((successRuns / runs.length) * 100) : null;
  const lastRun = runs[0] ?? null;
  const visibleFeeds = FEEDS.filter((f) => can(f.perm));

  if (executions.loading && !executions.data) return <LoadingBlock label="Loading AI feeds…" />;
  if (executions.error && !executions.data) return <ErrorBlock message={executions.error} onRetry={executions.refetch} />;

  const configured = status?.configured ?? false;
  const quota = status?.quota;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI"
        breadcrumb={["AI", "AI Hub"]}
        subtitle="Every AI feed in one tab — provider status, usage meter, the live execution feed and quick access to each AI surface."
        actions={
          <Button variant="outline" size="sm" onClick={() => executions.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
        }
      />

      {/* Status band — provider posture + headline execution stats */}
      <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm">
        <div className="bg-[#0b1f3a] px-5 py-6 relative">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,rgba(168,85,247,0.35),transparent_55%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-purple-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">AI availability</h2>
                <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                  {status && statusError === null ? (
                    configured ? (
                      <>
                        Live provider configured — every AI feature calls it through the governed BYOK layer with RBAC and audit on each execution.
                      </>
                    ) : (
                      <>
                        No provider key saved yet — AI features run the honest <span className="text-sky-300">heuristic / static fallback</span>.
                        Save a key in AI Provider Settings to enable live calls.
                      </>
                    )
                  ) : (
                    <>
                      AI features degrade gracefully when a key, quota or network is unavailable — fallbacks are verified, never silent.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  {status ? (
                    <>
                      <Badge variant="outline" className="bg-white/10 text-purple-200 border-white/20 font-normal">
                        {configured ? `configured · ${status.provider ?? "provider"}` : "not configured"}
                      </Badge>
                      {status.model && <Badge variant="outline" className="bg-white/10 text-purple-200 border-white/20 font-normal">model {status.model}</Badge>}
                      {status.maskedKey && <Badge variant="outline" className="bg-white/10 text-purple-200 border-white/20 font-normal">key {status.maskedKey}</Badge>}
                      <StatusChip status={configured ? "SUCCESS" : "FALLBACK"} className="!bg-white/10 !text-white !border-white/20" />
                    </>
                  ) : (
                    <Badge variant="outline" className="bg-white/10 text-slate-300 border-white/20 font-normal">
                      {isAdmin ? (statusError ?? "reading provider status…") : "provider status is admin-only"}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Executions</p><p className="text-xl font-semibold text-white tabular-nums">{runs.length}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Success</p><p className="text-xl font-semibold text-white tabular-nums">{successPct === null ? "—" : `${successPct}%`}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Tokens</p><p className="text-xl font-semibold text-white tabular-nums">{num(totalTokens, 0)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Last run</p><p className="text-xl font-semibold text-white tabular-nums">{lastRun ? fmtDateTime(lastRun.createdAt).slice(11, 16) : "—"}</p></div>
            </div>
          </div>
        </div>
        {executions.data?.scope && (
          <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5">
            <p className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Last execution scope:</span>{" "}
              <span className="font-mono">{executions.data.scope}</span> — every call is permission-scoped to the caller.
            </p>
          </div>
        )}
      </div>

      {/* All AI feeds — launch cards into the existing surfaces */}
      <SectionCard
        title="All AI feeds"
        description="Each surface keeps its own route and sidebar entry — this hub links to them in one place"
        actions={<span className="text-[11px] text-slate-400 flex items-center gap-1"><Activity className="h-3 w-3" /> {visibleFeeds.length} of {FEEDS.length} visible for your role</span>}
      >
        {session.loading && !session.data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-lg bg-slate-100 animate-pulse" />)}</div>
        ) : visibleFeeds.length === 0 ? (
          <EmptyState title="No AI feeds for your role" description="Ask an administrator for the ai.use permission to unlock the AI workspace." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleFeeds.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => navigate(f.href)}
                className="group text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-purple-300 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="h-9 w-9 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center">
                    <f.icon className="h-4 w-4 text-purple-600" />
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-purple-500 transition-colors" />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-slate-800">{f.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-3">{f.description}</p>
                <Badge variant="outline" className="mt-2 bg-purple-50/60 text-purple-700 border-purple-200 font-normal">{f.tag}</Badge>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* Left: provider + meter (admin) / honest restricted state */}
        <div className="space-y-5">
          <SectionCard title="Provider & token meter" description="Configuration is admin-only — status never exposes key material">
            {!session.data ? (
              <LoadingBlock label="Checking access…" />
            ) : !isAdmin ? (
              <EmptyState
                title="Administrator access required"
                description="Provider configuration and the token meter are visible to administrators with admin.config."
              />
            ) : statusError ? (
              <ErrorBlock message={statusError} onRetry={() => { setStatusError(null); setStatus(null); }} />
            ) : !status ? (
              <LoadingBlock label="Reading provider status…" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Provider" value={status.configured ? (status.provider ?? "configured") : "not set"} />
                  <Metric label="Calls made" value={num(status.usageCount, 0)} />
                  <Metric label="Key" value={status.maskedKey ?? "—"} />
                  <Metric label="Last used" value={status.lastUsedAt ? fmtDateTime(status.lastUsedAt) : "—"} />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                    <span className="font-semibold text-slate-600">Token usage this period</span>
                    <span className="tabular-nums">{quota ? `${num(quota.used, 0)} / ${quota.budget > 0 ? num(quota.budget, 0) : "∞"}` : "—"}</span>
                  </div>
                  {quota && quota.budget > 0 ? (
                    <ProgressBar value={Math.min(100, Math.round((quota.used / quota.budget) * 100))} />
                  ) : (
                    <p className="text-[11px] text-slate-400">No allowance set yet — set a quota in AI Provider Settings to cap spend.</p>
                  )}
                  {quota?.periodStartAt && (
                    <p className="text-[10px] text-slate-400 mt-1.5">Period opened {fmtDateTime(quota.periodStartAt)}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/admin/settings")}>
                  <Settings2 className="h-4 w-4 mr-1.5" /> Open AI Provider Settings
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Governed by design" description="What every AI feed on this tab shares">
            <div className="space-y-3">
              {[
                { icon: ShieldCheck, label: "RBAC per request", detail: "ai.use and per-surface permissions enforced server-side" },
                { icon: Activity, label: "Full audit trail", detail: "Every execution persisted with prompt, status, tokens and duration" },
                { icon: Clock, label: "Honest fallback", detail: "Missing key, quota or network degrades to verified heuristics — never invented data" },
              ].map((p) => (
                <div key={p.label} className="flex items-start gap-2.5">
                  <p.icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{p.label} <span className="text-emerald-600 ml-1">✓</span></p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{p.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Right: live execution feed */}
        <SectionCard
          title="Live AI execution feed"
          description="Every AI call across the platform, newest first — persisted for audit"
          actions={<span className="text-[11px] text-slate-400 flex items-center gap-1"><BarChart3 className="h-3 w-3" /> {successRuns}/{runs.length} succeeded</span>}
        >
          {runs.length === 0 ? (
            <EmptyState
              title="No AI executions yet"
              description="Ask your first question in the AI PM Assistant or press any feature in the AI Studio — it will appear here instantly."
              action={<Button size="sm" onClick={() => navigate("/assistant")}><Sparkles className="h-4 w-4 mr-1.5" /> Open AI PM Assistant</Button>}
            />
          ) : (
            <DataTable<AiExecution & Record<string, unknown>>
              keyField="id"
              rows={runs.slice(0, 25) as (AiExecution & Record<string, unknown>)[]}
              maxHeight="460px"
              columns={[
                { key: "createdAt", header: "Time", render: (e) => <span className="tabular-nums text-slate-500 whitespace-nowrap">{fmtDateTime(e.createdAt)}</span> },
                { key: "userName", header: "User", render: (e) => <span className="text-slate-700 font-medium">{e.userName ?? "—"}</span> },
                { key: "prompt", header: "Prompt", render: (e) => <span className="text-slate-600 block max-w-md truncate" title={e.prompt}>{e.prompt}</span> },
                { key: "status", header: "Status", render: (e) => <StatusChip status={e.status} /> },
                { key: "tokens", header: "Tokens", className: "tabular-nums", render: (e) => num(e.tokens, 0) },
                { key: "durationMs", header: "Duration", className: "tabular-nums", render: (e) => <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-slate-300" />{(e.durationMs / 1000).toFixed(1)}s</span> },
              ] as Column<AiExecution & Record<string, unknown>>[]}
            />
          )}
        </SectionCard>
      </div>

      {/* Role playbooks — pointer to the operating procedures document */}
      <SectionCard
        title="How each role uses these feeds"
        description="Cross-role playbook — full procedures in docs/AI-PMO-OPERATING-PROCEDURES.md"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.role} className="rounded-lg border border-slate-200 p-4 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <r.icon className="h-4 w-4 text-purple-600" />
                <p className="text-sm font-semibold text-slate-800">{r.role}</p>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{r.points}</p>
              <p className="mt-2 text-[10px] font-medium text-purple-600">{r.where}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
