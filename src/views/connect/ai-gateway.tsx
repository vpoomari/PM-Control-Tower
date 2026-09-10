"use client";
// PM CONTROL TOWER — CONNECT · AI Connector Gateway (governed model access)

import { useMemo } from "react";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, StatusChip, Button, Badge, LoadingBlock, ErrorBlock,
  EmptyState, Metric, DataTable, Column,
} from "@/components/pmct/kit";
import { fmtDateTime, num } from "@/lib/constants";
import {
  Sparkles, ShieldCheck, RefreshCw, Database, Scale, ScrollText, Activity, Clock,
} from "lucide-react";

interface AiExecution {
  id: string; prompt: string; response: string | null; tokens: number; durationMs: number;
  status: string; dataScopeUsed: string | null; createdAt: string; userName: string | null;
}
interface IntegrationRow {
  id: string; name: string; category: string; provider: string; description: string;
  status: string; authType: string; authStatus: string; healthScore: number;
  configJson: string | null; usageCount?: number;
}

/** Governed runtime configuration of the Insight Engine connector (as deployed in this environment). */
const CONNECTOR = {
  name: "PMCT Insight Engine",
  model: "glm-4-air",
  temperature: 0.3,
  maxTokens: 2048,
};

/** Governed data scope per spec §21. */
const DATA_SCOPE = [
  "Projects", "Programs", "Portfolio", "WBS", "Tasks", "Schedule", "Resources",
  "Timesheets", "Financials", "EVM", "RAID", "Changes", "Governance", "Reports", "Notifications",
];

const POLICIES = [
  { icon: ShieldCheck, label: "Authentication", detail: "JWT session required — no anonymous calls", ok: true },
  { icon: Scale, label: "Authorization", detail: "RBAC permission ai.use enforced per request", ok: true },
  { icon: Database, label: "Data scope", detail: "Queries are project-scoped to the caller's entitlements", ok: true },
  { icon: ScrollText, label: "Audit logging", detail: "Every execution persisted with prompt, tokens and duration", ok: true },
];

export default function AiGatewayView() {
  const executions = useApi<{ executions: AiExecution[]; scope: string }>("/api/assistant");
  const integrations = useApi<{ categories: Array<{ category: string; integrations: IntegrationRow[] }> }>("/api/integrations");
  useRealtimeRefetch(executions.refetch, ["automation:executed"]);

  const aiConnector = useMemo(() => {
    const cats = integrations.data?.categories ?? [];
    return cats.flatMap((c) => c.integrations).find((i) => i.category === "AI") ?? null;
  }, [integrations.data]);

  const runs = executions.data?.executions ?? [];
  const totalTokens = runs.reduce((s, e) => s + e.tokens, 0);
  const successRuns = runs.filter((e) => e.status === "SUCCESS").length;
  const lastRun = runs.length ? runs.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : null;

  if (executions.loading && !executions.data) return <LoadingBlock label="Connecting to the Insight Engine…" />;
  if (executions.error && !executions.data) return <ErrorBlock message={executions.error} onRetry={executions.refetch} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Connector Gateway"
        breadcrumb={["Connect", "AI Gateway"]}
        subtitle="The governed entry point between the AI PM Assistant and platform data. One approved connector, one policy, full audit."
        actions={<Button variant="outline" size="sm" onClick={() => { executions.refetch(); integrations.refetch(); }}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>}
      />

      {/* Navy header band */}
      <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm">
        <div className="bg-[#0b1f3a] px-5 py-6 relative">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.35),transparent_55%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-sky-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">{CONNECTOR.name}</h2>
                <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                  Governed natural-language access to portfolio, schedule, resource, financial, EVM, RAID and governance data —
                  with permission checks and audit logging on every execution.
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <Badge variant="outline" className="bg-white/10 text-sky-200 border-white/20 font-normal">model {CONNECTOR.model}</Badge>
                  <Badge variant="outline" className="bg-white/10 text-sky-200 border-white/20 font-normal">temperature {CONNECTOR.temperature}</Badge>
                  <Badge variant="outline" className="bg-white/10 text-sky-200 border-white/20 font-normal">max tokens {CONNECTOR.maxTokens}</Badge>
                  {aiConnector && <StatusChip status={aiConnector.status} className="!bg-white/10 !text-white !border-white/20" />}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-5">
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Executions (recent)</p><p className="text-xl font-semibold text-white tabular-nums">{runs.length}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Tokens used</p><p className="text-xl font-semibold text-white tabular-nums">{num(totalTokens, 0)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Last used</p><p className="text-xl font-semibold text-white tabular-nums">{lastRun ? fmtDateTime(lastRun.createdAt).slice(11, 16) : "—"}</p></div>
            </div>
          </div>
        </div>
        {aiConnector?.configJson && (
          <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5">
            <p className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Environment note:</span> {(() => {
                try { const c: unknown = JSON.parse(aiConnector.configJson); return typeof c === "object" && c && "note" in c ? String((c as { note: unknown }).note) : aiConnector.configJson; } catch { return aiConnector.configJson; }
              })()}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* Left column: scope + policy */}
        <div className="space-y-5">
          <SectionCard title="Governed data scope" description="Domains reachable by the connector">
            <div className="flex flex-wrap gap-1.5">
              {DATA_SCOPE.map((dm) => (
                <Badge key={dm} variant="outline" className="bg-blue-50/60 text-blue-700 border-blue-200 font-normal">{dm}</Badge>
              ))}
            </div>
            {executions.data?.scope && (
              <p className="text-[10px] text-slate-400 mt-3">Last execution used scope: <span className="font-mono">{executions.data.scope}</span></p>
            )}
          </SectionCard>

          <SectionCard title="Policy panel" description="Enforced by the API layer, not by convention">
            <div className="space-y-3">
              {POLICIES.map((p) => (
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

          <SectionCard title="Connector facts">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Provider" value="Internal (governed)" />
              <Metric label="Auth" value={aiConnector?.authType ?? "INTERNAL"} />
              <Metric label="Purpose" value="AI PM Assistant" />
              <Metric label="Health" value={aiConnector ? `${aiConnector.healthScore}` : "—"} />
            </div>
          </SectionCard>
        </div>

        {/* Right column: executions */}
        <SectionCard
          title="Recent AI executions"
          description="Persisted for audit — prompt, user, status, tokens and duration"
          actions={<span className="text-[11px] text-slate-400 flex items-center gap-1"><Activity className="h-3 w-3" /> {successRuns}/{runs.length} succeeded</span>}
        >
          {runs.length === 0 ? (
            <EmptyState
              title="No AI executions yet"
              description="Ask your first question in the AI PM Assistant — every execution will be recorded here."
            />
          ) : (
            <DataTable<AiExecution & Record<string, unknown>>
              keyField="id"
              rows={runs as (AiExecution & Record<string, unknown>)[]}
              maxHeight="440px"
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
    </div>
  );
}
