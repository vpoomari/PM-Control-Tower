// Generates minimal placeholder views for every registry route (replaced by feature batches).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";

const VIEWS: [string, string, string][] = [
  ["portfolio/portfolios", "Portfolios", "portfolio.view"],
  ["portfolio/programs", "Programs", "program.view"],
  ["portfolio/projects", "Projects", "project.view"],
  ["project/ProjectWorkspace", "Project Workspace", "project.view"],
  ["plan/register", "Project Register", "project.view"],
  ["plan/requirements", "Requirements", "project.view"],
  ["plan/wbs", "WBS", "project.view"],
  ["plan/tasks", "Tasks", "project.view"],
  ["plan/schedule", "Schedule", "project.view"],
  ["plan/milestones", "Milestones", "project.view"],
  ["plan/baselines", "Baselines", "project.view"],
  ["execute/resources", "Resources", "resource.view"],
  ["execute/timesheets", "Timesheets", "timesheet.own"],
  ["execute/inbox", "Work Inbox", "inbox.use"],
  ["execute/planner", "Focus Planner", "inbox.use"],
  ["control/financials", "Financials", "financial.view"],
  ["control/evm", "EVM", "evm.view"],
  ["control/health", "Health", "evm.view"],
  ["control/raid", "RAID", "project.view"],
  ["control/changes", "Change Control", "project.view"],
  ["control/gates", "Stage Gates", "project.view"],
  ["control/governance", "Governance", "project.view"],
  ["intelligence/reports", "Reports", "reports.view"],
  ["intelligence/analytics", "Analytics", "reports.view"],
  ["intelligence/assistant", "AI PM Assistant", "ai.use"],
  ["connect/integrations", "Integration Hub", "integration.view"],
  ["connect/automations", "Control Automations", "integration.view"],
  ["connect/notifications", "Notifications", "inbox.use"],
  ["connect/webhooks", "Webhooks", "integration.view"],
  ["connect/ai-gateway", "AI Connector Gateway", "integration.view"],
  ["connect/extensions", "Extension Hub", "integration.view"],
  ["admin/users", "Users", "admin.users"],
  ["admin/roles", "Roles & Permissions", "admin.users"],
  ["admin/templates", "PMO Template Library", "admin.templates"],
  ["admin/audit", "Audit Trail", "admin.audit"],
  ["admin/settings", "Configuration", "admin.config"],
];

const base = "/home/z/my-project/src/views";
let made = 0;
for (const [path, title] of VIEWS) {
  const file = `${base}/${path}.tsx`;
  if (existsSync(file)) continue;
  const dir = file.substring(0, file.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  const content = `"use client";
// PM CONTROL TOWER — ${title} (placeholder — replaced by feature batch)

import { PageHeader, EmptyState } from "@/components/pmct/kit";

export default function ${title.replace(/[^A-Za-z]/g, "")}View() {
  return (
    <div>
      <PageHeader title="${title}" />
      <EmptyState title="Module coming online" description="This workspace is being activated." />
    </div>
  );
}
`;
  writeFileSync(file, content);
  made++;
}
console.log(`created ${made} placeholder views`);
