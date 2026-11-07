// PM CONTROL TOWER — Application navigation definition (single source of truth).
// The app shell (sidebar + sub-tab bar) and the admin "Tab Visibility" settings
// screen both read this list, so they can never drift apart. Plain data — safe
// to import from API routes too (no "use client": the icons are only rendered
// by client components; the route only reads labels/hrefs).
//
// Hiding a tab (Admin Settings → Tab Visibility) ONLY removes it from the
// sidebar display. Routes, deep links, the command palette, exports, search
// and every API keep working — no linkage is ever broken.

import type { ComponentType } from "react";
import {
  Gauge, ClipboardList, ListTree, Network, CalendarCheck2, Zap, GanttChartSquare,
  Milestone, Layers3, FlaskConical, Layers, GitBranch, FolderKanban, Columns3,
  Users, Clock, Inbox, CalendarRange, Wallet, Briefcase, HardHat, TrendingUp,
  HeartPulse, ShieldAlert, ArrowLeftRight, ScanSearch, Landmark, ShieldCheck,
  Server, Target, BookOpen, Megaphone, FileText, MessagesSquare, FileCheck2,
  BarChart3, Crown, PieChart, LineChart, Sparkles, Wand2, Plug, Workflow, Bell,
  Webhook, BrainCircuit, Blocks, ArrowDownUp, FileUp, FileDown, Radar,
  CalendarClock, Bot,
} from "lucide-react";

export interface NavItem { label: string; href: string; icon: ComponentType<{ className?: string }>; perm?: string }
export interface NavGroup { label: string; accent: string; icon: ComponentType<{ className?: string }>; items: NavItem[] }

// Brand-palette accent per nav group — surfaces as colorful gradient-tinted
// icons in the Control Tower 3D theme (harmless custom property in Classic).
export const NAV: NavGroup[] = [
  { label: "Executive", accent: "#00D9FF", icon: Gauge, items: [{ label: "Executive Control Tower", href: "/dashboard", icon: Gauge, perm: "executive.view" }] },
  {
    label: "Plan", accent: "#843BFF", icon: ClipboardList, items: [
      { label: "Project Register", href: "/register", icon: ClipboardList, perm: "project.view" },
      { label: "Requirements", href: "/requirements", icon: ListTree, perm: "project.view" },
      { label: "WBS", href: "/wbs", icon: Network, perm: "project.view" },
      { label: "Tasks", href: "/tasks", icon: CalendarCheck2, perm: "project.view" },
      { label: "Agile Delivery", href: "/agile", icon: Zap, perm: "project.view" },
      { label: "Schedule", href: "/schedule", icon: GanttChartSquare, perm: "project.view" },
      { label: "Milestones", href: "/milestones", icon: Milestone, perm: "project.view" },
      { label: "Baselines", href: "/baselines", icon: Layers3, perm: "project.view" },
      { label: "Planning Lab", href: "/tools", icon: FlaskConical, perm: "project.view" },
    ],
  },
  {
    label: "Portfolio", accent: "#2864FF", icon: Layers, items: [
      { label: "Portfolios", href: "/portfolios", icon: Layers, perm: "portfolio.view" },
      { label: "Programs", href: "/programs", icon: GitBranch, perm: "program.view" },
      { label: "Projects", href: "/projects", icon: FolderKanban, perm: "project.view" },
    ],
  },
  {
    label: "Execute", accent: "#F52AA8", icon: Columns3, items: [
      { label: "Priority Dashboard", href: "/priorities", icon: CalendarClock, perm: "project.view" },
      { label: "Boards", href: "/boards", icon: Columns3, perm: "project.view" },
      { label: "Resources", href: "/resources", icon: Users, perm: "resource.view" },
      { label: "Timesheets", href: "/timesheets", icon: Clock, perm: "timesheet.own" },
      { label: "Work Inbox", href: "/inbox", icon: Inbox, perm: "inbox.use" },
      { label: "Focus Planner", href: "/planner", icon: CalendarRange, perm: "inbox.use" },
    ],
  },
  {
    label: "Control", accent: "#FF8A24", icon: ShieldAlert, items: [
      { label: "Financials", href: "/financials", icon: Wallet, perm: "financial.view" },
      { label: "Clients & Billing", href: "/clients", icon: Briefcase, perm: "financial.view" },
      { label: "Field Operations", href: "/field", icon: HardHat, perm: "project.view" },
      { label: "Investment & Business Case", href: "/investment", icon: TrendingUp, perm: "financial.view" },
      { label: "EVM", href: "/evm", icon: TrendingUp, perm: "evm.view" },
      { label: "Health", href: "/health", icon: HeartPulse, perm: "evm.view" },
      { label: "RAID", href: "/raid", icon: ShieldAlert, perm: "project.view" },
      { label: "Change Control", href: "/changes", icon: ArrowLeftRight, perm: "project.view" },
      { label: "Stage Gates", href: "/gates", icon: ScanSearch, perm: "project.view" },
      { label: "Governance", href: "/governance", icon: Landmark, perm: "project.view" },
      { label: "Data Integrity", href: "/integrity", icon: ShieldCheck, perm: "integrity.view" },
      { label: "CTO Tower", href: "/technology", icon: Server, perm: "integration.view" },
      { label: "Prioritization", href: "/prioritization", icon: Target, perm: "portfolio.view" },
    ],
  },
  {
    label: "Strategy & Knowledge", accent: "#29E68C", icon: BookOpen, items: [
      { label: "Feedback & Roadmap", href: "/feedback", icon: Megaphone, perm: "inbox.use" },
      { label: "Docs & Knowledge", href: "/docs", icon: FileText, perm: "docs.use" },
      { label: "Message Boards", href: "/boards-hub", icon: MessagesSquare, perm: "boards.use" },
      { label: "Proofing & Approvals", href: "/proofing", icon: FileCheck2, perm: "project.view" },
    ],
  },
  {
    label: "Intelligence", accent: "#FFD43B", icon: BarChart3, items: [
      { label: "Leadership Control Tower", href: "/reports/leadership", icon: Crown, perm: "reports.view" },
      { label: "Reports", href: "/reports", icon: BarChart3, perm: "reports.view" },
      { label: "Reporting Center", href: "/reporting", icon: BookOpen, perm: "reports.view" },
      { label: "Analytics", href: "/analytics", icon: LineChart, perm: "reports.view" },
      { label: "PMO Analytics", href: "/insights", icon: PieChart, perm: "reports.view" },
      { label: "AI PM Assistant", href: "/assistant", icon: Sparkles, perm: "ai.use" },
      { label: "AI Feature Studio", href: "/ai-features", icon: Wand2, perm: "ai.use" },
    ],
  },
  {
    label: "AI", accent: "#A855F7", icon: Sparkles, items: [
      { label: "AI Hub", href: "/ai", icon: Bot, perm: "ai.use" },
    ],
  },
  {
    label: "Connect", accent: "#00D9FF", icon: Plug, items: [
      { label: "Integration Hub", href: "/integrations", icon: Plug, perm: "integration.view" },
      { label: "TowerIntegration Hub", href: "/hub", icon: Radar, perm: "integration.view" },
      { label: "Control Automations", href: "/automations", icon: Workflow, perm: "integration.view" },
      { label: "Notifications", href: "/notifications", icon: Bell, perm: "inbox.use" },
      { label: "Webhooks", href: "/webhooks", icon: Webhook, perm: "integration.view" },
      { label: "AI Connector Gateway", href: "/ai-gateway", icon: BrainCircuit, perm: "integration.view" },
      { label: "Extension Hub", href: "/extensions", icon: Blocks, perm: "integration.view" },
    ],
  },
  {
    label: "Data Importing and Exporting", accent: "#2DD4BF", icon: ArrowDownUp, items: [
      { label: "Import CSV", href: "/data/import", icon: FileUp, perm: "project.view" },
      { label: "Export Center", href: "/data/export", icon: FileDown, perm: "project.view" },
    ],
  },
];

/** Every tab, flattened with its group label — powers the Tab Visibility screen. */
export const NAV_FLAT: { group: string; item: NavItem }[] =
  NAV.flatMap((g) => g.items.map((item) => ({ group: g.label, item })));

/** Valid tab hrefs — used by the API to reject unknown entries. */
export const NAV_HREFS: string[] = NAV_FLAT.map(({ item }) => item.href);
