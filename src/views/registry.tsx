"use client";
// PM CONTROL TOWER — View registry: maps hash routes to view components (single visible route "/").

import { ComponentType, lazy, Suspense } from "react";
import { LoadingBlock } from "@/components/pmct/kit";

const L = (factory: () => Promise<{ default: ComponentType }>) =>
  lazy(factory);

// --- Foundation views ---
const Dashboard = L(() => import("@/views/dashboard"));
const Login = L(() => import("@/views/login"));

// --- Portfolio & Plan views (batch F-A) ---
const PortfoliosView = L(() => import("@/views/portfolio/portfolios"));
const ProgramsView = L(() => import("@/views/portfolio/programs"));
const ProjectsView = L(() => import("@/views/portfolio/projects"));
const ProjectWorkspace = L(() => import("@/views/project/ProjectWorkspace"));
const RegisterView = L(() => import("@/views/plan/register"));
const RequirementsView = L(() => import("@/views/plan/requirements"));
const WbsView = L(() => import("@/views/plan/wbs"));
const TasksView = L(() => import("@/views/plan/tasks"));
const ScheduleView = L(() => import("@/views/plan/schedule"));
const MilestonesView = L(() => import("@/views/plan/milestones"));
const BaselinesView = L(() => import("@/views/plan/baselines"));

// --- Execute & Control views (batch F-B) ---
const ResourcesView = L(() => import("@/views/execute/resources"));
const TimesheetsView = L(() => import("@/views/execute/timesheets"));
const InboxView = L(() => import("@/views/execute/inbox"));
const PlannerView = L(() => import("@/views/execute/planner"));
const FinancialsView = L(() => import("@/views/control/financials"));
const EvmView = L(() => import("@/views/control/evm"));
const HealthView = L(() => import("@/views/control/health"));
const RaidView = L(() => import("@/views/control/raid"));
const ChangesView = L(() => import("@/views/control/changes"));
const GatesView = L(() => import("@/views/control/gates"));
const GovernanceView = L(() => import("@/views/control/governance"));
const IntegrityView = L(() => import("@/views/integrity/integrity"));
const TechnologyView = L(() => import("@/views/technology/technology"));

// --- Intelligence, Connect & Admin views (batch F-C) ---
const ReportsView = L(() => import("@/views/intelligence/reports"));
const LeadershipView = L(() => import("@/views/intelligence/leadership"));
const AnalyticsView = L(() => import("@/views/intelligence/analytics"));
const AssistantView = L(() => import("@/views/intelligence/assistant"));
const IntegrationsView = L(() => import("@/views/connect/integrations"));
const AutomationsView = L(() => import("@/views/connect/automations"));
const NotificationsView = L(() => import("@/views/connect/notifications"));
const WebhooksView = L(() => import("@/views/connect/webhooks"));
const AiGatewayView = L(() => import("@/views/connect/ai-gateway"));
const ExtensionsView = L(() => import("@/views/connect/extensions"));
const AdminUsersView = L(() => import("@/views/admin/users"));
const AdminRolesView = L(() => import("@/views/admin/roles"));
const AdminTemplatesView = L(() => import("@/views/admin/templates"));
const AdminAuditView = L(() => import("@/views/admin/audit"));
const AdminSettingsView = L(() => import("@/views/admin/settings"));

function Fallback() { return <LoadingBlock label="Preparing workspace…" />; }

export function renderView(segments: string[]): { C: ComponentType; key: string } {
  const [a, b] = segments;
  const key = segments.join("/") || "dashboard";
  switch (a) {
    case undefined:
    case "":
    case "dashboard": return { C: Dashboard, key };
    case "portfolios": return { C: PortfoliosView, key };
    case "programs": return { C: ProgramsView, key };
    case "projects": return b ? { C: ProjectWorkspace, key } : { C: ProjectsView, key };
    case "register": return { C: RegisterView, key };
    case "requirements": return { C: RequirementsView, key };
    case "wbs": return { C: WbsView, key };
    case "tasks": return { C: TasksView, key };
    case "schedule": return { C: ScheduleView, key };
    case "milestones": return { C: MilestonesView, key };
    case "baselines": return { C: BaselinesView, key };
    case "resources": return { C: ResourcesView, key };
    case "timesheets": return { C: TimesheetsView, key };
    case "inbox": return { C: InboxView, key };
    case "planner": return { C: PlannerView, key };
    case "financials": return { C: FinancialsView, key };
    case "evm": return { C: EvmView, key };
    case "health": return { C: HealthView, key };
    case "raid": return { C: RaidView, key };
    case "changes": return { C: ChangesView, key };
    case "gates": return { C: GatesView, key };
    case "governance": return { C: GovernanceView, key };
    case "integrity": return { C: IntegrityView, key };
    case "technology": return { C: TechnologyView, key };
    case "reports":
      switch (b) {
        case "leadership": return { C: LeadershipView, key };
        default: return { C: ReportsView, key };
      }
    case "analytics": return { C: AnalyticsView, key };
    case "assistant": return { C: AssistantView, key };
    case "integrations": return { C: IntegrationsView, key };
    case "automations": return { C: AutomationsView, key };
    case "notifications": return { C: NotificationsView, key };
    case "webhooks": return { C: WebhooksView, key };
    case "ai-gateway": return { C: AiGatewayView, key };
    case "extensions": return { C: ExtensionsView, key };
    case "admin":
      switch (b) {
        case "roles": return { C: AdminRolesView, key };
        case "templates": return { C: AdminTemplatesView, key };
        case "audit": return { C: AdminAuditView, key };
        case "settings": return { C: AdminSettingsView, key };
        default: return { C: AdminUsersView, key };
      }
    default: return { C: Dashboard, key };
  }
}

export function ViewLoader({ segments }: { segments: string[] }) {
  const { C, key } = renderView(segments);
  return (
    <Suspense fallback={<Fallback />}>
      <C key={key} />
    </Suspense>
  );
}
