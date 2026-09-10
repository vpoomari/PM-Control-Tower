// PM CONTROL TOWER — Enterprise Seed
// Seeds a full operating dataset through the REAL engine cascade (CPM → timesheet
// approval → actuals → EVM → health → governance), proving end-to-end linkage.

import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { ROLE_TEMPLATES, PERMISSION_CATALOG } from "../src/lib/rbac";
import { rescheduleProject } from "../src/lib/engines/rollup";
import { recalcProjectHealth } from "../src/lib/engines/health";
import { evaluateGovernance } from "../src/lib/engines/governance";
import { runAutomations } from "../src/lib/engines/automations";

const DAY = 86_400_000;
const now = new Date();
now.setUTCHours(9, 0, 0, 0);
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * DAY);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  console.log("◈ PM Control Tower — seeding enterprise dataset…");
  await db.$transaction([
    db.webhookDelivery.deleteMany(), db.webhookSubscription.deleteMany(),
    db.integrationEvent.deleteMany(), db.integrationCredential.deleteMany(), db.integration.deleteMany(),
    db.aIExecution.deleteMany(), db.aIConnector.deleteMany(),
    db.automationExecution.deleteMany(), db.automationRule.deleteMany(),
    db.plannerEntry.deleteMany(), db.inboxItem.deleteMany(), db.notification.deleteMany(),
    db.alertEvent.deleteMany(), db.governanceRule.deleteMany(),
    db.templateVersion.deleteMany(), db.template.deleteMany(),
    db.qualityRecord.deleteMany(), db.deliverable.deleteMany(),
    db.communication.deleteMany(), db.decision.deleteMany(), db.meeting.deleteMany(), db.stakeholder.deleteMany(),
    db.document.deleteMany(), db.vendor.deleteMany(),
    db.changeRequest.deleteMany(), db.stageGate.deleteMany(),
    db.risk.deleteMany(), db.issue.deleteMany(), db.assumption.deleteMany(),
    db.evmPeriod.deleteMany(), db.projectHealthSnapshot.deleteMany(), db.projectForecast.deleteMany(),
    db.budgetLine.deleteMany(), db.approval.deleteMany(),
    db.timesheetEntry.deleteMany(), db.timesheet.deleteMany(),
    db.assignment.deleteMany(), db.resource.deleteMany(),
    db.baseline.deleteMany(), db.milestone.deleteMany(), db.dependency.deleteMany(),
    db.task.deleteMany(), db.requirement.deleteMany(), db.wBSNode.deleteMany(),
    db.project.deleteMany(), db.program.deleteMany(), db.portfolio.deleteMany(),
    db.userRole.deleteMany(), db.rolePermission.deleteMany(), db.role.deleteMany(), db.permission.deleteMany(),
    db.auditEvent.deleteMany(),
    db.user.deleteMany(),
  ]);

  // ---------- 1) RBAC ----------
  const permissions = await Promise.all(
    PERMISSION_CATALOG.map((p) => db.permission.create({ data: p }))
  );
  const permByCode = new Map(permissions.map((p) => [p.code, p]));
  const roles: Record<string, { id: string }> = {};
  for (const t of ROLE_TEMPLATES) {
    const role = await db.role.create({ data: { code: t.code, name: t.name, description: t.description, level: t.level, isSystem: true } });
    roles[t.code] = role;
    const codes = t.permissions.includes("*") ? PERMISSION_CATALOG.map((p) => p.code) : t.permissions;
    for (const code of codes) {
      const perm = permByCode.get(code);
      if (perm) await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
  }
  console.log("  ✓ RBAC catalog:", permissions.length, "permissions /", Object.keys(roles).length, "roles");

  // ---------- 2) Users ----------
  const passwordHash = await bcrypt.hash("Pmct@2026", 10);
  const mkUser = (email: string, name: string, title: string, roleCode: string, isSuperAdmin = false) =>
    db.user.create({ data: { email, name, title, passwordHash, isSuperAdmin, avatarColor: pickAvatar(), userRoles: { create: { roleId: roles[roleCode].id } } } });
  function pickAvatar() {
    const colors = ["#1e3a5f", "#0f766e", "#7c2d12", "#4c1d95", "#831843", "#134e4a"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  const ceo = await mkUser("ceo@pmct.io", "Alexandra Chen", "Chief Operating Officer", "EXECUTIVE");
  const pmo = await mkUser("pmo@pmct.io", "Jordan Blake", "Head of PMO", "PMO_ADMIN", true);
  const pfmg = await mkUser("portfolio@pmct.io", "Priya Nair", "Portfolio Manager", "PORTFOLIO_MANAGER");
  const prgm = await mkUser("program@pmct.io", "Marcus Webb", "Program Manager", "PROGRAM_MANAGER");
  const pm1 = await mkUser("pm.sarah@pmct.io", "Sarah Okafor", "Senior Project Manager", "PROJECT_MANAGER");
  const pm2 = await mkUser("pm.david@pmct.io", "David Kim", "Project Manager", "PROJECT_MANAGER");
  const fin = await mkUser("finance@pmct.io", "Elena Rodriguez", "Finance Controller", "FINANCE");
  const auditor = await mkUser("auditor@pmct.io", "Thomas Reed", "Internal Auditor", "AUDITOR");
  const t1 = await mkUser("liam@pmct.io", "Liam Foster", "Technical Lead", "TEAM_MEMBER");
  const t2 = await mkUser("ava@pmct.io", "Ava Martinez", "Senior Engineer", "TEAM_MEMBER");
  const t3 = await mkUser("noah@pmct.io", "Noah Andersen", "Business Analyst", "TEAM_MEMBER");
  const t4 = await mkUser("mia@pmct.io", "Mia Tanaka", "QA Lead", "TEAM_MEMBER");
  console.log("  ✓ Users: 12");

  // ---------- 3) Portfolio hierarchy ----------
  const ptf1 = await db.portfolio.create({
    data: { code: "PTF-DT", name: "Enterprise Digital Transformation", description: "Modernize core systems and customer experiences across the group.", ownerId: pfmg.id, strategicObjective: "Reduce legacy estate 60% by 2028 and lift digital revenue share.", budgetTarget: 12_500_000, startDate: d(-320), endDate: d(600), status: "ACTIVE" },
  });
  const ptf2 = await db.portfolio.create({
    data: { code: "PTF-GI", name: "Growth & Innovation", description: "New products, markets and data-driven services.", ownerId: ceo.id, strategicObjective: "Launch two new revenue lines with positive contribution by FY27.", budgetTarget: 6_000_000, startDate: d(-200), endDate: d(720), status: "ACTIVE" },
  });
  const prg1 = await db.program.create({
    data: { code: "PRG-CSM", name: "Core Systems Modernization", portfolioId: ptf1.id, ownerId: prgm.id, description: "ERP, data platform and cloud foundation renewal.", budget: 7_800_000, startDate: d(-300), endDate: d(540), status: "ACTIVE" },
  });
  const prg2 = await db.program.create({
    data: { code: "PRG-CXP", name: "Customer Experience Platform", portfolioId: ptf1.id, ownerId: prgm.id, description: "Portal, mobile and CRM experience unification.", budget: 3_200_000, startDate: d(-260), endDate: d(420), status: "ACTIVE" },
  });
  const prg3 = await db.program.create({
    data: { code: "PRG-NMX", name: "New Market Expansion", portfolioId: ptf2.id, ownerId: pfmg.id, description: "Market entry programs with local compliance and delivery.", budget: 2_400_000, startDate: d(-120), endDate: d(640), status: "ACTIVE" },
  });
  console.log("  ✓ 2 portfolios, 3 programs");

  // ---------- 4) Projects ----------
  interface ProjSpec {
    code: string; name: string; programId: string; ownerId: string; managerId: string;
    status: string; phase: string; priority: string; risk: string; start: number; end: number;
    budget: number; baselineBudget: number; charter: string; rag: string;
  }
  const specs: ProjSpec[] = [
    { code: "PRJ-ERP-001", name: "Global ERP Implementation", programId: prg1.id, ownerId: pm1.id, managerId: pm1.id, status: "ACTIVE", phase: "EXECUTION", priority: "HIGH", risk: "HIGH", start: -280, end: 240, budget: 3_600_000, baselineBudget: 3_400_000, rag: "AMBER", charter: "Replace the legacy finance and supply chain estate with a single global ERP instance, standardizing 42 country processes and cutting month-end close from 12 to 5 days." },
    { code: "PRJ-DATA-002", name: "Enterprise Data Platform", programId: prg1.id, ownerId: pm2.id, managerId: pm2.id, status: "ACTIVE", phase: "EXECUTION", priority: "CRITICAL", risk: "HIGH", start: -220, end: 160, budget: 1_800_000, baselineBudget: 1_650_000, rag: "RED", charter: "Build the governed lakehouse and semantic layer that powers analytics, AI and regulatory reporting across all business units." },
    { code: "PRJ-PORT-003", name: "Customer Self-Service Portal", programId: prg2.id, ownerId: pm1.id, managerId: pm1.id, status: "ACTIVE", phase: "TESTING", priority: "HIGH", risk: "MEDIUM", start: -240, end: 90, budget: 1_400_000, baselineBudget: 1_380_000, rag: "GREEN", charter: "Launch a unified customer portal with single sign-on, case management and self-service billing, targeting 35% contact-center deflection." },
    { code: "PRJ-MOB-004", name: "Mobile Banking Application", programId: prg2.id, ownerId: pm2.id, managerId: pm2.id, status: "ACTIVE", phase: "EXECUTION", priority: "HIGH", risk: "MEDIUM", start: -180, end: 180, budget: 1_150_000, baselineBudget: 1_100_000, rag: "GREEN", charter: "Deliver a secure mobile banking app with biometric authentication, payments and personal finance insights for 2.4 million retail customers." },
    { code: "PRJ-CLD-005", name: "Cloud Infrastructure Migration", programId: prg1.id, ownerId: pm1.id, managerId: pm1.id, status: "ACTIVE", phase: "EXECUTION", priority: "MEDIUM", risk: "MEDIUM", start: -150, end: 300, budget: 1_300_000, baselineBudget: 1_250_000, rag: "AMBER", charter: "Migrate 310 workloads to cloud landing zones with landing-zone guardrails, cutting infrastructure cost 28% and improving resilience RTO to 2 hours." },
    { code: "PRJ-CRM-006", name: "CRM Consolidation", programId: prg3.id, ownerId: pm2.id, managerId: pm2.id, status: "DRAFT", phase: "INITIATION", priority: "MEDIUM", risk: "LOW", start: 30, end: 420, budget: 750_000, baselineBudget: 720_000, rag: "GREEN", charter: "Consolidate five regional CRM systems into one governed platform serving sales, service and partner channels." },
  ];
  const projects: { spec: ProjSpec; p: any }[] = [];
  for (const s of specs) {
    const p = await db.project.create({
      data: {
        code: s.code, name: s.name, description: s.charter, programId: s.programId,
        portfolioId: (s.programId === prg3.id ? ptf2.id : ptf1.id),
        ownerId: s.ownerId, managerId: s.managerId, sponsorId: ceo.id,
        status: s.status, phase: s.phase, priority: s.priority, riskLevel: s.risk,
        methodology: s.code === "PRJ-MOB-004" ? "AGILE" : s.code === "PRJ-ERP-001" ? "HYBRID" : "WATERFALL",
        startDate: d(s.start), endDate: d(s.end), baselineStart: d(s.start), baselineFinish: d(s.end),
        baselineBudget: s.baselineBudget, currentBudget: s.budget,
        charter: s.charter,
        objectives: "1. Deliver agreed scope on baseline schedule.\n2. Hold EAC within approved budget.\n3. Achieve adoption and benefit KPIs defined in the business case.",
        successCriteria: "On-time go-live, CPI ≥ 0.95, SPI ≥ 0.95, zero open critical risks at gate approval.",
        statusDate: now, healthScore: 100, ragStatus: "GREEN",
      },
    });
    projects.push({ spec: s, p });
  }
  console.log("  ✓ 6 projects registered");

  // ---------- 5) WBS + Requirements + Tasks + Dependencies + Milestones ----------
  const blended = { ERP: 120, DATA: 132, PORT: 105, MOB: 110, CLD: 98, CRM: 92 };

  interface LeafPlan { name: string; offset: number; dur: number; hours: number; progress: number }
  const phasePlans: Record<string, { phase: string; leaves: LeafPlan[] }[]> = {
    ERP: [
      { phase: "1. Discovery & Design", leaves: [
        { name: "Process harmonization workshops", offset: -280, dur: 30, hours: 480, progress: 100 },
        { name: "Solution architecture blueprint", offset: -250, dur: 35, hours: 560, progress: 100 },
        { name: "Data migration strategy", offset: -240, dur: 25, hours: 320, progress: 100 } ] },
      { phase: "2. Build & Configure", leaves: [
        { name: "Finance module configuration", offset: -190, dur: 70, hours: 900, progress: 78 },
        { name: "Supply chain module configuration", offset: -175, dur: 75, hours: 860, progress: 64 },
        { name: "Integrations build (12 interfaces)", offset: -150, dur: 90, hours: 760, progress: 45 } ] },
      { phase: "3. Test & Deploy", leaves: [
        { name: "System & integration testing", offset: -60, dur: 60, hours: 640, progress: 12 },
        { name: "Data migration execution", offset: 40, dur: 45, hours: 420, progress: 0 },
        { name: "Cutover & hypercare", offset: 170, dur: 40, hours: 380, progress: 0 } ] },
    ],
    DATA: [
      { phase: "1. Foundation", leaves: [
        { name: "Lakehouse landing zone", offset: -220, dur: 40, hours: 520, progress: 100 },
        { name: "Security & governance framework", offset: -200, dur: 40, hours: 460, progress: 95 } ] },
      { phase: "2. Core Domains", leaves: [
        { name: "Customer domain pipeline", offset: -150, dur: 60, hours: 700, progress: 52 },
        { name: "Finance domain pipeline", offset: -130, dur: 65, hours: 680, progress: 30 },
        { name: "Semantic layer & metrics store", offset: -80, dur: 70, hours: 640, progress: 14 } ] },
      { phase: "3. Enablement", leaves: [
        { name: "BI workspaces & catalog", offset: 10, dur: 55, hours: 480, progress: 0 },
        { name: "Data literacy program", offset: 60, dur: 50, hours: 260, progress: 0 } ] },
    ],
    PORT: [
      { phase: "1. Design", leaves: [
        { name: "Experience design system", offset: -240, dur: 35, hours: 380, progress: 100 },
        { name: "Service blueprint & journeys", offset: -230, dur: 30, hours: 300, progress: 100 } ] },
      { phase: "2. Build", leaves: [
        { name: "SSO & identity integration", offset: -190, dur: 45, hours: 420, progress: 100 },
        { name: "Case management module", offset: -165, dur: 60, hours: 560, progress: 100 },
        { name: "Billing self-service module", offset: -130, dur: 60, hours: 520, progress: 92 } ] },
      { phase: "3. Test & Launch", leaves: [
        { name: "UAT & accessibility audit", offset: -30, dur: 40, hours: 380, progress: 68 },
        { name: "Go-live & hypercare", offset: 40, dur: 30, hours: 240, progress: 0 } ] },
    ],
    MOB: [
      { phase: "1. Foundations", leaves: [
        { name: "Security architecture & biometrics", offset: -180, dur: 40, hours: 460, progress: 100 },
        { name: "Core banking API gateway", offset: -160, dur: 45, hours: 520, progress: 96 } ] },
      { phase: "2. Features", leaves: [
        { name: "Payments & transfers", offset: -110, dur: 55, hours: 640, progress: 74 },
        { name: "Personal finance insights", offset: -80, dur: 55, hours: 480, progress: 48 },
        { name: "Onboarding & KYC flow", offset: -60, dur: 50, hours: 440, progress: 35 } ] },
      { phase: "3. Release", leaves: [
        { name: "Performance & pen test", offset: 30, dur: 40, hours: 360, progress: 0 },
        { name: "Store release & rollout", offset: 110, dur: 30, hours: 220, progress: 0 } ] },
    ],
    CLD: [
      { phase: "1. Landing Zones", leaves: [
        { name: "Landing zone & guardrails", offset: -150, dur: 35, hours: 420, progress: 100 },
        { name: "Network & connectivity", offset: -135, dur: 30, hours: 340, progress: 100 } ] },
      { phase: "2. Migration Waves", leaves: [
        { name: "Wave 1 — Low risk (110 VMs)", offset: -95, dur: 50, hours: 560, progress: 90 },
        { name: "Wave 2 — Core apps (120 VMs)", offset: -45, dur: 60, hours: 640, progress: 55 },
        { name: "Wave 3 — Regulated (80 VMs)", offset: 60, dur: 65, hours: 600, progress: 8 } ] },
      { phase: "3. Optimize", leaves: [
        { name: "FinOps optimization", offset: 170, dur: 45, hours: 300, progress: 0 },
        { name: "DR & resilience validation", offset: 210, dur: 35, hours: 260, progress: 0 } ] },
    ],
    CRM: [
      { phase: "1. Mobilize", leaves: [
        { name: "Current-state assessment", offset: 30, dur: 30, hours: 240, progress: 0 },
        { name: "Target operating model", offset: 70, dur: 35, hours: 280, progress: 0 } ] },
      { phase: "2. Implement", leaves: [
        { name: "Platform configuration", offset: 120, dur: 80, hours: 640, progress: 0 },
        { name: "Data consolidation & dedupe", offset: 150, dur: 70, hours: 520, progress: 0 },
        { name: "Channel integrations", offset: 200, dur: 60, hours: 420, progress: 0 } ] },
      { phase: "3. Adopt", leaves: [
        { name: "Sales & service enablement", offset: 300, dur: 45, hours: 320, progress: 0 },
        { name: "Hypercare & closure", offset: 360, dur: 30, hours: 200, progress: 0 } ] },
    ],
  };

  const projectIds: Record<string, string> = {};
  const tasksByProject: Record<string, { id: string; name: string; plannedHours: number; plannedCost: number }[]> = {};
  const progressByTask: Record<string, number> = {};

  for (const { spec, p } of projects) {
    projectIds[spec.code] = p.id;
    const key = spec.code.split("-")[1];
    const rate = blended[key as keyof typeof blended] || 100;
    const plan = phasePlans[key as keyof typeof phasePlans] || [];
    tasksByProject[p.id] = [];
    let wbsIdx = 0;

    // Requirements (a few per project)
    const reqDefs = [
      { title: "Single sign-on across channels", type: "FUNCTIONAL", priority: "HIGH" },
      { title: "Audit logging & traceability", type: "NON_FUNCTIONAL", priority: "HIGH" },
      { title: "Response time under 2s (P95)", type: "NON_FUNCTIONAL", priority: "MEDIUM" },
      { title: "Regulatory reporting pack", type: "BUSINESS", priority: "MEDIUM" },
    ];
    for (let i = 0; i < reqDefs.length; i++) {
      const r = reqDefs[i];
      await db.requirement.create({
        data: { projectId: p.id, reqCode: `${spec.code}-REQ-${String(i + 1).padStart(3, "0")}`, title: r.title, description: `${r.title} as committed in the business case and solution baseline.`, reqType: r.type, priority: r.priority, status: spec.phase === "INITIATION" ? "DRAFT" : "BASELINED", source: "Business case v2.1", ownerName: "Marcus Webb", effortEstimate: 40 + i * 20 },
      });
    }

    for (const phase of plan) {
      wbsIdx += 1;
      const summary = await db.wBSNode.create({
        data: { projectId: p.id, code: `${wbsIdx}`, name: phase.phase, nodeType: "SUMMARY", level: 1, orderIndex: wbsIdx, ownerName: "Sarah Okafor" },
      });
      let leafIdx = 0;
      let prevTaskId: string | null = null;
      for (const leaf of phase.leaves) {
        leafIdx += 1;
        const wbs = await db.wBSNode.create({
          data: { projectId: p.id, parentId: summary.id, code: `${wbsIdx}.${leafIdx}`, name: leaf.name, nodeType: "WORK_PACKAGE", level: 2, orderIndex: leafIdx, plannedHours: leaf.hours, plannedCost: round2(leaf.hours * rate), progress: leaf.progress },
        });
        // Split each work package into 2 executable tasks (halve hours)
        for (let half = 1; half <= 2; half++) {
          const hours = round2(leaf.hours / 2);
          const start = d(leaf.offset + (half - 1) * Math.floor(leaf.dur / 2));
          const task = await db.task.create({
            data: {
              projectId: p.id, wbsId: wbs.id, code: `T-${wbs.code}-${half}`,
              name: `${leaf.name}${half === 1 ? "" : " (cont.)"}`,
              status: leaf.progress >= 100 ? "COMPLETED" : leaf.progress > 0 ? "IN_PROGRESS" : "NOT_STARTED",
              priority: leaf.progress > 0 ? "HIGH" : "MEDIUM",
              criticality: key === "DATA" ? "HIGH" : "MEDIUM",
              startDate: start, endDate: d(leaf.offset + (half - 1) * Math.floor(leaf.dur / 2) + Math.ceil(leaf.dur / 2)),
              durationDays: Math.ceil(leaf.dur / 2),
              progress: leaf.progress, plannedHours: hours, plannedCost: round2(hours * rate),
              remainingHours: round2(Math.max(0, hours * (1 - leaf.progress / 100))),
            },
          });
          tasksByProject[p.id].push({ id: task.id, name: task.name, plannedHours: hours, plannedCost: round2(hours * rate) });
          progressByTask[task.id] = leaf.progress;
        }
        // FS dependency inside phase; SS+lag across phase boundaries
        if (prevTaskId) {
          await db.dependency.create({ data: { projectId: p.id, predecessorId: prevTaskId, successorId: tasksByProject[p.id].slice(-2)[0].id, depType: "FS", lagDays: 0 } });
        }
        prevTaskId = tasksByProject[p.id].slice(-1)[0].id;
      }
      // cross-phase SS dependency with lag
      if (wbsIdx > 1) {
        const prevPhaseFirst = tasksByProject[p.id].slice(-(phase.leaves.length * 2 + 2))[0];
        const thisFirst = tasksByProject[p.id].slice(-(phase.leaves.length * 2))[0];
        if (prevPhaseFirst && thisFirst && prevPhaseFirst.id !== thisFirst.id) {
          await db.dependency.create({ data: { projectId: p.id, predecessorId: prevPhaseFirst.id, successorId: thisFirst.id, depType: "SS", lagDays: 5 } });
        }
      }
    }

    // Milestones
    const msDefs = [
      { name: "Project kickoff", off: spec.start + 5, status: "COMPLETED", crit: false },
      { name: "Design baseline approved", off: Math.round((spec.end + spec.start) / 2 - 90), status: spec.phase === "INITIATION" ? "PENDING" : "COMPLETED", crit: true },
      { name: "System testing complete", off: spec.end - 70, status: spec.phase === "TESTING" ? "IN_PROGRESS" : "PENDING", crit: true },
      { name: "Go-live", off: spec.end - 10, status: "PENDING", crit: true },
      { name: "Project closure", off: spec.end, status: "PENDING", crit: false },
    ];
    for (let i = 0; i < msDefs.length; i++) {
      const m = msDefs[i];
      const due = d(m.off);
      await db.milestone.create({
        data: { projectId: p.id, code: `${spec.code}-MS-${i + 1}`, name: m.name, description: `Governance checkpoint: ${m.name}.`, dueDate: due, baselineDate: due, status: m.status, isCritical: m.crit },
      });
    }

    // Stage gates
    const gateDefs = [
      { seq: 1, name: "Gate 0 — Investment Approval", decision: "PASSED", dd: -60 },
      { seq: 2, name: "Gate 1 — Design Readiness", decision: spec.phase === "INITIATION" ? "PENDING" : "PASSED", dd: -30 },
      { seq: 3, name: "Gate 2 — Deployment Readiness", decision: "PENDING", dd: null },
      { seq: 4, name: "Gate 3 — Benefits Realization", decision: "PENDING", dd: null },
    ];
    for (const g of gateDefs) {
      await db.stageGate.create({
        data: { projectId: p.id, code: `${spec.code}-G${g.seq}`, sequence: g.seq, name: g.name, description: `Stage gate controlling progression: ${g.name}.`, criteria: "Baseline current; EVM within thresholds; critical risks mitigated; benefits confirmed.", plannedDate: g.dd ? d(g.dd) : null, decisionStatus: g.decision, decisionDate: g.decision === "PASSED" ? d((g.dd ?? 0) + 1) : null, approverId: ceo.id, approverName: "Alexandra Chen", evidence: g.decision === "PASSED" ? "Gate pack v1.2 — approved by steering committee." : null },
      });
    }

    // Budget lines
    const laborPlanned = plan.reduce((s, ph) => s + ph.leaves.reduce((x, l) => x + l.hours, 0), 0) * rate;
    const lines = [
      { category: "LABOR", name: "Internal delivery team", baseline: round2(laborPlanned), current: round2(laborPlanned * 1.03), actual: 0 },
      { category: "SOFTWARE", name: "Platform licences", baseline: round2(spec.baselineBudget * 0.18), current: round2(spec.budget * 0.18), actual: round2(spec.budget * 0.16) },
      { category: "SERVICES", name: "Implementation partner", baseline: round2(spec.baselineBudget * 0.22), current: round2(spec.budget * 0.24), actual: round2(spec.budget * (key === "DATA" ? 0.26 : 0.2)) },
      { category: "CONTINGENCY", name: "Management reserve", baseline: round2(spec.baselineBudget * 0.08), current: round2(spec.budget * 0.07), actual: 0 },
    ];
    for (const l of lines) {
      await db.budgetLine.create({
        data: { projectId: p.id, category: l.category, name: l.name, baselineAmount: l.baseline, currentAmount: l.current, actualAmount: l.actual, forecastAmount: round2(l.current * (key === "DATA" ? 1.12 : 1.02)) },
      });
    }

    // Baseline v1 active
    await db.baseline.create({
      data: { projectId: p.id, version: 1, name: "Baseline v1.0 — Approved", description: "Initial performance baseline approved at Gate 0.", status: "ACTIVE", baselineStart: d(spec.start), baselineFinish: d(spec.end), baselineHours: plan.reduce((s, ph) => s + ph.leaves.reduce((x, l) => x + l.hours, 0), 0), baselineCost: spec.baselineBudget, createdBy: pm1.id, activatedAt: d(spec.start + 8), snapshotJson: JSON.stringify({ budget: spec.baselineBudget, start: spec.start, end: spec.end }) },
    });
    if (key === "ERP") {
      await db.baseline.create({
        data: { projectId: p.id, version: 2, name: "Baseline v1.1 — Scope addendum", description: "Superseded: added two additional interfaces approved via CR-001.", status: "SUPERSEDED", baselineStart: d(spec.start), baselineFinish: d(spec.end + 15), baselineHours: plan.reduce((s, ph) => s + ph.leaves.reduce((x, l) => x + l.hours, 0), 0) + 120, baselineCost: spec.budget, createdBy: pm1.id, activatedAt: d(-90) },
      });
    }

    // Deliverables
    const delDefs = [
      { name: "Solution architecture document", status: "ACCEPTED" },
      { name: "Test completion report", status: spec.phase === "TESTING" ? "IN_REVIEW" : "NOT_STARTED" },
      { name: "Cutover runbook", status: "DRAFT" },
    ];
    for (let i = 0; i < delDefs.length; i++) {
      const dl = delDefs[i];
      await db.deliverable.create({
        data: { projectId: p.id, code: `${spec.code}-DEL-${i + 1}`, name: dl.name, description: `${dl.name} governed under quality plan QP-04.`, deliverableType: "DOCUMENT", status: dl.status, ownerName: "Sarah Okafor", dueDate: d(spec.end - 100 + i * 60), acceptanceCriteria: "Reviewed and approved by quality board with zero critical findings.", qualityStatus: dl.status === "ACCEPTED" ? "PASS" : "PENDING" },
      });
    }
  }

  // Dependencies between phases already added; add one FF + lag sample on ERP
  const erpTasks = tasksByProject[projectIds["PRJ-ERP-001"]];
  if (erpTasks.length >= 4) {
    await db.dependency.create({ data: { projectId: projectIds["PRJ-ERP-001"], predecessorId: erpTasks[1].id, successorId: erpTasks[3].id, depType: "FF", lagDays: 3 } });
  }
  console.log("  ✓ WBS, requirements, tasks, dependencies, milestones, gates, baselines, budget lines");

  await seedPart2({ db, roles, users: { ceo, pmo, pfmg, prgm, pm1, pm2, fin, auditor, t1, t2, t3, t4 }, projects, projectIds, tasksByProject, blended, progressByTask });

  console.log("\n◈ PM Control Tower seed complete.");
  console.log("  Logins (sandbox): ceo@pmct.io | pmo@pmct.io | pm.sarah@pmct.io | team: liam@pmct.io — password Pmct@2026");
  await db.$disconnect();
}

// Part 2 appended below
import { seedPart2 } from "./seed-part2";

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
