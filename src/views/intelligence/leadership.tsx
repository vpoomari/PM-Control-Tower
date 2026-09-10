"use client";
// PM CONTROL TOWER — INTELLIGENCE · Leadership Reporting & Executive Control Tower
// One workspace, exception-first: tower → portfolio → status reports → registers
// → meeting mode → history & schedules. All figures from /api/reports/leadership.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, Button, Badge, cn,
} from "@/components/pmct/kit";
import type { LeadershipBundle, ProjectStatusReport } from "@/lib/engines/leadership";
import {
  TowerSection, PortfolioSection, StatusReportSection,
} from "./leadership-sections-a";
import {
  WhatChangedSection, RiskSection, IssueSection, MilestoneSection, FinancialSection,
  ResourceSection, ScheduleSection, DependencySection,
} from "./leadership-sections-b";
import {
  DecisionSection, ScopeSection, ActionSection, DeliverableSection, QualitySection,
  KpiSection, OutlookSection, MeetingMode, HistorySection,
} from "./leadership-sections-c";
import {
  Gauge, Layers, FileText, History as HistoryIcon, AlertTriangle, ShieldAlert, Flag,
  Wallet, Users, CalendarClock, Network, Scale, ArrowLeftRight, ListChecks, Award,
  ChevronRight, CalendarRange, Presentation, LayoutDashboard, RefreshCw,
} from "lucide-react";

const TABS: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; group: string }[] = [
  { id: "tower", label: "Control Tower", icon: Gauge, group: "Overview" },
  { id: "portfolio", label: "Portfolio", icon: Layers, group: "Overview" },
  { id: "status", label: "Status Reports", icon: FileText, group: "Overview" },
  { id: "changed", label: "What Changed", icon: HistoryIcon, group: "Overview" },
  { id: "risks", label: "Risks", icon: AlertTriangle, group: "Control" },
  { id: "issues", label: "Issues", icon: ShieldAlert, group: "Control" },
  { id: "milestones", label: "Milestones", icon: Flag, group: "Control" },
  { id: "financial", label: "Financial", icon: Wallet, group: "Control" },
  { id: "resources", label: "Resources", icon: Users, group: "Control" },
  { id: "schedule", label: "Schedule", icon: CalendarClock, group: "Control" },
  { id: "dependencies", label: "Dependencies", icon: Network, group: "Control" },
  { id: "decisions", label: "Decisions", icon: Scale, group: "Govern" },
  { id: "scope", label: "Scope Changes", icon: ArrowLeftRight, group: "Govern" },
  { id: "actions", label: "Actions", icon: ListChecks, group: "Govern" },
  { id: "deliverables", label: "Deliverables", icon: ChevronRight, group: "Govern" },
  { id: "quality", label: "Quality", icon: Award, group: "Govern" },
  { id: "kpis", label: "KPIs / Benefits", icon: LayoutDashboard, group: "Govern" },
  { id: "outlook", label: "30/60/90 Outlook", icon: CalendarRange, group: "Executive" },
  { id: "meeting", label: "Meeting Mode", icon: Presentation, group: "Executive" },
  { id: "history", label: "History & Schedules", icon: HistoryIcon, group: "Executive" },
];

const GROUPS = ["Overview", "Control", "Govern", "Executive"];

export default function LeadershipView() {
  const bundle = useApi<LeadershipBundle>("/api/reports/leadership");
  const [tab, setTab] = useState("tower");
  const [statusProjectId, setStatusProjectId] = useState<string | null>(null);
  useRealtimeRefetch(bundle.refetch, ["report:generated", "governance:changed"]);

  const d = bundle.data;

  const gotoProjectStatus = (projectId: string) => { setStatusProjectId(projectId); setTab("status"); };

  const body = useMemo(() => {
    if (bundle.loading && !d) return <div className="py-16 text-center text-sm text-slate-400">Compiling leadership intelligence from the live data engine…</div>;
    if (bundle.error && !d) return (
      <div className="py-10 text-center">
        <p className="text-sm text-red-600 mb-3">{bundle.error}</p>
        <Button variant="outline" size="sm" onClick={bundle.refetch}>Retry</Button>
      </div>
    );
    if (!d) return null;
    switch (tab) {
      case "tower": return <TowerSection d={d} onDrill={gotoProjectStatus} onGenerate={async () => {
        try {
          const res = await fetch("/api/reports/leadership/pack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "PORTFOLIO" }) });
          const j = await res.json();
          if (!res.ok || !j.success) throw new Error(j.error || "Generation failed");
          toast.success(`Leadership Pack generated`, { description: `${j.data.title} — stored in History & Schedules.` });
          bundle.refetch();
        } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); }
      }} />;
      case "portfolio": return <PortfolioSection d={d} onDrill={gotoProjectStatus} />;
      case "status": return <StatusReportSection d={d} projectId={statusProjectId} onPick={setStatusProjectId} />;
      case "changed": return <WhatChangedSection d={d} />;
      case "risks": return <RiskSection d={d} />;
      case "issues": return <IssueSection d={d} />;
      case "milestones": return <MilestoneSection d={d} />;
      case "financial": return <FinancialSection d={d} />;
      case "resources": return <ResourceSection d={d} />;
      case "schedule": return <ScheduleSection d={d} />;
      case "dependencies": return <DependencySection d={d} />;
      case "decisions": return <DecisionSection d={d} onChanged={bundle.refetch} />;
      case "scope": return <ScopeSection d={d} />;
      case "actions": return <ActionSection d={d} onChanged={bundle.refetch} />;
      case "deliverables": return <DeliverableSection d={d} />;
      case "quality": return <QualitySection d={d} />;
      case "kpis": return <KpiSection d={d} onChanged={bundle.refetch} />;
      case "outlook": return <OutlookSection d={d} />;
      case "meeting": return <MeetingMode d={d} />;
      case "history": return <HistorySection onChanged={bundle.refetch} />;
      default: return null;
    }
  }, [tab, d, bundle.loading, bundle.error, statusProjectId]);

  const gapBanner = d && !d.validation.passed ? (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <b>Nothing-missed validation:</b> {d.validation.gaps} data gap{d.validation.gaps === 1 ? "" : "s"} detected —
        statuses affected by gaps are flagged GREY / INSUFFICIENT DATA rather than hidden. Details on the Control Tower tab.
      </span>
    </div>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Leadership Control Tower"
        breadcrumb={["Intelligence", "Leadership Reporting"]}
        subtitle={d ? `Decision-ready intelligence from the single source of truth — ${d.tower.totalProjects} projects, baseline ${d.sinceLabel}. Exceptions first.` : "Decision-ready intelligence from the single source of truth."}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={bundle.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setTab("meeting")}><Presentation className="h-4 w-4 mr-1.5" /> Meeting Mode</Button>
          </>
        }
      />

      {/* Tab strip */}
      <div className="mb-4 space-y-2">
        {GROUPS.map((g) => (
          <div key={g} className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-20 shrink-0">{g}</span>
            {TABS.filter((t) => t.group === g).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all",
                  tab === t.id
                    ? "border-slate-800 bg-slate-800 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
                {t.id === "decisions" && d?.tower.overdueDecisions ? (
                  <Badge className="ml-0.5 h-4 px-1 text-[9px] bg-red-600 text-white border-0">{d.tower.overdueDecisions}</Badge>
                ) : null}
                {t.id === "actions" && d?.tower.overdueActions ? (
                  <Badge className="ml-0.5 h-4 px-1 text-[9px] bg-red-600 text-white border-0">{d.tower.overdueActions}</Badge>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </div>

      {gapBanner}
      <div className={cn(gapBanner && "mt-4")}>{body}</div>
    </div>
  );
}

// Small shared bits used across section files
export function RatingChip({ rating }: { rating: "GREEN" | "AMBER" | "RED" | "GREY" | string }) {
  const map: Record<string, string> = {
    GREEN: "bg-emerald-50 text-emerald-700 border-emerald-200",
    AMBER: "bg-amber-50 text-amber-700 border-amber-200",
    RED: "bg-red-50 text-red-700 border-red-200",
    GREY: "bg-slate-100 text-slate-600 border-slate-300",
  };
  const labels: Record<string, string> = { GREEN: "ON TRACK", AMBER: "AT RISK", RED: "CRITICAL", GREY: "INSUFFICIENT DATA" };
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide", map[rating] ?? map.GREY)}>{labels[rating] ?? rating}</span>;
}

export type { ProjectStatusReport };
