// PM CONTROL TOWER — Leadership reporting demo data (idempotent)
// Adds: leadership decisions (required-by dates, owners, impacts), action register
// items, strategic KPIs. Run: bun scripts/seed-leadership.ts

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const d = (offset: number) => new Date(Date.now() + offset * 86_400_000);

async function main() {
  const projects = await db.project.findMany({ select: { id: true, code: true } });
  const byCode = new Map(projects.map((p) => [p.code, p.id]));
  const pid = (code: string) => byCode.get(code) ?? null;

  // ---------- Leadership decisions ----------
  const decisions = [
    { code: "DEC-101", project: "PRJ-ERP-001", title: "Approve vendor contract amendment for extended integration scope", description: "Vendor priced the additional 4 interfaces at 128,000; commercial review recommends negotiating cap at 96,000 with phased acceptance.", decisionOwner: "CEO", requiredBy: d(-3), businessImpact: "Vendor mobilization window closes — a further 3-week slip and 8% price escalation if missed.", projectImpact: "Blocks integration test phase and Gate 3 entry.", recommendedDecision: "Approve capped amendment with phased acceptance milestones.", priority: "CRITICAL", decided: null as string | null },
    { code: "DEC-102", project: "PRJ-DATA-002", title: "Authorize wave-2 rollout despite outstanding reconciliation defects", description: "3 moderate reconciliation defects remain. Business wants the wave; finance wants a fix-first approach.", decisionOwner: "CFO", requiredBy: d(4), businessImpact: "Month-end close automation delayed one cycle; manual workaround costs ~30 hrs/week.", projectImpact: "Determines whether wave-2 milestones hold or move 2+ weeks.", recommendedDecision: "Conditional go with daily reconciliation checks and 10-day hardening window.", priority: "HIGH", decided: null },
    { code: "DEC-103", project: "PRJ-PORT-003", title: "Approve accessibility remediation scope (WCAG 2.2 AA)", description: "Independent audit found 3 moderate findings; remediation requires 120 hrs of front-end work.", decisionOwner: "COO", requiredBy: d(11), businessImpact: "Regulatory compliance commitment date is at risk without approval this cycle.", projectImpact: "Adds 120 hrs scope; go-live date may move 5 days.", recommendedDecision: "Approve remediation sprint before go-live.", priority: "MEDIUM", decided: null },
    { code: "DEC-104", project: "PRJ-ERP-001", title: "Confirm baseline v1.2 re-plan after vendor amendment", description: "Re-baseline incorporates the integration scope and 15-day allowance.", decisionOwner: "Steering Committee", requiredBy: d(-30), businessImpact: "Baseline governance suspended without confirmation.", projectImpact: "All variance reporting anchored to the confirmed baseline.", recommendedDecision: "Confirm baseline v1.2.", priority: "HIGH", decided: "APPROVED — baseline v1.2 confirmed with 15-day allowance.", },
  ];
  for (const x of decisions) {
    const exists = await db.decision.findFirst({ where: { code: x.code } });
    if (exists) continue;
    await db.decision.create({
      data: {
        projectId: pid(x.project), code: x.code, title: x.title, description: x.description,
        decision: x.decided, decidedBy: x.decided ? "Alexandra Chen" : null,
        decisionDate: x.decided ? d(-28) : d(-10),
        decisionOwner: x.decisionOwner, raisedAt: d(-10), requiredBy: x.requiredBy,
        businessImpact: x.businessImpact, projectImpact: x.projectImpact,
        recommendedDecision: x.recommendedDecision, priority: x.priority,
        status: x.decided ? "COMPLETED" : "ACTIVE",
      },
    });
  }

  // ---------- Action register ----------
  const actions = [
    { code: "ACT-101", project: "PRJ-ERP-001", title: "Provide updated benefits case for ERP program", owner: "Sarah Chen", due: d(-6), priority: "HIGH", relatedType: "DECISION", relatedCode: "DEC-101", status: "OPEN" },
    { code: "ACT-102", project: "PRJ-DATA-002", title: "Circulate reconciliation defect fix plan to finance stakeholders", owner: "Mia Tanaka", due: d(2), priority: "HIGH", relatedType: "ISSUE", relatedCode: "ISS-014", status: "IN_PROGRESS" },
    { code: "ACT-103", project: "PRJ-PORT-003", title: "Obtain legal sign-off on accessibility remediation approach", owner: "Ava Martinez", due: d(8), priority: "MEDIUM", relatedType: "RISK", relatedCode: "RSK-021", status: "OPEN" },
    { code: "ACT-104", project: null, title: "Publish quarterly portfolio performance pack to the board", owner: "Jordan Blake", due: d(14), priority: "MEDIUM", relatedType: null, relatedCode: null, status: "OPEN" },
    { code: "ACT-105", project: "PRJ-ERP-001", title: "Escalate data-migration resource conflict to sponsors", owner: "Sarah Chen", due: d(-15), priority: "CRITICAL", relatedType: "RISK", relatedCode: "RSK-008", status: "DONE" },
  ];
  for (const x of actions) {
    const exists = await db.actionItem.findUnique({ where: { code: x.code } });
    if (exists) continue;
    await db.actionItem.create({
      data: {
        projectId: x.project ? pid(x.project) : null, code: x.code, title: x.title,
        description: "Raised from the leadership reporting cycle.", ownerName: x.owner,
        priority: x.priority, status: x.status, source: "LEADERSHIP",
        relatedType: x.relatedType, relatedCode: x.relatedCode,
        escalationLevel: x.priority === "CRITICAL" ? "LEADERSHIP" : "NONE",
        raisedAt: d(-9), dueDate: x.due,
        completedAt: x.status === "DONE" ? d(-14) : null,
        raisedByName: "Jordan Blake",
      },
    });
  }

  // ---------- Strategic KPIs ----------
  const kpis = [
    { code: "KPI-001", project: "PRJ-ERP-001", name: "Finance close cycle time", category: "BENEFIT", unit: "days", target: 5, current: 8, expected: "Monthly close reduced from 10 to 5 working days.", status: "ON_TRACK" },
    { code: "KPI-002", project: "PRJ-ERP-001", name: "Manual journal entries eliminated", category: "KPI", unit: "%", target: 80, current: 46, expected: "80% of manual journals automated by go-live +60d.", status: "ON_TRACK" },
    { code: "KPI-003", project: "PRJ-DATA-002", name: "Reconciliation accuracy", category: "KPI", unit: "%", target: 99.5, current: 97.2, expected: "Automated reconciliation within tolerance on 18 scenarios.", status: "AT_RISK" },
    { code: "KPI-004", project: "PRJ-PORT-003", name: "Customer portal adoption", category: "BENEFIT", unit: "%", target: 60, current: 21, expected: "60% of customers self-serving within 6 months of launch.", status: "NOT_STARTED" },
    { code: "KPI-005", project: "PRJ-PORT-003", name: "Support call deflection", category: "BENEFIT", unit: "%", target: 35, current: 9, expected: "35% fewer support calls after portal launch.", status: "NOT_STARTED" },
  ];
  for (const x of kpis) {
    const exists = await db.projectKpi.findUnique({ where: { code: x.code } });
    if (exists) continue;
    await db.projectKpi.create({
      data: {
        projectId: pid(x.project), code: x.code, name: x.name, category: x.category,
        unit: x.unit, targetValue: x.target, currentValue: x.current,
        expectedBenefit: x.expected, status: x.status, measurementDate: d(-2),
      },
    });
  }

  const decCount = await db.decision.count();
  const actCount = await db.actionItem.count();
  const kpiCount = await db.projectKpi.count();
  console.log(`✓ Leadership data ready — ${decCount} decisions, ${actCount} actions, ${kpiCount} KPIs`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
