"use client";
// PM CONTROL TOWER — PROJECT WORKSPACE (flagship view)
// Route #/projects/[id]. Header bundle loads once; each tab fetches its own endpoint lazily.

import { useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { PageHeader, LoadingBlock, ErrorBlock, StatusChip, RagBadge, ProgressBar, Metric } from "@/components/pmct/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, num, fmtDate } from "@/lib/constants";
import type { ProjectDetailBundle } from "./tabs/types";
import OverviewTab from "./tabs/OverviewTab";
import ScopeTab from "./tabs/ScopeTab";
import FinancialsTab from "./tabs/FinancialsTab";
import EvmTab from "./tabs/EvmTab";
import HealthTab from "./tabs/HealthTab";
import RaidTab from "./tabs/RaidTab";
import ChangesTab from "./tabs/ChangesTab";
import GatesTab from "./tabs/GatesTab";
import AuditTab from "./tabs/AuditTab";
import WbsTree from "@/views/plan/shared/WbsTree";
import GanttChart from "@/views/plan/shared/GanttChart";
import MilestonesPanel from "@/views/plan/shared/MilestonesPanel";
import BaselinesPanel from "@/views/plan/shared/BaselinesPanel";
import { Building2, Layers, User, CalendarRange } from "lucide-react";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "scope", label: "Scope & Requirements" },
  { value: "wbs", label: "WBS" },
  { value: "schedule", label: "Schedule" },
  { value: "milestones", label: "Milestones" },
  { value: "baselines", label: "Baselines" },
  { value: "financials", label: "Financials" },
  { value: "evm", label: "EVM" },
  { value: "health", label: "Health" },
  { value: "raid", label: "RAID" },
  { value: "changes", label: "Changes" },
  { value: "gates", label: "Stage Gates" },
  { value: "audit", label: "Audit" },
] as const;

export default function ProjectWorkspace() {
  const route = useRoute();
  const projectId = route.segments[1] || null;
  const bundle = useApi<ProjectDetailBundle>(projectId ? `/api/projects/${projectId}` : null);
  useRealtimeRefetch(bundle.refetch, ["project:updated", "project:health", "project:created"]);

  if (!projectId) {
    return <ErrorBlock message="No project selected — open a project from the register." />;
  }
  if (bundle.loading || !bundle.data) {
    return bundle.error
      ? <ErrorBlock message={bundle.error} onRetry={bundle.refetch} />
      : <LoadingBlock label="Loading project workspace…" />;
  }
  if (bundle.error) {
    return <ErrorBlock message={bundle.error} onRetry={bundle.refetch} />;
  }

  const { project: p, program, portfolio, owner } = bundle.data;
  const evm = bundle.data.latestEvmPeriod;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <PageHeader
          breadcrumb={[
            "Home",
            portfolio ? `Portfolio ${portfolio.code}` : "Projects",
            program ? program.code : undefined,
            p.code,
          ].filter(Boolean) as string[]}
          title={p.name}
          subtitle={p.description || undefined}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={p.status} />
              <StatusChip status={p.phase} />
              <StatusChip status={p.priority} />
              <RagBadge rag={p.ragStatus} score={p.healthScore} />
            </div>
          }
        />
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 md:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Progress</span>
                <span className="text-sm font-semibold tabular-nums text-slate-800">{num(p.progress, 1)}%</span>
              </div>
              <ProgressBar value={p.progress} className="h-2" />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {portfolio ? `${portfolio.name}` : "No portfolio"}{program ? ` › ${program.name}` : ""}</span>
                <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" /> PM {owner?.name || "—"}</span>
                <span className="flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5 text-slate-400" /> {fmtDate(p.startDate)} → {fmtDate(p.endDate)}</span>
                <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-slate-400" /> {p.methodology.toLowerCase()} · {p.riskLevel.toLowerCase()} risk</span>
              </div>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-2 gap-4 lg:border-l lg:border-slate-100 lg:pl-5">
              <Metric label="Budget" value={money(p.currentBudget)} />
              <Metric label="Actual" value={money(p.actualCost)} tone={p.actualCost > p.currentBudget ? "text-red-600" : "text-slate-800"} />
              <Metric label="EAC" value={evm ? money(evm.eac) : money(p.forecastCost)} tone={p.forecastCost > p.currentBudget ? "text-red-600" : "text-slate-800"} />
              <Metric label="Hours (P/A)" value={`${num(p.plannedHours, 0)} / ${num(p.actualHours, 0)}`} />
              <Metric label="Baseline" value={p.baselineBudget ? money(p.baselineBudget) : "—"} />
              <Metric label="Status date" value={fmtDate(p.statusDate)} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
          <TabsList className="inline-flex h-9 items-center bg-slate-100 rounded-lg p-1 w-max max-w-none">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="px-3 h-7 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm whitespace-nowrap"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview"><OverviewTab bundle={bundle.data} /></TabsContent>
        <TabsContent value="scope"><ScopeTab project={p} /></TabsContent>
        <TabsContent value="wbs"><WbsTree projectId={projectId} /></TabsContent>
        <TabsContent value="schedule"><GanttChart projectId={projectId} /></TabsContent>
        <TabsContent value="milestones"><MilestonesPanel projectId={projectId} /></TabsContent>
        <TabsContent value="baselines"><BaselinesPanel projectId={projectId} /></TabsContent>
        <TabsContent value="financials"><FinancialsTab projectId={projectId} /></TabsContent>
        <TabsContent value="evm"><EvmTab projectId={projectId} /></TabsContent>
        <TabsContent value="health"><HealthTab projectId={projectId} /></TabsContent>
        <TabsContent value="raid"><RaidTab projectId={projectId} /></TabsContent>
        <TabsContent value="changes"><ChangesTab projectId={projectId} /></TabsContent>
        <TabsContent value="gates"><GatesTab projectId={projectId} /></TabsContent>
        <TabsContent value="audit"><AuditTab projectId={projectId} /></TabsContent>
      </Tabs>
    </div>
  );
}
