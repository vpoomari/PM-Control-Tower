// PM CONTROL TOWER — Analytics Engine: report registry.
// All 50 PMO reports across 5 functional modules are declared here as data
// (id, formula, sources, status) and, where source data can be captured today,
// bound to a compute function. The catalog API and the hub UI are both driven
// from this single list; the report API stamps identity/scope onto RawPayload.

import { AnalyticsContext } from "./context";
import { ModuleMeta, RawCompute, ReportDef, ReportPayload, ReportSpec } from "./types";
import * as planning from "./modules/planning";
import * as resources from "./modules/resources";
import * as delivery from "./modules/delivery";
import * as cost from "./modules/cost";
import * as quality from "./modules/quality";

export const ANALYTICS_MODULES: ModuleMeta[] = [
  { id: "planning", label: "Planning & Initiation", pillar: "PLAN", accent: "#2864FF", description: "Strategic alignment, feasibility, baselines, stakeholders, gates", reportCount: 8, liveCount: 8 },
  { id: "resources", label: "Resource & Capacity", pillar: "EXECUTE", accent: "#29E68C", description: "Utilization, allocation, skills, timesheets, contractor burn", reportCount: 8, liveCount: 8 },
  { id: "delivery", label: "Execution & Delivery", pillar: "MONITOR", accent: "#00D9FF", description: "EVM, schedule, agile delivery, blockers, SLA", reportCount: 12, liveCount: 11 },
  { id: "cost", label: "Budgeting & Cost", pillar: "DELIVER", accent: "#FFD43B", description: "CPI, budgets, forecasts, cash flow, spend, aging", reportCount: 12, liveCount: 12 },
  { id: "quality", label: "Quality, Risk & Closure", pillar: "GOVERN", accent: "#F52AA8", description: "Exposure, CoQ, UAT, benefits, PIR", reportCount: 10, liveCount: 8 },
];

const SPECS: ReportSpec[] = [
  // ---------- PLANNING & INITIATION (8) ----------
  { id: "strategic-alignment", module: "planning", pillar: "PLAN", title: "Strategic Portfolio Alignment", subtitle: "Project coverage against strategic objectives", formula: "aligned projects ÷ total projects; budget per objective", sources: ["Project", "StrategicObjective", "Portfolio"], status: "live" },
  { id: "feasibility-roi", module: "planning", pillar: "PLAN", title: "Feasibility & ROI", subtitle: "Business-case economics and recommendations", formula: "NPV/IRR/payback from finance engine over case cash flows", sources: ["BusinessCase"], status: "live" },
  { id: "capacity-demand", module: "planning", pillar: "PLAN", title: "Resource Capacity Demand", subtitle: "Remaining effort vs weekly capacity pool", formula: "Σ plannedHours×(1−progress) ÷ (Σ capacityHoursPerWeek)", sources: ["Task", "Resource"], status: "live" },
  { id: "baseline-definition", module: "planning", pillar: "PLAN", title: "Project Baseline Definition", subtitle: "Baseline coverage and schedule/cost drift", formula: "drift = current finish − baseline finish; cost drift % = (current − baseline)/baseline", sources: ["Baseline", "Project"], status: "live" },
  { id: "stakeholder-mapping", module: "planning", pillar: "PLAN", title: "Stakeholder Mapping", subtitle: "Influence × interest matrix and engagement", formula: "3×3 Mendelow matrix over stakeholder influence/interest bands", sources: ["Stakeholder"], status: "live" },
  { id: "vendor-procurement-readiness", module: "planning", pillar: "PLAN", title: "Vendor Procurement Readiness", subtitle: "Vendor pool status, ratings, budget linkage", formula: "vendor status mix; budget lines with resolvable vendorId", sources: ["Vendor", "BudgetLine"], status: "live" },
  { id: "initial-risk-assessment", module: "planning", pillar: "PLAN", title: "Initial Risk Assessment", subtitle: "Open risk profile by category and heat band", formula: "exposure = Σ probability×impact; bands LOW<4≤MEDIUM<8≤HIGH<15≤SEVERE", sources: ["Risk"], status: "live" },
  { id: "phase-gate-timeline", module: "planning", pillar: "PLAN", title: "Phase-Gate Timeline", subtitle: "Gate decisions vs plan, milestone pressure", formula: "overdue = PENDING decision with plannedDate < today", sources: ["StageGate", "Milestone"], status: "live" },

  // ---------- RESOURCE & CAPACITY (8) ----------
  { id: "billable-utilization", module: "resources", pillar: "EXECUTE", title: "Billable Utilization", subtitle: "Billable hours against capacity", formula: "billableHours ÷ (capacityHoursPerWeek × weeks with timesheets)", sources: ["Timesheet", "Resource"], status: "live" },
  { id: "resource-allocation", module: "resources", pillar: "EXECUTE", title: "Resource Allocation", subtitle: "Assignment load per resource", formula: "allocation = Σ assignment.allocationPercent; OVER when > 100%", sources: ["Assignment", "Resource"], status: "live" },
  { id: "non-billable-time", module: "resources", pillar: "EXECUTE", title: "Non-Billable Time", subtitle: "Non-billable, leave and overtime shares", formula: "nonBillable ÷ (billable + nonBillable + leave + holiday)", sources: ["Timesheet"], status: "live" },
  { id: "skills-gap-matrix", module: "resources", pillar: "EXECUTE", title: "Skills Gap Matrix", subtitle: "Role demand vs skill supply coverage", formula: "gap = headcount demanded per role − covered by matching skills", sources: ["Assignment", "Resource"], status: "live" },
  { id: "cross-functional-velocity", module: "resources", pillar: "EXECUTE", title: "Cross-Functional Team Velocity", subtitle: "Sprint committed vs completed points", formula: "velocity = Σ storyPoints of COMPLETED sprint tasks per sprint", sources: ["Sprint", "Task"], status: "live" },
  { id: "timesheet-variance", module: "resources", pillar: "EXECUTE", title: "Timesheet Variance", subtitle: "Planned vs logged hours, approval lag", formula: "variance = (logged − planned) ÷ planned; lag = approvedAt − submittedAt", sources: ["Timesheet", "Assignment"], status: "live" },
  { id: "contractor-ft-burn", module: "resources", pillar: "EXECUTE", title: "Contractor vs FTE Burn Rate", subtitle: "Cost split by resource type", formula: "burn = Σ hours × resource.costRate grouped by resourceType", sources: ["Timesheet", "Resource"], status: "live" },
  { id: "leave-impact", module: "resources", pillar: "EXECUTE", title: "Leave & Absence Impact", subtitle: "Leave trend and coverage risk", formula: "at risk = resources with leave > 0 and allocation ≥ 80%", sources: ["Timesheet", "Assignment"], status: "live" },

  // ---------- EXECUTION & DELIVERY (12) ----------
  { id: "evm-summary", module: "delivery", pillar: "MONITOR", title: "EVM Summary", subtitle: "BAC/PV/EV/AC portfolio and per project", formula: "EV = Σ plannedCost×progress; CPI = EV÷AC; SPI = EV÷PV", sources: ["Task", "EvmPeriod", "Project"], status: "live" },
  { id: "spi-dashboard", module: "delivery", pillar: "MONITOR", title: "SPI Dashboard", subtitle: "Schedule performance gauge, trend, distribution", formula: "SPI = EV ÷ PV", sources: ["EvmPeriod", "ProjectHealthSnapshot", "Task"], status: "live" },
  { id: "otd-tracking", module: "delivery", pillar: "MONITOR", title: "OTD Tracking", subtitle: "Milestones and deliverables on time", formula: "on time = actual date ≤ due date; open items excluded", sources: ["Milestone", "Deliverable"], status: "live" },
  { id: "sprint-burndown", module: "delivery", pillar: "MONITOR", title: "Sprint Burndown / Burnup", subtitle: "Remaining points vs ideal burn", formula: "remaining(d) = Σ points of tasks with endDate > d; ideal = linear burn", sources: ["Sprint", "Task"], status: "live" },
  { id: "critical-path-delay", module: "delivery", pillar: "MONITOR", title: "Critical Path Delay", subtitle: "Critical tasks with negative float or overdue finish", formula: "at risk = isCritical ∧ (totalFloat < 0 ∨ endDate < today)", sources: ["Task"], status: "live" },
  { id: "scope-creep-change-requests", module: "delivery", pillar: "MONITOR", title: "Scope Creep & Change Requests", subtitle: "CR volume and approved impact", formula: "creep index = approved CR hours ÷ baseline hours", sources: ["ChangeRequest", "Baseline"], status: "live" },
  { id: "cross-project-dependency", module: "delivery", pillar: "MONITOR", title: "Cross-Project Dependency", subtitle: "External links and blocked successors", formula: "blocked = successor task status BLOCKED; cross = predecessor.projectId ≠ successor.projectId", sources: ["Dependency", "Task"], status: "live" },
  { id: "agile-epic-delivery", module: "delivery", pillar: "MONITOR", title: "Agile Epic/Feature Delivery", subtitle: "Epic progress from task roll-up", formula: "epic % = completed tasks ÷ linked tasks (task.epicId)", sources: ["Epic", "Task"], status: "live" },
  { id: "task-completion-cycle-time", module: "delivery", pillar: "MONITOR", title: "Task Completion Cycle Time", subtitle: "Status transition lead time", formula: "cycle = completedAt − firstInProgressAt, percentile by WBS level", sources: ["TaskStatusHistory (planned)"], status: "roadmap", roadmapNote: delivery.cycleTimeRoadmapNote },
  { id: "blocker-aging", module: "delivery", pillar: "MONITOR", title: "Blocker Aging", subtitle: "Open issues by age bucket and severity", formula: "age = days(now − raisedAt); buckets 0-7/8-14/15-30/31-60/60+", sources: ["Issue"], status: "live" },
  { id: "milestone-variance", module: "delivery", pillar: "MONITOR", title: "Milestone Variance", subtitle: "Completed slip and upcoming pressure", formula: "variance = completedAt − (baselineDate || dueDate); positive = late", sources: ["Milestone"], status: "live" },
  { id: "sla-compliance", module: "delivery", pillar: "MONITOR", title: "SLA Compliance", subtitle: "Issues closed by due date, RFI response times", formula: "issue SLA = resolvedAt ≤ dueDate; RFI by priority: C 1d/H 3d/M 5d/L 10d", sources: ["Issue", "Rfi"], status: "live" },

  // ---------- BUDGETING & COST (12) ----------
  { id: "cpi-dashboard", module: "cost", pillar: "DELIVER", title: "CPI Dashboard", subtitle: "Cost performance gauge and distribution", formula: "CPI = EV ÷ AC; CV = EV − AC", sources: ["EvmPeriod", "Task"], status: "live" },
  { id: "budget-variance", module: "cost", pillar: "DELIVER", title: "Budget Variance", subtitle: "Baseline vs current vs actual by category", formula: "variance % = (current − baseline) ÷ baseline; burn = actual ÷ current", sources: ["BudgetLine"], status: "live" },
  { id: "project-gross-margin", module: "cost", pillar: "DELIVER", title: "Project Gross Margin", subtitle: "Invoiced revenue vs delivery cost", formula: "margin = invoiced subtotal − project actual cost; % = margin ÷ revenue", sources: ["Invoice", "Project", "Expense"], status: "live" },
  { id: "eac-forecast", module: "cost", pillar: "DELIVER", title: "EAC Forecast", subtitle: "Estimate at completion and VAC", formula: "EAC = BAC ÷ CPI; VAC = BAC − EAC; TCPI = (BAC − EV) ÷ (BAC − AC)", sources: ["EvmPeriod", "Task"], status: "live" },
  { id: "etc-report", module: "cost", pillar: "DELIVER", title: "ETC Report", subtitle: "Estimate to complete per project", formula: "ETC = EAC − AC", sources: ["EvmPeriod", "Task"], status: "live" },
  { id: "capex-opex", module: "cost", pillar: "DELIVER", title: "CapEx vs OpEx", subtitle: "Capital and operating split", formula: "Σ case CapEx items vs OpEx items; expense fallback by category keyword", sources: ["BusinessCase", "Expense"], status: "live" },
  { id: "cash-flow-forecast", module: "cost", pillar: "DELIVER", title: "Cash Flow Forecast", subtitle: "Monthly outflow from budgets and forecasts", formula: "monthly = Σ budgetLine.forecastAmount(period) + forecast.forecastCost(period)", sources: ["BudgetLine", "ProjectForecast", "EvmPeriod"], status: "live" },
  { id: "contingency-reserve-depletion", module: "cost", pillar: "DELIVER", title: "Contingency Reserve Depletion", subtitle: "Reserve burn against baseline", formula: "depletion = contingency actual ÷ contingency current", sources: ["BudgetLine"], status: "live" },
  { id: "vendor-spend-analytics", module: "cost", pillar: "DELIVER", title: "Vendor Spend Analytics", subtitle: "Spend concentration by vendor", formula: "spend = Σ expenses.vendorName + budget lines linked to a vendor", sources: ["Expense", "BudgetLine", "Vendor"], status: "live" },
  { id: "wbs-cost-analytics", module: "cost", pillar: "DELIVER", title: "WBS Cost Analytics", subtitle: "Planned vs actual per control account", formula: "variance % = (actual − planned) ÷ planned on level-1 WBS nodes", sources: ["WBSNode"], status: "live" },
  { id: "ap-ar-aging", module: "cost", pillar: "DELIVER", title: "AP/AR Aging", subtitle: "Receivable aging and pending payables", formula: "AR buckets by days past due; AP = unpaid expenses", sources: ["Invoice", "Expense"], status: "live" },
  { id: "revenue-forecast-accuracy", module: "cost", pillar: "DELIVER", title: "Revenue Forecast Accuracy", subtitle: "MAPE of forecasts against invoiced actuals", formula: "MAPE = mean(|forecast − actual| ÷ actual) × 100", sources: ["ProjectForecast", "Invoice"], status: "live" },

  // ---------- QUALITY, RISK & CLOSURE (10) ----------
  { id: "risk-exposure-trend", module: "quality", pillar: "GOVERN", title: "Risk Exposure Trend", subtitle: "Gross vs residual exposure over time", formula: "exposure = Σ probability×impact (open); trend from health snapshots", sources: ["Risk", "ProjectHealthSnapshot"], status: "live" },
  { id: "cost-of-quality", module: "quality", pillar: "GOVERN", title: "CoQ Analytics", subtitle: "Prevention / appraisal / failure mix", formula: "failure share = (internal + external failures) ÷ all quality events", sources: ["QualityRecord", "UatCase"], status: "live" },
  { id: "defect-density", module: "quality", pillar: "GOVERN", title: "Defect Density", subtitle: "Defects per 100 story points", formula: "density = defects ÷ storyPoints × 100 (fallback: per deliverable)", sources: ["QualityRecord", "UatCase", "Task"], status: "live" },
  { id: "test-coverage-uat", module: "quality", pillar: "GOVERN", title: "Test Coverage / UAT", subtitle: "Execution coverage and pass rates", formula: "coverage = executed ÷ total cases; pass rate = PASS ÷ executed", sources: ["UatCycle", "UatCase"], status: "live" },
  { id: "mitigation-cost-benefit", module: "quality", pillar: "GOVERN", title: "Mitigation Cost-Benefit", subtitle: "Exposure reduction per response strategy", formula: "benefit = (p×i) − (residual p × residual i) per mitigated risk", sources: ["Risk"], status: "live" },
  { id: "csat-dashboard", module: "quality", pillar: "GOVERN", title: "CSAT Dashboard", subtitle: "Customer satisfaction scores", formula: "CSAT = mean(rating) ÷ 5 × 100 over CsatResponse rows", sources: ["CsatResponse (planned)"], status: "roadmap", roadmapNote: quality.csatRoadmapNote },
  { id: "ttv-realization", module: "quality", pillar: "GOVERN", title: "TTV Realization", subtitle: "Time from activation to first benefit value", formula: "TTV months = (first BenefitActual − activatedAt) ÷ 30.44", sources: ["BenefitProfile", "BenefitActual", "Project"], status: "live" },
  { id: "pir-scorecard", module: "quality", pillar: "GOVERN", title: "PIR Scorecard", subtitle: "Post-implementation review evidence", formula: "avg score of PIR quality records + gates passed + benefit reviews", sources: ["QualityRecord", "StageGate", "BenefitReview"], status: "live" },
  { id: "benefits-realization", module: "quality", pillar: "GOVERN", title: "Benefits Realization Tracking", subtitle: "Target vs actual per benefit profile", formula: "realization = Σ BenefitActual ÷ (targetValue − baselineValue)", sources: ["BenefitProfile", "BenefitActual", "BenefitReview"], status: "live" },
  { id: "lessons-learned-summary", module: "quality", pillar: "GOVERN", title: "Lessons Learned Summary", subtitle: "Themes, actions and owners", formula: "group lessons by theme/project; action completion rate", sources: ["LessonLearned (planned)"], status: "roadmap", roadmapNote: quality.lessonsRoadmapNote },
];

const COMPUTES: Record<string, RawCompute> = {
  "strategic-alignment": planning.strategicAlignment,
  "feasibility-roi": planning.feasibilityRoi,
  "capacity-demand": planning.capacityDemand,
  "baseline-definition": planning.baselineDefinition,
  "stakeholder-mapping": planning.stakeholderMapping,
  "vendor-procurement-readiness": planning.vendorReadiness,
  "initial-risk-assessment": planning.initialRisk,
  "phase-gate-timeline": planning.phaseGateTimeline,

  "billable-utilization": resources.billableUtilization,
  "resource-allocation": resources.resourceAllocation,
  "non-billable-time": resources.nonBillableTime,
  "skills-gap-matrix": resources.skillsGap,
  "cross-functional-velocity": resources.teamVelocity,
  "timesheet-variance": resources.timesheetVariance,
  "contractor-ft-burn": resources.contractorFteBurn,
  "leave-impact": resources.leaveImpact,

  "evm-summary": delivery.evmSummary,
  "spi-dashboard": delivery.spiDashboard,
  "otd-tracking": delivery.otdTracking,
  "sprint-burndown": delivery.sprintBurndown,
  "critical-path-delay": delivery.criticalPathDelay,
  "scope-creep-change-requests": delivery.scopeCreep,
  "cross-project-dependency": delivery.dependencyMatrix,
  "agile-epic-delivery": delivery.epicDelivery,
  "blocker-aging": delivery.blockerAging,
  "milestone-variance": delivery.milestoneVariance,
  "sla-compliance": delivery.slaCompliance,

  "cpi-dashboard": cost.cpiDashboard,
  "budget-variance": cost.budgetVariance,
  "project-gross-margin": cost.grossMargin,
  "eac-forecast": cost.eacForecast,
  "etc-report": cost.etcReport,
  "capex-opex": cost.capexOpex,
  "cash-flow-forecast": cost.cashFlowForecast,
  "contingency-reserve-depletion": cost.contingencyDepletion,
  "vendor-spend-analytics": cost.vendorSpend,
  "wbs-cost-analytics": cost.wbsCostAnalytics,
  "ap-ar-aging": cost.apArAging,
  "revenue-forecast-accuracy": cost.revenueForecastAccuracy,

  "risk-exposure-trend": quality.riskExposure,
  "cost-of-quality": quality.costOfQuality,
  "defect-density": quality.defectDensity,
  "test-coverage-uat": quality.testCoverageUat,
  "mitigation-cost-benefit": quality.mitigationRoi,
  "ttv-realization": quality.ttvRealization,
  "pir-scorecard": quality.pirScorecard,
  "benefits-realization": quality.benefitsRealization,
};

function bind(spec: ReportSpec, compute: RawCompute): ReportDef {
  return {
    ...spec,
    compute: async (ctx: AnalyticsContext): Promise<ReportPayload> => {
      const raw = await compute(ctx);
      return {
        reportId: spec.id,
        title: spec.title,
        module: spec.module,
        generatedAt: ctx.now.toISOString(),
        scope: { projects: ctx.projects.length, label: ctx.projectId ? "Project" : "Portfolio" },
        ...raw,
      };
    },
  };
}

/** All 50 reports: metadata + compute (live) or roadmap note only. */
export const ANALYTICS_REPORTS: ReportDef[] = SPECS.map((spec) => {
  const compute = COMPUTES[spec.id];
  if (spec.status === "live" && !compute) {
    throw new Error(`Analytics report "${spec.id}" marked live but has no compute`);
  }
  return compute ? bind(spec, compute) : { ...spec };
});

export function getReport(id: string): ReportDef | undefined {
  return ANALYTICS_REPORTS.find((r) => r.id === id);
}

/** Catalog payload for GET /api/analytics/catalog (metadata only, no compute refs). */
export function catalog() {
  return {
    modules: ANALYTICS_MODULES,
    reports: ANALYTICS_REPORTS.map(({ id, module, pillar, title, subtitle, formula, sources, status, roadmapNote }) => ({
      id, module, pillar, title, subtitle, formula, sources, status, roadmapNote,
    })),
    generatedAt: new Date().toISOString(),
  };
}
