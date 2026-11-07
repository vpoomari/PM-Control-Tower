// PM CONTROL TOWER — TowerIntegration Hub screen.
// Central gateway view: 55 tools in 6 category queues, the harmonization
// pipeline, circuit-breaker health, the Dead Letter Queue and the event
// ledger. Pure display of /api/hub/* — every linkage stays intact.

"use client";

import { useState } from "react";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, Badge } from "@/components/pmct/kit";
import {
  Plug, Radio, ShieldCheck, Workflow, AlertTriangle, CheckCircle2, RefreshCw,
  Lock, Activity, ArrowRight, Zap, Database, GitMerge, Timer,
} from "lucide-react";

interface ConnectionView {
  toolId: string; name: string; vendor: string; category: string; queue: string;
  facade: string; auth: string[]; ingress: string[]; hint: string;
  linkedIntegration: string | null; namedInDirective: boolean; pollMinutes: number;
  status: string; authKind: string; authStatus: string; ingressMode: string;
  breaker: { state: string; consecutiveFailures: number; retryAtMs: number; trips: number; lastError: string | null; allowNow: boolean };
  counters: { ingested: number; harmonized: number; dlq: number };
  lastIngestAt: string | null; hasSecret: boolean;
}

interface DlqView {
  id: string; toolId: string; queue: string | null; severity: string; reason: string;
  anomalies: string[]; status: string; replayCount: number; payloadPreview: string | null; createdAt: string;
}

interface Overview {
  totals: { tools: number; active: number; paused: number; degraded: number; harmonized: number; dlqPending: number; events: number };
  categories: { category: string; queue: string; label: string; description: string; tools: ConnectionView[] }[];
  queues: { id: string; label: string; description: string; depth: number }[];
  recentEvents: { id: string; toolId: string; mode: string; outcome: string; harmonized: number; dlqEntries: number; durationMs: number; createdAt: string }[];
  dlq: DlqView[];
  breakerSummary: { closed: number; open: number; halfOpen: number };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PAUSED: { label: "Paused", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  DEGRADED: { label: "Degraded", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ERROR: { label: "Error", cls: "bg-red-50 text-red-700 border-red-200" },
};

const BREAKER_META: Record<string, { label: string; cls: string }> = {
  CLOSED: { label: "Closed", cls: "bg-emerald-50 text-emerald-700" },
  OPEN: { label: "Open", cls: "bg-red-50 text-red-700" },
  HALF_OPEN: { label: "Half-open", cls: "bg-amber-50 text-amber-700" },
};

const OUTCOME_META: Record<string, string> = {
  HARMONIZED: "text-emerald-600", PARTIAL: "text-amber-600",
  DLQ: "text-red-600", REJECTED: "text-red-700",
};

const PIPELINE_STEPS = [
  { icon: Radio, label: "Ingress", sub: "Webhook · Poll · BI refresh · CSV" },
  { icon: ShieldCheck, label: "Authenticate", sub: "OAuth 2.0 · JWT · HMAC · mTLS" },
  { icon: Database, label: "Extract", sub: "JSON / XML / CSV raw payload" },
  { icon: Plug, label: "Facade", sub: "Vendor template → normalized" },
  { icon: GitMerge, label: "UWM harmonize", sub: "Identity · status · dates · priority" },
  { icon: Workflow, label: "Queue", sub: "6 category processing queues" },
  { icon: Zap, label: "Engine handoff", sub: "WBS & CPM evaluation" },
];

export default function HubView() {
  const list = useApi<Overview>("/api/hub/overview");
  useRealtimeRefetch(list.refetch, ["hub:changed", "integration:changed"]);

  const [configTool, setConfigTool] = useState<ConnectionView | null>(null);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (list.loading && !list.data) return <LoadingBlock label="Opening TowerIntegration Hub…" />;
  if (list.error) return <div className="p-6 text-sm text-red-600">{list.error}</div>;
  const d = list.data!;
  const t = d.totals;

  async function replay(id: string) {
    setReplaying(id);
    try {
      const r = await api.post<{ harmonized: number; dlq: number }>(`/api/hub/dlq/${id}/replay`);
      setNotice(`Replayed → ${r.harmonized} harmonized, ${r.dlq} still queued`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Replay failed"); }
    setReplaying(null);
    list.refetch();
  }

  async function poll(toolId: string) {
    setPolling(toolId);
    try {
      const r = await api.post<{ ok: boolean; detail: string; attempts: number }>(`/api/hub/poll`, { toolId });
      setNotice(`${toolId}: ${r.ok ? "poll ok" : r.detail} (${r.attempts} attempt${r.attempts === 1 ? "" : "s"})`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Poll failed"); }
    setPolling(null);
    list.refetch();
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 sm:p-6">
      {/* ---- Header ---- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Plug className="h-5 w-5 text-cyan-600" /> TowerIntegration Hub
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Central API gateway — {t.tools} external systems harmonized into the Unified Work Model across {d.categories.length} category queues.
          </p>
        </div>
        <button onClick={() => list.refetch()} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50/70 px-4 py-2.5 text-sm text-cyan-800">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-cyan-500 hover:text-cyan-700">✕</button>
        </div>
      )}

      {/* ---- KPI strip ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Tools" value={t.tools} sub="in registry" icon={Plug} />
        <Kpi label="Active" value={t.active} sub="connections live" icon={CheckCircle2} tone="emerald" />
        <Kpi label="Harmonized" value={t.harmonized} sub="UWM items" icon={GitMerge} tone="cyan" />
        <Kpi label="DLQ pending" value={t.dlqPending} sub="needs review" icon={AlertTriangle} tone={t.dlqPending > 0 ? "amber" : "slate"} />
        <Kpi label="Breakers open" value={d.breakerSummary.open} sub={`${d.breakerSummary.halfOpen} half-open`} icon={Activity} tone={d.breakerSummary.open > 0 ? "red" : "emerald"} />
        <Kpi label="Events" value={t.events} sub="ledger rows" icon={Timer} />
      </div>

      {/* ---- Pipeline strip ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Workflow className="h-4 w-4 text-indigo-500" /> Ingest pipeline
        </h2>
        <div className="flex flex-wrap items-stretch gap-1.5">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className="flex min-w-[132px] flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <s.icon className="h-3.5 w-3.5 text-indigo-500" /> {s.label}
                </span>
                <span className="text-[10.5px] leading-tight text-slate-500">{s.sub}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] text-slate-500">
          Anomalies, missing required fields and validation errors route to the <strong>Dead Letter Queue</strong> — nothing is dropped, every payload stays replayable.
        </p>
      </section>

      {/* ---- Category queues ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {d.categories.map((cat) => (
          <section key={cat.category} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2.5 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{cat.label}</h2>
                <p className="text-[11px] text-slate-500">{cat.description}</p>
              </div>
              <Badge className="shrink-0 bg-indigo-50 text-indigo-700">{cat.tools.length} tools</Badge>
            </div>
            <div className="flex flex-col gap-1.5">
              {cat.tools.map((tool) => (
                <ToolRow
                  key={tool.toolId} tool={tool}
                  onConfigure={() => setConfigTool(tool)}
                  onPoll={() => poll(tool.toolId)}
                  polling={polling === tool.toolId}
                />
              ))}
              {cat.tools.length === 0 && <p className="py-3 text-center text-xs text-slate-400">No connections yet</p>}
            </div>
          </section>
        ))}
      </div>

      {/* ---- DLQ + recent events ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Dead Letter Queue
            {d.dlq.length > 0 && <Badge className="bg-amber-50 text-amber-700">{d.dlq.length} pending</Badge>}
          </h2>
          {d.dlq.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">All payloads harmonized cleanly — nothing queued.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.dlq.slice(0, 8).map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">{entry.toolId}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge className={entry.severity === "BLOCKING" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}>{entry.severity}</Badge>
                      <button
                        onClick={() => replay(entry.id)} disabled={replaying === entry.id}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >{replaying === entry.id ? "…" : "Replay"}</button>
                    </div>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-600">{entry.reason}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">{entry.anomalies.slice(0, 3).join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Timer className="h-4 w-4 text-slate-500" /> Recent ingest events
          </h2>
          {d.recentEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">No payloads processed yet — send a webhook to any tool to see it here.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {d.recentEvents.slice(0, 10).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="flex items-center gap-2">
                    <span className={`font-semibold ${OUTCOME_META[e.outcome] ?? "text-slate-600"}`}>{e.outcome}</span>
                    <span className="text-slate-700">{e.toolId}</span>
                    <span className="text-slate-400">· {e.mode.toLowerCase()} · {e.harmonized} harmonized{e.dlqEntries ? ` · ${e.dlqEntries} dlq` : ""}</span>
                  </span>
                  <span className="shrink-0 text-slate-400">{new Date(e.createdAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- Configure drawer ---- */}
      {configTool && (
        <ConfigureDrawer
          tool={configTool}
          onClose={() => setConfigTool(null)}
          onSaved={() => { setConfigTool(null); list.refetch(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Kpi({ label, value, sub, icon: Icon, tone = "slate" }: {
  label: string; value: number; sub: string;
  icon: React.ComponentType<{ className?: string }>; tone?: string;
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-700 border-slate-200", emerald: "text-emerald-700 border-emerald-200 bg-emerald-50/40",
    cyan: "text-cyan-700 border-cyan-200 bg-cyan-50/40", amber: "text-amber-700 border-amber-200 bg-amber-50/40",
    red: "text-red-700 border-red-200 bg-red-50/40",
  };
  return (
    <div className={`rounded-xl border bg-white p-3 ${tones[tone] ?? tones.slate}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <p className="mt-1 text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10.5px] opacity-60">{sub}</p>
    </div>
  );
}

function ToolRow({ tool, onConfigure, onPoll, polling }: {
  tool: ConnectionView; onConfigure: () => void; onPoll: () => void; polling: boolean;
}) {
  const status = STATUS_META[tool.status] ?? STATUS_META.PAUSED;
  const breaker = BREAKER_META[tool.breaker.state] ?? BREAKER_META.CLOSED;
  const canPoll = tool.ingress.includes("POLL") || tool.ingress.includes("BI_REFRESH");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:border-slate-200 hover:bg-slate-50/60">
      <div className="min-w-0">
        <span className="text-xs font-semibold text-slate-700">{tool.name}</span>
        <span className="ml-1.5 text-[10.5px] text-slate-400">{tool.vendor}</span>
        {tool.linkedIntegration && <Badge className="ml-1.5 bg-cyan-50 text-cyan-700">linked</Badge>}
        <p className="mt-0.5 truncate text-[10.5px] text-slate-500">{tool.hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge className={breaker.cls} title={`Breaker ${tool.breaker.state}${tool.breaker.consecutiveFailures ? ` · ${tool.breaker.consecutiveFailures} failures` : ""}`}>
          <Activity className="mr-0.5 h-2.5 w-2.5" />{breaker.label}
        </Badge>
        <span className="text-[10.5px] text-slate-500" title="harmonized / dlq">
          {tool.counters.harmonized}/{tool.counters.dlq}
        </span>
        <Badge className={status.cls}>{status.label}</Badge>
        {canPoll && (
          <button onClick={onPoll} disabled={polling} title="Run one poll cycle"
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {polling ? "…" : "Poll"}
          </button>
        )}
        <button onClick={onConfigure}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600 hover:bg-slate-100">
          <Lock className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ConfigureDrawer({ tool, onClose, onSaved }: {
  tool: ConnectionView; onClose: () => void; onSaved: () => void;
}) {
  const [authKind, setAuthKind] = useState<string>(tool.authKind);
  const [secret, setSecret] = useState("");
  const [ingressMode, setIngressMode] = useState<string>(tool.ingressMode);
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    try {
      await api.patch(`/api/hub/connections/${tool.toolId}`, {
        authKind,
        ...(secret ? { secret } : {}),
        ingressMode,
        ...(baseUrl ? { baseUrl } : {}),
      });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Configure {tool.name}</h3>
            <p className="text-[11px] text-slate-500">{tool.vendor} · {tool.category} · facade: {tool.facade}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Authentication kind
            <select value={authKind} onChange={(e) => setAuthKind(e.target.value)}
              className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-700">
              {["HMAC", "JWT", "OAUTH2", "MTLS", "NONE"].map((k) => (
                <option key={k} value={k}>{k}{tool.auth.includes(k) ? " (recommended)" : ""}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Shared secret {tool.hasSecret && <span className="text-[10px] font-normal text-slate-400">(a secret is saved — leave blank to keep it)</span>}
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
              placeholder="HMAC / JWT signing secret (min 8 chars)"
              className="rounded-md border border-slate-200 px-2.5 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Ingress mode
            <select value={ingressMode} onChange={(e) => setIngressMode(e.target.value)}
              className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-700">
              {tool.ingress.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Base URL <span className="text-[10px] font-normal text-slate-400">(poll cycles)</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.vendor.com"
              className="rounded-md border border-slate-200 px-2.5 py-2 text-sm" />
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
            <strong>Ingress URL:</strong>
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-[10.5px]">
              POST /api/hub/ingress/{tool.toolId}
            </code>
            <p className="mt-1.5">Auth headers are validated per kind — HMAC (<code>x-hub-signature-256</code>), JWT (Bearer), OAuth (Bearer), mTLS (proxy CN).</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || (secret.length > 0 && secret.length < 8)}
            className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
