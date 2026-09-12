"use client";
// PM CONTROL TOWER — CTO Technology Control Tower (§8/§9)
// Application portfolio, lifecycle, technical debt, releases, DevOps metrics — all computed.

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import { num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Badge, Input, cn,
} from "@/components/pmct/kit";
import { Label } from "@/components/ui/label";
import { RefreshCw, Server, Layers, Cloud, AlertTriangle, Rocket } from "lucide-react";

interface TechApp { id: string; name: string; category: string; businessCriticality: string; lifecycleStatus: string; cloudHosted: boolean; owner: string | null; version: string | null; healthScore: number; debts: { severity: string; status: string }[]; releases: { version: string; releasedAt: string; status: string }[] }
interface TechTech { id: string; name: string; category: string; lifecycleStatus: string; version: string | null }
interface DebtItem { id: string; title: string; severity: string; estimateHours: number; status: string; applicationId: string | null }
interface Rel { id: string; version: string; releasedAt: string; status: string; deployments: number; leadTimeDays: number }
interface TechData {
  apps: TechApp[]; technologies: TechTech[]; debt: DebtItem[]; releases: Rel[];
  kpis: { totalApps: number; missionCritical: number; legacyApps: number; legacyExposurePct: number; cloudAdoptionPct: number; openDebtItems: number; debtHours: number; criticalDebt: number; unsupportedTech: number; unsupportedNames: string[]; releases90d: number; deploymentsPerWeek: number; avgLeadTimeDays: number; rollbacks90d: number; architectureHealth: number };
}

const LC_TONE: Record<string, string> = { PLANNED: "border-slate-200 text-slate-500", ACTIVE: "border-emerald-200 text-emerald-700 bg-emerald-50", LEGACY: "border-amber-200 text-amber-700 bg-amber-50", SUNSET: "border-orange-300 text-orange-700 bg-orange-50", RETIRED: "border-slate-200 text-slate-400" };

export default function TechnologyView() {
  const data = useApi<TechData>("/api/technology");
  const canManage = true; // integration.manage holders; view-level gate via nav perm
  const [name, setName] = useState("");
  const [cloud, setCloud] = useState(false);
  const [busy, setBusy] = useState(false);

  const addApp = async () => {
    if (name.trim().length < 2) { toast.error("Give the application a name"); return; }
    setBusy(true);
    try {
      await api.post("/api/technology", { name: name.trim(), cloudHosted: cloud });
      toast.success("Application registered in the portfolio"); setName(""); data.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };

  if (data.loading && !data.data) return <LoadingBlock label="Computing technology portfolio…" />;
  if (data.error && !data.data) return <ErrorBlock message={data.error} onRetry={data.refetch} />;
  const k = data.data!.kpis;

  return (
    <div className="space-y-5">
      <PageHeader
        io="integrations"
        title="Technology Control Tower"
        subtitle="Application portfolio, lifecycle exposure, technical debt and delivery velocity — computed from the technology register."
        breadcrumb={["Home", "Technology", "CTO Tower"]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Architecture health" value={k.architectureHealth + "/100"} tone={k.architectureHealth >= 80 ? "good" : k.architectureHealth >= 60 ? "warn" : "bad"} sub="lifecycle + debt + unsupported mix" icon={<Server className="h-4 w-4" />} />
        <StatCard label="Applications" value={k.totalApps} sub={`${k.missionCritical} mission-critical`} icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Legacy exposure" value={k.legacyExposurePct + "%"} tone={k.legacyExposurePct > 30 ? "bad" : k.legacyExposurePct > 15 ? "warn" : "good"} sub={k.legacyApps + " legacy/sunset apps"} />
        <StatCard label="Cloud adoption" value={k.cloudAdoptionPct + "%"} tone="info" sub="of the portfolio" icon={<Cloud className="h-4 w-4" />} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open technical debt" value={k.openDebtItems} sub={num(k.debtHours) + "h estimated"} tone={k.criticalDebt > 0 ? "bad" : "warn"} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Unsupported tech" value={k.unsupportedTech} tone={k.unsupportedTech > 0 ? "bad" : "good"} sub={k.unsupportedNames.slice(0, 2).join(", ") || "none"} />
        <StatCard label="Deployments / week" value={k.deploymentsPerWeek} sub={k.releases90d + " releases in 90d"} icon={<Rocket className="h-4 w-4" />} />
        <StatCard label="Avg lead time" value={k.avgLeadTimeDays + "d"} sub={k.rollbacks90d + " rollbacks in 90d"} />
      </div>

      <SectionCard title="Application portfolio" description="Lifecycle, criticality and debt per application"
        actions={canManage && (
          <div className="flex items-center gap-2">
            <Input className="h-8 w-44" placeholder="New application name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="text-xs text-slate-500 flex items-center gap-1"><input type="checkbox" checked={cloud} onChange={(e) => setCloud(e.target.checked)} />cloud</label>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void addApp()}><RefreshCw className="h-3.5 w-3.5 mr-1" />Register</Button>
          </div>
        )}>
        <div className="space-y-1.5">
          {data.data!.apps.map((a) => {
            const openDebts = a.debts.filter((d) => d.status !== "RESOLVED").length;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800 flex-1 truncate min-w-40">{a.name}</span>
                <Badge variant="outline" className="border-slate-200 text-slate-500">{a.category}</Badge>
                <StatusChip status={a.businessCriticality} />
                <Badge variant="outline" className={cn(LC_TONE[a.lifecycleStatus])}>{a.lifecycleStatus}</Badge>
                {a.cloudHosted && <Badge variant="outline" className="border-sky-200 text-sky-700">cloud</Badge>}
                {openDebts > 0 && <Badge variant="outline" className="border-red-200 text-red-700">{openDebts} debt</Badge>}
                <span className={cn("text-xs tabular-nums", a.healthScore < 60 ? "text-red-600 font-semibold" : "text-slate-500")}>health {a.healthScore}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Technical debt register" description="Open + planned items — the honest cost of shortcuts">
          {data.data!.debt.length === 0 ? <EmptyState title="No open technical debt" /> : (
            <div className="space-y-1.5">
              {data.data!.debt.slice(0, 8).map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <span className="flex-1 truncate text-slate-700">{d.title}</span>
                  <StatusChip status={d.severity} />
                  <span className="text-xs tabular-nums text-slate-400">{num(d.estimateHours)}h</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Recent releases" description="Deployment velocity and stability">
          {data.data!.releases.length === 0 ? <EmptyState title="No releases recorded" /> : (
            <div className="space-y-1.5">
              {data.data!.releases.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <Rocket className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="flex-1 truncate text-slate-700">{r.version}</span>
                  <StatusChip status={r.status} />
                  <span className="text-xs tabular-nums text-slate-400">{new Date(r.releasedAt).toLocaleDateString()} · lead {num(r.leadTimeDays)}d</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Technology register" description="Languages, frameworks, databases, cloud and tools with lifecycle warnings">
        <div className="flex flex-wrap gap-2">
          {data.data!.technologies.map((t) => (
            <span key={t.id} title={t.category + (t.version ? " " + t.version : "")}
              className={cn("px-2 py-1 rounded-md border text-xs", t.lifecycleStatus === "UNSUPPORTED" ? "border-red-300 bg-red-50 text-red-700" : t.lifecycleStatus === "DEPRECATED" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600")}>
              {t.name}{t.version ? " · " + t.version : ""}{t.lifecycleStatus !== "ACTIVE" ? " · " + t.lifecycleStatus : ""}
            </span>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
