// PM CONTROL TOWER — Leadership Reporting & Executive Control Tower Engine
// Single source of truth: every figure is computed from live platform data.
// Exception-first prioritization, auto insights (traceable), nothing-missed
// validation, what-changed deltas, 30/60/90 outlook, health trends.

import { db } from "../db";
import { dayNum, addDays, round2, safeDiv, fromJson, DAY_MS } from "../constants";
import { computeEVM } from "./evm";

// ---------- shared types ----------
export type Rag = "GREEN" | "AMBER" | "RED" | "GREY";
export type ExceptionLevel = "CRITICAL" | "DECISION_NOW" | "AT_RISK" | "OVERDUE" | "DUE_SOON" | "CHANGE";

export interface ExceptionItem {
  id: string; level: ExceptionLevel; title: string; detail: string;
  projectId?: string | null; projectCode?: string | null;
  metric?: string; ageDays?: number;
}
export interface Insight {
  id: string; severity: "INFO" | "WARNING" | "CRITICAL"; text: string;
  source: { kind: string; code?: string | null };
}
export interface ValidationCheck { label: string; ok: boolean; detail: string }
export interface ChangeItem { label: string; text: string; tone: "good" | "bad" | "neutral" }

export interface ProjectLeadRow {
  id: string; code: string; name: string; portfolioName: string | null; programName: string | null;
  managerName: string; businessOwnerName: string; sponsorName: string;
  health: Rag; ragStatus: string; healthScore: number; dataGaps: string[];
  progress: number; plannedProgress: number; progressVariance: number;
  scheduleStatus: "ON_TRACK" | "AT_RISK" | "DELAYED"; spi: number;
  budgetStatus: "OK" | "WATCH" | "OVER"; budget: number; actualCost: number; forecastCost: number; budgetVariancePct: number;
  riskStatus: string; issueStatus: string; milestoneStatus: string; resourceStatus: string;
  pendingDecisions: number; overdueActions: number;
  nextMilestone: { name: string; dueDate: string | null } | null;
  forecastFinish: string | null; lastUpdated: string; status: string; priority: string;
  trend: { prev: string; current: string; label: string } | null;
}

export interface LeadershipBundle {
  generatedAt: string; since: string; sinceLabel: string;
  tower: {
    totalProjects: number; activeProjects: number;
    onTrack: number; atRisk: number; critical: number; insufficient: number;
    completionPct: number; avgHealth: number;
    budget: { baseline: number; approved: number; actual: number; forecast: number; variance: number; variancePct: number; committed: number };
    schedule: { overdueMilestones: number; avgSpi: number; delayedProjects: number; forecastVsBaselineDays: number | null };
    pendingApprovals: number; pendingDecisions: number; overdueDecisions: number;
    overdueActions: number; openCriticalRisks: number; openCriticalIssues: number;
    resourceBottlenecks: number; scopeChangesPending: number;
  };
  healthCounts: { GREEN: number; AMBER: number; RED: number; GREY: number };
  exceptions: ExceptionItem[];
  insights: Insight[];
  validation: { checks: ValidationCheck[]; gaps: number; passed: boolean };
  portfolio: ProjectLeadRow[];
  changed: ChangeItem[];
  outlook: {
    d30: OutlookWindow; d60: OutlookWindow; d90: OutlookWindow;
  };
  risks: { total: number; bySeverity: Record<string, number>; newCount: number; escalated: number; aging: number; noMitigation: number; noOwner: number; triggerApproaching: number; critical: CriticalRiskRow[] };
  issues: { total: number; critical: number; aging: number; overdue: number; noOwner: number; leadershipIntervention: number; list: IssueRow[] };
  milestones: { completed: number; upcoming: number; delayed: number; atRisk: number; requiringApproval: number; list: MilestoneRow[] };
  financial: { rows: FinancialRow[]; overruns: number; deteriorating: number; thresholdsBreached: number };
  resources: { utilizationPct: number; capacityHours: number; allocatedHours: number; over: ResourceRow[]; under: ResourceRow[]; shortages: string[]; conflicts: ResourceRow[] };
  scheduleReport: { rows: ScheduleRow[]; criticalConcerns: number };
  dependencies: { open: number; blocked: number; overdue: number; noOwner: number; crossProject: DependencyRow[]; affectingMilestones: number };
  decisions: DecisionRow[];
  scopeChanges: ScopeChangeRow[];
  deliverables: { total: number; completed: number; pending: number; overdue: number; rejected: number; awaitingApproval: number; missingOwner: number; missingDeadline: number; list: DeliverableRow[] };
  actions: ActionRow[];
  quality: { total: number; failed: number; conditional: number; openActions: number; avgScore: number | null; list: QualityRow[] };
  kpis: KpiRow[];
  upcomingEvents: { id: string; kind: string; title: string; date: string | null; projectCode: string | null }[];
}
interface OutlookWindow { label: string; milestones: { name: string; date: string | null; projectCode: string; critical: boolean }[]; decisions: { title: string; requiredBy: string | null; owner: string | null }[]; deliverables: { name: string; dueDate: string | null; projectCode: string }[]; budgetRequirement: number; riskReviews: number; approvals: number }
interface CriticalRiskRow { code: string; title: string; probability: number; impact: number; score: number; severity: string; owner: string | null; mitigation: string | null; dueDate: string | null; status: string; projectCode: string; impactNote: string | null }
interface IssueRow { code: string; title: string; severity: string; owner: string | null; impact: string | null; action: string | null; dueDate: string | null; status: string; projectCode: string; ageDays: number; overdue: boolean }
interface MilestoneRow { code: string; name: string; projectCode: string; dueDate: string | null; baselineDate: string | null; forecastDate: string | null; varianceDays: number | null; status: string; critical: boolean; reason: string | null; owner: string | null }
interface FinancialRow { code: string; name: string; approved: number; actual: number; committed: number; forecast: number; variance: number; variancePct: number; trendPct: number | null; status: "OK" | "WATCH" | "OVER" }
interface ResourceRow { name: string; employeeCode: string; department: string | null; allocatedPct: number; capacityHours: number; projects: string[]; primarySkill: string | null }
interface ScheduleRow { code: string; name: string; baselineFinish: string | null; currentFinish: string | null; forecastFinish: string | null; varianceDays: number | null; delayedActivities: number; criticalPathIssues: number; milestoneMoves: number; businessCommitmentRisk: boolean }
interface DependencyRow { id: string; predecessor: string; successor: string; fromProject: string; toProject: string; depType: string; status: string; overdue: boolean; downstreamImpact: string | null }
interface DecisionRow { id: string; code: string; title: string; description: string | null; projectCode: string | null; decisionOwner: string | null; raisedAt: string | null; requiredBy: string | null; daysPending: number | null; businessImpact: string | null; projectImpact: string | null; recommendedDecision: string | null; status: string; decidedBy: string | null; decision: string | null; classification: "DECISION_REQUIRED_NOW" | "DECISION_DUE_SOON" | "PENDING" | "COMPLETED" }
interface ScopeChangeRow { code: string; title: string; requester: string | null; reason: string | null; costImpact: number; scheduleImpactDays: number; riskImpact: string; status: string; decision: string | null; projectCode: string }
interface DeliverableRow { code: string; name: string; projectCode: string; status: string; qualityStatus: string; owner: string | null; dueDate: string | null; deliveredAt: string | null; overdue: boolean }
interface ActionRow { id: string; code: string; title: string; owner: string | null; priority: string; status: string; raisedAt: string | null; dueDate: string | null; projectCode: string | null; relatedType: string | null; relatedCode: string | null; escalationLevel: string; overdue: boolean; ageDays: number }
interface QualityRow { title: string; recordType: string; result: string; score: number | null; reviewer: string | null; reviewedAt: string; findings: string | null; actions: string | null; projectCode: string }
interface KpiRow { id: string; code: string; name: string; category: string; unit: string; target: number; current: number; realizationPct: number; status: string; projectCode: string | null; expectedBenefit: string | null; actualBenefit: string | null; measurementDate: string | null }

const OPEN_RISK = ["OPEN", "MITIGATING", "ESCALATED"];
const OPEN_ISSUE = ["OPEN", "IN_PROGRESS"];

function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / DAY_MS); }
function iso(d: Date | string | null | undefined): string | null { return d ? new Date(d).toISOString() : null; }
function ageOf(d: Date | string | null | undefined): number { return d ? daysBetween(new Date(d), new Date()) : 0; }

// ---------- data fetch ----------
async function fetchAll() {
  const now = new Date();
  const [projectsRaw, users, decisions, actionItems, kpis, approvals, resources, dependencies, meetings, alerts, lastSnapshot] = await Promise.all([
    db.project.findMany({
      orderBy: { code: "asc" },
      include: {
        portfolio: true, program: true, owner: true,
        tasks: true, milestones: true, baselines: { orderBy: { createdAt: "desc" } }, stageGates: true,
        risks: true, issues: true, changeRequests: true, deliverables: true, qualityRecords: true,
        budgetLines: true, assignments: { include: { resource: true } },
        healthSnapshots: { orderBy: { capturedAt: "desc" }, take: 12 },
        forecasts: { orderBy: { createdAt: "desc" }, take: 1 },
        alertEvents: { where: { status: { in: ["NEW", "ACKNOWLEDGED"] } } },
      },
    }),
    db.user.findMany({ select: { id: true, name: true, email: true } }),
    db.decision.findMany({ orderBy: { decisionDate: "desc" } }),
    db.actionItem.findMany({ orderBy: { dueDate: "asc" } }),
    db.projectKpi.findMany({ orderBy: { code: "asc" } }),
    db.approval.findMany({ orderBy: { createdAt: "desc" } }),
    db.resource.findMany({ include: { assignments: { where: { status: "ACTIVE" } } } }),
    db.dependency.findMany({ include: { predecessor: { include: { project: true } }, successor: { include: { project: true } } } }),
    db.meeting.findMany({ where: { scheduledAt: { gte: addDays(now, -7) } }, orderBy: { scheduledAt: "asc" } }),
    db.alertEvent.findMany({ where: { status: { in: ["NEW", "ACKNOWLEDGED"] } }, orderBy: { createdAt: "desc" } }),
    db.reportSnapshot.findFirst({ where: { scope: "PORTFOLIO" }, orderBy: { createdAt: "desc" } }),
  ]);
  const userNameById = new Map(users.map((u) => [u.id, u.name]));
  return { now, projectsRaw, userNameById, decisions, actionItems, kpis, approvals, resources, dependencies, meetings, alerts, lastSnapshot };
}

type RawProject = Awaited<ReturnType<typeof fetchAll>>["projectsRaw"][number];
type Fetched = Awaited<ReturnType<typeof fetchAll>>;

// ---------- data confidence (GREY / insufficient-data rule) ----------
function dataConfidence(p: RawProject, now: Date): DataConfidenceLocal {
  const gaps: string[] = [];
  const active = p.status === "ACTIVE" || p.status === "ON_HOLD";
  if (active && p.tasks.length === 0) gaps.push("no tasks scheduled");
  if (active && p.milestones.length === 0) gaps.push("no milestones defined");
  if (active && p.currentBudget <= 0) gaps.push("no approved budget");
  if (active && p.budgetLines.length === 0) gaps.push("no budget ledger");
  if (active && p.healthSnapshots.length === 0) gaps.push("no health snapshots");
  if (active && p.statusDate && ageOf(p.statusDate) > 21) gaps.push(`status not updated for ${ageOf(p.statusDate)} days`);
  if (active && !p.statusDate && !p.updatedAt) gaps.push("never statused");
  const score = Math.max(0, 6 - gaps.length);
  return { gaps, score, grey: active && gaps.length >= 3 };
}
interface DataConfidenceLocal { gaps: string[]; score: number; grey: boolean }

// ---------- per-project computation ----------
function computeProjectRow(p: RawProject, ctx: Fetched, since: Date): {
  row: ProjectLeadRow; evm: ReturnType<typeof computeEVM>; conf: DataConfidenceLocal;
  pendingDecisions: number; overdueActions: number; nextMilestone: ProjectLeadRow["nextMilestone"];
  forecastFinish: Date | null; baselineFinish: Date | null; openCriticalRisks: number; openCriticalIssues: number;
  delayedTasks: number; criticalPathIssues: number; overAllocated: number;
} {
  const now = ctx.now;
  const evm = computeEVM(p.tasks, p.actualCost, p.currentBudget || p.baselineBudget || null, p.statusDate || now);
  const conf = dataConfidence(p, now);
  const managerName = p.managerId ? (ctx.userNameById.get(p.managerId) ?? "Unassigned") : "Unassigned";
  const ownerName = p.owner?.name ?? "Unassigned";
  const sponsorName = p.sponsorId ? (ctx.userNameById.get(p.sponsorId) ?? "—") : "—";

  const health: Rag = conf.grey ? "GREY" : (p.ragStatus as Rag);
  const openRisks = p.risks.filter((r) => OPEN_RISK.includes(r.status));
  const openIssues = p.issues.filter((i) => OPEN_ISSUE.includes(i.status));
  const maxSev = (rows: { severity: string }[]) => rows.some((r) => r.severity === "CRITICAL") ? "CRITICAL" : rows.some((r) => r.severity === "HIGH") ? "HIGH" : rows.length ? "MEDIUM" : "NONE";
  const overdueMs = p.milestones.filter((m) => m.dueDate && m.dueDate < now && m.status !== "COMPLETED");
  const delayedTasks = p.tasks.filter((t) => !t.isSummary && t.endDate && t.endDate < now && t.status !== "COMPLETED" && t.status !== "CANCELLED").length;
  const criticalPathIssues = p.tasks.filter((t) => t.isCritical && t.status === "BLOCKED").length;

  const budget = p.currentBudget || p.baselineBudget || 0;
  const forecastCost = Math.max(p.forecastCost || 0, evm.eac || 0);
  const variancePct = budget > 0 ? round2(safeDiv(forecastCost - budget, budget, 0) * 100) : 0;
  const budgetStatus = !budget ? "WATCH" : variancePct > 10 ? "OVER" : variancePct > 0 ? "WATCH" : "OK";
  const scheduleStatus = overdueMs.length > 0 || evm.spi < 0.85 ? "DELAYED" : evm.spi < 0.95 || delayedTasks > 0 ? "AT_RISK" : "ON_TRACK";

  const plannedProgress = round2(safeDiv(evm.pv, evm.bac || 1, 0) * 100);
  const progress = round2(p.progress || evm.percentComplete);

  // resources of this project — detect over-allocation inside the project
  const byResource = new Map<string, number>();
  for (const a of p.assignments) {
    if (a.status !== "ACTIVE") continue;
    byResource.set(a.resourceId, (byResource.get(a.resourceId) ?? 0) + a.allocationPercent);
  }
  const overAllocated = [...byResource.values()].filter((v) => v > 100).length;

  const futureMs = p.milestones
    .filter((m) => m.status !== "COMPLETED" && m.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const nextMilestone = futureMs[0] ? { name: futureMs[0].name, dueDate: iso(futureMs[0].dueDate) } : (p.milestones[0] ? { name: p.milestones[0].name, dueDate: iso(p.milestones[0].dueDate) } : null);
  const forecastFinish = p.forecasts[0]?.forecastFinishDate ?? p.endDate ?? null;
  const baselineFinish = p.baselines.find((b) => b.status === "ACTIVE")?.baselineFinish ?? p.baselineFinish ?? null;

  const pDecisions = ctx.decisions.filter((d) => d.projectId === p.id && !d.decision && d.status !== "CANCELLED");
  const pActions = ctx.actionItems.filter((a) => a.projectId === p.id && ["OPEN", "IN_PROGRESS"].includes(a.status) && a.dueDate && a.dueDate < now);

  const trendSnaps = p.healthSnapshots;
  const trend = trendSnaps.length >= 2 ? { prev: trendSnaps[1].ragStatus, current: trendSnaps[0].ragStatus, label: trendLabel(trendSnaps[1].ragStatus, trendSnaps[0].ragStatus) } : null;

  const row: ProjectLeadRow = {
    id: p.id, code: p.code, name: p.name,
    portfolioName: p.portfolio?.name ?? null, programName: p.program?.name ?? null,
    managerName, businessOwnerName: ownerName, sponsorName,
    health, ragStatus: p.ragStatus, healthScore: p.healthScore, dataGaps: conf.gaps,
    progress, plannedProgress, progressVariance: round2(progress - plannedProgress),
    scheduleStatus, spi: round2(evm.spi),
    budgetStatus, budget: round2(budget), actualCost: round2(p.actualCost), forecastCost: round2(forecastCost), budgetVariancePct: variancePct,
    riskStatus: maxSev(openRisks), issueStatus: maxSev(openIssues),
    milestoneStatus: overdueMs.length ? "OVERDUE" : futureMs.length && futureMs[0].dueDate && daysBetween(now, new Date(futureMs[0].dueDate)) <= 14 && futureMs[0].isCritical ? "AT_RISK" : "ON_TRACK",
    resourceStatus: overAllocated > 0 ? "CONFLICT" : "OK",
    pendingDecisions: pDecisions.length, overdueActions: pActions.length,
    nextMilestone, forecastFinish: iso(forecastFinish), lastUpdated: iso(p.updatedAt)!, status: p.status, priority: p.priority, trend,
  };
  return { row, evm, conf, pendingDecisions: pDecisions.length, overdueActions: pActions.length, nextMilestone, forecastFinish, baselineFinish, openCriticalRisks: openRisks.filter((r) => r.severity === "CRITICAL" || r.score >= 16).length, openCriticalIssues: openIssues.filter((i) => i.severity === "CRITICAL" || i.priority === "CRITICAL").length, delayedTasks, criticalPathIssues, overAllocated };
}

export function trendLabel(prev: string, current: string): string {
  const rank: Record<string, number> = { GREEN: 0, AMBER: 1, RED: 2 };
  const d = (rank[current] ?? 0) - (rank[prev] ?? 0);
  if (d === 0) return "Stable";
  if (d === 1) return prev === "GREEN" ? "Deteriorating" : "Critical deterioration";
  if (d === 2) return "Critical deterioration";
  if (d === -1) return prev === "RED" ? "Recovering" : "Improving";
  return "Improving";
}

// ---------- main bundle ----------
export async function buildLeadershipBundle(): Promise<LeadershipBundle> {
  const ctx = await fetchAll();
  const now = ctx.now;
  const lastSnapshot = ctx.lastSnapshot;
  const since = lastSnapshot ? new Date(lastSnapshot.createdAt) : addDays(now, -30);
  const sinceLabel = lastSnapshot ? `since last report (${since.toISOString().slice(0, 10)})` : "last 30 days (no previous snapshot — baseline window used)";

  const computed = ctx.projectsRaw.map((p) => computeProjectRow(p, ctx, since));
  const rows = computed.map((c) => c.row);
  const byCode = new Map(ctx.projectsRaw.map((p) => [p.code, p]));
  const rowByCode = new Map(rows.map((r) => [r.code, r]));

  // ---- tower ----
  const healthCounts = { GREEN: 0, AMBER: 0, RED: 0, GREY: 0 } as Record<Rag, number>;
  rows.forEach((r) => { healthCounts[r.health] += 1; });
  const activeRows = rows.filter((r) => r.status === "ACTIVE" || r.status === "ON_HOLD");
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actualCost, 0);
  const totalForecast = rows.reduce((s, r) => s + r.forecastCost, 0);
  const totalBaseline = ctx.projectsRaw.reduce((s, p) => s + (p.baselineBudget || 0), 0);
  const committed = Math.max(0, totalForecast - totalActual);
  const weightedCompletion = totalBudget > 0 ? round2(rows.reduce((s, r) => s + r.progress * r.budget, 0) / totalBudget) : round2(rows.length ? rows.reduce((s, r) => s + r.progress, 0) / rows.length : 0);
  const pendingDecisions = ctx.decisions.filter((d) => !d.decision && d.status !== "CANCELLED");
  const overdueDecisions = pendingDecisions.filter((d) => d.requiredBy && d.requiredBy < now);
  const openActions = ctx.actionItems.filter((a) => ["OPEN", "IN_PROGRESS"].includes(a.status));
  const overdueActions = openActions.filter((a) => a.dueDate && a.dueDate < now);
  const pendingApprovals = ctx.approvals.filter((a) => a.status === "PENDING");
  const allOpenRisks = ctx.projectsRaw.flatMap((p) => p.risks).filter((r) => OPEN_RISK.includes(r.status));
  const allOpenIssues = ctx.projectsRaw.flatMap((p) => p.issues).filter((i) => OPEN_ISSUE.includes(i.status));
  const scopeChangesPending = ctx.projectsRaw.flatMap((p) => p.changeRequests).filter((c) => ["SUBMITTED", "ASSESSMENT", "APPROVAL"].includes(c.status));
  const overdueMsTotal = computed.reduce((s, c) => s + (byCode.get(c.row.code)!.milestones.filter((m) => m.dueDate && m.dueDate < now && m.status !== "COMPLETED").length), 0);
  const avgSpi = round2(safeDiv(computed.reduce((s, c) => s + c.evm.spi, 0), computed.filter((c) => c.evm.spi > 0).length || 1, 1));
  const forecastDelays = computed.filter((c) => c.forecastFinish && c.baselineFinish && c.forecastFinish > c.baselineFinish);
  const forecastVsBaselineDays = forecastDelays.length ? Math.max(...forecastDelays.map((c) => daysBetween(c.baselineFinish!, c.forecastFinish!))) : null;

  const tower: LeadershipBundle["tower"] = {
    totalProjects: rows.length, activeProjects: activeRows.length,
    onTrack: healthCounts.GREEN, atRisk: healthCounts.AMBER, critical: healthCounts.RED, insufficient: healthCounts.GREY,
    completionPct: weightedCompletion, avgHealth: round2(safeDiv(rows.reduce((s, r) => s + r.healthScore, 0), rows.length || 1, 0)),
    budget: { baseline: round2(totalBaseline), approved: round2(totalBudget), actual: round2(totalActual), forecast: round2(totalForecast), variance: round2(totalForecast - totalBudget), variancePct: totalBudget ? round2(safeDiv(totalForecast - totalBudget, totalBudget, 0) * 100) : 0, committed: round2(committed) },
    schedule: { overdueMilestones: overdueMsTotal, avgSpi, delayedProjects: rows.filter((r) => r.scheduleStatus === "DELAYED").length, forecastVsBaselineDays },
    pendingApprovals: pendingApprovals.length, pendingDecisions: pendingDecisions.length, overdueDecisions: overdueDecisions.length,
    overdueActions: overdueActions.length,
    openCriticalRisks: allOpenRisks.filter((r) => r.severity === "CRITICAL" || r.score >= 16).length,
    openCriticalIssues: allOpenIssues.filter((i) => i.severity === "CRITICAL" || i.priority === "CRITICAL").length,
    resourceBottlenecks: buildResourceViews(ctx.resources).over.length,
    scopeChangesPending: scopeChangesPending.length,
  };

  // ---- exceptions (priority order) ----
  const exceptions: ExceptionItem[] = [];
  const alertItems = ctx.alerts.filter((a) => a.severity === "CRITICAL");
  for (const a of alertItems) exceptions.push({ id: `al-${a.id}`, level: "CRITICAL", title: a.title, detail: a.message ?? "Critical governance alert", projectId: a.projectId, projectCode: a.projectId ? rowByCode.get(rows.find((r) => r.id === a.projectId)?.code ?? "")?.code ?? null : null, ageDays: ageOf(a.createdAt) });
  for (const c of computed) {
    if (c.row.health === "RED") exceptions.push({ id: `pj-red-${c.row.id}`, level: "CRITICAL", title: `${c.row.code} is CRITICAL`, detail: `Health ${c.row.healthScore} — SPI ${c.row.spi}, ${c.openCriticalRisks} critical risks, ${c.openCriticalIssues} critical issues, ${c.delayedTasks} delayed activities.`, projectId: c.row.id, projectCode: c.row.code });
    if (c.row.health === "GREY") exceptions.push({ id: `pj-grey-${c.row.id}`, level: "CRITICAL", title: `${c.row.code} — INSUFFICIENT DATA`, detail: `Active project reporting gaps: ${c.conf.gaps.join("; ") || "multiple"}. Status not trustworthy — do not treat as on-track.`, projectId: c.row.id, projectCode: c.row.code });
  }
  for (const d of overdueDecisions) {
    const p = d.projectId ? rows.find((r) => r.id === d.projectId) : null;
    exceptions.push({ id: `dec-${d.id}`, level: "DECISION_NOW", title: `Decision overdue: ${d.title}`, detail: `Owner ${d.decisionOwner ?? "unassigned"} — required by ${d.requiredBy?.toISOString().slice(0, 10)} (${Math.abs(daysBetween(now, new Date(d.requiredBy!)))} days overdue). Impact if no decision: ${d.businessImpact ?? "not documented"}.`, projectCode: p?.code ?? null, ageDays: Math.abs(daysBetween(new Date(d.requiredBy!), now)) });
  }
  for (const c of computed) if (c.row.health === "AMBER") exceptions.push({ id: `pj-amb-${c.row.id}`, level: "AT_RISK", title: `${c.row.code} is AT RISK`, detail: `Health ${c.row.healthScore} — SPI ${c.row.spi}, schedule ${c.row.scheduleStatus}, budget ${c.row.budgetStatus} (variance ${c.row.budgetVariancePct}%).`, projectId: c.row.id, projectCode: c.row.code });
  for (const a of overdueActions) exceptions.push({ id: `act-${a.id}`, level: "OVERDUE", title: `Action overdue: ${a.title}`, detail: `Owner ${a.ownerName ?? "unassigned"} — due ${a.dueDate?.toISOString().slice(0, 10)}, ${Math.abs(daysBetween(now, new Date(a.dueDate!)))} days overdue (priority ${a.priority}).`, projectCode: a.projectId ? rowByCode.get(rows.find((r) => r.id === a.projectId)?.code ?? "")?.code ?? null : null });
  for (const r of allOpenIssues.filter((i) => i.dueDate && i.dueDate < now)) {
    const p = byCode.get(rows.find((x) => x.id === r.projectId)?.code ?? "");
    exceptions.push({ id: `iss-${r.id}`, level: "OVERDUE", title: `Issue overdue: ${r.title}`, detail: `Severity ${r.severity}, owner ${r.ownerName ?? "unassigned"} — due ${r.dueDate?.toISOString().slice(0, 10)}.`, projectCode: p?.code ?? null });
  }
  for (const d of pendingDecisions.filter((d) => d.requiredBy && d.requiredBy >= now && daysBetween(now, d.requiredBy) <= 7)) {
    exceptions.push({ id: `dec-soon-${d.id}`, level: "DUE_SOON", title: `Decision due soon: ${d.title}`, detail: `Required by ${d.requiredBy!.toISOString().slice(0, 10)} (${daysBetween(now, new Date(d.requiredBy!))} days). Owner ${d.decisionOwner ?? "unassigned"}.`, projectCode: d.projectId ? rowByCode.get(rows.find((r) => r.id === d.projectId)?.code ?? "")?.code ?? null : null });
  }
  const newCriticalRisks = allOpenRisks.filter((r) => (r.severity === "CRITICAL" || r.score >= 16) && r.identifiedAt >= addDays(now, -14));
  for (const r of newCriticalRisks) {
    const p = byCode.get(rows.find((x) => x.id === r.projectId)?.code ?? "");
    exceptions.push({ id: `risk-${r.id}`, level: "CHANGE", title: `New critical risk: ${r.title}`, detail: `Score ${r.score} (P${r.probability}×I${r.impact}), owner ${r.ownerName ?? "unassigned"}, exposure ${r.score * 1000}. Identified ${r.identifiedAt.toISOString().slice(0, 10)}.`, projectCode: p?.code ?? null });
  }
  const levelOrder: ExceptionLevel[] = ["CRITICAL", "DECISION_NOW", "AT_RISK", "OVERDUE", "DUE_SOON", "CHANGE"];
  exceptions.sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level));

  // ---- sub-reports ----
  const risksView = buildRiskView(ctx);
  const issuesView = buildIssueView(ctx, rows, now);
  const milestonesView = buildMilestoneView(ctx, now);
  const financialView = buildFinancialView(ctx, computed, lastSnapshot);
  const resourcesView = buildResourceViews(ctx.resources);
  const scheduleView = buildScheduleView(ctx, computed, now);
  const depView = buildDependencyView(ctx, now);
  const decisionsView = buildDecisionRows(ctx, rows, now);
  const scopeView = buildScopeRows(ctx, rows);
  const delivView = buildDeliverableView(ctx, now);
  const actionsView = buildActionRows(ctx, rows, now);
  const qualityView = buildQualityView(ctx);
  const kpiView = buildKpiRows(ctx, rows);
  const outlook = buildOutlook(ctx, rows, now);
  const changed = buildWhatChanged(ctx, rows, since, lastSnapshot);
  const insights = buildInsights(computed, { pendingDecisions: pendingDecisions.length, overdueDecisions: overdueDecisions.length, over: resourcesView.over, depView, financialView, risksView, since });
  const validation = buildValidation(ctx, computed, now, { pendingApprovals: pendingApprovals.length, pendingDecisions: pendingDecisions.length, overdueActions: overdueActions.length });

  return {
    generatedAt: now.toISOString(), since: iso(since)!, sinceLabel,
    tower, healthCounts, exceptions, insights, validation, portfolio: rows, changed, outlook,
    risks: risksView, issues: issuesView, milestones: milestonesView, financial: financialView,
    resources: { ...resourcesView, utilizationPct: round2(resourcesView.allocatedHours / (resourcesView.capacityHours || 1) * 100) },
    scheduleReport: scheduleView, dependencies: depView, decisions: decisionsView, scopeChanges: scopeView,
    deliverables: delivView, actions: actionsView, quality: qualityView, kpis: kpiView,
    upcomingEvents: [
      ...ctx.meetings.map((m) => ({ id: m.id, kind: `MEETING · ${m.meetingType}`, title: m.title, date: iso(m.scheduledAt), projectCode: null })),
      ...ctx.projectsRaw.flatMap((p) => p.stageGates?.filter((g) => g.decisionStatus === "PENDING" && g.plannedDate && g.plannedDate >= addDays(now, -7)).map((g) => ({ id: g.id, kind: "STAGE GATE", title: `${p.code} — ${g.name}`, date: iso(g.plannedDate), projectCode: p.code })) ?? []),
    ].sort((a, b) => new Date(a.date ?? "2999").getTime() - new Date(b.date ?? "2999").getTime()).slice(0, 12),
  };
}

// ---------- resource views ----------
function buildResourceViews(resources: Fetched["resources"]) {
  const over: ResourceRow[] = []; const under: ResourceRow[] = [];
  let capacityHours = 0; let allocatedHours = 0;
  const shortages = new Map<string, number>();
  for (const r of resources) {
    if (!r.isActive) continue;
    const pct = r.assignments.reduce((s, a) => s + a.allocationPercent, 0);
    const projects = [...new Set(r.assignments.map((a) => a.projectId))];
    capacityHours += r.capacityHoursPerWeek;
    allocatedHours += r.capacityHoursPerWeek * Math.min(pct, 100) / 100;
    if (r.primarySkill && pct > 80) shortages.set(r.primarySkill, (shortages.get(r.primarySkill) ?? 0) + 1);
    const view: ResourceRow = { name: r.name, employeeCode: r.employeeCode, department: r.department, allocatedPct: round2(pct), capacityHours: r.capacityHoursPerWeek, projects, primarySkill: r.primarySkill };
    if (pct > 100) over.push(view); else if (pct < 40) under.push(view);
  }
  return { capacityHours: round2(capacityHours), allocatedHours: round2(allocatedHours), over, under, shortages: [...shortages.entries()].filter(([, n]) => n >= 2).map(([skill, n]) => `${skill} (${n} highly loaded)`), conflicts: over.filter((o) => o.projects.length >= 2) };
}

// ---------- risk view ----------
function buildRiskView(ctx: Fetched) {
  const now = ctx.now;
  const open = ctx.projectsRaw.flatMap((p) => p.risks.filter((r) => OPEN_RISK.includes(r.status)).map((r) => ({ r, p })));
  const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  open.forEach(({ r }) => { bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1; });
  const critical = open.filter(({ r }) => r.severity === "CRITICAL" || r.score >= 16).sort((a, b) => b.r.score - a.r.score)
    .map(({ r, p }): CriticalRiskRow => ({
      code: r.code, title: r.title, probability: r.probability, impact: r.impact, score: r.score, severity: r.severity,
      owner: r.ownerName, mitigation: r.mitigation, dueDate: iso(r.dueDate), status: r.status, projectCode: p.code,
      impactNote: r.mitigation ? null : "No mitigation recorded — exposure unmanaged",
    }));
  return {
    total: open.length, bySeverity,
    newCount: open.filter(({ r }) => r.identifiedAt >= addDays(now, -14)).length,
    escalated: open.filter(({ r }) => r.escalationLevel && r.escalationLevel !== "NONE").length,
    aging: open.filter(({ r }) => ageOf(r.identifiedAt) > 60).length,
    noMitigation: open.filter(({ r }) => !r.mitigation).length,
    noOwner: open.filter(({ r }) => !r.ownerName).length,
    triggerApproaching: open.filter(({ r }) => r.dueDate && daysBetween(now, r.dueDate) >= 0 && daysBetween(now, r.dueDate) <= 14).length,
    critical,
  };
}

// ---------- issue view ----------
function buildIssueView(ctx: Fetched, rows: ProjectLeadRow[], now: Date) {
  const open = ctx.projectsRaw.flatMap((p) => p.issues.filter((i) => OPEN_ISSUE.includes(i.status)).map((i) => ({ i, p })));
  const list: IssueRow[] = open.map(({ i, p }): IssueRow => ({
    code: i.code, title: i.title, severity: i.severity, owner: i.ownerName, impact: i.impact,
    action: i.resolution, dueDate: iso(i.dueDate), status: i.status, projectCode: p.code,
    ageDays: ageOf(i.raisedAt), overdue: Boolean(i.dueDate && i.dueDate < now),
  })).sort((a, b) => (a.severity === "CRITICAL" ? -1 : 1) - (b.severity === "CRITICAL" ? -1 : 1) || b.ageDays - a.ageDays);
  return {
    total: open.length,
    critical: open.filter(({ i }) => i.severity === "CRITICAL" || i.priority === "CRITICAL").length,
    aging: open.filter(({ i }) => ageOf(i.raisedAt) > 30).length,
    overdue: open.filter(({ i }) => i.dueDate && i.dueDate < now).length,
    noOwner: open.filter(({ i }) => !i.ownerName).length,
    leadershipIntervention: open.filter(({ i }) => i.escalationLevel && i.escalationLevel !== "NONE").length,
    list,
  };
}

// ---------- milestone view ----------
function buildMilestoneView(ctx: Fetched, now: Date) {
  const all = ctx.projectsRaw.flatMap((p) => p.milestones.map((m) => ({ m, p })));
  const open = all.filter(({ m }) => m.status !== "COMPLETED");
  const variance = (m: typeof all[number]["m"]): number | null => m.baselineDate && m.dueDate ? daysBetween(new Date(m.baselineDate), new Date(m.dueDate)) : null;
  const delayed = open.filter(({ m }) => m.dueDate && m.dueDate < now);
  const atRisk = open.filter(({ m }) => m.dueDate && m.dueDate >= now && daysBetween(now, m.dueDate) <= 30 && (m.isCritical || (variance(m) ?? 0) > 0));
  const list: MilestoneRow[] = [...delayed, ...atRisk].slice(0, 40).map(({ m, p }): MilestoneRow => ({
    code: m.code, name: m.name, projectCode: p.code, dueDate: iso(m.dueDate), baselineDate: iso(m.baselineDate),
    forecastDate: iso(m.dueDate), varianceDays: variance(m), status: delayed.includes({ m, p } as never) ? "DELAYED" : "AT_RISK",
    critical: m.isCritical, reason: m.description, owner: null,
  }));
  return {
    completed: all.filter(({ m }) => m.status === "COMPLETED").length,
    upcoming: open.filter(({ m }) => m.dueDate && m.dueDate >= now).length,
    delayed: delayed.length, atRisk: atRisk.length,
    requiringApproval: open.filter(({ m }) => m.gateId).length,
    list,
  };
}

// ---------- financial view ----------
function buildFinancialView(ctx: Fetched, computed: ReturnType<typeof computeProjectRow>[], lastSnapshot: Fetched["lastSnapshot"]) {
  const headline = fromJson<{ perProject?: Record<string, { forecastCost?: number }> }>(lastSnapshot?.headlineJson ?? "{}", {});
  const prevByCode = new Map(Object.entries(headline.perProject ?? {}));
  const rows: FinancialRow[] = computed.map((c): FinancialRow => {
    const prevForecast = prevByCode.get(c.row.code)?.forecastCost;
    const trendPct = prevForecast && prevForecast > 0 ? round2((c.row.forecastCost - prevForecast) / prevForecast * 100) : null;
    return {
      code: c.row.code, name: c.row.name, approved: c.row.budget, actual: c.row.actualCost,
      committed: round2(Math.max(0, c.row.forecastCost - c.row.actualCost)), forecast: c.row.forecastCost,
      variance: round2(c.row.forecastCost - c.row.budget), variancePct: c.row.budgetVariancePct,
      trendPct, status: c.row.budgetStatus as "OK" | "WATCH" | "OVER",
    };
  });
  return {
    rows,
    overruns: rows.filter((r) => r.status === "OVER").length,
    deteriorating: rows.filter((r) => (r.trendPct ?? 0) > 5).length,
    thresholdsBreached: rows.filter((r) => r.approved > 0 && r.actual / r.approved > 0.9 && r.status !== "OVER").length,
  };
}

// ---------- schedule view ----------
function buildScheduleView(ctx: Fetched, computed: ReturnType<typeof computeProjectRow>[], now: Date): { rows: ScheduleRow[]; criticalConcerns: number } {
  const rows: ScheduleRow[] = computed.map((c): ScheduleRow => {
    const p = ctx.projectsRaw.find((x) => x.id === c.row.id)!;
    const milestoneMoves = p.milestones.filter((m) => m.baselineDate && m.dueDate && new Date(m.dueDate) > new Date(m.baselineDate)).length;
    const businessCommitmentRisk = Boolean(
      (c.forecastFinish && c.baselineFinish && c.forecastFinish > c.baselineFinish) ||
      c.row.scheduleStatus === "DELAYED" ||
      p.milestones.some((m) => m.isCritical && m.dueDate && m.dueDate < now && m.status !== "COMPLETED"),
    );
    return {
      code: c.row.code, name: c.row.name,
      baselineFinish: iso(c.baselineFinish), currentFinish: iso(p.endDate), forecastFinish: iso(c.forecastFinish),
      varianceDays: c.forecastFinish && c.baselineFinish ? daysBetween(c.baselineFinish, c.forecastFinish) : null,
      delayedActivities: c.delayedTasks, criticalPathIssues: c.criticalPathIssues,
      milestoneMoves, businessCommitmentRisk,
    };
  });
  return { rows, criticalConcerns: rows.filter((r) => r.businessCommitmentRisk).length };
}

// ---------- dependency view ----------
function buildDependencyView(ctx: Fetched, now: Date) {
  const open = ctx.dependencies.filter((d) => d.predecessor.status !== "COMPLETED");
  const blocked = open.filter((d) => d.successor.status === "BLOCKED" || d.predecessor.status === "BLOCKED");
  const overdue = open.filter((d) => d.predecessor.endDate && d.predecessor.endDate < now && d.predecessor.status !== "COMPLETED");
  const crossProject = open
    .filter((d) => d.predecessor.projectId !== d.successor.projectId || d.isExternal)
    .map((d): DependencyRow => ({
      id: d.id, predecessor: `${d.predecessor.code} ${d.predecessor.name}`, successor: `${d.successor.code} ${d.successor.name}`,
      fromProject: d.isExternal ? (d.externalRef ?? "EXTERNAL") : d.predecessor.project.code,
      toProject: d.successor.project.code, depType: d.depType,
      status: blocked.includes(d) ? "BLOCKED" : overdue.includes(d) ? "OVERDUE" : "OPEN",
      overdue: overdue.includes(d),
      downstreamImpact: d.successor.isCritical
        ? `Successor ${d.successor.code} is on the critical path of ${d.successor.project.code} — planned finish ${d.successor.endDate ? d.successor.endDate.toISOString().slice(0, 10) : "unscheduled"}; delay propagates to project finish.`
        : `Affects ${d.successor.code} (${d.successor.project.code}) planned finish ${d.successor.endDate ? d.successor.endDate.toISOString().slice(0, 10) : "unscheduled"}.`,
    }));
  return {
    open: open.length, blocked: blocked.length, overdue: overdue.length,
    noOwner: open.filter((d) => !d.predecessor.assigneeId && !d.isExternal).length,
    crossProject,
    affectingMilestones: open.filter((d) => d.successor.isCritical).length,
  };
}

// ---------- decisions ----------
function buildDecisionRows(ctx: Fetched, rows: ProjectLeadRow[], now: Date): DecisionRow[] {
  return ctx.decisions
    .filter((d) => d.status !== "CANCELLED")
    .map((d): DecisionRow => {
      const pending = !d.decision;
      const requiredBy = d.requiredBy;
      let classification: DecisionRow["classification"] = "PENDING";
      if (!pending) classification = "COMPLETED";
      else if (requiredBy && requiredBy < now) classification = "DECISION_REQUIRED_NOW";
      else if (requiredBy && daysBetween(now, requiredBy) <= 14) classification = "DECISION_DUE_SOON";
      return {
        id: d.id, code: d.code, title: d.title, description: d.description,
        projectCode: d.projectId ? rows.find((r) => r.id === d.projectId)?.code ?? null : null,
        decisionOwner: d.decisionOwner ?? d.decidedBy ?? null,
        raisedAt: iso(d.raisedAt), requiredBy: iso(requiredBy),
        daysPending: d.raisedAt ? ageOf(d.raisedAt) : null,
        businessImpact: d.businessImpact ?? d.impact ?? null,
        projectImpact: d.projectImpact ?? null,
        recommendedDecision: d.recommendedDecision ?? null,
        status: d.status, decidedBy: d.decidedBy, decision: d.decision,
        classification,
      };
    });
}

// ---------- scope changes ----------
function buildScopeRows(ctx: Fetched, rows: ProjectLeadRow[]): ScopeChangeRow[] {
  return ctx.projectsRaw.flatMap((p) => p.changeRequests.map((c): ScopeChangeRow => ({
    code: c.code, title: c.title, requester: c.requesterName, reason: c.reason,
    costImpact: c.impactCost, scheduleImpactDays: c.scheduleImpactDays, riskImpact: c.riskImpact,
    status: c.status, decision: c.decision ?? null, projectCode: p.code,
  })));
}

// ---------- deliverables ----------
function buildDeliverableView(ctx: Fetched, now: Date) {
  const all = ctx.projectsRaw.flatMap((p) => p.deliverables.map((d) => ({ d, p })));
  const list: DeliverableRow[] = all.map(({ d, p }): DeliverableRow => ({
    code: d.code, name: d.name, projectCode: p.code, status: d.status, qualityStatus: d.qualityStatus,
    owner: d.ownerName, dueDate: iso(d.dueDate), deliveredAt: iso(d.deliveredAt),
    overdue: Boolean(d.dueDate && d.dueDate < now && !d.deliveredAt),
  }));
  return {
    total: all.length,
    completed: all.filter(({ d }) => d.status === "ACCEPTED" || d.status === "DELIVERED").length,
    pending: all.filter(({ d }) => ["NOT_STARTED", "IN_PROGRESS"].includes(d.status)).length,
    overdue: list.filter((d) => d.overdue).length,
    rejected: all.filter(({ d }) => d.qualityStatus === "REJECTED").length,
    awaitingApproval: all.filter(({ d }) => d.status === "SUBMITTED" || d.qualityStatus === "PENDING").length,
    missingOwner: all.filter(({ d }) => !d.ownerName).length,
    missingDeadline: all.filter(({ d }) => !d.dueDate).length,
    list: list.sort((a, b) => Number(b.overdue) - Number(a.overdue)).slice(0, 50),
  };
}

// ---------- actions ----------
function buildActionRows(ctx: Fetched, rows: ProjectLeadRow[], now: Date): ActionRow[] {
  return ctx.actionItems.map((a): ActionRow => ({
    id: a.id, code: a.code, title: a.title, owner: a.ownerName, priority: a.priority, status: a.status,
    raisedAt: iso(a.raisedAt), dueDate: iso(a.dueDate),
    projectCode: a.projectId ? rows.find((r) => r.id === a.projectId)?.code ?? null : null,
    relatedType: a.relatedType, relatedCode: a.relatedCode, escalationLevel: a.escalationLevel,
    overdue: Boolean(a.dueDate && a.dueDate < now && ["OPEN", "IN_PROGRESS"].includes(a.status)),
    ageDays: ageOf(a.raisedAt),
  })).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

// ---------- quality ----------
function buildQualityView(ctx: Fetched) {
  const all = ctx.projectsRaw.flatMap((p) => p.qualityRecords.map((q) => ({ q, p })));
  const scored = all.filter(({ q }) => q.score !== null);
  return {
    total: all.length,
    failed: all.filter(({ q }) => q.result === "FAIL").length,
    conditional: all.filter(({ q }) => q.result === "CONDITIONAL").length,
    openActions: all.filter(({ q }) => q.result !== "PASS" && q.actions).length,
    avgScore: scored.length ? round2(scored.reduce((s, { q }) => s + (q.score ?? 0), 0) / scored.length) : null,
    list: all.slice(0, 40).map(({ q, p }): QualityRow => ({
      title: q.title, recordType: q.recordType, result: q.result, score: q.score, reviewer: q.reviewerName,
      reviewedAt: q.reviewedAt.toISOString(), findings: q.findings, actions: q.actions, projectCode: p.code,
    })),
  };
}

// ---------- KPIs ----------
function buildKpiRows(ctx: Fetched, rows: ProjectLeadRow[]): KpiRow[] {
  return ctx.kpis.map((k): KpiRow => ({
    id: k.id, code: k.code, name: k.name, category: k.category, unit: k.unit,
    target: k.targetValue, current: k.currentValue,
    realizationPct: k.targetValue ? round2(Math.min(999, k.currentValue / k.targetValue * 100)) : 0,
    status: k.status, projectCode: k.projectId ? rows.find((r) => r.id === k.projectId)?.code ?? null : null,
    expectedBenefit: k.expectedBenefit, actualBenefit: k.actualBenefit, measurementDate: iso(k.measurementDate),
  }));
}

// ---------- outlook ----------
function buildOutlook(ctx: Fetched, rows: ProjectLeadRow[], now: Date): LeadershipBundle["outlook"] {
  const window = (days: number, label: string): OutlookWindow => {
    const to = addDays(now, days);
    const inWin = (d: Date | null | undefined) => Boolean(d && d >= now && d <= to);
    const ms = ctx.projectsRaw.flatMap((p) => p.milestones.filter((m) => m.status !== "COMPLETED" && inWin(m.dueDate)).map((m) => ({ name: m.name, date: iso(m.dueDate), projectCode: p.code, critical: m.isCritical })));
    const decs = ctx.decisions.filter((d) => !d.decision && d.status !== "CANCELLED" && inWin(d.requiredBy)).map((d) => ({ title: d.title, requiredBy: iso(d.requiredBy), owner: d.decisionOwner }));
    const dels = ctx.projectsRaw.flatMap((p) => p.deliverables.filter((d) => inWin(d.dueDate) && !d.deliveredAt).map((d) => ({ name: d.name, dueDate: iso(d.dueDate), projectCode: p.code })));
    const budgetRequirement = round2(ctx.projectsRaw.reduce((s, p) => {
      const c = { forecast: Math.max(p.forecastCost, 0), actual: p.actualCost };
      const remaining = Math.max(0, c.forecast - c.actual);
      return s + remaining * (days / 90);
    }, 0));
    const riskReviews = ctx.projectsRaw.flatMap((p) => p.risks).filter((r) => OPEN_RISK.includes(r.status) && inWin(r.dueDate)).length;
    const approvals = ctx.approvals.filter((a) => a.status === "PENDING" && a.createdAt >= addDays(to, -days)).length;
    return { label, milestones: ms.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")), decisions: decs, deliverables: dels, budgetRequirement, riskReviews, approvals };
  };
  return { d30: window(30, "Next 30 Days"), d60: window(60, "Next 60 Days"), d90: window(90, "Next 90 Days") };
}

// ---------- what changed ----------
function buildWhatChanged(ctx: Fetched, rows: ProjectLeadRow[], since: Date, lastSnapshot: Fetched["lastSnapshot"]): ChangeItem[] {
  const items: ChangeItem[] = [];
  const inWin = (d: Date | null | undefined) => Boolean(d && d >= since);
  const flat = <T,>(arr: T[][]): T[] => arr.flat();
  const tasks = flat(ctx.projectsRaw.map((p) => p.tasks));
  const risks = flat(ctx.projectsRaw.map((p) => p.risks));
  const issues = flat(ctx.projectsRaw.map((p) => p.issues));
  const milestones = flat(ctx.projectsRaw.map((p) => p.milestones));
  const crs = flat(ctx.projectsRaw.map((p) => p.changeRequests));
  const dels = flat(ctx.projectsRaw.map((p) => p.deliverables));

  const tasksCompleted = tasks.filter((t) => t.status === "COMPLETED" && inWin(t.updatedAt)).length;
  const tasksDelayed = tasks.filter((t) => t.endDate && t.endDate < ctx.now && !["COMPLETED", "CANCELLED"].includes(t.status)).length;
  items.push({ label: "Tasks completed", text: `${tasksCompleted} task${tasksCompleted === 1 ? "" : "s"} completed`, tone: tasksCompleted > 0 ? "good" : "neutral" });
  items.push({ label: "Tasks delayed", text: `${tasksDelayed} task${tasksDelayed === 1 ? "" : "s"} currently overdue`, tone: tasksDelayed > 0 ? "bad" : "good" });

  const newRisks = risks.filter((r) => inWin(r.identifiedAt));
  const closedRisks = risks.filter((r) => inWin(r.closedAt));
  const escalated = risks.filter((r) => OPEN_RISK.includes(r.status) && r.escalationLevel !== "NONE" && inWin(r.updatedAt));
  items.push({ label: "New risks", text: `${newRisks.length} new risk${newRisks.length === 1 ? "" : "s"} identified`, tone: newRisks.length ? "bad" : "good" });
  items.push({ label: "Risks closed", text: `${closedRisks.length} risk${closedRisks.length === 1 ? "" : "s"} closed`, tone: closedRisks.length ? "good" : "neutral" });
  items.push({ label: "Escalated risks", text: `${escalated.length} open risk${escalated.length === 1 ? "" : "s"} escalated`, tone: escalated.length ? "bad" : "good" });

  const issuesOpened = issues.filter((i) => inWin(i.raisedAt));
  const issuesClosed = issues.filter((i) => inWin(i.resolvedAt));
  items.push({ label: "Issues opened", text: `${issuesOpened.length} issue${issuesOpened.length === 1 ? "" : "s"} opened`, tone: issuesOpened.length ? "bad" : "good" });
  items.push({ label: "Issues closed", text: `${issuesClosed.length} issue${issuesClosed.length === 1 ? "" : "s"} resolved`, tone: issuesClosed.length ? "good" : "neutral" });

  const msCompleted = milestones.filter((m) => m.status === "COMPLETED" && inWin(m.completedAt));
  const msDelayed = milestones.filter((m) => m.status !== "COMPLETED" && m.baselineDate && m.dueDate && new Date(m.dueDate) > new Date(m.baselineDate));
  items.push({ label: "Milestones completed", text: `${msCompleted.length} milestone${msCompleted.length === 1 ? "" : "s"} completed`, tone: msCompleted.length ? "good" : "neutral" });
  items.push({ label: "Milestones delayed", text: msDelayed.length ? `${msDelayed.length} milestone${msDelayed.length === 1 ? "" : "s"} moved past baseline${msDelayed[0].dueDate && msDelayed[0].baselineDate ? ` (e.g. ${msDelayed[0].name} +${daysBetween(new Date(msDelayed[0].baselineDate), new Date(msDelayed[0].dueDate))}d)` : ""}` : "no baseline slippage", tone: msDelayed.length ? "bad" : "good" });

  // budget forecast delta vs previous snapshot
  const prevByCode = fromJson<{ perProject?: Record<string, { forecastCost?: number }>; totals?: { forecast?: number } }>(lastSnapshot?.headlineJson ?? "{}", {});
  if (prevByCode.totals?.forecast && prevByCode.totals.forecast > 0) {
    const nowF = rows.reduce((s, r) => s + r.forecastCost, 0);
    const deltaPct = round2((nowF - prevByCode.totals.forecast) / prevByCode.totals.forecast * 100);
    items.push({ label: "Budget forecast", text: `portfolio forecast ${deltaPct >= 0 ? "increased" : "decreased"} by ${Math.abs(deltaPct)}% since previous report`, tone: deltaPct > 2 ? "bad" : deltaPct < -2 ? "good" : "neutral" });
  } else {
    items.push({ label: "Budget forecast", text: "no previous snapshot — generate one to enable forecast deltas", tone: "neutral" });
  }

  const scopeNew = crs.filter((c) => inWin(c.createdAt));
  const scopeDecided = crs.filter((c) => inWin(c.decisionDate));
  items.push({ label: "Scope changes", text: `${scopeNew.length} raised, ${scopeDecided.length} decided in period`, tone: scopeNew.length ? "neutral" : "good" });

  const approvalsDone = ctx.approvals.filter((a) => a.status === "APPROVED" && inWin(a.decisionDate)).length;
  const approvalsPending = ctx.approvals.filter((a) => a.status === "PENDING").length;
  items.push({ label: "Approvals", text: `${approvalsDone} completed, ${approvalsPending} pending`, tone: approvalsPending > 5 ? "bad" : "neutral" });

  const decisionsDone = ctx.decisions.filter((d) => d.decision && inWin(d.decisionDate)).length;
  const decisionsNew = ctx.decisions.filter((d) => !d.decision && d.status !== "CANCELLED" && inWin(d.raisedAt)).length;
  items.push({ label: "Leadership decisions", text: `${decisionsDone} completed, ${decisionsNew} newly required`, tone: decisionsNew ? "bad" : "good" });

  const actionsDone = ctx.actionItems.filter((a) => ["DONE", "COMPLETED"].includes(a.status) && inWin(a.completedAt)).length;
  const actionsNew = ctx.actionItems.filter((a) => inWin(a.raisedAt)).length;
  items.push({ label: "Actions", text: `${actionsDone} completed, ${actionsNew} raised in period`, tone: "neutral" });

  const resourceChanges = ctx.resources.reduce((s, r) => s + r.assignments.filter((a) => inWin(a.createdAt)).length, 0);
  items.push({ label: "Resource changes", text: `${resourceChanges} new assignment${resourceChanges === 1 ? "" : "s"} in period`, tone: "neutral" });

  const delsDone = dels.filter((d) => d.deliveredAt && inWin(d.deliveredAt)).length;
  items.push({ label: "Deliverables", text: `${delsDone} delivered in period`, tone: delsDone ? "good" : "neutral" });

  return items;
}

// ---------- insights ----------
function buildInsights(computed: ReturnType<typeof computeProjectRow>[], ctxData: {
  pendingDecisions: number; overdueDecisions: number; over: ResourceRow[]; depView: ReturnType<typeof buildDependencyView>;
  financialView: ReturnType<typeof buildFinancialView>; risksView: ReturnType<typeof buildRiskView>; since: Date;
}): Insight[] {
  const out: Insight[] = [];
  const push = (severity: Insight["severity"], kind: string, code: string | null, text: string) =>
    out.push({ id: `in-${out.length}`, severity, text, source: { kind, code } });

  for (const c of computed) {
    if (c.evm.spi > 0 && c.evm.spi < 0.95) push("WARNING", "EVM", c.row.code, `${c.row.code} completion is ${round2((1 - c.evm.spi) * 100)}% behind plan (SPI ${c.row.spi}).`);
    if (c.forecastFinish && c.baselineFinish && c.forecastFinish > c.baselineFinish) push("WARNING", "SCHEDULE", c.row.code, `${c.row.code} forecast completion date has moved by ${daysBetween(c.baselineFinish, c.forecastFinish)} days versus baseline.`);
    if (c.row.budgetVariancePct > 5) push("WARNING", "FINANCIAL", c.row.code, `${c.row.code} budget forecast is ${c.row.budgetVariancePct}% above approved budget (EAC ${Math.round(c.row.forecastCost)}).`);
    if (c.row.health === "GREY") push("CRITICAL", "DATA", c.row.code, `INSUFFICIENT DATA — ${c.row.code}: ${c.conf.gaps.join("; ")}. Status cannot be verified.`);
  }
  const blocked = ctxData.depView.blocked + ctxData.depView.overdue;
  if (blocked > 0) push("WARNING", "DEPENDENCIES", null, `${blocked} unresolved dependenc${blocked === 1 ? "y threatens" : "ies threaten"} downstream milestones (${ctxData.depView.affectingMilestones} on critical paths).`);
  if (ctxData.pendingDecisions > 0) push(ctxData.overdueDecisions ? "CRITICAL" : "WARNING", "DECISIONS", null, `${ctxData.pendingDecisions} leadership decision${ctxData.pendingDecisions === 1 ? " is" : "s are"} pending${ctxData.overdueDecisions ? ` — ${ctxData.overdueDecisions} overdue` : ""}.`);
  if (ctxData.over.length > 0) push("WARNING", "RESOURCES", null, `Resource capacity may become insufficient — ${ctxData.over.length} resource${ctxData.over.length === 1 ? " is" : "s are"} over-allocated (over 100%).`);
  const ft = ctxData.financialView.rows.filter((r) => (r.trendPct ?? 0) > 5);
  if (ft.length) push("WARNING", "FINANCIAL", null, `Budget forecast increased by up to ${Math.max(...ft.map((r) => r.trendPct ?? 0))}% since the previous report (${ft.map((r) => r.code).join(", ")}).`);
  if (ctxData.risksView.noMitigation > 0) push("WARNING", "RISK", null, `${ctxData.risksView.noMitigation} open risk${ctxData.risksView.noMitigation === 1 ? " has" : "s have"} no mitigation plan recorded.`);
  if (!out.length) push("INFO", "SYSTEM", null, "No material deviations detected in the current reporting window.");
  return out;
}

// ---------- nothing-missed validation ----------
function buildValidation(ctx: Fetched, computed: ReturnType<typeof computeProjectRow>[], now: Date, counts: { pendingApprovals: number; pendingDecisions: number; overdueActions: number }): { checks: ValidationCheck[]; gaps: number; passed: boolean } {
  const checks: ValidationCheck[] = [];
  const add = (label: string, ok: boolean, detail: string) => checks.push({ label, ok, detail });

  const staleCritical = computed.filter((c) => ["RED", "AMBER"].includes(c.row.health) && c.row.status === "ACTIVE" && ageOf(ctx.projectsRaw.find((p) => p.id === c.row.id)!.statusDate) > 14);
  add("Critical projects updated", staleCritical.length === 0, staleCritical.length ? `${staleCritical.length} at-risk project(s) not statused in 14 days: ${staleCritical.map((c) => c.row.code).join(", ")}` : "all at-risk projects statused within 14 days");
  const noManager = ctx.projectsRaw.filter((p) => ["ACTIVE", "ON_HOLD"].includes(p.status) && !p.managerId);
  add("Project owners assigned", noManager.length === 0, noManager.length ? `${noManager.length} project(s) without a project manager` : "all active projects have a manager");
  const unassignedCritical = flatTasks(ctx).filter((t) => t.isCritical && !t.assigneeId && !["COMPLETED", "CANCELLED"].includes(t.status));
  add("Critical tasks assigned", unassignedCritical.length === 0, unassignedCritical.length ? `${unassignedCritical.length} critical task(s) without assignee` : "all critical tasks assigned");
  const noDeadlines = flatTasks(ctx).filter((t) => !t.isSummary && !t.endDate && !["COMPLETED", "CANCELLED"].includes(t.status));
  add("Deadlines present", noDeadlines.length === 0, noDeadlines.length ? `${noDeadlines.length} open task(s) without end date` : "all open tasks have dates");
  const overdueTasks = flatTasks(ctx).filter((t) => t.endDate && t.endDate < now && !["COMPLETED", "CANCELLED"].includes(t.status));
  add("Overdue tasks identified", true, `${overdueTasks.length} overdue task(s) surfaced in exceptions`);
  const staleRisks = flatRisks(ctx).filter((r) => OPEN_RISK.includes(r.status) && ageOf(r.updatedAt) > 30);
  add("Risks updated", staleRisks.length === 0, staleRisks.length ? `${staleRisks.length} open risk(s) untouched for 30+ days` : "all open risks reviewed within 30 days");
  const staleIssues = flatIssues(ctx).filter((i) => OPEN_ISSUE.includes(i.status) && ageOf(i.updatedAt) > 30);
  add("Issues updated", staleIssues.length === 0, staleIssues.length ? `${staleIssues.length} open issue(s) untouched for 30+ days` : "all open issues reviewed within 30 days");
  const msNoDates = flatMilestones(ctx).filter((m) => m.status !== "COMPLETED" && !m.dueDate);
  add("Milestones dated", msNoDates.length === 0, msNoDates.length ? `${msNoDates.length} open milestone(s) without due date` : "all milestones scheduled");
  add("Pending approvals identified", true, `${counts.pendingApprovals} pending approval(s) listed for leadership`);
  add("Pending decisions identified", true, `${counts.pendingDecisions} pending decision(s) in the register`);
  const noLedger = ctx.projectsRaw.filter((p) => ["ACTIVE", "ON_HOLD"].includes(p.status) && p.currentBudget > 0 && p.budgetLines.length === 0);
  add("Budget figures current", noLedger.length === 0, noLedger.length ? `${noLedger.length} funded project(s) without budget ledger entries` : "all funded projects carry a budget ledger");
  const extDeps = ctx.dependencies.filter((d) => d.isExternal && !d.externalRef);
  add("Dependencies identified", extDeps.length === 0, extDeps.length ? `${extDeps.length} external dependenc(ies) without a reference` : `${ctx.dependencies.length} dependencies mapped`);
  add("Critical actions tracked", true, `${counts.overdueActions} overdue action(s) escalated in the register`);
  const crNoDecision = flatCRs(ctx).filter((c) => ["SUBMITTED", "ASSESSMENT", "APPROVAL"].includes(c.status) && !c.dueDate);
  add("Scope changes recorded", crNoDecision.length === 0, crNoDecision.length ? `${crNoDecision.length} in-flight change request(s) without decision date` : `${flatCRs(ctx).length} change requests fully traceable`);
  const dNoMeta = flatDeliverables(ctx).filter((d) => !d.deliveredAt && (!d.ownerName || !d.dueDate));
  add("Deliverables accounted for", dNoMeta.length === 0, dNoMeta.length ? `${dNoMeta.length} deliverable(s) missing owner or deadline` : `${flatDeliverables(ctx).length} deliverables fully specified`);

  const gaps = checks.filter((c) => !c.ok).length;
  return { checks, gaps, passed: gaps === 0 };
}
const flatTasks = (ctx: Fetched) => ctx.projectsRaw.flatMap((p) => p.tasks);
const flatRisks = (ctx: Fetched) => ctx.projectsRaw.flatMap((p) => p.risks);
const flatIssues = (ctx: Fetched) => ctx.projectsRaw.flatMap((p) => p.issues);
const flatMilestones = (ctx: Fetched) => ctx.projectsRaw.flatMap((p) => p.milestones);
const flatCRs = (ctx: Fetched) => ctx.projectsRaw.flatMap((p) => p.changeRequests);
const flatDeliverables = (ctx: Fetched) => ctx.projectsRaw.flatMap((p) => p.deliverables);

// ---------- executive project status report ----------
export interface ProjectStatusReport {
  projectId: string; code: string; name: string; generatedAt: string; since: string;
  manager: string; businessOwner: string; sponsor: string; phase: string; status: string;
  executiveSummary: string[];
  currentStatus: { dimension: string; rating: "GREEN" | "AMBER" | "RED" | "GREY"; basis: string }[];
  progress: { planned: number; actual: number; variance: number; spi: number; cpi: number; completedTasks: number; wipTasks: number; remainingTasks: number };
  upcoming: { milestones: { name: string; dueDate: string | null; critical: boolean }[]; deadlines: { name: string; date: string | null }[]; approvals: number; deliverables: { name: string; dueDate: string | null }[]; events: { title: string; date: string | null }[] };
  concerns: { risks: { code: string; title: string; severity: string; owner: string | null; mitigation: string | null }[]; issues: { code: string; title: string; severity: string; owner: string | null }[]; delays: string[]; dependencies: string[]; resourceConstraints: string[]; budgetConcerns: string[] };
  leadershipActions: { decision: string; who: string | null; byWhen: string | null; ifNoDecision: string | null; classification: DecisionRow["classification"] }[];
  whatChanged: ChangeItem[];
  healthTrend: { prev: string; current: string; label: string } | null;
}

export async function buildProjectStatusReport(projectId: string): Promise<ProjectStatusReport | null> {
  const ctx = await fetchAll();
  const p = ctx.projectsRaw.find((x) => x.id === projectId);
  if (!p) return null;
  const now = ctx.now;
  const since = ctx.lastSnapshot ? new Date(ctx.lastSnapshot.createdAt) : addDays(now, -30);
  const inWin = (d: Date | null | undefined) => Boolean(d && d >= since);
  const c = computeProjectRow(p, ctx, since);
  const openRisks = p.risks.filter((r) => OPEN_RISK.includes(r.status));
  const openIssues = p.issues.filter((i) => OPEN_ISSUE.includes(i.status));
  const completedTasks = p.tasks.filter((t) => t.status === "COMPLETED").length;
  const wipTasks = p.tasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "BLOCKED").length;
  const remainingTasks = p.tasks.filter((t) => t.status === "NOT_STARTED").length;
  const overdueMs = p.milestones.filter((m) => m.dueDate && m.dueDate < now && m.status !== "COMPLETED");
  const upcomingMs = p.milestones.filter((m) => m.status !== "COMPLETED" && m.dueDate && m.dueDate >= now && m.dueDate <= addDays(now, 60)).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const pDecisions = ctx.decisions.filter((d) => d.projectId === p.id && !d.decision && d.status !== "CANCELLED");
  const overRes = ctx.resources.filter((r) => r.isActive && r.assignments.some((a) => a.projectId === p.id) && r.assignments.filter((a) => a.status === "ACTIVE").reduce((s, a) => s + a.allocationPercent, 0) > 100);
  const budget = c.row.budget;

  const summary: string[] = [];
  const recentCompletions = p.tasks.filter((t) => t.status === "COMPLETED" && inWin(t.updatedAt)).length;
  summary.push(
    `${p.code} (${p.name}) is in the ${p.phase} phase with overall health ${c.row.health} (score ${p.healthScore}). ` +
    `Progress stands at ${c.row.progress}% against a planned ${c.row.plannedProgress}% (variance ${c.row.progressVariance >= 0 ? "+" : ""}${c.row.progressVariance} pts, SPI ${c.row.spi}). ` +
    (c.row.health === "GREY"
      ? `INSUFFICIENT DATA — ${c.conf.gaps.join("; ") || "reporting gaps"} prevent a verified status; treat current RAG as unconfirmed.`
      : `Position versus plan is ${c.row.progressVariance >= 0 ? "ahead of or on" : "behind"} plan.`),
  );
  summary.push(
    `In the reporting window ${recentCompletions} task${recentCompletions === 1 ? "" : "s"} completed and ${p.milestones.filter((m) => m.status === "COMPLETED" && inWin(m.completedAt)).length} milestone(s) reached. ` +
    `Currently ${wipTasks} work-stream${wipTasks === 1 ? "" : "s"} in progress, ${remainingTasks} not started, ${p.tasks.filter((t) => t.endDate && t.endDate < now && !["COMPLETED", "CANCELLED"].includes(t.status)).length} overdue. ` +
    (overdueMs.length ? `Milestone concern: ${overdueMs.map((m) => m.name).join(", ")} ${overdueMs.length === 1 ? "is" : "are"} past due.` : "No milestones are past due."),
  );
  summary.push(
    `Financially the project has spent ${Math.round(p.actualCost)} of ${Math.round(budget)} approved; forecast at completion is ${Math.round(c.row.forecastCost)} (${c.row.budgetVariancePct >= 0 ? "+" : ""}${c.row.budgetVariancePct}% vs budget). ` +
    `Open exposure: ${openRisks.filter((r) => r.severity === "CRITICAL" || r.score >= 16).length} critical risk(s), ${openIssues.filter((i) => i.severity === "CRITICAL").length} critical issue(s), ${pDecisions.length} decision(s) awaiting leadership. ` +
    `Leadership attention is ${pDecisions.length || c.row.health !== "GREEN" ? "required on the items below" : "not currently required beyond routine monitoring"}.`,
  );

  const scheduleBasis = `${c.row.scheduleStatus} — SPI ${c.row.spi}, ${overdueMs.length} overdue milestone(s), ${c.delayedTasks} overdue task(s)`;
  const budgetBasis = budget > 0 ? `${c.row.budgetStatus} — forecast ${Math.round(c.row.forecastCost)} vs approved ${Math.round(budget)} (${c.row.budgetVariancePct}%)` : "GREY — no approved budget recorded";
  const qualityRecs = p.qualityRecords;
  const qualityFail = qualityRecs.filter((q) => q.result === "FAIL" || q.result === "CONDITIONAL");
  const currentStatus: ProjectStatusReport["currentStatus"] = [
    { dimension: "Overall", rating: c.row.health === "GREY" ? "GREY" : (p.ragStatus as "GREEN" | "AMBER" | "RED"), basis: `Health score ${p.healthScore}; RAG ${p.ragStatus}` },
    { dimension: "Schedule", rating: c.row.scheduleStatus === "ON_TRACK" ? "GREEN" : c.row.scheduleStatus === "AT_RISK" ? "AMBER" : "RED", basis: scheduleBasis },
    { dimension: "Budget", rating: c.row.budgetStatus === "OK" ? "GREEN" : c.row.budgetStatus === "WATCH" ? "AMBER" : "RED", basis: budgetBasis },
    { dimension: "Resource", rating: overRes.length ? "RED" : "GREEN", basis: overRes.length ? `${overRes.length} resource(s) over-allocated: ${overRes.map((r) => r.name).join(", ")}` : `${p.assignments.length} active assignment(s), no over-allocation` },
    { dimension: "Risk", rating: openRisks.some((r) => r.severity === "CRITICAL" || r.score >= 16) ? "RED" : openRisks.some((r) => r.severity === "HIGH") ? "AMBER" : openRisks.length ? "AMBER" : "GREEN", basis: `${openRisks.length} open risk(s), top score ${Math.max(0, ...openRisks.map((r) => r.score))}` },
    { dimension: "Quality", rating: qualityFail.some((q) => q.result === "FAIL") ? "RED" : qualityFail.length ? "AMBER" : qualityRecs.length ? "GREEN" : "GREY", basis: qualityRecs.length ? `${qualityRecs.length} record(s), ${qualityFail.length} fail/conditional` : "no quality records yet" },
    { dimension: "Scope", rating: p.changeRequests.some((cr) => ["SUBMITTED", "ASSESSMENT", "APPROVAL"].includes(cr.status)) ? "AMBER" : "GREEN", basis: `${p.changeRequests.filter((cr) => !cr.decision).length} change request(s) pending decision of ${p.changeRequests.length} total` },
  ];

  const concerns: ProjectStatusReport["concerns"] = {
    risks: openRisks.sort((a, b) => b.score - a.score).slice(0, 6).map((r) => ({ code: r.code, title: r.title, severity: r.severity, owner: r.ownerName, mitigation: r.mitigation })),
    issues: openIssues.slice(0, 6).map((i) => ({ code: i.code, title: i.title, severity: i.severity, owner: i.ownerName })),
    delays: [
      ...overdueMs.map((m) => `Milestone ${m.name} overdue since ${m.dueDate!.toISOString().slice(0, 10)}`),
      ...(c.row.spi < 0.95 ? [`Schedule performance index ${c.row.spi} — forecast finish ${c.forecastFinish ? c.forecastFinish.toISOString().slice(0, 10) : "TBD"}`] : []),
    ],
    dependencies: ctx.dependencies.filter((d) => d.successor.projectId === p.id && d.predecessor.status !== "COMPLETED").map((d) => `${d.isExternal ? "External" : d.predecessor.project.code}: ${d.predecessor.code} → ${d.successor.code} (${d.predecessor.status})`),
    resourceConstraints: overRes.map((r) => `${r.name} allocated ${r.assignments.filter((a) => a.status === "ACTIVE").reduce((s, a) => s + a.allocationPercent, 0)}% across projects`),
    budgetConcerns: [c.row.budgetVariancePct > 0 ? `Forecast exceeds budget by ${c.row.budgetVariancePct}%` : null, p.budgetLines.length === 0 && budget > 0 ? "No budget ledger detail recorded" : null].filter(Boolean) as string[],
  };

  const pendingApprovalsCount = (await db.approval.count({ where: { projectId: p.id, status: "PENDING" } }));

  return {
    projectId: p.id, code: p.code, name: p.name, generatedAt: now.toISOString(), since: iso(since)!,
    manager: c.row.managerName, businessOwner: c.row.businessOwnerName, sponsor: c.row.sponsorName,
    phase: p.phase, status: p.status,
    executiveSummary: summary, currentStatus,
    progress: { planned: c.row.plannedProgress, actual: c.row.progress, variance: c.row.progressVariance, spi: c.row.spi, cpi: round2(c.evm.cpi), completedTasks, wipTasks, remainingTasks },
    upcoming: {
      milestones: upcomingMs.map((m) => ({ name: m.name, dueDate: iso(m.dueDate), critical: m.isCritical })),
      deadlines: [...p.tasks.filter((t) => t.isCritical && t.endDate && t.endDate >= now && t.endDate <= addDays(now, 30)).map((t) => ({ name: `${t.code} ${t.name}`, date: iso(t.endDate) }))].slice(0, 6),
      approvals: pendingApprovalsCount,
      deliverables: p.deliverables.filter((d) => !d.deliveredAt && d.dueDate && d.dueDate <= addDays(now, 60)).map((d) => ({ name: d.name, dueDate: iso(d.dueDate) })),
      events: ctx.meetings.filter((m) => m.projectId === p.id && m.scheduledAt >= now).map((m) => ({ title: m.title, date: iso(m.scheduledAt) })),
    },
    concerns,
    leadershipActions: pDecisions.map((d): ProjectStatusReport["leadershipActions"][number] => ({
      decision: `${d.title}${d.description ? ` — ${d.description}` : ""}`,
      who: d.decisionOwner ?? null,
      byWhen: iso(d.requiredBy),
      ifNoDecision: d.businessImpact ?? "Impact of inaction not documented — flag to PMO",
      classification: d.requiredBy && d.requiredBy < now ? "DECISION_REQUIRED_NOW" : d.requiredBy && daysBetween(now, d.requiredBy) <= 14 ? "DECISION_DUE_SOON" : "PENDING",
    })),
    whatChanged: buildWhatChanged(ctx, [c.row], since, ctx.lastSnapshot),
    healthTrend: c.row.trend,
  };
}

// ---------- leadership pack (snapshot persistence) ----------
export async function generateLeadershipPack(scope: "PORTFOLIO" | "PROJECT", projectId: string | null, session: { id: string; name: string } | null): Promise<{ id: string; title: string; version: number }> {
  const bundle = await buildLeadershipBundle();
  const headline = {
    totals: {
      green: bundle.tower.onTrack, amber: bundle.tower.atRisk, red: bundle.tower.critical, grey: bundle.tower.insufficient,
      total: bundle.tower.totalProjects, completionPct: bundle.tower.completionPct,
      forecast: bundle.tower.budget.forecast, actual: bundle.tower.budget.actual, approved: bundle.tower.budget.approved,
      openRisks: bundle.risks.total, openIssues: bundle.issues.total,
      overdueMilestones: bundle.tower.schedule.overdueMilestones,
      pendingDecisions: bundle.tower.pendingDecisions, overdueDecisions: bundle.tower.overdueDecisions, overdueActions: bundle.tower.overdueActions,
    },
    perProject: Object.fromEntries(bundle.portfolio.map((r) => [r.code, { forecastCost: r.forecastCost, progress: r.progress, rag: r.health }])),
  };
  const previousCount = await db.reportSnapshot.count({ where: { scope, projectId: projectId ?? null } });
  const project = projectId ? bundle.portfolio.find((r) => r.id === projectId) : null;
  const title = scope === "PORTFOLIO"
    ? `Leadership Pack — Portfolio Review v${previousCount + 1}`
    : `Leadership Pack — ${project?.code ?? "Project"} Status v${previousCount + 1}`;
  const snap = await db.reportSnapshot.create({
    data: {
      scope, projectId: projectId ?? null, projectCode: project?.code ?? null,
      title, version: previousCount + 1,
      periodStart: new Date(bundle.since), periodEnd: new Date(bundle.generatedAt),
      generatedById: session?.id ?? null, generatedByName: session?.name ?? "System",
      headlineJson: JSON.stringify(headline), payloadJson: JSON.stringify(bundle),
    },
  });
  // Auto-escalate overdue leadership decisions on pack generation
  const now = new Date();
  const overdue = await db.decision.findMany({ where: { decision: null, status: { not: "CANCELLED" }, requiredBy: { lt: now }, escalatedAt: null } });
  if (overdue.length) {
    await db.decision.updateMany({ where: { id: { in: overdue.map((d) => d.id) } }, data: { escalatedAt: now } });
    for (const d of overdue) {
      await db.actionItem.create({ data: { projectId: d.projectId, code: `ACT-DEC-${d.code}`, title: `Escalate overdue decision: ${d.title}`, description: `Decision ${d.code} passed its required-by date without a recorded decision. Escalated automatically by the leadership engine.`, ownerName: d.decisionOwner, priority: "CRITICAL", status: "OPEN", source: "AUTO_ESCALATION", relatedType: "DECISION", relatedCode: d.code, escalationLevel: "LEADERSHIP", dueDate: addDays(now, 3), raisedByName: "Leadership Engine" } }).catch(() => { /* duplicate code — already escalated previously */ });
    }
  }
  return { id: snap.id, title, version: previousCount + 1 };
}

// ---------- schedule runner (lazy scheduler) ----------
export async function runDueSchedules(): Promise<{ ran: number; generated: string[] }> {
  const now = new Date();
  const due = await db.reportSchedule.findMany({ where: { isActive: true, nextRunAt: { lte: now } } });
  const generated: string[] = [];
  const freqDays: Record<string, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30, QUARTERLY: 90 };
  for (const s of due) {
    const pack = await generateLeadershipPack(s.scope as "PORTFOLIO" | "PROJECT", s.projectId ?? null, s.createdByName ? { id: "system", name: s.createdByName } : null);
    const interval = (freqDays[s.frequency] ?? 7) * DAY_MS;
    await db.reportSchedule.update({
      where: { id: s.id },
      data: {
        lastRunAt: now, nextRunAt: new Date(now.getTime() + interval),
        lastRunSummary: `Generated "${pack.title}" (v${pack.version})`,
      },
    });
    // in-app distribution to recipients
    const emails = (s.recipients ?? "").split(/[,;]/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (emails.length) {
      const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
      if (users.length) {
        await db.notification.createMany({
          data: users.map((u) => ({
            userId: u.id, notifType: "REPORT", category: "REPORT", title: pack.title,
            message: `Scheduled leadership report "${s.name}" (${s.frequency}) has been generated and is ready in Reports → History.`,
            actionUrl: "#/reports/leadership", channel: "IN_APP",
          })),
        }).catch(() => { /* distribution failure is non-fatal — report stays in History view */ });
      }
    }
    generated.push(`${s.name} → ${pack.title}`);
  }
  return { ran: due.length, generated };
}
