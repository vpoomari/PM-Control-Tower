// PM CONTROL TOWER — Documentation Suite generator (main)
const L = require("./docs-lib.cjs");
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageNumber,
  SectionType, NumberFormat, TableOfContents, PageBreak,
  P, FONT, HFONT, buildCoverR1, h1, h2, body, bodyRuns, bullet, codeLine, table, fs,
} = L;

const CH = [];

// ============ 1. PRODUCT BLUEPRINT ============
CH.push(h1("1", "Product Blueprint"));
CH.push(h2("1.1", "Vision"));
CH.push(body("PM Control Tower is an enterprise Project, Program and Portfolio Management (PPM) platform built on a single guiding principle: one platform, complete project intelligence, greater outcomes. It is explicitly not a simple task manager. The product provides one source of truth across the full enterprise delivery lifecycle: Portfolio, Program, Project, Scope, Requirements, Work Breakdown Structure, Tasks, Schedule, Milestones, Dependencies, Resources, Timesheets, Effort, Cost, Budget, Forecast, Earned Value Management, Risks, Issues, Assumptions, Dependencies, Change Control, Quality, Deliverables, Governance, Health/RAG status, Executive Reporting, an AI PM Assistant, Integrations, and Automation."));
CH.push(body("Every executive and reporting figure originates from the operational data model. There are no disconnected duplicate data sets for dashboards: when a timesheet is approved, the approval cascades through task actuals, WBS roll-ups, project actual hours and cost, budget, forecast, EVM, project health, governance evaluation, realtime events, and executive reporting automatically."));
CH.push(h2("1.2", "Core Value Areas"));
CH.push(bullet("Real-time visibility across portfolios, programs and projects with automatic RAG health scoring.", "Strategic alignment"));
CH.push(bullet("Critical Path Method scheduling, interactive Gantt, baselines and variance tracking.", "Delivery control"));
CH.push(bullet("Capacity planning, allocation heatmaps and utilization driven by real assignments and timesheets.", "Optimized resources"));
CH.push(bullet("Budget lines, actuals, forecast at completion, CPI/SPI/EAC/ETC/VAC/TCPI per period.", "Financial truth"));
CH.push(bullet("Configurable threshold rules that raise alerts, inbox items and notifications automatically.", "Automated governance"));
CH.push(bullet("A governed, permission-checked assistant that answers executive questions from live data.", "AI PM Assistant"));
CH.push(h2("1.3", "Product Structure"));
CH.push(body("The product is organized into eight major areas, each exposed as a navigation group in the application: Executive Control Tower (dashboards, portfolio overview, financial overview, EVM, governance queue, executive alerts, forecast, analytics); Portfolio (portfolios, programs, projects and roll-up reporting); Plan (project register, requirements, WBS, tasks, schedule, milestones, baselines); Execute (resources, timesheets, work inbox, focus planner); Control (financials, EVM, health, RAID, change control, stage gates, governance); Intelligence (reports, analytics, AI PM Assistant); Connect (integration hub, automations, notifications, webhooks, AI connector gateway, extension hub); and Administration (users, roles, permissions, templates, audit trail, configuration)."));
CH.push(h2("1.4", "Delivery Status Classification"));
CH.push(body("In line with the product quality standard, capabilities are classified honestly using five states: Implemented (fully working in this release), Configured (parameterized and ready but requiring environment-specific secrets), Connected (live external connectivity verified), Tested (covered by executed tests), and Production Certified (validated in a production environment under load). In this sandbox release, all core platform capabilities are Implemented and Tested. External integrations (email, calendar, SSO, storage, messaging, BI) are Implemented at the gateway level but are NOT claimed as Connected because no external credentials exist in this environment; each reports its honest status in the Integration Hub. Production Certified status requires live deployment validation per the Go-Live Checklist in chapter 11."));

// ============ 2. TECHNICAL ARCHITECTURE ============
CH.push(h1("2", "Technical Architecture"));
CH.push(h2("2.1", "Overview"));
CH.push(body("PM Control Tower is a full-stack web application. The presentation layer is a Next.js 16 application (React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui) delivering a single-page enterprise experience with hash-based deep links. The application layer consists of Next.js route handlers under /api implementing a REST gateway with authentication, authorization, validation, rate limiting, error handling and audit hooks. Real-time collaboration is provided by a dedicated Socket.IO gateway service. The data layer is Prisma ORM over a relational database: SQLite in the sandbox environment and PostgreSQL in production deployment."));
CH.push(...table("Architecture layers", ["Layer", "Technology", "Responsibility"], [
  ["Presentation", "Next.js 16, React 19, Tailwind 4, shadcn/ui", "Enterprise SPA, 36 views, command palette, realtime updates"],
  ["API gateway", "Next.js route handlers (88 endpoints)", "Auth, RBAC, validation (Zod), rate limiting, audit, errors"],
  ["Domain engines", "TypeScript services (src/lib/engines)", "CPM scheduling, EVM, health scoring, governance, timesheet cascade, automations"],
  ["Realtime", "Socket.IO gateway (Node/Bun, port 3003)", "JWT-authenticated subscriptions, room fan-out, shared-secret emit API"],
  ["Data", "Prisma ORM, SQLite (sandbox) / PostgreSQL (production)", "50-entity schema, single source of truth, indexed FKs"],
  ["Identity", "JWT (jose) + bcrypt, RBAC matrix", "12-hour tokens, httpOnly cookies, 8 roles, 32 permissions"],
], [1600, 3200, 4500]));
CH.push(h2("2.2", "Domain Engines"));
CH.push(body("The intellectual core of the platform is a set of pure, testable engines. The scheduling engine implements the Critical Path Method: forward and backward passes across Finish-to-Start, Start-to-Start, Finish-to-Finish and Start-to-Finish dependencies with lag days, computing early/late start and finish dates, total and free float, and critical-task flags. Summary WBS nodes are rolled up from children rather than participating directly in the network. The EVM engine computes BAC, PV (time-phased), EV (cost-weighted physical progress), AC, CPI, SPI, EAC, ETC, VAC, TCPI, cost variance and schedule variance from operational task, progress and actual-cost data. The health engine converts CPI, SPI, budget utilization, critical risks and issues, overdue milestones, governance alerts and capacity pressure into a 0-100 score with Green/Amber/Red classification and rule-based override floors. The governance engine evaluates configurable rules (metrics CPI, SPI, EAC, budget utilization, health score, variances, open risks/issues; operators LT, LTE, GT, GTE, EQ) and, on breach, creates alert events, work-inbox items and notifications, recalculates health, and publishes realtime events. The timesheet engine implements the Draft-Submitted-Under Review-Approved/Rejected-Locked workflow and owns the actuals cascade. The automation engine executes trigger-condition-action rules with execution history, retry counters and audit trails."));
CH.push(h2("2.3", "Request and Event Flow"));
CH.push(body("A typical business action follows one governed path. The client calls an API route; the wrapper authenticates the JWT, checks the RBAC permission, applies rate limits and validates the body with a Zod schema. The handler mutates data through Prisma, invokes the relevant engine (for example, approving a timesheet triggers the actuals cascade), writes an audit event with before/after values, publishes realtime events to project and user rooms, and returns a structured JSON envelope. Subscribed UIs refresh without a page reload."));

// ============ 3. DATABASE ARCHITECTURE ============
CH.push(h1("3", "Database Architecture"));
CH.push(h2("3.1", "Entity Model"));
CH.push(body("The schema contains fifty entities organized in coherent domains. Identity and access: User, Role, Permission, UserRole, RolePermission. Portfolio hierarchy: Portfolio, Program, Project. Planning: WBSNode (self-referencing tree), Requirement, Task (self-referencing for sub-tasks), Dependency (FS/SS/FF/SF with lag), Milestone, Baseline. Execution: Resource, Assignment, Timesheet, TimesheetEntry, Approval. Financial control: BudgetLine, EvmPeriod, ProjectHealthSnapshot, ProjectForecast. RAID and governance: Risk, Issue, Assumption, ChangeRequest, StageGate, GovernanceRule, AlertEvent. Delivery: Deliverable, QualityRecord. Collaboration: Meeting, Decision, Stakeholder, Communication, Document, Vendor. Engagement: Notification, InboxItem, PlannerEntry. Automation: AutomationRule, AutomationExecution. Templates: Template, TemplateVersion. Connectivity: Integration, IntegrationCredential, IntegrationEvent, WebhookSubscription, WebhookDelivery, AIConnector, AIExecution. Assurance: AuditEvent."));
CH.push(body("Project is the central business object. Foreign keys follow the hierarchy Portfolio to Program to Project to WBS to Tasks to Timesheet entries, with project-scoped ownership on every operational record. All foreign-key columns are indexed; collection endpoints support search, filtering and pagination."));
CH.push(h2("3.2", "SQLite Sandbox and PostgreSQL Production"));
CH.push(body("The sandbox uses SQLite for zero-configuration operation; enumeration-style fields are string constants validated by the shared constants module, and JSON payloads are serialized to text columns through shared helpers. The production schema is the same model with the PostgreSQL provider. For production hardening, teams should generate Prisma migration files, commit them to the repository, and deploy with prisma migrate deploy. Controlled use of prisma db push is acceptable only for initial provisioning of non-production environments; uncontrolled data-loss pushes must never be used against a production database."));
CH.push(...table("Key integrity rules", ["Rule", "Implementation"], [
  ["Single source of truth", "Dashboards and EVM compute from operational tables, never copies"],
  ["Timesheet uniqueness", "One timesheet header per resource per week (unique index)"],
  ["Referential cleanup", "Cascading deletes from Project to WBS, tasks, dependencies, timesheet entries"],
  ["Audit completeness", "AuditEvent rows capture user, role, action, entity, before/after, IP, timestamp"],
  ["Secret hygiene", "IntegrationCredential stores masked values only; environment variables hold secrets"],
], [2600, 6600]));

// ============ 4. API SPECIFICATION ============
CH.push(h1("4", "API Specification"));
CH.push(h2("4.1", "Conventions"));
CH.push(body("The API is REST over HTTPS with JSON bodies. All responses use a structured envelope: success true with a data payload, or success false with an error message and optional details. Authentication is a Bearer JWT (also issued as an httpOnly cookie). Every endpoint declares its required permission from a catalog of thirty-two codes; every mutating endpoint writes an audit event. List endpoints accept q (search), status and other domain filters, and take/skip pagination with sane caps. Errors use appropriate status codes: 400 validation, 401 unauthenticated, 403 permission denied, 404 not found, 409 conflict (workflow or referential guards), 429 rate limited, 502 upstream failure."));
CH.push(h2("4.2", "Endpoint Map (88 routes)"));
CH.push(...table("Endpoint groups", ["Group", "Representative endpoints"], [
  ["Authentication", "POST /api/auth/login, /logout, /register; GET /api/auth/me"],
  ["Portfolio", "GET/POST /api/portfolios; GET/PATCH/DELETE /api/portfolios/{id}; programs likewise"],
  ["Projects", "GET/POST /api/projects; GET/PATCH/DELETE /api/projects/{id} (full detail bundle)"],
  ["Planning", "/api/projects/{id}/wbs, /requirements, /tasks, /tasks/{taskId}, /dependencies, /dependencies/{depId}, /schedule, /milestones, /baselines, /baselines/{id}/activate"],
  ["Execution", "/api/resources, /api/capacity (8-week heatmap), /api/assignments, /api/timesheets (+ /submit, /approve, /reject, /lock)"],
  ["Engagement", "/api/inbox, /api/planner, /api/notifications"],
  ["Control", "/api/financials (+ /budget-lines), /api/evm, /api/health, /api/risks, /api/issues, /api/assumptions, /api/changes, /api/gates, /api/governance/rules, /api/governance/evaluate, /api/alerts"],
  ["Delivery", "/api/deliverables, /api/meetings, /api/stakeholders"],
  ["Connect", "/api/automations (+ /{id}/run), /api/templates (+ /{id}/apply), /api/integrations (+ /test, /enable, /disable, /credentials), /api/webhooks (+ /deliveries, /test)"],
  ["Intelligence", "/api/reports/executive, /api/reports/analytics, /api/assistant"],
  ["Administration", "/api/admin/users, /api/admin/roles, /api/admin/templates-config, /api/audit"],
  ["Search & ops", "/api/search; GET /api/system/health; GET /api/system/ready"],
], [1800, 7400]));
CH.push(h2("4.3", "Realtime Events"));
CH.push(body("The Socket.IO gateway authenticates handshakes with the same JWT, joins each user to their personal room, and accepts subscriptions to project, role and global rooms. Business services publish through a shared-secret emit endpoint. The event catalog includes project created/updated/health, WBS changed, task changed, schedule changed, dependency changed, baseline changed, resource assigned, timesheet submitted/approved, actuals changed, EVM changed, RAID changed, change changed, governance changed, alert created, inbox changed, planner changed, integration changed, automation executed, notification created and audit created. Clients subscribe once and refresh the relevant views on arrival."));

// ============ 5. UI ARCHITECTURE ============
CH.push(h1("5", "UI Architecture"));
CH.push(h2("5.1", "Design System"));
CH.push(body("The interface is an original PM Control Tower design built on Tailwind CSS 4 and shadcn/ui primitives. The foundation is professional navy and blue: a deep navy sidebar carries the eight navigation groups, the content area is light with white cards, slate typography, and restrained status color (emerald, amber, red reserved for RAG and severity). Shared primitives in the design kit include the page header with breadcrumbs, KPI stat cards, section cards, data tables with sticky headers, RAG badges, status chips, severity dots, progress bars, toolbars with search, and consistent loading, error and empty states. The shell provides a command palette (keyboard-invoked global search across projects, tasks and actions), quick-create menu, notification bell with live unread count, a realtime LIVE/OFF indicator, and a user menu with role display and sign-out."));
CH.push(h2("5.2", "Navigation and Views"));
CH.push(body("The application exposes thirty-six views across the eight product areas. The Executive Control Tower dashboard presents portfolio KPIs, RAG distribution, investment view, top risks, governance alerts, capacity hot spots, EVM by project, actual-hours trend and the governance queue. The Project Workspace is the flagship surface: thirteen tabs (Overview, Scope and Requirements, WBS, Schedule, Milestones, Baselines, Financials, EVM, Health, RAID, Changes, Stage Gates, Audit) over a live project header. The Schedule tab renders an interactive Gantt computed by the CPM engine: critical tasks in red, summary bars in navy, float shown as outlined extensions, a today marker, and per-task tooltips with early/late dates and float."));
CH.push(h2("5.3", "Behavioral Standards"));
CH.push(body("All data views implement the three required states (loading, error with retry, empty with guidance). Mutations confirm success or surface the exact API error through toasts. Realtime events refresh affected views without page reloads. The layout is responsive from mobile to desktop with a minimum 44-pixel touch target on interactive elements, semantic landmarks, labelled controls and keyboard-operable dialogs and menus."));

// ============ 6. INTEGRATION ARCHITECTURE ============
CH.push(h1("6", "Integration Architecture"));
CH.push(h2("6.1", "Connectivity Model"));
CH.push(body("External systems connect through a layered model: external system, integration gateway, authentication, connector, transformation, PM Control Tower, business event, database, automation, notification, audit, and realtime UI. Each integration record exposes connection status, authentication status, last sync, sync direction, error count, retry count, last error, health score and an audit trail. The Integration Hub implements eight generic categories: Email Service, Calendar Integration, SSO / Identity Provider, File Storage, Notifications, BI / Reporting, Webhooks / APIs, and AI / Insights."));
CH.push(h2("6.2", "Webhooks and APIs"));
CH.push(body("Webhook subscriptions carry an event list, an HMAC-SHA256 signing configuration, retry policy and delivery history. Test deliveries are executed for real and their true outcomes recorded, including failures; the platform never fabricates delivery success. Operations endpoints exist for list, create, pause/activate, delete, delivery history and test."));
CH.push(h2("6.3", "Honest Connectivity Status"));
CH.push(body("In this environment no external credentials are configured, so external connectors report CONFIGURING or DISCONNECTED with authentication status NOT CONFIGURED, and connectivity tests honestly report that credentials are required. The AI / Insights category runs an internal connector (the PMCT Insight Engine) which is ACTIVE and used by the AI PM Assistant. Claiming a Connected state requires configured credentials and a successful test; the platform is designed so this claim can never be forged in the UI."));

module.exports = { CH, L };
