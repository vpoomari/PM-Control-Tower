"use client";
// PM CONTROL TOWER — ADMIN · System Configuration (read-only environment, readiness, deployment)

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import {
  PageHeader, SectionCard, StatCard, Button, Badge, LoadingBlock, ErrorBlock, cn,
} from "@/components/pmct/kit";
import { fmtDateTime, num } from "@/lib/constants";
import {
  Settings, RefreshCw, CheckCircle2, AlertTriangle, Database, Radio, Server,
  Cloud, ShieldCheck, BookOpen, Boxes,
} from "lucide-react";

interface TemplatesConfig {
  counts: Record<string, number>;
  featureFlags: Record<string, boolean>;
  featureFlagsSource: string;
  environment: { jwtSecretSet: boolean; databaseUrlSet: boolean; webOriginSet: boolean; realtimeUrlSet: boolean };
  generatedAt: string;
}
interface SystemReady {
  status: string; service: string; time: string;
  checks: {
    database: { ok: boolean; counts?: Record<string, number> };
    realtime: { ok: boolean; detail?: string };
  };
}

const ENV_KEYS: Array<{ key: keyof TemplatesConfig["environment"]; label: string; hint: string }> = [
  { key: "jwtSecretSet", label: "JWT_SECRET", hint: "Session signing secret — set it in the deployment environment. Dev fallback active when unset." },
  { key: "databaseUrlSet", label: "DATABASE_URL", hint: "Connection string for the platform database." },
  { key: "webOriginSet", label: "WEB_ORIGIN", hint: "Public origin used for links and CORS — set it before exposing the platform." },
  { key: "realtimeUrlSet", label: "REALTIME_URL", hint: "Address of the realtime gateway service for event fan-out." },
];

export default function AdminSettingsView() {
  const config = useApi<TemplatesConfig>("/api/admin/templates-config");
  const ready = useApi<SystemReady>("/api/system/ready");
  const [probing, setProbing] = useState(false);

  const runProbe = async () => {
    setProbing(true);
    try {
      await api.get<SystemReady>("/api/system/ready");
      ready.refetch();
      config.refetch();
    } finally {
      setTimeout(() => setProbing(false), 400);
    }
  };

  const counts = config.data?.counts;
  const env = config.data?.environment;
  const checks = ready.data?.checks;

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Configuration"
        breadcrumb={["Administration", "Settings"]}
        subtitle="Read-only operations view — environment readiness, entity volumes and gateway status. Secrets are never displayed; only their configured state."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Environment"
          value={env ? `${[env.jwtSecretSet, env.databaseUrlSet, env.webOriginSet, env.realtimeUrlSet].filter(Boolean).length}/4 set` : "—"}
          sub="Configured environment keys (presence only)"
          tone={env && env.databaseUrlSet ? "info" : "warn"}
          icon={<Settings className="h-4 w-4" />}
        />
        <StatCard
          label="Gateway status"
          value={ready.data ? ready.data.status.toUpperCase() : "—"}
          sub={ready.data ? `checked ${fmtDateTime(ready.data.time)}` : "probing…"}
          tone={ready.data?.status === "ready" ? "good" : "warn"}
          icon={<Radio className="h-4 w-4" />}
        />
        <StatCard
          label="Feature flags"
          value={config.data ? `${Object.values(config.data.featureFlags).filter(Boolean).length} active` : "—"}
          sub={config.data ? `source: ${config.data.featureFlagsSource}` : undefined}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Environment readiness */}
        <SectionCard
          title="Environment readiness"
          description="Presence checks only — values are never exposed by the API"
        >
          {config.loading && !config.data ? <LoadingBlock /> : config.error ? <ErrorBlock message={config.error} onRetry={config.refetch} /> : !env ? null : (
            <div className="space-y-2.5">
              {ENV_KEYS.map((k) => {
                const set = env[k.key];
                return (
                  <div key={k.key} className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3", set ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50")}>
                    {set
                      ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 mt-0.5 shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                        <span className="font-mono">{k.label}</span>
                        <Badge variant="outline" className={set ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                          {set ? "configured ✓" : "not set !"}
                        </Badge>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {set ? k.hint : `${k.hint} Configure in the deployment environment — the value is never shown here.`}
                      </p>
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-400">Snapshot generated {fmtDateTime(config.data?.generatedAt)}</p>
            </div>
          )}
        </SectionCard>

        {/* Realtime gateway status */}
        <SectionCard
          title="Realtime & database gateway"
          description="Live probes — refreshed on demand"
          actions={
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={runProbe} disabled={probing || ready.loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", probing && "animate-spin")} /> Probe now
            </Button>
          }
        >
          {ready.loading && !ready.data ? <LoadingBlock /> : ready.error ? <ErrorBlock message={ready.error} onRetry={ready.refetch} /> : !checks ? null : (
            <div className="space-y-2.5">
              <div className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3", checks.database.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50")}>
                <Database className={cn("h-4 w-4 mt-0.5 shrink-0", checks.database.ok ? "text-emerald-600" : "text-red-600")} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    Database
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", checks.database.ok ? "text-emerald-700" : "text-red-700")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", checks.database.ok ? "bg-emerald-500" : "bg-red-500")} />
                      {checks.database.ok ? "reachable" : "unreachable"}
                    </span>
                  </p>
                  {checks.database.counts && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Probe counts: {Object.entries(checks.database.counts).map(([k, v]) => `${num(v, 0)} ${k}`).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <div className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3", checks.realtime.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50")}>
                <Radio className={cn("h-4 w-4 mt-0.5 shrink-0", checks.realtime.ok ? "text-emerald-600" : "text-red-600")} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    Realtime gateway
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", checks.realtime.ok ? "text-emerald-700" : "text-red-700")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", checks.realtime.ok ? "bg-emerald-500" : "bg-red-500")} />
                      {checks.realtime.ok ? "connected" : "degraded"}
                    </span>
                  </p>
                  {checks.realtime.detail && <p className="text-[11px] text-slate-500 mt-0.5">{checks.realtime.detail}</p>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-3">
                <p className="text-xs font-semibold text-slate-700 mb-1">Overall</p>
                <p className="text-[11px] text-slate-500">
                  Service <span className="font-mono">{ready.data?.service}</span> reports status{" "}
                  <StatusBadge status={ready.data?.status ?? "unknown"} />.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Entity counts */}
      <SectionCard title="Entity volumes" description="Live counts from the platform configuration endpoint">
        {config.loading && !config.data ? <LoadingBlock /> : config.error ? <ErrorBlock message={config.error} onRetry={config.refetch} /> : !counts ? null : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 truncate" title={k}>{k.replace(/([A-Z])/g, " $1")}</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{num(v, 0)}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Deployment info */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Deployment architecture" description="Target topology per the platform deployment blueprint">
          <div className="space-y-2.5">
            {[
              { icon: Cloud, name: "pm-control-tower-web", detail: "Next.js application — renders the single-page control tower and serves the /api route handlers" },
              { icon: Server, name: "pm-control-tower-api", detail: "Application layer — auth, RBAC, engines (CPM, EVM, health, governance) and integrations" },
              { icon: Database, name: "pm-control-tower-db", detail: "Managed database — portfolio, delivery, financial and audit ledgers" },
              { icon: Radio, name: "pm-control-tower-rt", detail: "Realtime gateway — Socket.IO fan-out for live project rooms" },
            ].map((s) => (
              <div key={s.name} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                <s.icon className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800 font-mono">{s.name}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{s.detail}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3.5 py-2.5">
              <Boxes className="h-4 w-4 text-slate-400 shrink-0" />
              <p className="text-[11px] text-slate-500">Region: Singapore (single-region deployment, managed database with daily backups).</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Operations references" description="Documentation for running and extending the platform">
          <div className="space-y-2.5">
            {[
              { title: "Platform handbook", detail: "Architecture, RBAC model, engine behaviour and lifecycle workflows." },
              { title: "API reference", detail: "Envelope conventions, permission codes and rate limits — see the Extension Hub developer notes." },
              { title: "Environment configuration", detail: "Required environment keys and secret management guidance (values never displayed in-app)." },
              { title: "Backup & recovery", detail: "Managed daily snapshots with point-in-time restore; audit ledger is append-only." },
            ].map((r) => (
              <div key={r.title} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                <BookOpen className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">{r.title}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200";
  return <Badge variant="outline" className={cn("font-medium uppercase", tone)}>{status}</Badge>;
}
