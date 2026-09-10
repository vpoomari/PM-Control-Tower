"use client";
// PM CONTROL TOWER — CONNECT · Extension Hub (honest developer catalog — no fake marketplace)

import { useApi } from "@/lib/client";
import {
  PageHeader, SectionCard, Button, Badge, LoadingBlock, ErrorBlock, StatCard,
} from "@/components/pmct/kit";
import {
  Network, Webhook, Radio, FileSpreadsheet, LayoutTemplate, Terminal,
  BookOpen, KeyRound, Gauge, RefreshCw,
} from "lucide-react";

interface TemplatesConfig {
  counts: Record<string, number>;
  featureFlags: Record<string, boolean>;
  featureFlagsSource: string;
  environment: Record<string, boolean>;
  generatedAt: string;
}

/** Extension surfaces per spec §18 — descriptive, endpoint counts come live from the config API. */
const SURFACES = [
  {
    icon: Network,
    title: "API Gateway — REST endpoints",
    endpointKey: "entityTypes",
    fallback: 0,
    description: "Versioned JSON API under /api/** with envelope responses { success, data | error }. JWT bearer auth, RBAC permission checks, per-identity rate limiting and audit trails on every route.",
    features: ["Bearer JWT authentication", "Role-based permission guards", "Rate limiting per identity", "Standard error envelope (400/401/403/404/409/502)"],
  },
  {
    icon: Webhook,
    title: "Webhooks",
    endpointKey: "webhookSubscriptions",
    fallback: 1,
    description: "Signed event delivery (HMAC-SHA256) to registered HTTPS endpoints with retries, delivery history and honest failure recording.",
    features: ["8 subscribable event types", "Signed payloads (x-pmct-signature)", "Per-subscription pause/activate", "Verbatim delivery log"],
  },
  {
    icon: Radio,
    title: "Realtime events",
    endpointKey: null,
    fallback: 0,
    description: "Socket.IO gateway broadcasting platform events to connected clients — project changes, approvals, alerts and integration state, fanned out through the realtime service.",
    features: ["Project room subscriptions", "JWT-authenticated sockets", "Events: project:*, task:*, wbs:*, schedule:*, alert:*, integration:changed, automation:executed and more", "Automatic view refetch fan-out"],
  },
  {
    icon: FileSpreadsheet,
    title: "Import / Export CSV",
    endpointKey: null,
    fallback: 0,
    description: "Client-side CSV extraction of the project register and timesheet ledger (Report Library), with Blob-based downloads that keep data inside the platform boundary.",
    features: ["Projects register export", "Timesheet ledger export", "RFC-quoted CSV formatting", "No server-side data egress"],
  },
  {
    icon: LayoutTemplate,
    title: "Templates SDK structure",
    endpointKey: "templates",
    fallback: 14,
    description: "Versioned PMO templates with structured JSON definitions — phases, artifacts, methodology and industry metadata — applied through the template application engine.",
    features: ["Version history with changelogs", "structureJson phase definitions", "One-click apply → generates WBS, tasks, milestones, gates and budget lines", "Usage counters per template"],
  },
] as const;

export default function ExtensionsView() {
  const config = useApi<TemplatesConfig>("/api/admin/templates-config");

  const registrations = config.data
    ? (config.data.counts["webhookSubscriptions"] ?? 0) + (config.data.counts["templates"] ?? 0) + (config.data.counts["integrations"] ?? 0)
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Extension Hub"
        breadcrumb={["Connect", "Extensions"]}
        subtitle="The surfaces available to extend the control tower — API, events, exports and the template SDK. This catalog describes only what the platform actually ships; no marketplace placeholders."
        actions={<Button variant="outline" size="sm" onClick={config.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Entity types exposed" value={config.data ? Object.keys(config.data.counts).length : "—"} sub="Across the API surface" icon={<Network className="h-4 w-4" />} />
        <StatCard label="Feature flags active" value={config.data ? Object.values(config.data.featureFlags).filter(Boolean).length : "—"} sub={config.data ? `${Object.keys(config.data.featureFlags).length} defined · source: ${config.data.featureFlagsSource ?? "defaults"}` : undefined} tone="info" icon={<Gauge className="h-4 w-4" />} />
        <StatCard label="Extension surfaces" value={SURFACES.length} sub="REST, webhooks, realtime, CSV, templates" icon={<Terminal className="h-4 w-4" />} />
        <StatCard label="Registered assets" value={config.data ? registrations : "—"} sub="Webhooks, templates & integrations" icon={<Webhook className="h-4 w-4" />} />
      </div>

      {config.loading && !config.data ? <LoadingBlock label="Reading platform configuration…" />
        : config.error ? <ErrorBlock message={config.error} onRetry={config.refetch} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SURFACES.map((s) => {
            const count = s.endpointKey && config.data
              ? (s.endpointKey === "entityTypes" ? Object.keys(config.data.counts).length : (config.data.counts[s.endpointKey] ?? null))
              : null;
            return (
              <div key={s.title} className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center"><s.icon className="h-4 w-4 text-blue-600" /></div>
                  {count !== null && (
                    <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-normal">
                      {s.endpointKey === "entityTypes" ? `${count} entity types exposed` : `${count} registered`}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.description}</p>
                </div>
                <ul className="mt-auto space-y-1.5">
                  {s.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                      <span className="h-1 w-1 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <SectionCard
        title="Developer notes"
        description="Conventions every integration follows"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2"><Network className="h-3.5 w-3.5 text-blue-600" /> API versioning</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              All routes live under <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">/api/…</code> and return a stable envelope:
              <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">{'{ success: true, data }'}</code> or
              <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">{'{ success: false, error }'}</code>.
              Breaking changes introduce a new path segment rather than altering existing contracts.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2"><KeyRound className="h-3.5 w-3.5 text-blue-600" /> Authentication</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Send <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">Authorization: Bearer &lt;JWT&gt;</code> on every call.
              Tokens are issued by <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">/api/auth/login</code> and expire per session policy.
              Permissions are evaluated server-side — a 403 means the role lacks the required permission code.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2"><Gauge className="h-3.5 w-3.5 text-blue-600" /> Rate limits</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Standard reads allow hundreds of requests per minute per identity; expensive routes (search, AI assistant) are throttled harder.
              Exceeding a limit returns <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">429</code> with a Retry-After hint.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2"><BookOpen className="h-3.5 w-3.5 text-blue-600" /> Event catalog</p>
            <div className="flex flex-wrap gap-1">
              {["project.created", "project.updated", "project:health", "task:changed", "wbs:changed", "schedule:changed", "raid:changed", "dependency:changed", "alert:created", "notification:created", "integration:changed", "automation:executed", "resource:assigned", "inbox:changed", "planner:changed", "governance:changed"].map((e) => (
                <Badge key={e} variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-mono text-[10px] font-normal">{e}</Badge>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
