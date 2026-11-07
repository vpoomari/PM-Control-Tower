"use client";
// PM CONTROL TOWER — PROJECT WORKSPACE (flagship view)
// Route #/projects/[id]. Header bundle loads once; each tab fetches its own endpoint lazily.

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { PageHeader, LoadingBlock, ErrorBlock, StatusChip, RagBadge, ProgressBar, Metric, SectionCard } from "@/components/pmct/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money, num, fmtDate } from "@/lib/constants";
import {
  ProjectFormFields, emptyProjectForm, projectFormFrom, projectPatchPayload, type ProjectFormState,
} from "@/components/pmct/project-form";
import type { ProjectDetailBundle } from "./tabs/types";
import OverviewTab from "./tabs/OverviewTab";
import ControlsTab from "./tabs/ControlsTab";
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
import { Building2, Layers, User, CalendarRange, Pencil } from "lucide-react";
import DynamicFormRenderer from "@/components/pmct/DynamicFormRenderer";
import type { HydratedTab } from "@/lib/engines/custom-fields";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "scope", label: "Scope & Requirements" },
  { value: "wbs", label: "WBS" },
  { value: "schedule", label: "Schedule" },
    { value: "controls", label: "Controls" },
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
  // Dynamic Field Configuration Engine — admin-configured tabs (empty when none exist)
  const customTabs = useApi<{ tabs: HydratedTab[] }>(projectId ? "/api/tabs" : null);
  const customTabList = customTabs.data?.tabs ?? [];

  // Edit project dialog — same field set as the register's New project form
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ProjectFormState>(emptyProjectForm);
  const [saving, setSaving] = useState(false);
  const users = useApi<{ users: { id: string; name: string; isActive?: boolean }[] }>(editOpen ? "/api/admin/users" : null);
  const programs = useApi<{ id: string; code: string; name: string }[]>(editOpen ? "/api/programs" : null);
  const portfolios = useApi<{ id: string; code: string; name: string }[]>(editOpen ? "/api/portfolios" : null);

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

  const openEdit = () => { setEditForm(projectFormFrom(p)); setEditOpen(true); };
  const saveEdit = async () => {
    if (editForm.name.trim().length < 2) { toast.error("Name must be at least 2 characters"); return; }
    setSaving(true);
    try {
      await api.patch(`/api/projects/${projectId}`, projectPatchPayload(editForm));
      toast.success("Project updated");
      setEditOpen(false);
      await bundle.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

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
              <Button variant="outline" size="sm" className="h-8" onClick={openEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit project
              </Button>
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
            {customTabList.map((ct) => (
              <TabsTrigger
                key={ct.id}
                value={`custom-${ct.id}`}
                className="px-3 h-7 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm whitespace-nowrap"
              >
                {ct.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview"><OverviewTab bundle={bundle.data} /></TabsContent>
        <TabsContent value="scope"><ScopeTab project={p} /></TabsContent>
        <TabsContent value="wbs"><WbsTree projectId={projectId} /></TabsContent>
        <TabsContent value="schedule"><GanttChart projectId={projectId} /></TabsContent>
        <TabsContent value="controls"><ControlsTab projectId={projectId} /></TabsContent>
        <TabsContent value="milestones"><MilestonesPanel projectId={projectId} /></TabsContent>
        <TabsContent value="baselines"><BaselinesPanel projectId={projectId} /></TabsContent>
        <TabsContent value="financials"><FinancialsTab projectId={projectId} /></TabsContent>
        <TabsContent value="evm"><EvmTab projectId={projectId} /></TabsContent>
        <TabsContent value="health"><HealthTab projectId={projectId} /></TabsContent>
        <TabsContent value="raid"><RaidTab projectId={projectId} /></TabsContent>
        <TabsContent value="changes"><ChangesTab projectId={projectId} /></TabsContent>
        <TabsContent value="gates"><GatesTab projectId={projectId} /></TabsContent>
        <TabsContent value="audit"><AuditTab projectId={projectId} /></TabsContent>
        {/* Dynamic Field Configuration Engine — admin-defined tabs */}
        {customTabList.map((ct) => (
          <TabsContent key={ct.id} value={`custom-${ct.id}`}>
            <SectionCard
              title={ct.name}
              description={ct.description || "Custom fields for this project — saved as structured JSON on the project record"}
            >
              <DynamicFormRenderer
                tab={ct}
                projectId={projectId}
                customData={p.customData}
                onSaved={bundle.refetch}
              />
            </SectionCard>
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit project — same field set as New project and the Overview details card */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit project — {p.code}</DialogTitle></DialogHeader>
          <ProjectFormFields
            form={editForm}
            setForm={setEditForm}
            meta={{ programs: programs.data || [], portfolios: portfolios.data || [], users: users.data?.users || [] }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
