"use client";
// PM CONTROL TOWER — unified Administration → Settings hub.
// One top-level entry, with the former administration destinations retained as
// permission-aware in-page tabs.

import { lazy, Suspense, useMemo } from "react";
import { useApi } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/pmct/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const OverviewView = lazy(() => import("./settings"));
const UsersView = lazy(() => import("./users"));
const RolesView = lazy(() => import("./roles"));
const TemplatesView = lazy(() => import("./templates"));
const AuditView = lazy(() => import("./audit"));
const ControlCenterView = lazy(() => import("./admin"));
const FieldsView = lazy(() => import("./FieldDictionaryAdmin"));
const FormTabsView = lazy(() => import("./TabBuilder"));
const TabVisibilityView = lazy(() => import("./TabVisibility"));
const AgentsView = lazy(() => import("./agents"));

interface SessionPermissions {
  user: { isSuperAdmin: boolean; permissions: string[] };
}

const SECTIONS = [
  { id: "overview", label: "Overview", permission: "admin.config", View: OverviewView },
  { id: "users", label: "Users", permission: "admin.users", View: UsersView },
  { id: "roles", label: "Roles & Permissions", permission: "admin.users", View: RolesView },
  { id: "templates", label: "Template Library", permission: "admin.templates", View: TemplatesView },
  { id: "audit", label: "Audit Trail", permission: "admin.audit", View: AuditView },
  { id: "control-center", label: "Control Center", permission: "admin.config", View: ControlCenterView },
  { id: "fields", label: "Field Dictionary", permission: "admin.config", View: FieldsView },
  { id: "form-tabs", label: "Form Tab Builder", permission: "admin.config", View: FormTabsView },
  { id: "tab-visibility", label: "Tab Visibility", permission: "admin.config", View: TabVisibilityView },
  { id: "agents", label: "AI Agents", permission: "admin.config", View: AgentsView },
] as const;

export default function SettingsHubView() {
  const session = useApi<SessionPermissions>("/api/auth/me");
  const { query, navigate } = useRoute();

  // The active section is derived from the route (#/admin/settings?tab=agents)
  // so deep links from the AI Hub open it directly and browser back/forward
  // walks the sections. No tab param → Overview (historic default).
  const setActive = (id: string) => navigate(`/admin/settings?tab=${id}`);
  const active = query.get("tab") ?? "overview";

  const permissions = session.data?.user.permissions ?? [];
  const isSuperAdmin = session.data?.user.isSuperAdmin ?? false;
  const allowed = useMemo(
    () => SECTIONS.filter((section) => isSuperAdmin || permissions.includes("*") || permissions.includes(section.permission)),
    [isSuperAdmin, permissions]
  );
  const activeTab = allowed.find((section) => section.id === active)?.id ?? allowed[0]?.id ?? "";

  if (session.loading && !session.data) return <LoadingBlock label="Loading settings access…" />;
  if (session.error) return <ErrorBlock message={session.error} />;
  if (!allowed.length) return <EmptyState title="Settings access required" description="Your role does not have any Administration permissions." />;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage workspace configuration, access, templates and audit controls.</p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActive} className="space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {allowed.map((section) => (
            <TabsTrigger key={section.id} value={section.id} className="min-h-9 whitespace-nowrap px-3 text-xs">
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Suspense fallback={<LoadingBlock label="Opening settings…" />}>
          {allowed.map(({ id, View }) => (
            <TabsContent key={id} value={id} className="mt-0 focus-visible:outline-none">
              {id === "overview" ? <OverviewView embedded /> : <View />}
            </TabsContent>
          ))}
        </Suspense>
      </Tabs>
    </div>
  );
}
