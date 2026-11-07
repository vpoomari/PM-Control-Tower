// PM CONTROL TOWER — Analytics Engine: batched fact loader.
// One Promise.all fan-out per request feeds every report compute (the codebase's
// established style: batched reads + JS bucketing, no raw SQL, no N+1).
// Optional projectId narrows the whole context to a single project.

import { db } from "../db";

export interface CtxProject {
  id: string; code: string; name: string; status: string; phase: string; priority: string;
  methodology: string; billingType: string; currency: string;
  startDate: Date | null; endDate: Date | null;
  baselineStart: Date | null; baselineFinish: Date | null;
  baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number;
  plannedHours: number; actualHours: number; progress: number;
  healthScore: number; ragStatus: string;
  strategicObjectiveId: string | null; clientId: string | null; ownerId: string | null; managerId: string | null;
}
export interface CtxTask {
  id: string; projectId: string; code: string; name: string; status: string; priority: string;
  criticality: string; startDate: Date | null; endDate: Date | null; progress: number;
  plannedHours: number; actualHours: number; remainingHours: number;
  plannedCost: number; actualCost: number; assigneeId: string | null;
  isCritical: boolean; totalFloat: number; earliestFinish: Date | null; latestFinish: Date | null;
  storyPoints: number; epicId: string | null; sprintId: string | null;
  constraintType: string; deadline: Date | null; createdAt: Date;
}
export interface CtxRisk {
  id: string; projectId: string; code: string; title: string; category: string;
  probability: number; impact: number; score: number; severity: string; status: string;
  responseStrategy: string; residualProbability: number; residualImpact: number;
  escalationLevel: string; identifiedAt: Date; dueDate: Date | null; closedAt: Date | null;
}
export interface CtxIssue {
  id: string; projectId: string; code: string; title: string; category: string;
  priority: string; severity: string; status: string; escalationLevel: string;
  raisedAt: Date; dueDate: Date | null; resolvedAt: Date | null;
}
export interface AnalyticsContext {
  now: Date;
  projectId?: string;
  projects: CtxProject[];
  tasks: CtxTask[];
  dependencies: { projectId: string; predecessorId: string; successorId: string; isExternal: boolean; externalRef: string | null }[];
  milestones: { id: string; projectId: string; code: string; name: string; dueDate: Date | null; baselineDate: Date | null; status: string; isCritical: boolean; completedAt: Date | null }[];
  stageGates: { id: string; projectId: string; code: string; name: string; sequence: number; plannedDate: Date | null; decisionStatus: string; decisionDate: Date | null }[];
  baselines: { id: string; projectId: string; version: number; name: string; status: string; baselineStart: Date | null; baselineFinish: Date | null; baselineHours: number; baselineCost: number; activatedAt: Date | null }[];
  budgetLines: { id: string; projectId: string; category: string; name: string; baselineAmount: number; currentAmount: number; actualAmount: number; forecastAmount: number; period: string | null; vendorId: string | null }[];
  evmPeriods: { id: string; projectId: string; statusDate: Date; bac: number; pv: number; ev: number; ac: number; cpi: number; spi: number; eac: number; etc: number; vac: number; tcpi: number; costVariance: number; scheduleVariance: number; percentComplete: number }[];
  healthSnapshots: { projectId: string; capturedAt: Date; healthScore: number; ragStatus: string; cpi: number; spi: number; openRisks: number; openIssues: number; overdueMilestones: number }[];
  forecasts: { projectId: string; period: string; forecastCost: number; forecastHours: number; forecastFinishDate: Date | null; confidence: string }[];
  risks: CtxRisk[];
  issues: CtxIssue[];
  assumptions: { projectId: string; status: string }[];
  changeRequests: { id: string; projectId: string; code: string; title: string; category: string; status: string; impactHours: number; impactCost: number; scheduleImpactDays: number; createdAt: Date; decisionDate: Date | null }[];
  resources: { id: string; employeeCode: string; name: string; resourceType: string; seniority: string; primarySkill: string | null; skills: string | null; capacityHoursPerWeek: number; costRate: number; billableRate: number; availabilityStatus: string; isActive: boolean }[];
  assignments: { id: string; projectId: string; resourceId: string; taskId: string | null; role: string | null; allocationPercent: number; plannedHours: number; actualHours: number; startDate: Date | null; endDate: Date | null; status: string; billable: boolean }[];
  timesheets: { resourceId: string; weekStart: Date; weekEnd: Date; status: string; totalHours: number; regularHours: number; overtimeHours: number; billableHours: number; nonBillableHours: number; leaveHours: number; holidayHours: number; submittedAt: Date | null; approvedAt: Date | null }[];
  timesheetEntries: { projectId: string | null; entryDate: Date; hours: number; billableHours: number; nonBillableHours: number; entryType: string }[];
  sprints: { id: string; projectId: string; name: string; status: string; startDate: Date | null; endDate: Date | null; committedPoints: number }[];
  epics: { id: string; projectId: string; code: string; name: string; status: string; colorHex: string; createdAt: Date }[];
  invoices: { id: string; clientId: string | null; projectId: string | null; number: string; status: string; issueDate: Date | null; dueDate: Date | null; paidAt: Date | null; subtotal: number; total: number }[];
  expenses: { id: string; projectId: string; category: string; description: string; amount: number; expenseDate: Date; billable: boolean; vendorName: string | null; status: string }[];
  qualityRecords: { id: string; projectId: string; recordType: string; title: string; result: string; score: number | null; reviewedAt: Date }[];
  uatCycles: { id: string; projectId: string; name: string; status: string; startDate: Date; endDate: Date | null }[];
  uatCases: { id: string; cycleId: string; severity: string; status: string; executedAt: Date | null; defectRef: string | null }[];
  benefitProfiles: { id: string; projectId: string; name: string; type: string; baselineValue: number; targetValue: number; timeframeMonths: number; active: boolean; activatedAt: Date | null }[];
  benefitActuals: { profileId: string; period: Date; value: number }[];
  benefitReviews: { profileId: string; date: Date; status: string }[];
  businessCases: { id: string; name: string; projectId: string | null; status: string; recommendation: string; computedJson: string; capexItemsJson: string; opexItemsJson: string; analysisYears: number; discountRatePct: number; approvedAmount: number | null }[];
  stakeholders: { id: string; projectId: string | null; name: string; role: string | null; organization: string | null; influence: string; interest: string; engagement: string }[];
  vendors: { id: string; name: string; vendorType: string | null; contractValue: number; rating: number; status: string }[];
  deliverables: { id: string; projectId: string; code: string; name: string; dueDate: Date | null; deliveredAt: Date | null; status: string; qualityStatus: string }[];
  wbsNodes: { id: string; projectId: string; parentId: string | null; code: string; name: string; level: number; nodeType: string; plannedCost: number; actualCost: number; plannedHours: number; actualHours: number; progress: number }[];
  feedbackPosts: { id: string; projectId: string | null; category: string; source: string; status: string; votesCount: number; createdAt: Date }[];
  strategicObjectives: { id: string; name: string; weight: number; order: number }[];
  portfolios: { id: string; code: string; name: string; strategicObjective: string | null; budgetTarget: number; actualCost: number; forecastCost: number; ragStatus: string; healthScore: number }[];
  clients: { id: string; name: string; organization: string | null; status: string }[];
  rfis: { id: string; projectId: string; status: string; priority: string; dateOpened: Date; dateAnswered: Date | null; scheduleImpactDays: number; costImpact: number }[];
  projectKpis: { id: string; projectId: string | null; code: string; name: string; category: string; unit: string; targetValue: number; currentValue: number; status: string }[];
}

const notCancelled = { status: { not: "CANCELLED" } };

export async function loadAnalyticsContext(projectId?: string): Promise<AnalyticsContext> {
  const now = new Date();
  const scope = projectId ? { projectId } : {};
  const projectWhere = projectId ? { id: projectId, ...notCancelled } : notCancelled;

  const [
    projects, tasks, dependencies, milestones, stageGates, baselines, budgetLines,
    evmPeriods, healthSnapshots, forecasts, risks, issues, assumptions, changeRequests,
    resources, assignments, timesheets, timesheetEntries, sprints, epics,
    invoices, expenses, qualityRecords, uatCycles, uatCases,
    benefitProfiles, benefitActuals, benefitReviews, businessCases,
    stakeholders, vendors, deliverables, wbsNodes, feedbackPosts,
    strategicObjectives, portfolios, clients, rfis, projectKpis,
  ] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      select: {
        id: true, code: true, name: true, status: true, phase: true, priority: true, methodology: true,
        billingType: true, currency: true, startDate: true, endDate: true, baselineStart: true, baselineFinish: true,
        baselineBudget: true, currentBudget: true, actualCost: true, forecastCost: true,
        plannedHours: true, actualHours: true, progress: true, healthScore: true, ragStatus: true,
        strategicObjectiveId: true, clientId: true, ownerId: true, managerId: true,
      },
    }),
    db.task.findMany({ where: scope, select: {
      id: true, projectId: true, code: true, name: true, status: true, priority: true, criticality: true,
      startDate: true, endDate: true, progress: true, plannedHours: true, actualHours: true, remainingHours: true,
      plannedCost: true, actualCost: true, assigneeId: true, isCritical: true, totalFloat: true,
      earliestFinish: true, latestFinish: true, storyPoints: true, epicId: true, sprintId: true,
      constraintType: true, deadline: true, createdAt: true,
    } }),
    db.dependency.findMany({ where: scope, select: { projectId: true, predecessorId: true, successorId: true, isExternal: true, externalRef: true } }),
    db.milestone.findMany({ where: scope, select: { id: true, projectId: true, code: true, name: true, dueDate: true, baselineDate: true, status: true, isCritical: true, completedAt: true } }),
    db.stageGate.findMany({ where: scope, select: { id: true, projectId: true, code: true, name: true, sequence: true, plannedDate: true, decisionStatus: true, decisionDate: true } }),
    db.baseline.findMany({ where: scope, select: { id: true, projectId: true, version: true, name: true, status: true, baselineStart: true, baselineFinish: true, baselineHours: true, baselineCost: true, activatedAt: true } }),
    db.budgetLine.findMany({ where: scope, select: { id: true, projectId: true, category: true, name: true, baselineAmount: true, currentAmount: true, actualAmount: true, forecastAmount: true, period: true, vendorId: true } }),
    db.evmPeriod.findMany({ where: scope, orderBy: { statusDate: "asc" }, select: { id: true, projectId: true, statusDate: true, bac: true, pv: true, ev: true, ac: true, cpi: true, spi: true, eac: true, etc: true, vac: true, tcpi: true, costVariance: true, scheduleVariance: true, percentComplete: true } }),
    db.projectHealthSnapshot.findMany({ where: scope, orderBy: { capturedAt: "asc" }, select: { projectId: true, capturedAt: true, healthScore: true, ragStatus: true, cpi: true, spi: true, openRisks: true, openIssues: true, overdueMilestones: true } }),
    db.projectForecast.findMany({ where: scope, select: { projectId: true, period: true, forecastCost: true, forecastHours: true, forecastFinishDate: true, confidence: true } }),
    db.risk.findMany({ where: scope, select: { id: true, projectId: true, code: true, title: true, category: true, probability: true, impact: true, score: true, severity: true, status: true, responseStrategy: true, residualProbability: true, residualImpact: true, escalationLevel: true, identifiedAt: true, dueDate: true, closedAt: true } }),
    db.issue.findMany({ where: scope, select: { id: true, projectId: true, code: true, title: true, category: true, priority: true, severity: true, status: true, escalationLevel: true, raisedAt: true, dueDate: true, resolvedAt: true } }),
    db.assumption.findMany({ where: scope, select: { projectId: true, status: true } }),
    db.changeRequest.findMany({ where: scope, select: { id: true, projectId: true, code: true, title: true, category: true, status: true, impactHours: true, impactCost: true, scheduleImpactDays: true, createdAt: true, decisionDate: true } }),
    db.resource.findMany({ where: { isActive: true }, select: { id: true, employeeCode: true, name: true, resourceType: true, seniority: true, primarySkill: true, skills: true, capacityHoursPerWeek: true, costRate: true, billableRate: true, availabilityStatus: true, isActive: true } }),
    db.assignment.findMany({ where: scope, select: { id: true, projectId: true, resourceId: true, taskId: true, role: true, allocationPercent: true, plannedHours: true, actualHours: true, startDate: true, endDate: true, status: true, billable: true } }),
    db.timesheet.findMany({ select: { resourceId: true, weekStart: true, weekEnd: true, status: true, totalHours: true, regularHours: true, overtimeHours: true, billableHours: true, nonBillableHours: true, leaveHours: true, holidayHours: true, submittedAt: true, approvedAt: true } }),
    db.timesheetEntry.findMany({ where: scope, select: { projectId: true, entryDate: true, hours: true, billableHours: true, nonBillableHours: true, entryType: true } }),
    db.sprint.findMany({ where: scope, select: { id: true, projectId: true, name: true, status: true, startDate: true, endDate: true, committedPoints: true } }),
    db.epic.findMany({ where: scope, select: { id: true, projectId: true, code: true, name: true, status: true, colorHex: true, createdAt: true } }),
    db.invoice.findMany({ select: { id: true, clientId: true, projectId: true, number: true, status: true, issueDate: true, dueDate: true, paidAt: true, subtotal: true, total: true } }),
    db.expense.findMany({ where: scope, select: { id: true, projectId: true, category: true, description: true, amount: true, expenseDate: true, billable: true, vendorName: true, status: true } }),
    db.qualityRecord.findMany({ where: scope, select: { id: true, projectId: true, recordType: true, title: true, result: true, score: true, reviewedAt: true } }),
    db.uatCycle.findMany({ where: scope, select: { id: true, projectId: true, name: true, status: true, startDate: true, endDate: true } }),
    db.uatCase.findMany({ select: { id: true, cycleId: true, severity: true, status: true, executedAt: true, defectRef: true } }),
    db.benefitProfile.findMany({ where: scope, select: { id: true, projectId: true, name: true, type: true, baselineValue: true, targetValue: true, timeframeMonths: true, active: true, activatedAt: true } }),
    db.benefitActual.findMany({ select: { profileId: true, period: true, value: true } }),
    db.benefitReview.findMany({ select: { profileId: true, date: true, status: true } }),
    db.businessCase.findMany({ select: { id: true, name: true, projectId: true, status: true, recommendation: true, computedJson: true, capexItemsJson: true, opexItemsJson: true, analysisYears: true, discountRatePct: true, approvedAmount: true } }),
    db.stakeholder.findMany({ where: { OR: [{ projectId: projectId ?? { not: null } }, ...(projectId ? [] : [{ projectId: null, portfolioId: { not: null } }])] }, select: { id: true, projectId: true, name: true, role: true, organization: true, influence: true, interest: true, engagement: true } }),
    db.vendor.findMany({ select: { id: true, name: true, vendorType: true, contractValue: true, rating: true, status: true } }),
    db.deliverable.findMany({ where: scope, select: { id: true, projectId: true, code: true, name: true, dueDate: true, deliveredAt: true, status: true, qualityStatus: true } }),
    db.wBSNode.findMany({ where: scope, select: { id: true, projectId: true, parentId: true, code: true, name: true, level: true, nodeType: true, plannedCost: true, actualCost: true, plannedHours: true, actualHours: true, progress: true } }),
    db.feedbackPost.findMany({ select: { id: true, projectId: true, category: true, source: true, status: true, votesCount: true, createdAt: true } }),
    db.strategicObjective.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, weight: true, order: true } }),
    db.portfolio.findMany({ select: { id: true, code: true, name: true, strategicObjective: true, budgetTarget: true, actualCost: true, forecastCost: true, ragStatus: true, healthScore: true } }),
    db.client.findMany({ select: { id: true, name: true, organization: true, status: true } }),
    db.rfi.findMany({ where: scope, select: { id: true, projectId: true, status: true, priority: true, dateOpened: true, dateAnswered: true, scheduleImpactDays: true, costImpact: true } }),
    db.projectKpi.findMany({ select: { id: true, projectId: true, code: true, name: true, category: true, unit: true, targetValue: true, currentValue: true, status: true } }),
  ]);

  // Timesheets/invoices are owner-scoped: narrow to the project's resources/clients when filtered.
  const scopedResources = new Set(
    projectId ? assignments.map((a) => a.resourceId) : resources.map((r) => r.id),
  );
  const ts = projectId ? timesheets.filter((t) => scopedResources.has(t.resourceId)) : timesheets;
  const inv = projectId ? invoices.filter((i) => i.projectId === projectId || i.clientId === null && false) : invoices;
  const activeIds = new Set(projects.map((p) => p.id));

  return {
    now,
    projectId,
    projects,
    tasks: tasks.filter((t) => activeIds.has(t.projectId)),
    dependencies, milestones, stageGates, baselines, budgetLines, evmPeriods,
    healthSnapshots, forecasts, risks, issues, assumptions, changeRequests,
    resources,
    assignments,
    timesheets: ts,
    timesheetEntries,
    sprints, epics,
    invoices: inv, expenses, qualityRecords, uatCycles, uatCases,
    benefitProfiles, benefitActuals, benefitReviews, businessCases,
    stakeholders, vendors, deliverables, wbsNodes, feedbackPosts,
    strategicObjectives, portfolios, clients, rfis, projectKpis,
  };
}
