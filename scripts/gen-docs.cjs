// PM CONTROL TOWER — Documentation Suite generator (chapters 7-16 + assembly)
const { CH, L } = require("./docs-ch1-6.cjs");
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, PageNumber,
  SectionType, NumberFormat, TableOfContents, PageBreak,
  P, FONT, HFONT, buildCoverR1, h1, h2, body, bodyRuns, bullet, codeLine, table, fs,
} = L;

// ============ 7. SECURITY ARCHITECTURE ============
CH.push(h1("7", "Security Architecture"));
CH.push(h2("7.1", "Identity and Access"));
CH.push(body("Authentication uses JSON Web Tokens signed with HS256 (jose library), a twelve-hour expiry, and an issuer check. Tokens are returned to the client and additionally set as httpOnly, SameSite=Lax cookies. Passwords are hashed with bcrypt (cost 10). Login attempts are rate limited and failed-login counters are recorded. Authorization is role-based: eight system roles (Executive, PMO Administrator, Portfolio Manager, Program Manager, Project Manager, Finance Controller, Team Member, Auditor) map to a catalog of thirty-two permission codes across executive, portfolio, project, planning, execution, control, connect and administration categories. The API wrapper enforces the permission on every endpoint; super-admin status is a deliberate, auditable flag. SSO/OIDC is implemented at the gateway level as an integration category for enterprise identity providers."));
CH.push(h2("7.2", "Platform Controls"));
CH.push(bullet("Every input validated with Zod schemas; unknown or malformed fields rejected with 400 responses.", "Request validation"));
CH.push(bullet("Per-IP, per-route sliding windows; login endpoints have stricter limits.", "Rate limiting"));
CH.push(bullet("Secrets only from environment variables (JWT secret, database URL, webhook signing refs). Nothing hard-coded; the sandbox fallback secret is documented for rotation before production.", "Secret management"));
CH.push(bullet("AuditEvent records user, role, action, entity, entity identifier, before/after values, IP, user agent and timestamp for every material action.", "Audit trail"));
CH.push(bullet("Webhook deliveries signed with HMAC-SHA256; the realtime emit endpoint requires a shared secret; the AI assistant is permission-checked (ai.use) and logs every execution.", "Interface hardening"));
CH.push(h2("7.3", "Data Protection Commitments"));
CH.push(body("Credential values are never returned by the API: integration credentials store masked representations only, and configuration fields named secret, password, key or token are rejected at write time. Transport security (HTTPS/TLS) is enforced at the deployment edge. CORS is same-origin in the sandbox gateway and pinned to the web origin in production via the WEB_ORIGIN environment variable. Production secrets must be rotated from the documented sandbox defaults before go-live."));

// ============ 8. DEPLOYMENT GUIDE ============
CH.push(h1("8", "Deployment Guide"));
CH.push(h2("8.1", "Target Topology (Render Cloud)"));
CH.push(body("The reference production topology deploys three services to Render in the Singapore region: pm-control-tower-web (Next.js web service), pm-control-tower-api (Node API service), and pm-control-tower-db (managed PostgreSQL). Users reach the web service over HTTPS; the web tier calls the API service; the API talks to PostgreSQL through Prisma with an SSL connection. External systems integrate through the API gateway and webhooks. Monitoring, logging, backups, and CI/CD wrap the three services."));
CH.push(...table("Render configuration", ["Service", "Setting", "Value"], [
  ["API", "Build", "npm install && npm run db:generate"],
  ["API", "Start", "npx prisma migrate deploy && npm --workspace @pmct/api run start"],
  ["API", "Environment", "NODE_ENV=production; PORT=4000; DATABASE_URL (Render internal URL, SSL); JWT_SECRET (strong production secret); WEB_ORIGIN (deployed web URL)"],
  ["Web", "Build", "npm install && npm run build:web"],
  ["Web", "Start", "npm --workspace @pmct/web run start"],
  ["Web", "Environment", "NEXT_PUBLIC_API_URL=https://pm-control-tower-api.onrender.com"],
], [900, 1800, 6500]));
CH.push(h2("8.2", "Deployment Steps"));
CH.push(bullet("Provision the PostgreSQL instance; copy the internal connection string (requires SSL) into DATABASE_URL.", "Step 1"));
CH.push(bullet("Deploy the API service with the environment variables above; run migrations (see 8.3); verify GET /api/system/health and /api/system/ready.", "Step 2"));
CH.push(bullet("Deploy the web service; after Render assigns the URL, set WEB_ORIGIN on the API to the exact origin and redeploy to fix CORS.", "Step 3"));
CH.push(bullet("Rotate JWT_SECRET from any documented development value; store it in Render environment settings; restart both services.", "Step 4"));
CH.push(bullet("Run the production validation sequence in chapter 11 before announcing availability.", "Step 5"));
CH.push(h2("8.3", "Migration Policy"));
CH.push(body("Initial provisioning may use prisma db push for non-production databases. For production, generate migration files with prisma migrate dev locally, commit them to the repository, and apply them with prisma migrate deploy in the release pipeline. Data-loss operations are prohibited against production; schema changes must be additive and backward compatible where possible."));
CH.push(h2("8.4", "Troubleshooting"));
CH.push(...table("Common deployment faults", ["Symptom", "Resolution"], [
  ["SSL/TLS required error from database", "Use the Render internal database URL with sslmode requirement in DATABASE_URL"],
  ["CORS errors in the browser", "WEB_ORIGIN must exactly match the deployed web origin (scheme + host); redeploy API after change"],
  ["Web cannot reach API", "Verify NEXT_PUBLIC_API_URL and that the API service is live"],
  ["Prisma cannot connect", "Check DATABASE_URL, database availability, SSL, credentials and region networking"],
  ["API restart loop", "Inspect runtime logs; typically a missing environment variable or failed migration"],
  ["Realtime unavailable", "Confirm the Socket.IO service is running and the gateway forwards its path; check origin rules"],
  ["Management API returns 500", "Retry via the Render dashboard and inspect deployment/service events"],
], [3400, 5800]));

// ============ 9. OPERATIONS RUNBOOK ============
CH.push(h1("9", "Operations Runbook"));
CH.push(h2("9.1", "Health and Readiness"));
CH.push(body("GET /api/system/health is a liveness probe returning service identity and time. GET /api/system/ready is a readiness probe verifying the database (a live query) and the realtime gateway (a health fetch with timeout), returning ready or degraded with per-check status. Wire load balancers to liveness and alert on readiness degradation."));
CH.push(h2("9.2", "Routine Operations"));
CH.push(bullet("Review new CRITICAL governance alerts daily in the Governance Center; acknowledge with rationale.", "Daily"));
CH.push(bullet("Verify /api/system/ready, backup completion, webhook failure counts, integration error counts.", "Daily"));
CH.push(bullet("Review audit trail samples, user access changes, and timesheet approval backlogs.", "Weekly"));
CH.push(bullet("Rotate credentials due to expire, review RBAC changes, and re-run the production validation subset.", "Monthly"));
CH.push(h2("9.3", "Incident Response"));
CH.push(body("For API degradation: check /api/system/ready, inspect service logs for the failing dependency, and scale or restart the service. For database issues: verify connection limits and SSL, fail over to the latest restore point if corruption is suspected (chapter 12). For realtime outage: the application remains fully functional via REST; investigate the gateway service and its path routing. For suspected credential compromise: rotate the affected secrets, force token invalidation by rotating JWT_SECRET (invalidates all sessions), and review the audit trail for the affected identities."));

// ============ 10. TESTING STRATEGY ============
CH.push(h1("10", "Testing Strategy"));
CH.push(h2("10.1", "Test Levels"));
CH.push(...table("Test levels", ["Level", "Scope", "Status in this release"], [
  ["Unit", "CPM forward/backward passes, EVM formulas, health scoring, governance operators", "Implemented (engines are pure functions); extend with Vitest suite"],
  ["API integration", "Every endpoint group exercised with authenticated requests, guards and error paths", "Executed via scripted smoke tests (all groups green)"],
  ["Workflow", "Timesheet Draft-SUBMITTED-Approved cascade to actuals, EVM, health, governance", "Executed end-to-end with real assertions on database state"],
  ["RBAC", "Role-permission matrix enforcement on representative endpoints", "Executed (403 paths verified)"],
  ["Realtime", "Socket authentication, room subscriptions, event delivery", "Executed (gateway health + client fan-out)"],
  ["Browser E2E", "All 36 views loaded; golden paths: login, dashboard, workspace tabs, timesheet submit/approve, governance evaluate, assistant, template apply", "Executed via automated browser (zero runtime errors)"],
  ["Deployment smoke", "Health/ready probes after deploy", "Defined; executes at deployment"],
], [1500, 4300, 3400]));
CH.push(h2("10.2", "The Golden Chain Test"));
CH.push(body("The platform mandates an end-to-end assertion of the business chain: Project to WBS to Task to Schedule to Resource to Timesheet to Approval to Actuals to Cost to EVM to Health to Governance to Executive reporting. The release verification approved a real timesheet and confirmed the project actual cost increased by the expected labor amount, a new EVM period context was reflected in health recalculation, governance re-evaluation ran, and the executive bundle showed updated figures. This chain test is the acceptance gate for any release."));

// ============ 11. GO-LIVE CHECKLIST ============
CH.push(h1("11", "Go-Live Checklist"));
CH.push(...table("Production certification checklist", ["#", "Item", "Evidence required"], [
  ["1", "JWT_SECRET rotated; sandbox fallback removed", "Environment settings screenshot; API restart clean"],
  ["2", "DATABASE_URL uses managed PostgreSQL with SSL", "Ready probe green; SSL verified"],
  ["3", "Migrations committed and applied via prisma migrate deploy", "Migration list in repository; deploy log"],
  ["4", "WEB_ORIGIN matches production web URL", "CORS-protected call succeeds from web origin"],
  ["5", "Health and readiness probes wired to monitoring", "Monitoring dashboard shows probes"],
  ["6", "Backup schedule enabled (PITR) and restore rehearsed", "Restore drill record"],
  ["7", "SSO/OIDC integration configured and tested (if in scope)", "Authentication test through identity provider"],
  ["8", "Email/notifications connector credentials configured and tested", "Integration Hub shows CONNECTED after real test"],
  ["9", "Webhook endpoints reachable with valid signatures", "Delivery history shows SUCCESS entries"],
  ["10", "Golden chain test executed in production", "Timesheet approval cascades to EVM/health figures"],
  ["11", "RBAC sign-off: role assignments match the operating model", "Role matrix reviewed by PMO and Security"],
  ["12", "Executive dashboard figures reconcile to finance source", "Signed reconciliation note"],
], [500, 3600, 5100]));
CH.push(body("Production Certified status is granted only when every row above carries real evidence in the target environment. Anything less must be reported honestly as Implemented and Tested (staging) or Configured."));

// ============ 12. DISASTER RECOVERY ============
CH.push(h1("12", "Disaster Recovery"));
CH.push(h2("12.1", "Objectives"));
CH.push(body("Targets for the reference deployment: Recovery Point Objective of fifteen minutes (point-in-time recovery from continuous WAL archiving) and Recovery Time Objective of two hours for full service restoration. These targets align with the platform positioning as a system of record for delivery governance."));
CH.push(h2("12.2", "Backup and Restore"));
CH.push(bullet("Enable automated daily backups plus point-in-time recovery on the managed database; retain 30 days.", "Backups"));
CH.push(bullet("Quarterly restore drill into a scratch environment; verify row counts, integrity and a project workspace render.", "Drills"));
CH.push(bullet("Infrastructure is code: service definitions and environment variable inventories are versioned in the repository, enabling environment rebuild without discovery work.", "Rebuild"));
CH.push(h2("12.3", "Degraded Mode"));
CH.push(body("The application degrades gracefully: realtime loss does not affect REST operation; a failed AI connector does not block any business function; integration outages queue retries with error counts visible in the hub. The dependency that requires the most protection is the database; its DR posture defines the platform's."));

// ============ 13. ADMINISTRATION GUIDE ============
CH.push(h1("13", "Administration Guide"));
CH.push(h2("13.1", "Users and Roles"));
CH.push(body("Administrators manage users under Administration: create users (email, name, strong password, title, role), deactivate rather than delete to preserve audit integrity, and change role assignments (fully audited with before/after values). The Roles and Permissions screen presents the full role-permission matrix; custom roles can be created for operating models the eight system roles do not cover. The last active PMO Administrator cannot be deactivated as a guard against lockout."));
CH.push(h2("13.2", "Templates and Configuration"));
CH.push(body("The PMO Template Library curates Project, PMO and Delivery templates with versioning and structure definitions (phases, artifacts). Applying a template creates a real project with WBS skeleton, tasks, dependencies, milestones, gates, budget lines and charter content, then links it into the portfolio hierarchy. The Configuration screen shows environment readiness (secret presence, never values), entity volumes, and live database/realtime status."));
CH.push(h2("13.3", "Audit"));
CH.push(body("The Audit Trail screen filters by entity, action, severity, user, free text and date range, and expands rows to show before/after JSON. Retention follows the corporate policy; exports support compliance review."));

// ============ 14. USER GUIDE ============
CH.push(h1("14", "User Guide"));
CH.push(h2("14.1", "Getting Started"));
CH.push(body("Sign in from the login screen with your work email and password, or select a demo role in the sandbox. The sidebar groups the product into the eight areas; the command palette (Control/Cmd + K) searches projects, tasks and actions from anywhere. Breadcrumbs above every page title show your location; the bell shows unread notifications; the LIVE badge confirms realtime is connected."));
CH.push(h2("14.2", "Everyday Flows"));
CH.push(bullet("Open Projects, filter or search the register, and click a project to enter its workspace. Use tabs for WBS, the Schedule Gantt, EVM, RAID and everything else about that project.", "Work a project"));
CH.push(bullet("Under Timesheets pick your week, add entries per day (project, task, time, hours, billable), save as draft, and Submit. If your manager rejects the week, correct it and resubmit; approved and locked weeks are read-only.", "Log your time"));
CH.push(bullet("The Work Inbox collects approvals, alerts, governance escalations and mentions with one-click actions back to the source record. The Focus Planner plans your day around real tasks and meetings.", "Stay on top"));
CH.push(bullet("Ask the AI PM Assistant questions such as which projects are at risk because of resource capacity; answers cite project codes and are drawn only from governed data you can see.", "Ask the tower"));
CH.push(h2("14.3", "Managers"));
CH.push(body("Project managers approve timesheets (driving the actuals cascade), assess change requests through the governance workflow, make stage-gate decisions with evidence, and watch CPI/SPI and health trends per project. Portfolio and program managers use the Executive Control Tower and investment view for roll-ups."));

// ============ 15. PMO GUIDE ============
CH.push(h1("15", "PMO Guide"));
CH.push(h2("15.1", "Operating Model"));
CH.push(body("The PMO configures the governance engine to mirror policy: threshold rules on CPI, SPI, EAC, budget utilization, health score, variances and open RAID counts, with severities and scope. Breaches raise alerts and inbox items automatically, removing subjective status reporting. Stage gates encode investment governance; change requests enforce impact assessment and decision records."));
CH.push(h2("15.2", "Cadence"));
CH.push(bullet("Portfolio performance review monthly using the Executive bundle and EVM by project.", "Monthly"));
CH.push(bullet("RAID and gate review weekly; timesheet approval hygiene check (nothing older than one week).", "Weekly"));
CH.push(bullet("Baseline discipline: re-baseline only through approved change requests; the Baselines screen preserves versions.", "Continuous"));
CH.push(h2("15.3", "Templates and Quality"));
CH.push(body("Curate the template library so every new project starts from the approved structure; apply templates rather than rebuilding. Quality records attach review and test outcomes to projects so gate evidence is complete. The audit trail is the PMO's compliance friend: every material action is provable."));

// ============ 16. EXECUTIVE GUIDE ============
CH.push(h1("16", "Executive Guide"));
CH.push(h2("16.1", "The Control Tower Screen"));
CH.push(body("The Executive Control Tower answers the five questions that matter: where is the portfolio healthy (RAG distribution and health trend), where is money at risk (budget vs actual vs forecast with variance), whether delivery is accelerating or slipping (CPI/SPI by project and actual-hours trend), what needs my decision (governance queue: pending gates, changes in assessment/approval), and what could hurt us (top risks and critical alerts)."));
CH.push(h2("16.2", "Reading the Numbers"));
CH.push(bullet("Above 1 means value is being delivered faster than cost is consumed; below 0.85 demands intervention.", "CPI"));
CH.push(bullet("Below 1 means the schedule is slipping against the value plan; below 0.8 is a red-flag threshold.", "SPI"));
CH.push(bullet("EAC is the statistically forecast total cost; compare to current budget and act on the gap (VAC).", "EAC / VAC"));
CH.push(bullet("The health score blends cost, schedule, risk, issues, milestones and alerts into one governed number; RAG floors prevent optimistic reporting.", "Health / RAG"));
CH.push(h2("16.3", "Decision Rhythm"));
CH.push(body("Executives own gate decisions and change approvals above threshold. The Governance Queue on the dashboard lists exactly what awaits a decision, each item linked to its evidence pack. Because every figure traces to operational data through audited engines, the executive conversation moves from debating status to choosing action. That is the promise of the control tower: one platform, complete project intelligence, greater outcomes."));

// ============ Front matter ============
const frontMatter = [
  new Paragraph({
    spacing: { before: 200, after: 160 },
    children: [new TextRun({ text: "About This Documentation", bold: true, size: 30, color: P.primary, font: HFONT })],
  }),
  body("This suite is the complete documentation set for PM Control Tower, the enterprise project, program and portfolio management platform. It consolidates the sixteen required documents into one navigable volume: Product Blueprint, Technical Architecture, Database Architecture, API Specification, UI Architecture, Integration Architecture, Security Architecture, Deployment Guide, Operations Runbook, Testing Strategy, Go-Live Checklist, Disaster Recovery, Administration Guide, User Guide, PMO Guide and Executive Guide."),
  body("The volume serves four audiences. Executives read chapters 1, 10 and 16. Delivery organizations (project, program and portfolio managers) live in chapters 1 through 6 and 14 and 15. Engineers and integrators implement from chapters 2 through 9 and 12. Operations and PMO administrators run the platform from chapters 8, 9, 11, 12 and 13."),
  bodyRuns([
    { text: "Status honesty. ", bold: true },
    { text: "Statements in this volume distinguish Implemented, Configured, Connected, Tested and Production Certified (chapter 1.4). Nothing in this release claims live external connectivity or production certification that has not occurred; where a capability requires customer-side credentials or a production deployment, the text says so." },
  ]),
  new Paragraph({
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 30, color: P.primary, font: HFONT })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: FONT,
    })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ============ Headers / footers ============
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      border: { bottom: { style: "single", size: 4, color: P.tableLine } },
      children: [
        new TextRun({ text: "PM CONTROL TOWER", bold: true, size: 15, color: P.accent, font: HFONT }),
        new TextRun({ text: "   |   Complete Documentation Suite", size: 15, color: P.muted, font: FONT }),
      ],
    })],
  });
}
function numFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "PLAN | EXECUTE | MONITOR | GOVERN | DELIVER        ", size: 13, color: P.muted, font: FONT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: P.muted, font: FONT }),
      ],
    })],
  });
}

// ============ Assembly ============
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1300, left: 1560, right: 1440 };

const doc = new Document({
  creator: "PM Control Tower",
  title: "PM Control Tower — Complete Documentation Suite",
  description: "Enterprise Project, Program & Portfolio Management Platform documentation",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 22, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: { run: { font: HFONT, size: 30, bold: true, color: P.primary }, paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      heading2: { run: { font: HFONT, size: 25, bold: true, color: P.accent }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
    },
  },
  sections: [
    { // Cover
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "PM Control Tower",
        subtitle: "Enterprise Project, Program & Portfolio Management Platform — Complete Documentation Suite",
        englishLabel: "DOCUMENTATION",
        metaLines: [
          "One Platform. Complete Project Intelligence. Greater Outcomes.",
          "Release 1.0   |   Sandbox Edition",
          "Classification: Internal",
          "PLAN  |  EXECUTE  |  MONITOR  |  GOVERN  |  DELIVER",
        ],
        footerLeft: "PM CONTROL TOWER",
        footerRight: "ENTERPRISE PPM PLATFORM",
      }),
    },
    { // Front matter (Roman)
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: pageHeader() },
      footers: { default: numFooter() },
      children: frontMatter,
    },
    { // Body (Arabic)
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: pageHeader() },
      footers: { default: numFooter() },
      children: CH,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync("/home/z/my-project/download", { recursive: true });
  fs.writeFileSync("/home/z/my-project/download/PM-Control-Tower-Documentation-Suite.docx", buf);
  console.log("docx written:", buf.length, "bytes");
});
