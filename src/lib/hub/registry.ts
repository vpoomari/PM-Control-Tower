// PM CONTROL TOWER — TowerIntegration Hub: tool registry (pure data, DB-free).
// 55 external PM / BI / ERP systems across 6 routing categories. Every tool
// routes into a category queue and speaks through a vendor-shape Facade; the
// registry is the single source of truth the Hub API, UI and tests all read.

export type HubCategory =
  | "AGILE_DEVSECOPS"
  | "WORK_OS_PORTFOLIO"
  | "BI_ANALYTICS"
  | "COLLAB_KNOWLEDGE"
  | "TIME_FINANCE_RESOURCE"
  | "DATA_SPREADSHEET_SPECIALIZED";

/** Vendor-shape facades: raw payloads are ONLY parsed behind one of these. */
export type FacadeKind = "jira" | "msGraph" | "powerBi" | "zoho" | "slack" | "csv" | "generic";

export type HubAuthMode = "OAUTH2" | "JWT" | "MTLS" | "HMAC" | "API_KEY" | "BASIC";

export type HubIngressMode = "WEBHOOK" | "POLL" | "BI_REFRESH" | "CSV_UPLOAD";

export interface HubQueue {
  id: string;
  category: HubCategory;
  label: string;
  description: string;
}

export const HUB_QUEUES: HubQueue[] = [
  { id: "queue.agile_devsecops", category: "AGILE_DEVSECOPS", label: "Agile & DevSecOps", description: "Epics, sprints, story points, commit linkages" },
  { id: "queue.work_os_portfolio", category: "WORK_OS_PORTFOLIO", label: "Enterprise Work OS, Portfolio & Planning", description: "Dependencies, portfolios, resource capacity, Gantt, EVM" },
  { id: "queue.bi_analytics", category: "BI_ANALYTICS", label: "Business Intelligence & Analytics", description: "Dashboard metrics, data models, realtime analytics" },
  { id: "queue.collab_knowledge", category: "COLLAB_KNOWLEDGE", label: "Collaboration & Knowledge Management", description: "Document repos, unstructured lists, status updates, decisions" },
  { id: "queue.time_finance_resource", category: "TIME_FINANCE_RESOURCE", label: "Time, Finance & Resource Management", description: "Billable hours, capacity plans, budget burn rates" },
  { id: "queue.data_spreadsheet_specialized", category: "DATA_SPREADSHEET_SPECIALIZED", label: "Data, Spreadsheets & Specialized", description: "Tabular project data, CSV imports, domain metadata → UWM extension fields" },
];

export const HUB_CATEGORIES: HubCategory[] = HUB_QUEUES.map((q) => q.category);

export function queueForCategory(category: HubCategory): string {
  const q = HUB_QUEUES.find((x) => x.category === category);
  if (!q) throw new Error("No queue for category " + category); // exhaustive below
  return q.id;
}

export interface HubTool {
  id: string;
  name: string;
  vendor: string;
  category: HubCategory;
  facade: FacadeKind;
  /** Auth mechanisms this tool's connection may use — first is the recommended one. */
  auth: HubAuthMode[];
  /** How data normally arrives. */
  ingress: HubIngressMode[];
  /** Listed explicitly in the Hub routing directive (31 tools). */
  namedInDirective: boolean;
  /** Existing PMCT Integration name when one is already seeded (nothing de-linked). */
  linkedIntegration?: string;
  /** Default poll cadence for POLL mode, minutes (0 = webhook/BI push only). */
  pollMinutes: number;
  hint: string;
}

// Per-tool status overrides fed into UWM normalization (vendor vocabulary
// that the global synonym table should not have to guess about).
export const HUB_STATUS_OVERRIDES: Record<string, Record<string, string>> = {
  servicenow: { "1": "TO_DO", "2": "IN_PROGRESS", "3": "BLOCKED", "6": "COMPLETED", "7": "COMPLETED", "8": "CANCELLED" },
  jira: { "awaiting client": "BLOCKED", "in qa": "IN_PROGRESS", "blocked by dependency": "BLOCKED", "ready for uat": "IN_PROGRESS" },
  trello: { lists: "TO_DO", doing: "IN_PROGRESS", qa: "IN_PROGRESS", done: "COMPLETED", archived: "CANCELLED" },
  basecamp: { stalled: "BLOCKED", "on the bench": "TO_DO" },
  procore: { "closeout": "COMPLETED", "punch list": "IN_PROGRESS", "ready to close": "IN_PROGRESS" },
  filestage: { "changes requested": "BLOCKED", "awaiting approval": "BLOCKED" },
};

const t = (
  id: string, name: string, vendor: string, category: HubCategory,
  facade: FacadeKind, auth: HubAuthMode[], ingress: HubIngressMode[],
  namedInDirective: boolean, hint: string,
  extra: Partial<Pick<HubTool, "linkedIntegration" | "pollMinutes">> = {},
): HubTool => ({ id, name, vendor, category, facade, auth, ingress, namedInDirective, hint, pollMinutes: 0, ...extra });

export const HUB_TOOLS: HubTool[] = [
  // ---- Agile & DevSecOps (10) ----
  t("jira", "Jira", "Atlassian", "AGILE_DEVSECOPS", "jira", ["OAUTH2", "BASIC", "HMAC"], ["WEBHOOK", "POLL"], true,
    "Epics, sprints, story points and issue transitions via Jira REST v3.", { linkedIntegration: "Jira Software", pollMinutes: 15 }),
  t("assembla", "Assembla", "Assembla/Swarm", "AGILE_DEVSECOPS", "generic", ["API_KEY", "HMAC"], ["WEBHOOK", "POLL"], true,
    "Milestones, tickets and story streams from the Assembla REST API.", { pollMinutes: 30 }),
  t("versionone", "VersionOne", "Digital.ai (VersionOne)", "AGILE_DEVSECOPS", "generic", ["OAUTH2", "API_KEY"], ["POLL"], true,
    "Portfolio epics, iterations and teams from the VersionOne API.", { pollMinutes: 30 }),
  t("azure-devops", "Azure DevOps", "Microsoft", "AGILE_DEVSECOPS", "msGraph", ["BASIC", "OAUTH2"], ["WEBHOOK", "POLL"], false,
    "Work items, boards and PR linkages via the Azure DevOps REST API.", { linkedIntegration: "Azure DevOps", pollMinutes: 15 }),
  t("github", "GitHub", "GitHub", "AGILE_DEVSECOPS", "generic", ["HMAC", "OAUTH2"], ["WEBHOOK", "POLL"], false,
    "Issues, projects and commit linkages via GitHub webhooks.", { pollMinutes: 30 }),
  t("gitlab", "GitLab", "GitLab", "AGILE_DEVSECOPS", "generic", ["HMAC", "API_KEY"], ["WEBHOOK", "POLL"], false,
    "Issues, epics and merge-request linkages via GitLab webhooks.", { pollMinutes: 30 }),
  t("bitbucket", "Bitbucket", "Atlassian", "AGILE_DEVSECOPS", "jira", ["OAUTH2", "HMAC"], ["WEBHOOK", "POLL"], false,
    "Issues and pipelines via Bitbucket Cloud webhooks.", { pollMinutes: 30 }),
  t("rally", "Rally", "Broadcom (Rally)", "AGILE_DEVSECOPS", "generic", ["API_KEY"], ["POLL"], false,
    "User stories, tasks and iterations from the Rally WSAPI.", { pollMinutes: 60 }),
  t("linear", "Linear", "Linear", "AGILE_DEVSECOPS", "generic", ["API_KEY", "OAUTH2"], ["WEBHOOK", "POLL"], false,
    "Issues, cycles and projects via the Linear GraphQL API.", { pollMinutes: 30 }),
  t("shortcut", "Shortcut", "Shortcut (Clubhouse)", "AGILE_DEVSECOPS", "generic", ["OAUTH2"], ["WEBHOOK", "POLL"], false,
    "Stories, epics and iterations via the Shortcut API.", { pollMinutes: 30 }),

  // ---- Enterprise Work OS, Portfolio & Planning (12) ----
  t("broadcom-clarity", "Broadcom Clarity", "Broadcom", "WORK_OS_PORTFOLIO", "generic", ["OAUTH2", "API_KEY"], ["POLL"], true,
    "Enterprise portfolios, investments and Clarity Gantt schedules.", { pollMinutes: 60 }),
  t("asana", "Asana", "Asana", "WORK_OS_PORTFOLIO", "generic", ["OAUTH2"], ["WEBHOOK", "POLL"], true,
    "Portfolios, projects, tasks and cross-functional dependencies.", { pollMinutes: 15 }),
  t("monday", "monday.com", "monday.com", "WORK_OS_PORTFOLIO", "generic", ["API_KEY", "HMAC"], ["WEBHOOK", "POLL"], true,
    "Boards, items and status columns via monday.com webhooks.", { pollMinutes: 15 }),
  t("smartsheet", "Smartsheet", "Smartsheet", "WORK_OS_PORTFOLIO", "generic", ["OAUTH2", "API_KEY"], ["WEBHOOK", "POLL"], true,
    "Sheets, rows and Gantt dependencies via the Smartsheet API.", { pollMinutes: 30 }),
  t("clickup", "ClickUp", "ClickUp", "WORK_OS_PORTFOLIO", "generic", ["OAUTH2", "API_KEY"], ["WEBHOOK", "POLL"], true,
    "Spaces, lists, tasks and dependencies via ClickUp webhooks.", { pollMinutes: 15 }),
  t("zoho-projects", "Zoho Projects", "Zoho", "WORK_OS_PORTFOLIO", "zoho", ["OAUTH2", "API_KEY"], ["WEBHOOK", "POLL"], true,
    "Projects, tasks, Gantt and milestones via the Zoho Projects API.", { pollMinutes: 30 }),
  t("wrike", "Wrike", "Wrike", "WORK_OS_PORTFOLIO", "generic", ["OAUTH2", "API_KEY"], ["WEBHOOK", "POLL"], true,
    "Spaces, folders, tasks and Wrike dependency graphs.", { pollMinutes: 30 }),
  t("workfront", "Adobe Workfront", "Adobe", "WORK_OS_PORTFOLIO", "generic", ["OAUTH2", "API_KEY"], ["POLL"], true,
    "Enterprise portfolios, programs and resource capacity from Workfront.", { pollMinutes: 60 }),
  t("liquidplanner", "LiquidPlanner", "LiquidPlanner", "WORK_OS_PORTFOLIO", "generic", ["API_KEY"], ["POLL"], true,
    "Project schedules with LiquidPlanner estimate ranges and par levels.", { pollMinutes: 60 }),
  t("microsoft-project", "Microsoft Project", "Microsoft", "WORK_OS_PORTFOLIO", "msGraph", ["OAUTH2"], ["POLL"], false,
    "Project for the web schedules and task dependencies via Microsoft Graph.", { pollMinutes: 60 }),
  t("servicenow", "ServiceNow SPM", "ServiceNow", "WORK_OS_PORTFOLIO", "generic", ["BASIC", "OAUTH2"], ["POLL"], false,
    "SPM demand, project and incident records via the ServiceNow table API.", { linkedIntegration: "ServiceNow SPM", pollMinutes: 30 }),
  t("trello", "Trello", "Atlassian", "WORK_OS_PORTFOLIO", "jira", ["API_KEY", "HMAC"], ["WEBHOOK", "POLL"], false,
    "Boards, lists and cards via Trello webhooks.", { pollMinutes: 30 }),

  // ---- Business Intelligence & Analytics (5) ----
  t("power-bi", "Power BI", "Microsoft", "BI_ANALYTICS", "powerBi", ["OAUTH2"], ["BI_REFRESH", "POLL"], true,
    "Embedded dashboard metrics, dataset refresh events and tile KPIs.", { pollMinutes: 60 }),
  t("qlik-sense", "Qlik Sense", "Qlik", "BI_ANALYTICS", "generic", ["OAUTH2", "API_KEY"], ["BI_REFRESH", "POLL"], true,
    "Associative data model selections and app objects via the Qlik engine API.", { pollMinutes: 60 }),
  t("tableau", "Tableau", "Salesforce", "BI_ANALYTICS", "generic", ["API_KEY", "OAUTH2"], ["BI_REFRESH", "POLL"], false,
    "Workbook views, subscriptions and extract refreshes via the Tableau REST API.", { pollMinutes: 60 }),
  t("looker", "Looker", "Google", "BI_ANALYTICS", "generic", ["OAUTH2"], ["BI_REFRESH", "POLL"], false,
    "LookML dashboard tiles and scheduled plans via the Looker API.", { pollMinutes: 60 }),
  t("domo", "Domo", "Domo", "BI_ANALYTICS", "generic", ["OAUTH2", "API_KEY"], ["BI_REFRESH"], false,
    "Datasets, cards and KPI pulses from the Domo API.", { pollMinutes: 60 }),

  // ---- Collaboration & Knowledge Management (10) ----
  t("sharepoint", "SharePoint", "Microsoft", "COLLAB_KNOWLEDGE", "msGraph", ["OAUTH2"], ["WEBHOOK", "POLL"], true,
    "Document libraries, pages and list items via Microsoft Graph.", { pollMinutes: 30 }),
  t("notion", "Notion", "Notion", "COLLAB_KNOWLEDGE", "generic", ["OAUTH2"], ["WEBHOOK", "POLL"], true,
    "Databases, pages and unstructured lists via the Notion API.", { pollMinutes: 30 }),
  t("confluence", "Confluence", "Atlassian", "COLLAB_KNOWLEDGE", "jira", ["OAUTH2", "BASIC"], ["WEBHOOK", "POLL"], true,
    "Spaces, pages and decision records via the Confluence REST API.", { pollMinutes: 30 }),
  t("basecamp", "Basecamp", "37signals", "COLLAB_KNOWLEDGE", "generic", ["OAUTH2"], ["WEBHOOK", "POLL"], true,
    "To-dos, message boards and campfire status updates.", { pollMinutes: 30 }),
  t("slack", "Slack", "Salesforce (Slack)", "COLLAB_KNOWLEDGE", "slack", ["HMAC", "OAUTH2"], ["WEBHOOK", "POLL"], true,
    "Channel status updates and threaded decisions via Slack events API.", { pollMinutes: 0 }),
  t("ms-teams", "Microsoft Teams", "Microsoft", "COLLAB_KNOWLEDGE", "msGraph", ["OAUTH2"], ["WEBHOOK", "POLL"], true,
    "Channel messages and threaded replies via Microsoft Graph subscriptions.", { pollMinutes: 30 }),
  t("google-drive", "Google Drive", "Google", "COLLAB_KNOWLEDGE", "generic", ["OAUTH2"], ["POLL"], false,
    "Shared drives, folders and document metadata.", { pollMinutes: 60 }),
  t("dropbox", "Dropbox", "Dropbox", "COLLAB_KNOWLEDGE", "generic", ["OAUTH2"], ["WEBHOOK"], false,
    "Folder and file change events via Dropbox webhooks.", { pollMinutes: 0 }),
  t("box", "Box", "Box", "COLLAB_KNOWLEDGE", "generic", ["OAUTH2"], ["WEBHOOK", "POLL"], false,
    "Collaboration folders and file metadata via Box webhooks.", { pollMinutes: 60 }),
  t("miro", "Miro", "Miro", "COLLAB_KNOWLEDGE", "generic", ["OAUTH2"], ["WEBHOOK"], false,
    "Board items and framework cards via Miro webhooks.", { pollMinutes: 0 }),

  // ---- Time, Finance & Resource Management (8) ----
  t("harvest", "Harvest", "Harvest", "TIME_FINANCE_RESOURCE", "generic", ["OAUTH2", "API_KEY"], ["POLL"], true,
    "Billable hours, invoices and budget burn rates.", { pollMinutes: 60 }),
  t("everhour", "Everhour", "Everhour", "TIME_FINANCE_RESOURCE", "generic", ["API_KEY"], ["POLL"], true,
    "Time entries and estimates synced onto tasks.", { pollMinutes: 60 }),
  t("timecamp", "TimeCamp", "TimeCamp", "TIME_FINANCE_RESOURCE", "generic", ["API_KEY"], ["POLL"], true,
    "Time entries, attendance and project budgets.", { pollMinutes: 60 }),
  t("resource-guru", "Resource Guru", "Resource Guru", "TIME_FINANCE_RESOURCE", "generic", ["API_KEY"], ["POLL"], true,
    "Capacity plans, bookings and leave from Resource Guru.", { pollMinutes: 60 }),
  t("scoro", "Scoro", "Scoro", "TIME_FINANCE_RESOURCE", "generic", ["OAUTH2", "API_KEY"], ["POLL"], true,
    "Tasks, time logs, quotes and budget burn in one work management suite.", { pollMinutes: 60 }),
  t("paymo", "Paymo", "Paymo", "TIME_FINANCE_RESOURCE", "generic", ["API_KEY"], ["POLL"], true,
    "Timesheets, task budgets and invoicing.", { pollMinutes: 60 }),
  t("toggl", "Toggl Track", "Toggl", "TIME_FINANCE_RESOURCE", "generic", ["API_KEY"], ["POLL"], false,
    "Time entries and project billability from Toggl.", { pollMinutes: 60 }),
  t("quickbooks", "QuickBooks", "Intuit", "TIME_FINANCE_RESOURCE", "generic", ["OAUTH2"], ["POLL"], false,
    "Invoices, expenses and actual cost postings.", { pollMinutes: 60 }),

  // ---- Data, Spreadsheets & Specialized (10) ----
  t("excel", "Microsoft Excel", "Microsoft", "DATA_SPREADSHEET_SPECIALIZED", "csv", ["OAUTH2", "API_KEY"], ["CSV_UPLOAD", "POLL"], true,
    "Tabular project data; workbook ranges land in UWM extension fields.", { pollMinutes: 0 }),
  t("google-sheets", "Google Sheets", "Google", "DATA_SPREADSHEET_SPECIALIZED", "csv", ["OAUTH2"], ["CSV_UPLOAD", "POLL"], false,
    "Spreadsheet rows streamed as CSV into the harmonization lane.", { pollMinutes: 0 }),
  t("csv-upload", "CSV Upload", "PM Control Tower", "DATA_SPREADSHEET_SPECIALIZED", "csv", ["JWT"], ["CSV_UPLOAD"], false,
    "Direct CSV payload uploads from internal tools (JWT-authenticated).", { pollMinutes: 0 }),
  t("procore", "Procore", "Procore", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["OAUTH2"], ["WEBHOOK", "POLL"], true,
    "Construction RFIs, punch items and submittals with domain metadata.", { pollMinutes: 30 }),
  t("aha", "Aha!", "Aha!", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["API_KEY"], ["WEBHOOK", "POLL"], true,
    "Roadmap initiatives, features and releases.", { pollMinutes: 60 }),
  t("airtable", "Airtable", "Airtable", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["API_KEY"], ["WEBHOOK", "POLL"], true,
    "Relational bases, tables and records via the Airtable API.", { pollMinutes: 30 }),
  t("filestage", "Filestage", "Filestage", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["API_KEY"], ["WEBHOOK", "POLL"], true,
    "Proofing approvals and review states for deliverable assets.", { pollMinutes: 30 }),
  t("docusign", "DocuSign", "DocuSign", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["OAUTH2", "JWT"], ["WEBHOOK"], false,
    "Envelope approvals and signed-off deliverables via Connect webhooks.", { pollMinutes: 0 }),
  t("zendesk", "Zendesk", "Zendesk", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["OAUTH2", "API_KEY"], ["WEBHOOK", "POLL"], false,
    "Support tickets and escalation metadata mapped to project issues.", { pollMinutes: 30 }),
  t("pagerduty", "PagerDuty", "PagerDuty", "DATA_SPREADSHEET_SPECIALIZED", "generic", ["API_KEY", "HMAC"], ["WEBHOOK"], false,
    "Incident records and on-call escalations mapped to BLOCKED work.", { pollMinutes: 0 }),
];

/** Tool lookup by id. */
export function hubTool(id: string): HubTool | undefined {
  return HUB_TOOLS.find((tool) => tool.id === id);
}

/** Facade kind for a tool — falls back to "generic" so an unknown id never throws. */
export function facadeKindFor(toolId: string): FacadeKind {
  return hubTool(toolId)?.facade ?? "generic";
}

export const HUB_TOOL_IDS: string[] = HUB_TOOLS.map((tool) => tool.id);

/** Tools whose payloads are covered by an explicit HMAC webhook signature. */
export function hmacSignedTools(): HubTool[] {
  return HUB_TOOLS.filter((tool) => tool.auth.includes("HMAC"));
}

/** Category view for the Hub UI: queue + its tools. */
export function hubCatalog(): { queue: HubQueue; tools: HubTool[] }[] {
  return HUB_QUEUES.map((queue) => ({ queue, tools: HUB_TOOLS.filter((tool) => tool.category === queue.category) }));
}
