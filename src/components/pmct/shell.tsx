"use client";
// PM CONTROL TOWER — Application shell: sidebar navigation, topbar, command palette,
// global search, quick create, notification bell, realtime indicator, user menu.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { api, getToken, socketState, onRealtime, useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/pmct/avatar";
import { AvatarPickerDialog } from "@/components/pmct/avatar-picker";
import { BRAND_ASSETS } from "@/components/pmct/brand";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TASK_DASHBOARD_ROLES } from "@/lib/constants";
import {
  Gauge, FolderKanban, Clock, CalendarCheck2, Landmark, Crown, Sparkles, Bell,
  ScrollText, Settings, Search, Plus, Menu, Radio, LogOut, FileText, FileDown,
  Loader2, Presentation, FileSpreadsheet, Table2,
} from "lucide-react";
import { matchPptView, PPT_VIEWS } from "@/lib/pptx/registry";
import { ThemeSwitcher } from "@/components/pmct/theme-switcher";

export interface SessionUser {
  id: string; email: string; name: string; isSuperAdmin: boolean;
  roles: string[]; permissions: string[]; avatarColor: string; avatarUrl?: string | null; title: string | null;
}

import { NAV } from "@/components/pmct/nav-items";
import type { NavGroup } from "@/components/pmct/nav-items";
import { Image as ImageIcon } from "lucide-react";

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

/**
 * Role-based post-login landing: users holding the PMO Administrator or
 * Project Manager role are routed straight to the prioritized task dashboard
 * (#/priorities). Returns null for every other role — they keep the default
 * landing behaviour (homeFor / the Executive Control Tower).
 */
export function landingAfterLogin(user: SessionUser | null): string | null {
  if (!user) return null;
  const wanted = TASK_DASHBOARD_ROLES as readonly string[];
  return user.roles.some((r) => wanted.includes(r)) ? "/priorities" : null;
}

/**
 * Sidebar (top-level only): one button per navigation group — no accordions,
 * no dropdowns. The active group drives the sub-tab bar rendered at the top of
 * the main content area. In collapsed (icon-only) mode each button keeps an
 * sr-only label plus a native title tooltip so it stays discoverable.
 */
function NavGroups({
  user, collapsed, activeLabel, onSelect, hidden,
}: {
  user: SessionUser | null;
  collapsed: boolean;
  activeLabel: string;
  onSelect: (group: NavGroup) => void;
  /** Admin-hidden tab hrefs (display-only filter — routes stay reachable). */
  hidden: Set<string>;
}) {
  return (
    <nav aria-label="Main sections" className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scroll-py-2">
      {NAV.map((group) => {
        const items = group.items.filter((i) => hasPerm(user, i.perm) && !hidden.has(i.href));
        if (!items.length) return null;
        const active = group.label === activeLabel;
        const Icon = group.icon;
        return (
          <button
            key={group.label}
            type="button"
            onClick={() => onSelect(group)}
            aria-current={active ? "true" : undefined}
            title={collapsed ? group.label : undefined}
            style={{ "--ct-accent": group.accent } as React.CSSProperties}
            className={cn(
              "ct-nav-group group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-reduce:transition-none",
              collapsed && "justify-center px-0",
              active ? "ct-nav-active bg-blue-600/90 text-white shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full"
                style={{ backgroundColor: group.accent }}
              />
            )}
            <Icon className={cn("h-4 w-4 shrink-0 transition-colors motion-reduce:transition-none", active ? "text-white" : "text-slate-400 group-hover:text-slate-200")} />
            {!collapsed && <span className="truncate">{group.label}</span>}
            {collapsed && <span className="sr-only">{group.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Sub-tab bar: the active group's items, rendered at the top of the main view.
 * Plain anchors (NOT next/link) — hash routes rely on the native hashchange
 * event; next/link's history.pushState never fires it. Dark, high-contrast
 * surface (slate-950) with the group accent as the active-tab underline.
 */
function SubTabs({ user, group, hidden }: { user: SessionUser; group: NavGroup; hidden: Set<string> }) {
  const route = useRoute();
  const current = route.path;
  const items = group.items.filter((i) => hasPerm(user, i.perm) && !hidden.has(i.href));
  if (!items.length) return null;
  const activeIdx = items.findIndex((i) => current === i.href || current.startsWith(i.href + "/"));
  return (
    <div
      className="ct-subtabs shrink-0 bg-slate-950 border-b border-slate-700/70"
      style={{ "--ct-accent": group.accent } as React.CSSProperties}
    >
      <div className="flex items-center gap-1 overflow-x-auto px-3 md:px-5 h-11 scroll-py-1">
        <span
          aria-hidden="true"
          className="hidden sm:flex items-center gap-1.5 pr-3 mr-1 border-r border-slate-700 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 shrink-0"
        >
          <span aria-hidden="true" className="inline-flex" style={{ color: group.accent }}>
            <group.icon className="h-3.5 w-3.5" />
          </span>
          {group.label}
        </span>
        {items.map((item, idx) => {
          const active = idx === activeIdx;
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={`#${item.href}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-reduce:transition-none",
                active ? "text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-slate-500")} />
              {item.label}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 -bottom-0 h-0.5 rounded-full"
                  style={{ backgroundColor: group.accent }}
                />
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className={cn("flex h-[68px] shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "px-4")}>
      {!collapsed && (
        <>
          <img
            src="/ct-logo.png"
            alt=""
            aria-hidden="true"
            width={174}
            height={600}
            draggable={false}
            className="h-12 w-auto shrink-0 mr-2.5 select-none motion-reduce:pointer-events-none"
          />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">Control Tower</span>
        </>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors",
          "hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-reduce:transition-none",
          !collapsed && "ml-auto"
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </button>
    </div>
  );
}

export function AppShell({ user, children, onLogout }: { user: SessionUser; children: React.ReactNode; onLogout: () => void }) {
  const route = useRoute();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar collapse: icon-only rail vs. icons + labels. Persisted per user,
  // applied to the desktop rail only (the mobile sheet always shows labels).
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [selectedGroupLabel, setSelectedGroupLabel] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    projects: { id: string; code: string; name: string }[];
    tasks: { id: string; code: string; name: string; projectName?: string }[];
    custom?: { fieldKey: string; label: string; moduleKey: string; recordId: string; value: string }[];
  } | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [rtConnected, setRtConnected] = useState(socketState());
  const [allTabsBusy, setAllTabsBusy] = useState(false);
  const [pptBusy, setPptBusy] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Admin-configured tab visibility (Administration → Settings → Tab Visibility).
  // Display-only filter on the sidebar + sub-tab bar: hidden tabs keep their
  // routes, deep links, palette entries, exports and APIs — no linkage breaks.
  const navVis = useApi<{ hidden: string[] }>("/api/admin/nav-visibility");
  useRealtimeRefetch(navVis.refetch, ["admin:changed"]);
  const hiddenTabs = useMemo(() => new Set(navVis.data?.hidden ?? []), [navVis.data]);

  // Restore the persisted collapse preference after mount (client-only value).
  useEffect(() => {
    try {
      if (window.localStorage.getItem("pmct.nav.collapsed") === "1") setNavCollapsed(true);
    } catch { /* storage unavailable — stay expanded */ }
  }, []);

  const toggleNav = () => {
    setNavCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("pmct.nav.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  // Active group: the route's owning group wins (deep links keep working);
  // otherwise the group the user last picked in the sidebar.
  const routeGroup = useMemo(
    () => NAV.find((g) => g.items.some((i) => route.path === i.href || route.path.startsWith(i.href + "/"))),
    [route.path]
  );
  const accessibleGroups = useMemo(
    () => NAV.filter((g) => g.items.some((i) => hasPerm(user, i.perm) && !hiddenTabs.has(i.href))),
    [user, hiddenTabs]
  );
  const activeGroup =
    routeGroup ??
    accessibleGroups.find((g) => g.label === selectedGroupLabel) ??
    accessibleGroups[0] ??
    NAV[0];

  // Clicking a sidebar header selects its group and, when the current route
  // isn't already inside it, jumps to that group's first permitted item so the
  // sub-tabs and the content always agree.
  const selectGroup = (group: NavGroup) => {
    setSelectedGroupLabel(group.label);
    if (!routeGroup || routeGroup.label !== group.label) {
      const first = group.items.find((i) => hasPerm(user, i.perm));
      if (first) window.location.hash = `#${first.href}`;
    }
    setMobileOpen(false);
  };

  // Universal "Export PPT view": server-side engine renders the current module as a
  // presentation-native 16:9 deck — identical output from browser and desktop app.
  const downloadPpt = async () => {
    if (pptBusy) return;
    const hit = matchPptView(route.path);
    if (!hit || !PPT_VIEWS[hit.view.key]) {
      toast.error("PPT export isn't available for this view yet.");
      return;
    }
    let projectId: string | null = hit.projectIdFromRoute ?? null;
    if (!projectId && hit.view.projectScoped) {
      projectId = typeof window !== "undefined" ? localStorage.getItem("pmct.plan.project") : null;
    }
    if (hit.view.projectScoped && !projectId) {
      toast.error("Pick a project in the header first — this export is project-specific.");
      return;
    }
    setPptBusy(true);
    try {
      const token = getToken();
      const res = await fetch("/api/export/ppt", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ view: hit.view.key, projectId }),
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] ?? "pmct-export.pptx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(`PowerPoint exported — ${hit.view.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PPT export failed");
    } finally {
      setPptBusy(false);
    }
  };

  // All-tabs export: one report containing every permitted module, in PDF, Excel or CSV.
  const downloadAllTabs = async (format: "pdf" | "xlsx" | "csv") => {
    if (allTabsBusy) return;
    setAllTabsBusy(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/export/all-tabs?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] ?? `pmct-all-tabs.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(`All-tabs ${format === "xlsx" ? "Excel workbook" : format === "csv" ? "CSV" : "PDF report"} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "All-tabs export failed");
    } finally {
      setAllTabsBusy(false);
    }
  };

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
      const d = await api.get<{
        projects: { id: string; code: string; name: string }[];
        tasks: { id: string; code: string; name: string; projectName?: string }[];
        custom?: { fieldKey: string; label: string; moduleKey: string; recordId: string; value: string }[];
      }>(`/api/search?q=${encodeURIComponent(q)}`);
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

  const sidebar = (collapsed: boolean) => (
    <div className="ct-sidebar flex flex-col h-full bg-[#10243a]">
      <Brand collapsed={collapsed} onToggle={toggleNav} />
      <NavGroups
        user={user}
        collapsed={collapsed}
        activeLabel={activeGroup.label}
        onSelect={selectGroup}
        hidden={hiddenTabs}
      />
      <div className={cn("border-t border-white/10 shrink-0", collapsed ? "px-2 py-3 flex justify-center" : "px-4 py-3")}>
        {collapsed ? (
          <span
            title={rtConnected ? "Live updates connected" : "Live updates disconnected"}
            className={cn("flex items-center gap-1 text-[9px] font-medium", rtConnected ? "text-emerald-400" : "text-slate-500")}
          >
            <Radio className={cn("h-2.5 w-2.5", rtConnected && "animate-pulse")} />
            <span className="sr-only">{rtConnected ? "LIVE" : "OFF"}</span>
          </span>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500">One Platform · One Truth</span>
            <span className={cn("flex items-center gap-1 text-[9px] font-medium", rtConnected ? "text-emerald-400" : "text-slate-500")}>
              <Radio className={cn("h-2.5 w-2.5", rtConnected && "animate-pulse")} />
              {rtConnected ? "LIVE" : "OFF"}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="ct-app h-screen flex overflow-hidden bg-[#f5f8fa]">
        {/* Desktop sidebar — width transitions on collapse (motion-reduced honored via CSS) */}
        <aside
          className={cn(
            "hidden lg:flex lg:flex-col shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
            navCollapsed ? "lg:w-16" : "lg:w-60"
          )}
        >
          {sidebar(navCollapsed)}
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden fixed top-3 left-3 z-40 bg-white/90">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebar(false)}
          </SheetContent>
        </Sheet>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="ct-topbar relative h-16 shrink-0 bg-white border-b border-slate-200 flex items-center gap-3 px-4 lg:pl-5">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
              {crumbs.map((c, i) => (
                <span key={i} className={cn("capitalize", i === crumbs.length - 1 && "text-slate-700 font-medium")}>{c}</span>
              ))}
              {i0(crumbs)}
            </div>
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
            <div className="min-w-0 flex-1" />
            {/* Centered enterprise co-brand lockup; hidden on narrow screens to protect control space. */}
            <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 items-center gap-3 min-[1100px]:flex" role="img" aria-label="Optinus Solutions and Czarnikow">
              <img src={BRAND_ASSETS.optinusLightSurface} alt="" className="h-auto w-[118px] object-contain xl:w-[132px]" />
              <span aria-hidden="true" className="h-7 w-px bg-[#e5a148]" />
              <span className="flex items-center gap-2">
                <img src={BRAND_ASSETS.czarnikow} alt="" className="h-6 w-6 rounded-[3px] object-contain" />
                <span className="whitespace-nowrap font-serif text-[11px] font-bold tracking-[0.13em] text-[#193653] xl:text-xs">CZARNIKOW</span>
              </span>
            </div>
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
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Download all tabs (PDF, Excel or CSV)"
                  title="Download all tabs as one report — PDF, Excel or CSV"
                >
                  {allTabsBusy ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <FileDown className="h-4 w-4 text-slate-500" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs">Download all tabs</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={allTabsBusy} onClick={() => downloadAllTabs("pdf")}>
                  <FileText className="h-4 w-4 mr-2 text-red-500" /> PDF report (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem disabled={allTabsBusy} onClick={() => downloadAllTabs("xlsx")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Excel workbook (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem disabled={allTabsBusy} onClick={() => downloadAllTabs("csv")}>
                  <Table2 className="h-4 w-4 mr-2 text-slate-500" /> CSV file (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Export current view as PowerPoint"
              title="Export this view as PowerPoint (16:9)"
              disabled={pptBusy}
              onClick={downloadPpt}
            >
              {pptBusy ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <Presentation className="h-4 w-4 text-slate-500" />}
            </Button>
            <ThemeSwitcher />
            {(["admin.config", "admin.users", "admin.templates", "admin.audit"] as const).some((permission) => hasPerm(user, permission)) && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:border-sky-300 hover:text-[#087faf] sm:px-3"
                aria-label="Open Settings"
                onClick={() => { window.location.hash = "/admin/settings"; }}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="User menu"
                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Avatar
                    name={user.name}
                    color={user.avatarColor}
                    url={user.avatarUrl}
                    size="h-8 w-8 text-xs"
                    className="shadow-sm ring-2 ring-white/60"
                    title={user.name}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-slate-500 font-normal">{user.title || user.roles.join(", ")}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAvatarOpen(true)}>
                  <ImageIcon className="h-4 w-4 mr-2 text-slate-400" /> Change avatar
                </DropdownMenuItem>
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

          {/* Sub-tabs: the active sidebar group's items at the top of the main view */}
          <SubTabs key={activeGroup.label} user={user} group={activeGroup} hidden={hiddenTabs} />

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
          {searchResults?.custom && searchResults.custom.length > 0 && (
            <CommandGroup heading="Custom fields">
              {searchResults.custom.map((c, i) => (
                <CommandItem
                  key={`${c.moduleKey}-${c.recordId}-${c.fieldKey}-${i}`}
                  value={`custom-${c.label}-${c.value}`}
                  onSelect={() => { setPaletteOpen(false); window.location.hash = moduleRoute(c.moduleKey, c.recordId); }}
                >
                  <Sparkles className="h-4 w-4 mr-2 text-slate-400" />
                  <span className="font-medium mr-2">{c.label}</span>
                  <span className="text-slate-500 truncate">{c.value}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400 shrink-0">
                    {c.moduleKey.replace(/_/g, " ")}
                  </span>
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

      <AvatarPickerDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        current={user.avatarUrl}
      />
    </TooltipProvider>
  );
}

// helper to render trailing separator (tiny, avoids map key warning)
function i0(crumbs: string[]) {
  return null;
}

// Field Dictionary module key → hash route (command palette navigation targets).
function moduleRoute(moduleKey: string, recordId: string): string {
  const routes: Record<string, string> = {
    portfolio: "/portfolios",
    program: "/programs",
    project: `/projects/${recordId}`,
    requirement: "/requirements",
    wbs_node: "/wbs",
    task: `/tasks?focus=${recordId}`,
    milestone: "/milestones",
    baseline: "/baselines",
    resource: "/resources",
    timesheet: "/timesheets",
    timesheet_entry: "/timesheets",
    budget_line: "/financials",
    evm_period: "/evm",
    health_snapshot: "/health",
    risk: "/raid",
    issue: "/raid",
    assumption: "/raid",
    change_request: "/changes",
    stage_gate: "/gates",
    governance_rule: "/governance",
    governance_alert: "/governance",
    user: "/admin/users",
    audit_trail: "/admin/audit",
  };
  return routes[moduleKey] ?? "/dashboard";
}
