// PM CONTROL TOWER — Seed Part 2: resources, timesheet cascade, financial calibration,
// RAID, governance, connect & admin domains, EVM history, final engine pass.

import { startOfWeek, addDays, toJson } from "../src/lib/constants";
import { submitTimesheet, approveTimesheet } from "../src/lib/engines/timesheet";
import { rescheduleProject } from "../src/lib/engines/rollup";
import { recalcProjectHealth } from "../src/lib/engines/health";
import { evaluateGovernance } from "../src/lib/engines/governance";
import { runAutomations } from "../src/lib/engines/automations";
import { computeEVM } from "../src/lib/engines/evm";

const DAY = 86_400_000;
const now = new Date();
now.setUTCHours(9, 0, 0, 0);
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * DAY);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface Args {
  db: any;
  roles: Record<string, { id: string }>;
  users: Record<string, { id: string; name: string }>;
  projects: { spec: any; p: { id: string; code: string } }[];
  projectIds: Record<string, string>;
  tasksByProject: Record<string, { id: string; name: string; plannedHours: number; plannedCost: number }[]>;
  blended: Record<string, number>;
  progressByTask: Record<string, number>;
}

export async function seedPart2({ db, roles, users, projects, projectIds, tasksByProject, blended, progressByTask }: Args) {
  const { ceo, pmo, pfmg, prgm, pm1, pm2, fin, auditor, t1, t2, t3, t4 } = users;

  // ---------- 6) Resources & assignments ----------
  const resDefs = [
    { code: "EMP-001", name: "Liam Foster", email: "liam@pmct.io", title: "Technical Lead", dept: "Engineering", type: "EMPLOYEE", seniority: "SENIOR", skill: "TypeScript, Node.js, Cloud", rate: 110, bill: 155, cap: 40, userId: t1.id, loc: "Singapore" },
    { code: "EMP-002", name: "Ava Martinez", email: "ava@pmct.io", title: "Senior Engineer", dept: "Engineering", type: "EMPLOYEE", seniority: "SENIOR", skill: "Data Engineering, Python, Spark", rate: 132, bill: 180, cap: 40, userId: t2.id, loc: "Singapore" },
    { code: "EMP-003", name: "Noah Andersen", email: "noah@pmct.io", title: "Business Analyst", dept: "Business Change", type: "EMPLOYEE", seniority: "MID", skill: "Requirements, Process Mapping", rate: 95, bill: 130, cap: 40, userId: t3.id, loc: "London" },
    { code: "EMP-004", name: "Mia Tanaka", email: "mia@pmct.io", title: "QA Lead", dept: "Quality Engineering", type: "EMPLOYEE", seniority: "SENIOR", skill: "Test Automation, Performance", rate: 100, bill: 140, cap: 40, userId: t4.id, loc: "Tokyo" },
    { code: "EMP-005", name: "Omar Haddad", email: "omar.haddad@pmct.io", title: "Solution Architect", dept: "Architecture", type: "EMPLOYEE", seniority: "PRINCIPAL", skill: "ERP, Integration, Architecture", rate: 150, bill: 200, cap: 40, userId: null, loc: "Dubai" },
    { code: "EMP-006", name: "Grace Park", email: "grace.park@pmct.io", title: "Change Manager", dept: "Business Change", type: "EMPLOYEE", seniority: "SENIOR", skill: "OCM, Training, Adoption", rate: 90, bill: 125, cap: 40, userId: null, loc: "Singapore" },
    { code: "CON-001", name: "Samuel Osei", email: "s.osei@partnerco.example", title: "Data Engineer", dept: "Partner", type: "CONTRACTOR", seniority: "MID", skill: "Lakehouse, dbt, Airflow", rate: 125, bill: 170, cap: 40, userId: null, loc: "Remote" },
    { code: "EMP-007", name: "Lena Fischer", email: "lena.fischer@pmct.io", title: "Security Lead", dept: "Security", type: "EMPLOYEE", seniority: "PRINCIPAL", skill: "IAM, Security Architecture", rate: 140, bill: 190, cap: 40, userId: null, loc: "Frankfurt" },
    { code: "EMP-008", name: "Raj Patel", email: "raj.patel@pmct.io", title: "Infrastructure Engineer", dept: "Infrastructure", type: "EMPLOYEE", seniority: "MID", skill: "Cloud, Networks, IaC", rate: 105, bill: 145, cap: 40, userId: null, loc: "Singapore" },
    { code: "EMP-009", name: "Sofia Rossi", email: "sofia.rossi@pmct.io", title: "Training Lead", dept: "Business Change", type: "EMPLOYEE", seniority: "MID", skill: "Enablement, Curriculum", rate: 80, bill: 110, cap: 40, userId: null, loc: "Milan" },
    { code: "EMP-010", name: "Jordan Blake", email: "pmo@pmct.io", title: "Head of PMO", dept: "PMO", type: "EMPLOYEE", seniority: "PRINCIPAL", skill: "Portfolio Governance, PPM, EVM", rate: 130, bill: 165, cap: 40, userId: pmo.id, loc: "Singapore" },
    { code: "EMP-011", name: "Sarah Okafor", email: "pm.sarah@pmct.io", title: "Senior Project Manager", dept: "Delivery", type: "EMPLOYEE", seniority: "PRINCIPAL", skill: "ERP, Program Delivery, Vendor Management", rate: 135, bill: 175, cap: 40, userId: pm1.id, loc: "London" },
    { code: "EMP-012", name: "David Kim", email: "pm.david@pmct.io", title: "Project Manager", dept: "Delivery", type: "EMPLOYEE", seniority: "SENIOR", skill: "Data Platforms, Agile Delivery", rate: 125, bill: 170, cap: 40, userId: pm2.id, loc: "Singapore" },
  ];
  const resources: any[] = [];
  for (const r of resDefs) {
    resources.push(await db.resource.create({
      data: { employeeCode: r.code, name: r.name, email: r.email, title: r.title, department: r.dept, resourceType: r.type, seniority: r.seniority, primarySkill: r.skill.split(",")[0], skills: r.skill, capacityHoursPerWeek: r.cap, costRate: r.rate, billableRate: r.bill, location: r.loc, userId: r.userId },
    }));
  }
  const byName = (n: string) => resources.find((r) => r.name.startsWith(n))!;
  const primary: Record<string, string> = { "PRJ-ERP-001": "Liam", "PRJ-DATA-002": "Ava", "PRJ-PORT-003": "Noah", "PRJ-MOB-004": "Mia", "PRJ-CLD-005": "Raj", "PRJ-CRM-006": "Grace" };
  const extra: Record<string, string[]> = {
    "PRJ-ERP-001": ["Omar", "Grace"], "PRJ-DATA-002": ["Samuel", "Lena"], "PRJ-PORT-003": ["Sofia"],
    "PRJ-MOB-004": ["Lena"], "PRJ-CLD-005": ["Liam", "Ava"], "PRJ-CRM-006": ["Noah"],
  };
  for (const { spec, p } of projects) {
    const planHours = tasksByProject[p.id].reduce((s, t) => s + t.plannedHours, 0);
    const names = [primary[spec.code], ...(extra[spec.code] || [])];
    for (const n of names) {
      const r = byName(n);
      const share = names.length === 1 ? 1 : n === primary[spec.code] ? 0.5 : 0.5 / (names.length - 1);
      await db.assignment.create({
        data: { projectId: p.id, resourceId: r.id, role: r.title, allocationPercent: spec.status === "DRAFT" ? 25 : Math.round(share * 100), plannedHours: round2(planHours * share), startDate: spec.start < 0 ? d(spec.start) : d(spec.start), endDate: d(spec.end), status: "ACTIVE", billable: r.resourceType !== "EMPLOYEE" },
      });
    }
  }
  console.log("  ✓ 13 resources, 14 assignments");

  // ---------- 7) Governance rules & automations (BEFORE timesheet cascade) ----------
  await db.governanceRule.create({ data: { name: "Cost performance below 0.95", description: "CPI below 0.95 signals cost efficiency erosion.", metric: "CPI", operator: "LT", threshold: 0.95, severity: "WARNING", createdBy: pmo.id } });
  await db.governanceRule.create({ data: { name: "Schedule performance critical", description: "SPI below 0.85 signals material schedule slippage.", metric: "SPI", operator: "LT", threshold: 0.85, severity: "CRITICAL", createdBy: pmo.id } });
  await db.governanceRule.create({ data: { name: "Budget utilization above 90%", description: "Actual spend beyond 90% of current budget.", metric: "BUDGET_UTILIZATION", operator: "GT", threshold: 90, severity: "WARNING", createdBy: fin.id } });
  await db.governanceRule.create({ data: { name: "Health score below 60", description: "Project health red territory — executive attention required.", metric: "HEALTH_SCORE", operator: "LT", threshold: 60, severity: "CRITICAL", createdBy: pmo.id } });
  await db.governanceRule.create({ data: { name: "Schedule variance over 15 days", description: "Forecast finish beyond baseline by more than 15 working days.", metric: "SCHEDULE_VARIANCE_DAYS", operator: "GT", threshold: 15, severity: "WARNING", createdBy: prgm.id } });

  const ar1 = await db.automationRule.create({
    data: {
      name: "Overdue critical task escalation", description: "WHEN task becomes overdue IF criticality is HIGH THEN raise inbox item, notify PM, recalc health, evaluate governance, check schedule.",
      triggerType: "TASK_OVERDUE", isActive: true, createdBy: pmo.id,
      conditionsJson: toJson([{ field: "criticality", op: "EQ", value: "HIGH" }]),
      actionsJson: toJson([{ type: "CREATE_INBOX_ITEM", params: { category: "ACTION_REQUIRED", priority: "CRITICAL", title: "Critical task overdue", message: "A HIGH-criticality task has passed its finish date. Immediate action required." } }, { type: "NOTIFY_PM", params: { title: "Critical task overdue", severity: "WARNING" } }, { type: "RECALC_HEALTH" }, { type: "EVALUATE_GOVERNANCE" }, { type: "RECALC_CPM" }]),
    },
  });
  await db.automationRule.create({
    data: {
      name: "Timesheet approval cascade", description: "WHEN timesheet approved THEN refresh WBS roll-up, EVM context, forecast, health, governance and publish realtime updates.",
      triggerType: "TIMESHEET_APPROVED", isActive: true, createdBy: pmo.id,
      conditionsJson: toJson([]),
      actionsJson: toJson([{ type: "RECALC_HEALTH" }, { type: "EVALUATE_GOVERNANCE" }, { type: "NOTIFY_ROLE", params: { roles: ["PMO_ADMIN"], title: "Timesheet approved", message: "Actuals, EVM and health refreshed after timesheet approval." } }]),
    },
  });
  await db.automationRule.create({
    data: {
      name: "Critical risk escalation", description: "WHEN RAID item created IF severity is CRITICAL THEN escalate to PMO and executive inbox.",
      triggerType: "RAID_CREATED", isActive: true, createdBy: pmo.id,
      conditionsJson: toJson([{ field: "severity", op: "EQ", value: "CRITICAL" }]),
      actionsJson: toJson([{ type: "NOTIFY_ROLE", params: { roles: ["PMO_ADMIN", "EXECUTIVE"], title: "Critical risk escalated", severity: "CRITICAL" } }, { type: "CREATE_INBOX_ITEM", params: { category: "ESCALATIONS", priority: "CRITICAL" } }]),
    },
  });
  console.log("  ✓ 5 governance rules, 3 automation rules");

  // ---------- 8) Timesheets through the REAL workflow (submit → approve → cascade) ----------
  const tsPlan: { resName: string; user: { id: string; name: string }; projCode: string; weeks: { offset: number; status: string }[] }[] = [
    { resName: "Liam", user: t1, projCode: "PRJ-ERP-001", weeks: [{ offset: -14, status: "LOCKED" }, { offset: -7, status: "APPROVED" }, { offset: 0, status: "DRAFT" }] },
    { resName: "Ava", user: t2, projCode: "PRJ-DATA-002", weeks: [{ offset: -14, status: "LOCKED" }, { offset: -7, status: "APPROVED" }, { offset: 0, status: "SUBMITTED" }] },
    { resName: "Noah", user: t3, projCode: "PRJ-PORT-003", weeks: [{ offset: -14, status: "APPROVED" }, { offset: -7, status: "APPROVED" }, { offset: 0, status: "UNDER_REVIEW" }] },
    { resName: "Mia", user: t4, projCode: "PRJ-MOB-004", weeks: [{ offset: -14, status: "APPROVED" }, { offset: -7, status: "REJECTED" }, { offset: 0, status: "DRAFT" }] },
  ];
  const actorPmo = { id: pmo.id, name: pmo.name, role: "PMO_ADMIN" };
  for (const plan of tsPlan) {
    const resource = byName(plan.resName);
    const pid = projectIds[plan.projCode];
    for (const w of plan.weeks) {
      const ws = startOfWeek(d(w.offset));
      const ts = await db.timesheet.create({
        data: { resourceId: resource.id, userId: plan.user.id, weekStart: ws, weekEnd: addDays(ws, 6), status: "DRAFT", comments: w.status === "REJECTED" ? "Resubmission required — see reviewer notes." : null },
      });
      const projTasks = tasksByProject[pid].filter((t) => t.plannedHours > 0);
      const workstream = "Delivery";
      const wrap = (i: number) => ((i % projTasks.length) + projTasks.length) % projTasks.length;
      for (let day = 0; day < 5; day++) {
        const taskA = projTasks[wrap(day + w.offset + 14)];
        const taskB = projTasks[wrap(day + 2 + w.offset + 14)];
        const date = addDays(ws, day);
        const isOvertime = day === 3;
        await db.timesheetEntry.create({
          data: { timesheetId: ts.id, entryDate: date, projectId: pid, workstream, wbsId: null, taskId: taskA.id, activity: "Delivery work", startTime: "09:00", endTime: "13:00", breakMinutes: 0, hours: 4, regularHours: 4, billableHours: 4, nonBillableHours: 0, entryType: "WORK", billable: true, comments: null },
        });
        await db.timesheetEntry.create({
          data: { timesheetId: ts.id, entryDate: date, projectId: pid, workstream, taskId: taskB.id, activity: "Delivery work", startTime: "14:00", endTime: isOvertime ? "19:00" : "17:30", breakMinutes: 30, hours: isOvertime ? 5 : 3.5, regularHours: isOvertime ? 3 : 3.5, overtimeHours: isOvertime ? 2 : 0, billableHours: isOvertime ? 5 : 3.5, nonBillableHours: 0, entryType: "WORK", billable: true, comments: isOvertime ? "Overtime approved by PM" : null },
        });
      }
      if (w.status === "SUBMITTED" || w.status === "APPROVED" || w.status === "LOCKED") {
        await submitTimesheet(ts.id, { id: plan.user.id, name: plan.user.name, role: "TEAM_MEMBER" });
      }
      if (w.status === "APPROVED" || w.status === "LOCKED") {
        await approveTimesheet(ts.id, actorPmo, "Approved — within plan.", "10.20.0.11");
      }
      if (w.status === "LOCKED") {
        await db.timesheet.update({ where: { id: ts.id }, data: { status: "LOCKED", lockedAt: new Date() } });
      }
      if (w.status === "REJECTED") {
        await submitTimesheet(ts.id, { id: plan.user.id, name: plan.user.name, role: "TEAM_MEMBER" });
        await db.timesheet.update({ where: { id: ts.id }, data: { status: "REJECTED", rejectionReason: "Friday entries duplicate Thursday tasks — please correct and resubmit.", reviewedAt: new Date(), approverId: actorPmo.id } });
      }
      if (w.status === "UNDER_REVIEW") {
        await submitTimesheet(ts.id, { id: plan.user.id, name: plan.user.name, role: "TEAM_MEMBER" });
        await db.timesheet.update({ where: { id: ts.id }, data: { status: "UNDER_REVIEW", reviewedAt: new Date() } });
      }
    }
  }
  console.log("  ✓ 12 timesheets processed through the real approval cascade");

  // ---------- 9) EVM calibration to target CPI *and* SPI posture ----------
  // The timesheet cascade resets progress on touched tasks; restore planned progress,
  // then scale progress uniformly to hit the target SPI, then set AC for target CPI.
  const targets: Record<string, { cpi: number; spi: number }> = {
    "PRJ-ERP-001": { cpi: 0.92, spi: 0.95 }, "PRJ-DATA-002": { cpi: 0.85, spi: 0.8 },
    "PRJ-PORT-003": { cpi: 1.04, spi: 1.02 }, "PRJ-MOB-004": { cpi: 1.01, spi: 0.99 },
    "PRJ-CLD-005": { cpi: 0.93, spi: 0.9 }, "PRJ-CRM-006": { cpi: 1.0, spi: 1.0 },
  };
  for (const { spec, p } of projects) {
    const full = await db.project.findUnique({ where: { id: p.id }, include: { tasks: true, budgetLines: true } });
    if (!full || spec.status === "DRAFT") continue;
    const target = targets[spec.code];
    // Sequential earned-value fit: award EV along planned sequence until EV target = PV × SPI
    const probe = computeEVM(full.tasks, full.actualCost, full.currentBudget, full.statusDate || now);
    const evTarget = probe.pv * target.spi;
    const ordered = [...full.tasks].filter((t) => t.plannedCost > 0).sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
    let remaining = evTarget;
    for (const t of ordered) {
      let prog: number;
      if (remaining >= t.plannedCost - 0.01) { prog = 100; remaining -= t.plannedCost; }
      else if (remaining > 0) { prog = Math.min(100, round2((remaining / t.plannedCost) * 100)); remaining = 0; }
      else prog = 0;
      const status = prog >= 100 ? "COMPLETED" : prog > 0 ? "IN_PROGRESS" : t.status === "COMPLETED" ? "NOT_STARTED" : t.status;
      await db.task.update({ where: { id: t.id }, data: { progress: prog, status } });
      t.progress = prog;
    }
    // Exact CPI: AC = EV / CPI target
    const evm = computeEVM(full.tasks, full.actualCost, full.currentBudget, full.statusDate || now);
    const wantedAC = round2(evm.ev / target.cpi);
    await db.project.update({ where: { id: p.id }, data: { actualCost: wantedAC } });
    const delta = round2(wantedAC - full.actualCost);
    if (delta > 0) {
      const svc = full.budgetLines.find((b: any) => b.category === "SERVICES");
      if (svc) await db.budgetLine.update({ where: { id: svc.id }, data: { actualAmount: round2(svc.actualAmount + delta) } });
    }
  }
  console.log("  ✓ EVM calibrated: CPI 0.85–1.04, SPI 0.80–1.02 across portfolio");

  // ---------- 10) EVM history (3 prior periods) + forecasts ----------
  for (const { spec, p } of projects) {
    if (spec.status === "DRAFT") continue;
    const drift = spec.code === "PRJ-DATA-002" ? [-0.06, -0.03, 0] : spec.code === "PRJ-PORT-003" ? [0.03, 0.02, 0] : [0.02, 0.01, 0];
    for (let i = 0; i < 3; i++) {
      const base = targets[spec.code].cpi + drift[i];
      const cpi = round2(Math.max(0.6, base));
      const bac = spec.budget;
      const ev = round2(bac * (0.18 + i * 0.06));
      const ac = round2(ev / cpi);
      const pv = round2(bac * (0.2 + i * 0.07));
      await db.evmPeriod.create({
        data: { projectId: p.id, statusDate: d(-60 + i * 30), periodStart: d(-90 + i * 30), periodEnd: d(-60 + i * 30), bac, pv, ev, ac, cpi, spi: round2(cpi + (spec.code === "PRJ-DATA-002" ? -0.05 : 0.02)), eac: round2(bac / cpi), etc: round2(bac / cpi - ac), vac: round2(bac - bac / cpi), tcpi: round2(1 / cpi), costVariance: round2(ev - ac), scheduleVariance: round2(ev - pv), percentComplete: round2((ev / bac) * 100), source: "MONTHLY_CLOSE" },
      });
    }
    await db.projectForecast.create({
      data: { projectId: p.id, period: "2026-Q4", forecastCost: round2(spec.budget / targets[spec.code].cpi), forecastHours: round2(tasksByProject[p.id].reduce((s, t) => s + t.plannedHours, 0) * (spec.code === "PRJ-DATA-002" ? 1.18 : 1.05)), forecastFinishDate: d(spec.end + (spec.code === "PRJ-DATA-002" ? 45 : spec.code === "PRJ-ERP-001" ? 20 : 0)), confidence: spec.code === "PRJ-DATA-002" ? "LOW" : "MEDIUM", basis: "EVM (CPI-based)" },
    });
  }
  console.log("  ✓ EVM history (3 periods) + quarterly forecasts");

  // ---------- 11) RAID, changes, meetings, collaboration ----------
  const raid: [string, string, any[], any[], any[]][] = [
    ["PRJ-ERP-001", pm1.id, [
      { title: "Data quality in legacy finance module below migration threshold", cat: "TECHNICAL", prob: 4, imp: 5, sev: "CRITICAL", owner: "Omar Haddad", status: "MITIGATING" },
      { title: "Key finance users unavailable during UAT window", cat: "RESOURCE", prob: 3, imp: 4, sev: "HIGH", owner: "Grace Park", status: "OPEN" },
      { title: "Vendor interface delivery slipping one sprint behind", cat: "VENDOR", prob: 3, imp: 3, sev: "MEDIUM", owner: "Sarah Okafor", status: "OPEN" },
    ], [
      { title: "Interface 7 (banking) failing certification in partner sandbox", cat: "TECHNICAL", sev: "CRITICAL", prio: "CRITICAL", owner: "Omar Haddad" },
      { title: "Cutover rehearsal scheduling conflicts with quarter close", cat: "SCHEDULE", sev: "MEDIUM", prio: "HIGH", owner: "Sarah Okafor" },
    ], [
      { title: "Legacy charts of accounts remain stable through cutover", status: "VALID" },
    ]],
    ["PRJ-DATA-002", pm2.id, [
      { title: "Source system extraction performance degrades beyond 40% volume", cat: "TECHNICAL", prob: 4, imp: 5, sev: "CRITICAL", owner: "Samuel Osei", status: "ESCALATED" },
      { title: "Domain ownership not confirmed for two critical datasets", cat: "GOVERNANCE", prob: 4, imp: 4, sev: "CRITICAL", owner: "Marcus Webb", status: "OPEN" },
      { title: "Cloud spend overrun on experimental workloads", cat: "FINANCIAL", prob: 3, imp: 4, sev: "HIGH", owner: "Elena Rodriguez", status: "MITIGATING" },
    ], [
      { title: "Finance domain pipeline failing reconciliation on margin data", cat: "DATA", sev: "CRITICAL", prio: "CRITICAL", owner: "Ava Martinez" },
      { title: "Semantic layer rework needed after metric definition changes", cat: "SCOPE", sev: "HIGH", prio: "HIGH", owner: "Ava Martinez" },
      { title: "Test environment instability slowing verification", cat: "ENVIRONMENT", sev: "MEDIUM", prio: "MEDIUM", owner: "Raj Patel" },
    ], [
      { title: "Business units adopt central semantic layer without local shadow metrics", status: "AT_RISK" },
    ]],
    ["PRJ-PORT-003", pm1.id, [
      { title: "Third-party accessibility remediation capacity limited", cat: "RESOURCE", prob: 2, imp: 3, sev: "LOW", owner: "Noah Andersen", status: "OPEN" },
    ], [
      { title: "Minor defect cluster in billing self-service edge cases", cat: "TECHNICAL", sev: "LOW", prio: "MEDIUM", owner: "Noah Andersen" },
    ], [
      { title: "Contact-center deflection assumption holds at 35%", status: "VALID" },
    ]],
    ["PRJ-MOB-004", pm2.id, [
      { title: "App store review timeline uncertainty for biometric flows", cat: "EXTERNAL", prob: 2, imp: 3, sev: "MEDIUM", owner: "David Kim", status: "OPEN" },
    ], [], [
      { title: "Core banking API rate limits sufficient for launch volume", status: "VALID" },
    ]],
    ["PRJ-CLD-005", pm1.id, [
      { title: "Regulated workload approvals may extend wave 3 timeline", cat: "COMPLIANCE", prob: 3, imp: 4, sev: "HIGH", owner: "Lena Fischer", status: "MITIGATING" },
    ], [
      { title: "Two legacy apps incompatible with target runtime — replatform required", cat: "TECHNICAL", sev: "MEDIUM", prio: "HIGH", owner: "Raj Patel" },
    ], []],
    ["PRJ-CRM-006", pm2.id, [
      { title: "Regional data residency constraints shape platform topology", cat: "COMPLIANCE", prob: 2, imp: 4, sev: "MEDIUM", owner: "Marcus Webb", status: "OPEN" },
    ], [], []],
  ];
  let riskN = 0, issueN = 0, assumN = 0;
  for (const [code, , risks, issues, assumptions] of raid) {
    const pid = projectIds[code];
    for (const r of risks) {
      riskN += 1;
      await db.risk.create({
        data: { projectId: pid, code: `RSK-${String(riskN).padStart(3, "0")}`, title: r.title, description: `${r.title}. Probability ${r.prob}/5, impact ${r.imp}/5.`, category: r.cat, probability: r.prob, impact: r.imp, score: r.prob * r.imp, severity: r.sev, status: r.status, ownerName: r.owner, responseStrategy: r.sev === "CRITICAL" ? "MITIGATE" : "MONITOR", mitigation: "Mitigation plan tracked in RAID review; owner reports weekly.", dueDate: d(30), identifiedAt: d(-40), escalationLevel: r.status === "ESCALATED" ? "PROGRAM" : "NONE" },
      });
    }
    for (const i of issues) {
      issueN += 1;
      await db.issue.create({
        data: { projectId: pid, code: `ISS-${String(issueN).padStart(3, "0")}`, title: i.title, description: `${i.title}. Raised through quality monitoring.`, category: i.cat, priority: i.prio, severity: i.sev, status: "OPEN", ownerName: i.owner, raisedBy: "Quality review", impact: "Schedule and cost impact being assessed.", dueDate: d(14), raisedAt: d(-12) },
      });
    }
    for (const a of assumptions) {
      assumN += 1;
      await db.assumption.create({
        data: { projectId: pid, code: `ASM-${String(assumN).padStart(3, "0")}`, description: a.title, rationale: "Documented in the business case and baseline pack.", impactIfFalse: "Replan required; contingency reserve may be consumed.", status: a.status, ownerName: "Sarah Okafor", dueDate: d(45) },
      });
    }
    // Trigger critical-risk escalation automation for DATA project
    if (code === "PRJ-DATA-002") {
      await runAutomations("RAID_CREATED", { entityType: "Risk", entityId: "seed", projectId: pid, severity: "CRITICAL", criticality: "HIGH" });
    }
  }

  const crs = [
    { code: "PRJ-ERP-001", title: "Add two banking interfaces to integration scope", reason: "Regulatory change requires direct bank connectivity in three markets.", status: "APPROVED", hours: 120, cost: 96000, days: 15, risk: "MEDIUM", dec: "APPROVED" },
    { code: "PRJ-DATA-002", title: "Re-baseline finance domain to revised metric catalogue", reason: "Finance policy change invalidates original metric definitions.", status: "ASSESSMENT", hours: 240, cost: 168000, days: 30, risk: "HIGH", dec: null },
    { code: "PRJ-PORT-003", title: "Extend hypercare from 2 to 4 weeks", reason: "Reduce post-launch defect leakage risk to operations.", status: "SUBMITTED", hours: 80, cost: 42000, days: 14, risk: "LOW", dec: null },
    { code: "PRJ-MOB-004", title: "Add instant notifications capability to launch scope", reason: "Marketing commitment for launch feature set.", status: "DRAFT", hours: 60, cost: 36000, days: 10, risk: "LOW", dec: null },
  ];
  for (let i = 0; i < crs.length; i++) {
    const c = crs[i];
    await db.changeRequest.create({
      data: { projectId: projectIds[c.code], code: `CR-${String(i + 1).padStart(3, "0")}`, title: c.title, description: `${c.title}. Impact assessed by delivery team.`, reason: c.reason, category: "SCOPE", requesterName: "Alexandra Chen", requesterId: ceo.id, ownerId: pm1.id, impactHours: c.hours, impactCost: c.cost, scheduleImpactDays: c.days, riskImpact: c.risk, status: c.status, decision: c.dec, decisionDate: c.dec ? d(-20) : null, decidedBy: c.dec ? ceo.name : null, priority: "HIGH" },
    });
  }
  console.log("  ✓ RAID register (9 risks, 6 issues, 5 assumptions), 4 change requests");

  const meetings = [
    { title: "ERP Program Steering Committee — September", type: "STEERCO", off: 7, dur: 90, agenda: "1. Gate 2 readiness\n2. Data migration status\n3. Change request CR-001 close-out\n4. Risks and decisions required." },
    { title: "Data Platform Turnaround Review", type: "REVIEW", off: 2, dur: 60, agenda: "1. Recovery plan options\n2. Re-baseline proposal CR-002\n3. Executive support required." },
    { title: "Portfolio Monthly Performance Review", type: "REVIEW", off: -5, dur: 120, agenda: "1. Portfolio EVM roll-up\n2. Resource capacity hot spots\n3. Investment shifts." },
  ];
  for (let i = 0; i < meetings.length; i++) {
    const m = meetings[i];
    await db.meeting.create({
      data: { projectId: i === 0 ? projectIds["PRJ-ERP-001"] : i === 1 ? projectIds["PRJ-DATA-002"] : null, title: m.title, meetingType: m.type, scheduledAt: d(m.off), durationMins: m.dur, location: i === 2 ? "Virtual — Executive Boardroom" : "Boardroom A / Virtual", organizerId: prgm.id, attendees: "Alexandra Chen, Jordan Blake, Marcus Webb, Sarah Okafor, David Kim, Elena Rodriguez", agenda: m.agenda, status: m.off < 0 ? "COMPLETED" : "SCHEDULED", minutes: m.off < 0 ? "Actions recorded: recovery plan to be tabled at next SteerCo; capacity re balance approved." : null },
    });
  }
  await db.decision.create({ data: { projectId: projectIds["PRJ-ERP-001"], code: "DEC-001", title: "Approve CR-001 banking interfaces", description: "Steering committee decision on regulatory interface scope.", decision: "APPROVED with 15-day schedule allowance and 96,000 cost authorization.", decidedBy: "Alexandra Chen", impact: "Baseline v1.1 issued; contingency reserve reduced by 20%." } });
  await db.decision.create({ data: { projectId: projectIds["PRJ-DATA-002"], code: "DEC-002", title: "Hold wave 2 rollout pending reconciliation fix", description: "Quality hold issued after margin reconciliation failures.", decision: "APPROVED quality hold; recovery plan required within 10 days.", decidedBy: "Jordan Blake", impact: "SPI recovery plan mandatory before next release." } });
  const stDefs = [
    { name: "Alexandra Chen", role: "COO / Executive Sponsor", org: "Group Operations", infl: "HIGH", int: "HIGH", eng: "CHAMPION" },
    { name: "Jordan Blake", role: "Head of PMO", org: "PMO", infl: "HIGH", int: "HIGH", eng: "CHAMPION" },
    { name: "CFO Office — Wei Liu", role: "Finance Business Partner", org: "Finance", infl: "HIGH", int: "MEDIUM", eng: "SUPPORTIVE" },
    { name: "Regional Ops — Fatima Noor", role: "Regional Operations Director", org: "Regions", infl: "MEDIUM", int: "HIGH", eng: "NEUTRAL" },
    { name: "Security Council — Lena Fischer", role: "Security Lead", org: "Security", infl: "MEDIUM", int: "MEDIUM", eng: "SUPPORTIVE" },
    { name: "Partner Co — Daniel Beck", role: "Implementation Partner Lead", org: "Partner Co", infl: "MEDIUM", int: "HIGH", eng: "SUPPORTIVE" },
  ];
  for (const s of stDefs) {
    await db.stakeholder.create({ data: { name: s.name, role: s.role, organization: s.org, influence: s.infl, interest: s.int, engagement: s.eng, strategy: "Engage via monthly SteerCo and targeted briefings.", email: "stakeholders@pmct.io" } });
  }
  await db.vendor.create({ data: { name: "Global Systems Partner Co", vendorType: "IMPLEMENTATION", contactName: "Daniel Beck", email: "d.beck@partnerco.example", contractRef: "MSA-2025-114", contractValue: 890000, rating: 4.1, status: "ACTIVE" } });
  await db.vendor.create({ data: { name: "Cloud Infrastructure Provider", vendorType: "CLOUD", contactName: "Account Team", email: "enterprise@cloudprov.example", contractRef: "EA-2026-077", contractValue: 460000, rating: 4.4, status: "ACTIVE" } });
  await db.communication.create({ data: { projectId: projectIds["PRJ-PORT-003"], commType: "REPORT", subject: "Portal UAT weekly status — week 36", audience: "Steering committee", channel: "EMAIL", content: "UAT progressing at 68% completion; accessibility remediation on track; billing edge-case defects under triage.", senderId: pm1.id } });
  await db.document.create({ data: { projectId: projectIds["PRJ-ERP-001"], name: "ERP Cutover Runbook v0.9", docType: "RUNBOOK", category: "Delivery", version: "0.9", sizeKb: 2480, uploadedBy: "Sarah Okafor", description: "Draft cutover runbook for Gate 2 evidence pack." } });
  await db.document.create({ data: { projectId: projectIds["PRJ-DATA-002"], name: "Data Platform Recovery Plan", docType: "PLAN", category: "Governance", version: "1.2", sizeKb: 860, uploadedBy: "David Kim", description: "Turnaround plan tabled at the September SteerCo." } });
  await db.qualityRecord.create({ data: { projectId: projectIds["PRJ-PORT-003"], recordType: "REVIEW", title: "Accessibility audit — WCAG 2.2 AA", description: "Independent accessibility audit of portal release candidate.", result: "CONDITIONAL", score: 86, reviewerName: "Mia Tanaka", findings: "12 findings: 9 minor, 3 moderate; no critical blockers.", actions: "Remediate moderate findings before go-live." } });
  await db.qualityRecord.create({ data: { projectId: projectIds["PRJ-DATA-002"], recordType: "TEST", title: "Finance domain reconciliation test cycle 3", description: "Automated reconciliation across margin datasets.", result: "FAIL", score: 62, reviewerName: "Ava Martinez", findings: "Margin variance beyond tolerance in 4 of 18 scenarios.", actions: "Root cause on source extract logic; fix scheduled cycle 4." } });
  console.log("  ✓ Meetings, decisions, stakeholders, vendors, documents, quality records");

  // ---------- 12) Templates ----------
  const templates = [
    { name: "IT Implementation Project", cat: "PROJECT", type: "IT_IMPLEMENTATION", method: "HYBRID", industry: "Technology", desc: "Full lifecycle IT implementation with discovery, build, test and deploy phases.", tags: "IT,implementation,enterprise", structure: ["1. Discovery & Design", "2. Build & Configure", "3. Test & Validate", "4. Deploy & Hypercare"] },
    { name: "Software Development (Agile)", cat: "PROJECT", type: "SOFTWARE_DEVELOPMENT", method: "AGILE", industry: "Software", desc: "Agile delivery with sprint cadence, release trains and definition-of-done governance.", tags: "agile,software,sprints", structure: ["1. Mobilize", "2. Sprints 1-6", "3. Release & Hardening", "4. Review & Retrospective"] },
    { name: "Infrastructure Migration", cat: "PROJECT", type: "INFRASTRUCTURE", method: "WATERFALL", industry: "Infrastructure", desc: "Wave-based migration with landing zones, cutover rehearsals and resilience validation.", tags: "cloud,migration,infrastructure", structure: ["1. Landing Zone", "2. Migration Waves", "3. Optimization", "4. DR Validation"] },
    { name: "Business Transformation", cat: "PROJECT", type: "TRANSFORMATION", method: "HYBRID", industry: "Enterprise", desc: "Cross-functional transformation with operating model, change and adoption workstreams.", tags: "transformation,change,adoption", structure: ["1. Assess & Design", "2. Pilot", "3. Scale", "4. Embed & Sustain"] },
    { name: "Product Launch", cat: "PROJECT", type: "PRODUCT_LAUNCH", method: "AGILE", industry: "Product", desc: "Go-to-market launch with readiness gates across product, marketing and support.", tags: "launch,gtm,product", structure: ["1. Readiness", "2. Pilot Market", "3. Launch", "4. Post-Launch Review"] },
    { name: "Compliance Program", cat: "PROJECT", type: "COMPLIANCE", method: "WATERFALL", industry: "Regulated", desc: "Regulatory compliance delivery with control mapping and evidence management.", tags: "compliance,regulatory,audit", structure: ["1. Gap Assessment", "2. Remediation", "3. Evidence & Testing", "4. Certification"] },
    { name: "Business Change & Adoption", cat: "PROJECT", type: "BUSINESS_CHANGE", method: "HYBRID", industry: "Enterprise", desc: "Change management delivery with stakeholder, training and adoption measurement.", tags: "change,adoption,training", structure: ["1. Change Impact", "2. Readiness", "3. Deploy", "4. Reinforce"] },
    { name: "Project Charter (PMO)", cat: "PMO", type: "CHARTER", method: null, industry: "Universal", desc: "Standard charter template covering objectives, scope, stakeholders and governance.", tags: "charter,governance", structure: ["Objectives", "Scope & Exclusions", "Stakeholders", "Governance & Cadence", "Success Criteria"] },
    { name: "RAID Register (PMO)", cat: "PMO", type: "RAID", method: null, industry: "Universal", desc: "Structured RAID log with scoring model and escalation paths.", tags: "raid,risk,issues", structure: ["Scoring Model", "Escalation Rules", "Review Cadence"] },
    { name: "Stage Gate Framework (PMO)", cat: "PMO", type: "GATES", method: null, industry: "Universal", desc: "Five-gate investment governance framework with criteria and evidence packs.", tags: "gates,governance", structure: ["Gate 0 Investment", "Gate 1 Design", "Gate 2 Deployment", "Gate 3 Benefits"] },
    { name: "Communication Plan (PMO)", cat: "PMO", type: "COMMS", method: null, industry: "Universal", desc: "Audience-driven communication planning matrix.", tags: "communications,stakeholders", structure: ["Audience Matrix", "Channel Plan", "Cadence"] },
    { name: "Sprint Delivery (Agile)", cat: "DELIVERY", type: "SPRINT", method: "AGILE", industry: "Software", desc: "Two-week sprint operating rhythm with ceremonies and exit criteria.", tags: "sprint,agile", structure: ["Planning", "Standups", "Review", "Retro"] },
    { name: "UAT Cycle (Delivery)", cat: "DELIVERY", type: "UAT", method: null, industry: "Universal", desc: "User acceptance testing cycle with entry/exit criteria and defect triage.", tags: "uat,testing", structure: ["Entry Criteria", "Cycle 1", "Cycle 2", "Exit & Signoff"] },
    { name: "Hypercare & Closure (Delivery)", cat: "DELIVERY", type: "HYPERCARE", method: null, industry: "Universal", desc: "Post-go-live support model with exit criteria and transition to operations.", tags: "hypercare,closure,support", structure: ["Daily Triage", "Weekly Trend", "Exit Criteria", "Handover"] },
  ];
  for (const t of templates) {
    const tpl = await db.template.create({
      data: { name: t.name, category: t.cat, templateType: t.type, description: t.desc, methodology: t.method, industry: t.industry, version: "1.2", usageCount: Math.floor(Math.random() * 40) + 3, rating: Math.round((3.8 + Math.random() * 1.1) * 10) / 10, tags: t.tags, createdBy: pmo.id },
    });
    await db.templateVersion.create({
      data: { templateId: tpl.id, version: "1.2", changelog: "Refined WBS granularity; aligned gate criteria to investment framework.", structureJson: toJson({ phases: t.structure, artifacts: ["Charter", "Plan", "RAID", "Status report"] }), status: "ACTIVE", createdBy: pmo.id },
    });
    await db.templateVersion.create({
      data: { templateId: tpl.id, version: "1.1", changelog: "Initial curated release.", structureJson: toJson({ phases: t.structure }), status: "SUPERSEDED", createdBy: pmo.id },
    });
  }
  console.log("  ✓ Template library: 14 templates with version history");

  // ---------- 13) Integration Hub (honest status: no live external credentials in sandbox) ----------
  const integrations = [
    { name: "Email Service", cat: "EMAIL", provider: "Generic SMTP provider", desc: "Notifications, approvals and report distribution via configured email service.", direction: "OUTBOUND", status: "DISCONNECTED", auth: "API_KEY" },
    { name: "Calendar Integration", cat: "CALENDAR", provider: "Enterprise calendar services", desc: "Meeting and schedule synchronization for the Focus Planner.", direction: "BIDIRECTIONAL", status: "DISCONNECTED", auth: "OAUTH" },
    { name: "SSO / Identity Provider", cat: "SSO", provider: "OIDC enterprise identity provider", desc: "Enterprise single sign-on foundation (OIDC) with RBAC mapping.", direction: "INBOUND", status: "CONFIGURING", auth: "OIDC" },
    { name: "File Storage", cat: "STORAGE", provider: "Object storage service", desc: "Document and attachment storage with versioned exports.", direction: "OUTBOUND", status: "DISCONNECTED", auth: "API_KEY" },
    { name: "Notifications", cat: "NOTIFICATIONS", provider: "Team messaging platforms", desc: "Automated alerts to collaboration channels.", direction: "OUTBOUND", status: "DISCONNECTED", auth: "WEBHOOK" },
    { name: "BI / Reporting", cat: "BI", provider: "Enterprise BI platforms", desc: "Executive reporting extracts and governed datasets for BI consumption.", direction: "OUTBOUND", status: "DISCONNECTED", auth: "API_KEY" },
    { name: "Webhooks / APIs", cat: "WEBHOOKS", provider: "Third-party systems", desc: "Event exchange with signature validation, retry and delivery history.", direction: "BIDIRECTIONAL", status: "CONFIGURING", auth: "HMAC" },
    { name: "AI / Insights", cat: "AI", provider: "PMCT Insight Engine (internal)", desc: "Approved AI services for the AI PM Assistant and predictive insights.", direction: "INBOUND", status: "CONNECTED", auth: "INTERNAL" },
  ];
  for (const it of integrations) {
    const integ = await db.integration.create({
      data: { name: it.name, category: it.cat, provider: it.provider, description: it.desc, status: it.status, authType: it.auth, authStatus: it.status === "CONNECTED" ? "CONFIGURED" : "NOT_CONFIGURED", syncDirection: it.direction, syncFrequency: "HOURLY", errorCount: 0, retryCount: 0, healthScore: it.status === "CONNECTED" ? 100 : 0, createdBy: pmo.id, configJson: toJson({ sandbox: true, note: "No external credentials configured in this environment; connection requires secrets via secure configuration." }) },
    });
    if (it.status === "CONNECTED") {
      await db.integrationCredential.create({ data: { integrationId: integ.id, label: "Internal service token", credType: "INTERNAL", maskedValue: "pmct-internal-****", status: "ACTIVE", rotatedAt: new Date() } });
      await db.integrationEvent.create({ data: { integrationId: integ.id, direction: "INBOUND", eventType: "AI_QUERY", status: "SUCCESS", payload: toJson({ scope: "projects,risks,capacity" }), response: toJson({ ok: true }), durationMs: 420 } });
    }
  }
  await db.webhookSubscription.create({
    data: { name: "PMO Data Warehouse sync", url: "https://example-pmo-warehouse.internal/hooks/pmct", events: "project.updated,timesheet.approved,alert.created,health.changed", status: "PAUSED", authType: "HMAC_SHA256", maxRetries: 3, createdBy: pmo.id, secretRef: "vault://pmct/webhooks/wh-001" },
  });
  await db.aIConnector.create({
    data: { name: "PMCT Insight Engine", provider: "INTERNAL", model: "glm-4-air", purpose: "AI PM Assistant — governed natural-language access to portfolio, schedule, resource, financial, EVM, RAID and governance data.", status: "ACTIVE", dataScope: toJson(["projects", "programs", "portfolios", "wbs", "tasks", "schedule", "resources", "timesheets", "financials", "evm", "raid", "changes", "governance", "reports", "notifications"]), temperature: 0.3, maxTokens: 2048, usageCount: 1 },
  });
  console.log("  ✓ Integration hub: 8 connectors (1 internal ACTIVE, others honestly DISCONNECTED/CONFIGURING), 1 webhook, AI connector");

  // ---------- 14) Work inbox, notifications, planner, audit context ----------
  const allUsers = [ceo, pmo, pfmg, prgm, pm1, pm2, fin, auditor, t1, t2, t3, t4];
  await db.inboxItem.create({ data: { userId: pm1.id, category: "MENTIONS", title: "Marcus Webb mentioned you", message: "\"@Sarah please confirm cutover rehearsal staffing before Friday.\"", entityType: "Comment", priority: "MEDIUM", actionUrl: "#/inbox", sourceType: "MENTION" } });
  await db.inboxItem.create({ data: { userId: pm2.id, category: "ESCALATIONS", title: "Critical issue open 14+ days", message: "Finance domain reconciliation failure is aging. Turnaround plan due.", entityType: "Issue", priority: "CRITICAL", projectId: projectIds["PRJ-DATA-002"], actionUrl: "#/raid", sourceType: "RAID" } });
  await db.notification.create({ data: { userId: ceo.id, notifType: "HEALTH", category: "HEALTH", title: "Project health changed to RED", message: "Enterprise Data Platform health dropped to RED — CPI 0.78, SPI below threshold.", entityType: "Project", entityId: projectIds["PRJ-DATA-002"], projectId: projectIds["PRJ-DATA-002"], severity: "CRITICAL", actionUrl: "#/projects" } });
  await db.notification.create({ data: { userId: fin.id, notifType: "BUDGET", category: "BUDGET", title: "Budget utilization alert", message: "Enterprise Data Platform spend exceeded governance threshold this period.", entityType: "Project", entityId: projectIds["PRJ-DATA-002"], projectId: projectIds["PRJ-DATA-002"], severity: "WARNING", actionUrl: "#/financials" } });

  // Personal inbox starter items — every demo role signs in to a non-empty work inbox.
  const personalInbox: { user: { id: string }; category: string; title: string; message: string; priority: string; sourceType: string; actionUrl: string }[] = [
    { user: ceo, category: "GOVERNANCE", title: "CPI below target on strategic projects", message: "Two flagship projects are tracking under the cost-performance governance threshold this period.", priority: "HIGH", sourceType: "GOVERNANCE", actionUrl: "#/governance" },
    { user: ceo, category: "ACTION_REQUIRED", title: "Quarterly portfolio review sign-off", message: "Executive sign-off is requested on the quarterly portfolio performance narrative before the board pack is issued.", priority: "HIGH", sourceType: "REPORT", actionUrl: "#/governance" },
    { user: pmo, category: "ACTION_REQUIRED", title: "PMO operating review due", message: "Consolidate schedule, cost and governance exceptions into the weekly PMO operating review.", priority: "MEDIUM", sourceType: "REPORT", actionUrl: "#/governance" },
    { user: pfmg, category: "GOVERNANCE", title: "Portfolio burn tracking above plan", message: "Aggregate spend across the active portfolio is trending above the phase plan — review investment mix.", priority: "MEDIUM", sourceType: "GOVERNANCE", actionUrl: "#/financials" },
    { user: prgm, category: "MENTIONS", title: "Priya Nair mentioned you", message: "\"@Marcus can we lock the integration cutover window before the next steering?\"", entityType: "Comment", priority: "MEDIUM", sourceType: "MENTION", actionUrl: "#/inbox" },
    { user: fin, category: "ACTION_REQUIRED", title: "Budget variance review due Friday", message: "Cost variance on the regulated workstream needs a finance position before the period close.", priority: "MEDIUM", sourceType: "FINANCE", actionUrl: "#/financials" },
    { user: fin, category: "APPROVALS", title: "Forecast revision awaiting finance concurrence", message: "Project forecast revision routed for finance concurrence as part of the monthly calibration.", priority: "LOW", sourceType: "APPROVAL", actionUrl: "#/financials" },
    { user: auditor, category: "ACTION_REQUIRED", title: "Control evidence sampling ready", message: "Q3 control evidence bundle is ready for sampling — gate evidence and change approvals included.", priority: "LOW", sourceType: "AUDIT", actionUrl: "#/inbox" },
    { user: t1, category: "ACTION_REQUIRED", title: "Submit your weekly timesheet", message: "Last week's timesheet is still in draft — submit it so planned vs actual stays accurate.", priority: "MEDIUM", sourceType: "TIMESHEET", actionUrl: "#/timesheets" },
    { user: t2, category: "ACTION_REQUIRED", title: "Submit your weekly timesheet", message: "Last week's timesheet is still in draft — submit it so planned vs actual stays accurate.", priority: "MEDIUM", sourceType: "TIMESHEET", actionUrl: "#/timesheets" },
    { user: t3, category: "ACTION_REQUIRED", title: "Task reassigned to you", message: "UAT defect triage ownership moved to you following the QA capacity review.", priority: "HIGH", sourceType: "TASK", actionUrl: "#/inbox" },
    { user: t4, category: "ALERTS", title: "Regression suite exceeded window", message: "Overnight regression exceeded its scheduled window — performance scenarios were skipped.", priority: "MEDIUM", sourceType: "ALERT", actionUrl: "#/inbox" },
    { user: pm1, category: "APPROVALS", title: "Team member availability change", message: "Noah Andersen flagged partial availability next week — rebalance the cutover rehearsal plan.", priority: "MEDIUM", sourceType: "RESOURCE", actionUrl: "#/resources" },
    { user: pm2, category: "ALERTS", title: "Dependency at risk", message: "Upstream data-migration dependency is trending late against the recovery baseline.", priority: "HIGH", sourceType: "SCHEDULE", actionUrl: "#/raid" },
  ];
  for (const it of personalInbox) {
    await db.inboxItem.create({ data: { userId: it.user.id, category: it.category, title: it.title, message: it.message, entityType: it.category === "MENTIONS" ? "Comment" : "WorkItem", priority: it.priority, actionUrl: it.actionUrl, sourceType: it.sourceType } });
  }

  // Focus planner — anchored to the CURRENT week (Mon–Fri) so the default planner
  // view always shows seeded blocks regardless of when the seed ran.
  const monday = startOfWeek(now);
  const at = (weekday: number) => addDays(monday, weekday);
  const mins = (start: string, end: string) => Math.round(((new Date(`2026-01-01T${end}:00`)).getTime() - (new Date(`2026-01-01T${start}:00`)).getTime()) / 60000);
  const plannerDefs: { user: { id: string }; title: string; type: string; weekday: number; start: string; end: string; prio: string; project?: string }[] = [
    { user: ceo, title: "Executive dashboard review", type: "FOCUS", weekday: 0, start: "09:00", end: "10:00", prio: "MEDIUM" },
    { user: ceo, title: "Portfolio steering committee", type: "MEETING", weekday: 2, start: "14:00", end: "15:00", prio: "HIGH" },
    { user: pmo, title: "PMO operations review", type: "FOCUS", weekday: 0, start: "10:00", end: "12:00", prio: "MEDIUM" },
    { user: pmo, title: "Governance exception triage", type: "TASK", weekday: 3, start: "11:00", end: "12:00", prio: "HIGH" },
    { user: pfmg, title: "Portfolio rebalance analysis", type: "FOCUS", weekday: 1, start: "09:00", end: "11:00", prio: "MEDIUM" },
    { user: prgm, title: "Program delivery sync", type: "MEETING", weekday: 1, start: "14:00", end: "15:00", prio: "MEDIUM" },
    { user: pm1, title: "Gate 2 evidence review", type: "FOCUS", weekday: 3, start: "14:00", end: "16:00", prio: "HIGH" },
    { user: pm2, title: "Recovery plan working session", type: "TASK", weekday: 2, start: "09:00", end: "11:00", prio: "HIGH", project: "PRJ-DATA-002" },
    { user: fin, title: "Month-end cost accruals", type: "TASK", weekday: 4, start: "09:00", end: "12:00", prio: "MEDIUM" },
    { user: auditor, title: "Control evidence sampling", type: "TASK", weekday: 3, start: "09:00", end: "11:00", prio: "LOW" },
    { user: t1, title: "Focus: ERP finance module configuration", type: "FOCUS", weekday: 0, start: "09:00", end: "12:00", prio: "HIGH", project: "PRJ-ERP-001" },
    { user: t1, title: "Steering committee preparation", type: "MEETING", weekday: 1, start: "15:00", end: "16:30", prio: "MEDIUM" },
    { user: t2, title: "Fix reconciliation extract logic", type: "TASK", weekday: 0, start: "09:00", end: "13:00", prio: "CRITICAL", project: "PRJ-DATA-002" },
    { user: t2, title: "Domain design review", type: "MEETING", weekday: 2, start: "11:00", end: "12:00", prio: "MEDIUM" },
    { user: t3, title: "UAT triage with QA", type: "TASK", weekday: 1, start: "10:00", end: "12:00", prio: "HIGH" },
    { user: t4, title: "Test plan review — regulated wave", type: "FOCUS", weekday: 2, start: "13:00", end: "15:00", prio: "MEDIUM" },
  ];
  for (const pl of plannerDefs) {
    await db.plannerEntry.create({ data: { userId: pl.user.id, projectId: pl.project ? projectIds[pl.project] : null, title: pl.title, entryType: pl.type, date: at(pl.weekday), startTime: pl.start, endTime: pl.end, durationMins: mins(pl.start, pl.end), priority: pl.prio, status: "PLANNED", estimatedHours: Math.round((mins(pl.start, pl.end) / 60) * 10) / 10 } });
  }
  console.log("  ✓ Inbox, notifications, focus planner seeded for all", allUsers.length, "users (current-week anchored)");

  // ---------- 15) Final engine pass: CPM everywhere → EVM/health snapshots → governance cycle ----------
  for (const { spec, p } of projects) {
    await rescheduleProject(p.id);
    await recalcProjectHealth(p.id, "SEED");
    // Authoritative period-close EVM snapshot so "latest period" reflects the calibrated state
    if (spec.status !== "DRAFT") {
      const full = await db.project.findUnique({ where: { id: p.id }, include: { tasks: true } });
      if (full) {
        const evm = computeEVM(full.tasks, full.actualCost, full.currentBudget || full.baselineBudget || null, full.statusDate || now);
        await db.evmPeriod.create({
          data: { projectId: p.id, statusDate: now, periodStart: d(-30), periodEnd: now, bac: evm.bac, pv: evm.pv, ev: evm.ev, ac: evm.ac, cpi: evm.cpi, spi: evm.spi, eac: evm.eac, etc: evm.etc, vac: evm.vac, tcpi: evm.tcpi, costVariance: evm.costVariance, scheduleVariance: evm.scheduleVariance, percentComplete: evm.percentComplete, source: "PERIOD_CLOSE" },
        });
      }
    }
  }
  const gov = await evaluateGovernance();
  console.log(`  ✓ CPM schedules persisted (critical paths computed); health snapshots captured; governance evaluated: ${gov.evaluated} checks, ${gov.breaches.length} breaches`);

  // PMO acknowledges the seeded alert backlog (realistic operating state) then refresh health
  await db.alertEvent.updateMany({ data: { status: "ACKNOWLEDGED", acknowledgedBy: pmo.id, acknowledgedAt: new Date() } });
  for (const { p } of projects) {
    await recalcProjectHealth(p.id, "SEED_FINAL");
  }
  console.log("  ✓ Alert backlog acknowledged by PMO; final health pass complete");

  await runAutomations("TASK_OVERDUE", { entityType: "Task", entityId: "seed-demo", projectId: projectIds["PRJ-DATA-002"], criticality: "HIGH", projects: [projectIds["PRJ-DATA-002"]] });
  await db.aIExecution.create({
    data: { userId: ceo.id, prompt: "Which projects are at risk because of resource capacity?", response: "Enterprise Data Platform shows the highest capacity risk: its critical pipeline work is concentrated on two specialist resources while SPI sits below 0.85 and two critical issues are open. Cloud Infrastructure Migration wave 3 depends on regulated-workload approvals with medium capacity headroom. Recommendation: protect Ava Martinez's allocation on the Data Platform recovery plan and pre-approve partner capacity for wave 3 compliance support.", tokens: 512, durationMs: 980, status: "SUCCESS", dataScopeUsed: "projects,resources,assignments,schedule,health,raid,governance" },
  });
}
