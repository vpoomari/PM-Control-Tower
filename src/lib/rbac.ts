// PM CONTROL TOWER — Role-Based Access Control
// Permission matrix + role templates. Roles and permissions are provisioned to DB at seed time;
// runtime checks use the session's resolved permission set.

export const PERMISSION_CATALOG: { code: string; category: string; description: string }[] = [
  // Executive & reporting
  { code: "executive.view", category: "EXECUTIVE", description: "View executive control tower and roll-ups" },
  { code: "reports.view", category: "EXECUTIVE", description: "View reports and analytics" },
  // Portfolio / program / project
  { code: "portfolio.view", category: "PORTFOLIO", description: "View portfolios" },
  { code: "portfolio.manage", category: "PORTFOLIO", description: "Create and manage portfolios" },
  { code: "program.view", category: "PORTFOLIO", description: "View programs" },
  { code: "program.manage", category: "PORTFOLIO", description: "Create and manage programs" },
  { code: "project.view", category: "PROJECT", description: "View projects" },
  { code: "project.manage", category: "PROJECT", description: "Create and manage projects" },
  // Planning
  { code: "wbs.manage", category: "PLAN", description: "Manage WBS, tasks, schedule, baselines" },
  { code: "schedule.manage", category: "PLAN", description: "Manage schedule and dependencies" },
  { code: "baseline.manage", category: "PLAN", description: "Create and activate baselines" },
  // Execution
  { code: "resource.view", category: "EXECUTE", description: "View resources and capacity" },
  { code: "resource.manage", category: "EXECUTE", description: "Manage resource register and assignments" },
  { code: "timesheet.own", category: "EXECUTE", description: "Submit own timesheets" },
  { code: "timesheet.approve", category: "EXECUTE", description: "Approve/reject team timesheets" },
  { code: "inbox.use", category: "EXECUTE", description: "Use work inbox and focus planner" },
  // Control
  { code: "financial.view", category: "CONTROL", description: "View financials, budget, forecast" },
  { code: "financial.manage", category: "CONTROL", description: "Manage budget lines and forecasts" },
  { code: "evm.view", category: "CONTROL", description: "View EVM metrics" },
  { code: "evm.manage", category: "CONTROL", description: "Create EVM snapshots" },
  { code: "raid.manage", category: "CONTROL", description: "Manage risks, issues, assumptions" },
  { code: "change.manage", category: "CONTROL", description: "Manage change requests" },
  { code: "gate.decide", category: "CONTROL", description: "Decide stage gates" },
  { code: "governance.manage", category: "CONTROL", description: "Manage governance rules and alerts" },
  { code: "integrity.view", category: "CONTROL", description: "View data freshness, simulations, calibration and evidence" },
  { code: "integrity.manage", category: "CONTROL", description: "Run simulations, export evidence bundles, tune freshness cadences" },
  { code: "scenario.manage", category: "CONTROL", description: "Create, simulate and merge scenario sandboxes" },
  { code: "benefits.manage", category: "CONTROL", description: "Manage benefits realization profiles and reviews" },
  // Connect
  { code: "integration.view", category: "CONNECT", description: "View integration hub" },
  { code: "integration.manage", category: "CONNECT", description: "Configure integrations and webhooks" },
  { code: "automation.manage", category: "CONNECT", description: "Manage control automations" },
  { code: "ai.use", category: "CONNECT", description: "Use AI PM Assistant" },
  // Administration
  { code: "admin.users", category: "ADMIN", description: "Manage users and roles" },
  { code: "admin.templates", category: "ADMIN", description: "Manage PMO template library" },
  { code: "admin.audit", category: "ADMIN", description: "View audit trail" },
  { code: "admin.config", category: "ADMIN", description: "System configuration" },
];

export const ROLE_TEMPLATES: { code: string; name: string; level: number; description: string; permissions: string[] }[] = [
  { code: "EXECUTIVE", name: "Executive", level: 100, description: "Portfolio oversight, executive dashboards, governance decisions", permissions: ["executive.view", "reports.view", "portfolio.view", "program.view", "project.view", "financial.view", "evm.view", "resource.view", "gate.decide", "ai.use", "inbox.use", "integrity.view"] },
  { code: "PMO_ADMIN", name: "PMO Administrator", level: 90, description: "Full PMO administration", permissions: ["*"] },
  { code: "PORTFOLIO_MANAGER", name: "Portfolio Manager", level: 80, description: "Portfolio and investment management", permissions: ["executive.view", "reports.view", "portfolio.view", "portfolio.manage", "program.view", "program.manage", "project.view", "project.manage", "financial.view", "evm.view", "resource.view", "governance.manage", "ai.use", "inbox.use", "integrity.view", "scenario.manage", "benefits.manage"] },
  { code: "PROGRAM_MANAGER", name: "Program Manager", level: 70, description: "Program delivery management", permissions: ["executive.view", "reports.view", "portfolio.view", "program.view", "project.view", "project.manage", "wbs.manage", "schedule.manage", "baseline.manage", "resource.view", "resource.manage", "financial.view", "financial.manage", "evm.view", "raid.manage", "change.manage", "ai.use", "inbox.use", "timesheet.approve", "integrity.view", "integrity.manage", "scenario.manage", "benefits.manage"] },
  { code: "PROJECT_MANAGER", name: "Project Manager", level: 60, description: "End-to-end project delivery", permissions: ["executive.view", "reports.view", "portfolio.view", "program.view", "project.view", "project.manage", "wbs.manage", "schedule.manage", "baseline.manage", "resource.view", "resource.manage", "financial.view", "financial.manage", "evm.view", "evm.manage", "raid.manage", "change.manage", "automation.manage", "ai.use", "inbox.use", "timesheet.approve", "timesheet.own", "integrity.view", "integrity.manage", "benefits.manage"] },
  { code: "FINANCE", name: "Finance Controller", level: 60, description: "Budget, cost and forecast control", permissions: ["executive.view", "reports.view", "portfolio.view", "program.view", "project.view", "financial.view", "financial.manage", "evm.view", "inbox.use"] },
  { code: "TEAM_MEMBER", name: "Team Member", level: 20, description: "Task execution and timesheets", permissions: ["project.view", "resource.view", "timesheet.own", "inbox.use"] },
  { code: "AUDITOR", name: "Auditor", level: 50, description: "Read-only audit and compliance access", permissions: ["executive.view", "reports.view", "portfolio.view", "program.view", "project.view", "financial.view", "evm.view", "admin.audit", "integration.view"] },
];

export function hasPermission(session: { permissions: string[]; isSuperAdmin: boolean } | null, code: string): boolean {
  if (!session) return false;
  if (session.isSuperAdmin) return true;
  return session.permissions.includes("*") || session.permissions.includes(code);
}
