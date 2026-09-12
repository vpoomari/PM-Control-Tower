"use client";
// PM CONTROL TOWER — Application shell: sidebar navigation, topbar, command palette,
// global search, quick create, notification bell, realtime indicator, user menu.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { api, getToken, socketState, onRealtime } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Gauge, Layers, GitBranch, FolderKanban, ClipboardList, ListTree, CalendarRange, GanttChartSquare,
  Milestone, Layers3, Users, Clock, Inbox, CalendarCheck2, Wallet, TrendingUp, HeartPulse, ShieldAlert,
  ArrowLeftRight, ScanSearch, Landmark, BarChart3, LineChart, Sparkles, Plug, Blocks, Workflow, Bell,
  Webhook, BrainCircuit, UserCog, KeyRound, LayoutTemplate, ScrollText, Settings, Search, Plus, Menu,
  Radio, LogOut, CircleUser, TowerControl, Crown,
  ShieldCheck } from "lucide-react";

export interface SessionUser {
  id: string; email: string; name: string; isSuperAdmin: boolean;
  roles: string[]; permissions: string[]; avatarColor: string; title: string | null;
}

interface NavItem { label: string; href: string; icon: React.ComponentType<{ className?: string }>; perm?: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { label: "Executive", items: [{ label: "Executive Control Tower", href: "/dashboard", icon: Gauge, perm: "executive.view" }] },
  {
    label: "Portfolio", items: [
      { label: "Portfolios", href: "/portfolios", icon: Layers, perm: "portfolio.view" },
      { label: "Programs", href: "/programs", icon: GitBranch, perm: "program.view" },
      { label: "Projects", href: "/projects", icon: FolderKanban, perm: "project.view" },
    ],
  },
  {
    label: "Plan", items: [
      { label: "Project Register", href: "/register", icon: ClipboardList, perm: "project.view" },
      { label: "Requirements", href: "/requirements", icon: ListTree, perm: "project.view" },
      { label: "WBS", href: "/wbs", icon: Network, perm: "project.view" },
      { label: "Tasks", href: "/tasks", icon: CalendarCheck2, perm: "project.view" },
      { label: "Schedule", href: "/schedule", icon: GanttChartSquare, perm: "project.view" },
      { label: "Milestones", href: "/milestones", icon: Milestone, perm: "project.view" },
      { label: "Baselines", href: "/baselines", icon: Layers3, perm: "project.view" },
    ],
  },
  {
    label: "Execute", items: [
      { label: "Resources", href: "/resources", icon: Users, perm: "resource.view" },
      { label: "Timesheets", href: "/timesheets", icon: Clock, perm: "timesheet.own" },
      { label: "Work Inbox", href: "/inbox", icon: Inbox, perm: "inbox.use" },
      { label: "Focus Planner", href: "/planner", icon: CalendarRange, perm: "inbox.use" },
    ],
  },
  {
    label: "Control", items: [
      { label: "Financials", href: "/financials", icon: Wallet, perm: "financial.view" },
      { label: "EVM", href: "/evm", icon: TrendingUp, perm: "evm.view" },
      { label: "Health", href: "/health", icon: HeartPulse, perm: "evm.view" },
      { label: "RAID", href: "/raid", icon: ShieldAlert, perm: "project.view" },
      { label: "Change Control", href: "/changes", icon: ArrowLeftRight, perm: "project.view" },
      { label: "Stage Gates", href: "/gates", icon: ScanSearch, perm: "project.view" },
      { label: "Governance", href: "/governance", icon: Landmark, perm: "project.view" },
      { label: "Data Integrity", href: "/integrity", icon: ShieldCheck, perm: "integrity.view" },
    ],
  },
  {
    label: "Intelligence", items: [
      { label: "Leadership Control Tower", href: "/reports/leadership", icon: Crown, perm: "reports.view" },
      { label: "Reports", href: "/reports", icon: BarChart3, perm: "reports.view" },
      { label: "Analytics", href: "/analytics", icon: LineChart, perm: "reports.view" },
      { label: "AI PM Assistant", href: "/assistant", icon: Sparkles, perm: "ai.use" },
    ],
  },
  {
    label: "Connect", items: [
      { label: "Integration Hub", href: "/integrations", icon: Plug, perm: "integration.view" },
      { label: "Control Automations", href: "/automations", icon: Workflow, perm: "integration.view" },
      { label: "Notifications", href: "/notifications", icon: Bell, perm: "inbox.use" },
      { label: "Webhooks", href: "/webhooks", icon: Webhook, perm: "integration.view" },
      { label: "AI Connector Gateway", href: "/ai-gateway", icon: BrainCircuit, perm: "integration.view" },
      { label: "Extension Hub", href: "/extensions", icon: Blocks, perm: "integration.view" },
    ],
  },
  {
    label: "Administration", items: [
      { label: "Users", href: "/admin/users", icon: UserCog, perm: "admin.users" },
      { label: "Roles & Permissions", href: "/admin/roles", icon: KeyRound, perm: "admin.users" },
      { label: "PMO Template Library", href: "/admin/templates", icon: LayoutTemplate, perm: "admin.templates" },
      { label: "Audit Trail", href: "/admin/audit", icon: ScrollText, perm: "admin.audit" },
      { label: "Configuration", href: "/admin/settings", icon: Settings, perm: "admin.config" },
    ],
  },
];

// Network icon not exported above — import here
import { Network } from "lucide-react";

function hasPerm(user: SessionUser | null, perm?: string): boolean {
  if (!perm) return true;
  if (!user) return false;
  if (user.isSuperAdmin || user.permissions.includes("*")) return true;
  return user.permissions.includes(perm);
}

export function canAccess(user: SessionUser | null, perm?: string): boolean {
  return hasPerm(user, perm);
}

/**
 * Role-aware home route. The Executive Control Tower (#/dashboard) requires the
 * "executive.view" permission — users without it (e.g. team members) are sent to
 * the first workspace they can actually use, so the main screen never shows a
 * raw "Permission denied" error.
 */
export function homeFor(user: SessionUser | null): string {
  if (hasPerm(user, "executive.view")) return "/dashboard";
  const HOME_CANDIDATES: { href: string; perm?: string }[] = [
    { href: "/inbox", perm: "inbox.use" },          // work inbox — natural home for delivery roles
    { href: "/projects", perm: "project.view" },    // project register / list
    { href: "/timesheets", perm: "timesheet.own" }, // own timesheets
    { href: "/resources", perm: "resource.view" },  // resource & capacity view
    { href: "/reports", perm: "reports.view" },     // report library (read-only roles)
  ];
  for (const c of HOME_CANDIDATES) if (hasPerm(user, c.perm)) return c.href;
  // Fall back to the first item in the main navigation this user may open.
  for (const group of NAV) {
    const item = group.items.find((i) => hasPerm(user, i.perm));
    if (item) return item.href;
  }
  // No navigation at all — dashboard renders a graceful restricted panel.
  return "/dashboard";
}

function NavLinks({ user, onNavigate }: { user: SessionUser | null; onNavigate?: () => void }) {
  const route = useRoute();
  const current = route.path;
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scroll-py-2">
      {NAV.map((group) => {
        const items = group.items.filter((i) => hasPerm(user, i.perm));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = current === item.href || current.startsWith(item.href + "/");
                const Icon = item.icon;
                // Plain anchor (NOT next/link): hash routes rely on the native hashchange
                // event. next/link intercepts clicks with history.pushState, which never
                // fires hashchange — leaving the view stuck on the previous page.
                return (
                  <a
                    key={item.href}
                    href={`#${item.href}`}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                      active ? "bg-blue-600/90 text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-slate-400")} />
                    <span className="truncate">{item.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/10 shrink-0">
      <div className="h-8 w-8 rounded-md bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center shadow-md">
        <TowerControl className="h-4.5 w-4.5 text-white" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[13px] font-bold tracking-wide text-white">PM CONTROL TOWER</p>
          <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">Plan · Execute · Govern · Deliver</p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, children, onLogout }: { user: SessionUser; children: React.ReactNode; onLogout: () => void }) {
  const route = useRoute();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{ projects: { id: string; code: string; name: string }[]; tasks: { id: string; code: string; name: string; projectName?: string }[] } | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [rtConnected, setRtConnected] = useState(socketState());

  // breadcrumbs from route
  const crumbs = useMemo(() => {
    const segs = route.segments;
    const out: string[] = ["Home"];
    if (segs[0] === "projects" && segs[1]) out.push("Projects", "Workspace");
    else if (segs[0]) out.push(segs[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    return out;
  }, [route.path]);

  useEffect(() => {
    return onRealtime(() => { /* heartbeat hook */ });
  }, []);

  useEffect(() => {
    const fn = (e: Event) => setRtConnected(Boolean((e as CustomEvent).detail));
    window.addEventListener("pmct:rt-state", fn);
    return () => window.removeEventListener("pmct:rt-state", fn);
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    let cancelled = false;
    const load = () => api.get<{ unread: number; items: unknown[] }>("/api/notifications?unread=1&take=1")
      .then((d) => { if (alive && !cancelled) setNotifCount(d.unread ?? 0); })
      .catch(() => undefined);
    const t = setTimeout(() => { if (!cancelled) { load(); cancelled = false; } }, 0);
    const iv = setInterval(load, 30000);
    const off = onRealtime(() => load());
    return () => { alive = false; cancelled = true; clearTimeout(t); clearInterval(iv); off(); };
  }, []);

  // command palette: global search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runSearch = async (q: string) => {
    if (!q || q.length < 2) { setSearchResults(null); return; }
    try {
      const d = await api.get<{ projects: { id: string; code: string; name: string }[]; tasks: { id: string; code: string; name: string; projectName?: string }[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      setSearchResults(d);
    } catch { setSearchResults(null); }
  };

  const quickActions: { label: string; href: string; icon: React.ComponentType<{ className?: string }>; run?: () => void }[] = [
    { label: "New Project", href: "#/projects?create=1", icon: FolderKanban },
    {
      label: "New Timesheet Entry", href: "#/timesheets?new=1", icon: Clock,
      // Already on Timesheets? Navigating to the same hash would be a silent no-op —
      // raise an event the view listens for instead (it opens an editable week).
      run: () => {
        if ((window.location.hash || "").startsWith("#/timesheets")) window.dispatchEvent(new CustomEvent("pmct:timesheet-new"));
        else window.location.assign("#/timesheets?new=1");
      },
    },
    { label: "Run Governance Evaluation", href: "#/governance", icon: Landmark },
    { label: "Leadership Control Tower", href: "#/reports/leadership", icon: Crown },
    { label: "Ask AI PM Assistant", href: "#/assistant", icon: Sparkles },
    { label: "Executive Control Tower", href: "#/dashboard", icon: Gauge },
  ];
  const runQuickAction = (a: (typeof quickActions)[number]) => {
    if (a.run) { a.run(); return; }
    window.location.assign(a.href);
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-[#0b1f3a]">
      <Brand />
      <NavLinks user={user} onNavigate={() => setMobileOpen(false)} />
      <div className="px-4 py-3 border-t border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500">One Platform · One Truth</span>
          <span className={cn("flex items-center gap-1 text-[9px] font-medium", rtConnected ? "text-emerald-400" : "text-slate-500")}>
            <Radio className={cn("h-2.5 w-2.5", rtConnected && "animate-pulse")} />
            {rtConnected ? "LIVE" : "OFF"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen flex overflow-hidden bg-slate-100">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-60 shrink-0">{sidebar}</aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden fixed top-3 left-3 z-40 bg-white/90">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4 lg:pl-6">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
              {crumbs.map((c, i) => (
                <span key={i} className={cn("capitalize", i === crumbs.length - 1 && "text-slate-700 font-medium")}>{c}</span>
              ))}
              {i0(crumbs)}
            </div>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-slate-500 border-slate-200 min-w-52 justify-start text-xs bg-slate-50"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
              Search everything
              <kbd className="ml-auto pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-white px-1 font-mono text-[9px] text-slate-400">⌘K</kbd>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 relative" aria-label="Quick create">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Quick create</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickActions.map((a) => (
                  <DropdownMenuItem key={a.label} onClick={() => runQuickAction(a)}>
                    <a.icon className="h-4 w-4 mr-2 text-slate-400" /> {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="icon" className="h-8 w-8 relative" aria-label="Notifications"
              onClick={() => { window.location.hash = "/notifications"; }}>
              <Bell className="h-4 w-4" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center px-0.5">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-white/60 focus:outline-none"
                  style={{ backgroundColor: user.avatarColor || "#1e3a5f" }}
                  aria-label="User menu"
                >
                  {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-slate-500 font-normal">{user.title || user.roles.join(", ")}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { window.location.hash = "/admin/audit"; }}>
                  <ScrollText className="h-4 w-4 mr-2 text-slate-400" /> My activity
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600 focus:text-red-700">
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 max-w-[1500px] mx-auto">{children}</div>
          </main>
        </div>
      </div>

      {/* Command palette */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search projects, tasks, and actions…" onValueChange={runSearch} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No results found.</CommandEmpty>
          {searchResults?.projects && searchResults.projects.length > 0 && (
            <CommandGroup heading="Projects">
              {searchResults.projects.map((p) => (
                <CommandItem key={p.id} value={`project-${p.code}`} onSelect={() => { setPaletteOpen(false); window.location.hash = `/projects/${p.id}`; }}>
                  <FolderKanban className="h-4 w-4 mr-2 text-slate-400" />
                  <span className="font-medium mr-2">{p.code}</span>
                  <span className="text-slate-500 truncate">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searchResults?.tasks && searchResults.tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {searchResults.tasks.map((t) => (
                <CommandItem key={t.id} value={`task-${t.code}`} onSelect={() => { setPaletteOpen(false); window.location.hash = `/tasks?focus=${t.id}`; }}>
                  <CalendarCheck2 className="h-4 w-4 mr-2 text-slate-400" />
                  <span className="font-medium mr-2">{t.code}</span>
                  <span className="text-slate-500 truncate">{t.name}{t.projectName ? ` — ${t.projectName}` : ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {quickActions.map((a) => (
              <CommandItem key={a.label} value={`action-${a.label}`} onSelect={() => { setPaletteOpen(false); runQuickAction(a); }}>
                <a.icon className="h-4 w-4 mr-2 text-slate-400" /> {a.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </TooltipProvider>
  );
}

// helper to render trailing separator (tiny, avoids map key warning)
function i0(crumbs: string[]) {
  return null;
}
