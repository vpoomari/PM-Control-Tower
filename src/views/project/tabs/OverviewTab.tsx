"use client";
// PM CONTROL TOWER — Workspace Overview tab: charter, objectives, EVM snapshot, health, open items

import type { ReactNode } from "react";
import { useApi } from "@/lib/client";
import type { ProjectDetailBundle } from "./types";
import { SectionCard, StatCard, StatusChip, RagBadge, ProgressBar, EmptyState } from "@/components/pmct/kit";
import { money, num, fmtDate, pct } from "@/lib/constants";
import { ScrollText, Target, Trophy, Activity, AlertTriangle, Bug, GitPullRequest, BellRing } from "lucide-react";

export default function OverviewTab({ bundle }: { bundle: ProjectDetailBundle }) {
  const p = bundle.project;
  const evm = bundle.latestEvmPeriod;
  const health = bundle.healthSnapshots?.[bundle.healthSnapshots.length - 1];
  const counts = bundle.counts;
  const users = useApi<{ users: { id: string; name: string }[] }>("/api/admin/users");
  const userName = (id: string | null) => (id ? (users.data?.users.find((u) => u.id === id)?.name ?? "…") : "—");

  return (
    <div className="space-y-4">
      {/* EVM snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="CPI" value={evm ? num(evm.cpi, 2) : "—"} sub={evm ? "Cost performance index" : "No EVM snapshot yet"} tone={evm ? (evm.cpi >= 1 ? "good" : evm.cpi >= 0.95 ? "warn" : "bad") : "default"} />
        <StatCard label="SPI" value={evm ? num(evm.spi, 2) : "—"} sub={evm ? "Schedule performance index" : "No EVM snapshot yet"} tone={evm ? (evm.spi >= 1 ? "good" : evm.spi >= 0.95 ? "warn" : "bad") : "default"} />
        <StatCard label="EAC" value={evm ? money(evm.eac) : "—"} sub={evm ? `BAC ${money(evm.bac)}` : undefined} tone={evm && evm.eac > p.currentBudget ? "bad" : "default"} />
        <StatCard label="VAC" value={evm ? money(evm.vac) : "—"} sub="Variance at completion" tone={evm && evm.vac < 0 ? "bad" : "good"} />
        <StatCard label="TCPI" value={evm ? num(evm.tcpi, 2) : "—"} sub="To-complete performance index" tone={evm && evm.tcpi > 1.1 ? "warn" : "default"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Charter / description */}
        <SectionCard title="Charter & Description" className="lg:col-span-2" bodyClass="p-4 pt-2 space-y-3">
          {p.charter || p.description ? (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{p.charter || p.description}</p>
          ) : <p className="text-sm text-slate-400">No charter recorded yet.</p>}
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1"><Target className="h-3.5 w-3.5" /> Objectives</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{p.objectives || "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1"><Trophy className="h-3.5 w-3.5" /> Success criteria</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{p.successCriteria || "—"}</p>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-4">
          {/* Latest health snapshot */}
          <SectionCard title="Latest Health Snapshot" bodyClass="p-4 pt-2">
            {health ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <RagBadge rag={health.ragStatus} score={health.healthScore} />
                  <span className="text-xs text-slate-400">{fmtDate(health.capturedAt)}</span>
                </div>
                <ProgressBar value={health.healthScore} />
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <span>CPI <b className="tabular-nums">{num(health.cpi, 2)}</b></span>
                  <span>SPI <b className="tabular-nums">{num(health.spi, 2)}</b></span>
                  <span>EAC <b className="tabular-nums">{money(health.eac)}</b></span>
                  <span>Open risks <b>{health.openRisks}</b></span>
                  <span>Open issues <b>{health.openIssues}</b></span>
                  <span>Overdue MS <b>{health.overdueMilestones}</b></span>
                </div>
                {health.notes && <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">{health.notes}</p>}
              </div>
            ) : <EmptyState title="No health snapshots" description="Health is computed from schedule, cost and RAID signals." />}
          </SectionCard>

          {/* Delivery facts */}
          <SectionCard title="Delivery Facts" bodyClass="p-4 pt-2">
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><StatusChip status={p.status} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Phase</span><StatusChip status={p.phase} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Methodology</span><span className="font-medium text-slate-700">{p.methodology}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Risk level</span><StatusChip status={p.riskLevel} /></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Status date</span><span className="text-slate-700 tabular-nums">{fmtDate(p.statusDate)}</span></div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Project details — the same field set as the New/Edit project dialogs */}
      <SectionCard title="Project details"
        description="Identical field set to the create and edit forms — use Edit project in the header to change any value."
        bodyClass="p-4 pt-2">
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          {([
            ["Code", <span className="font-mono text-xs">{p.code}</span>],
            ["Status", <StatusChip status={p.status} />],
            ["Priority", <StatusChip status={p.priority} />],
            ["Phase", <StatusChip status={p.phase} />],
            ["Methodology", p.methodology],
            ["Risk level", <StatusChip status={p.riskLevel} />],
            ["Billing type", (p.billingType || "").replace("_", " ") || "—"],
            ["Currency", p.currency || "—"],
            ["Program", bundle.program ? `${bundle.program.code} — ${bundle.program.name}` : "—"],
            ["Portfolio", bundle.portfolio ? `${bundle.portfolio.code} — ${bundle.portfolio.name}` : "—"],
            ["Project manager", bundle.owner?.name || "—"],
            ["Manager", userName(p.managerId)],
            ["Sponsor", userName(p.sponsorId)],
            ["Start", fmtDate(p.startDate)],
            ["Finish", fmtDate(p.endDate)],
            ["Baseline start", fmtDate(p.baselineStart)],
            ["Baseline finish", fmtDate(p.baselineFinish)],
            ["Status date", fmtDate(p.statusDate)],
            ["Current budget", money(p.currentBudget)],
            ["Baseline budget", money(p.baselineBudget)],
            ["Forecast cost", money(p.forecastCost)],
          ] as [string, ReactNode][]).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="text-sm font-medium text-slate-800 truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      {/* Open items summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open Risks" value={counts.risks} sub="RAID register" tone={counts.risks > 0 ? "warn" : "good"} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Open Issues" value={counts.issues} sub="Active problem management" tone={counts.issues > 0 ? "warn" : "good"} icon={<Bug className="h-4 w-4" />} />
        <StatCard label="Change Requests" value={counts.changeRequests} sub="Governance workflow" icon={<GitPullRequest className="h-4 w-4" />} />
        <StatCard label="Alert Events" value={counts.alertEvents} sub="Threshold breaches raised" tone={counts.alertEvents > 0 ? "info" : "default"} icon={<BellRing className="h-4 w-4" />} />
      </div>

      {/* Financial position strip */}
      <SectionCard title="Financial Position" bodyClass="p-4 pt-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
          <StatCardish label="Baseline budget" value={money(p.baselineBudget)} />
          <StatCardish label="Current budget" value={money(p.currentBudget)} />
          <StatCardish label="Actual cost" value={money(p.actualCost)} />
          <StatCardish label="Forecast (EAC)" value={money(p.forecastCost)} tone={p.forecastCost > p.currentBudget ? "text-red-600" : "text-slate-900"} />
          <StatCardish label="Budget consumed" value={pct(p.currentBudget ? (p.actualCost / p.currentBudget) * 100 : 0)} />
        </div>
      </SectionCard>

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <ScrollText className="h-3.5 w-3.5" /> Figures derive from live operational data — status date {fmtDate(p.statusDate)}.
        <Activity className="h-3.5 w-3.5 ml-2" /> {bundle.tasks.length} tasks · {bundle.wbsTree.length} root WBS nodes · {bundle.baselines.length} baselines · {bundle.stageGates.length} gates
      </p>
    </div>
  );
}

function StatCardish({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone || "text-slate-900"}`}>{value}</p>
    </div>
  );
}
