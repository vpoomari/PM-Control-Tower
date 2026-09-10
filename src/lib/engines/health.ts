// PM CONTROL TOWER — Project Health Engine
// Multi-factor scoring → Health Score (0-100) → RAG (Green/Amber/Red).
// Persists ProjectHealthSnapshot on every material recalculation.

import { db } from "../db";
import { clamp, round2 } from "../constants";
import { computeEVM } from "./evm";
import { emitRealtime } from "../realtime";

export interface HealthInputs {
  cpi: number; spi: number;
  costVariance: number; scheduleVariance: number;
  eac: number; bac: number; actualCost: number;
  openCriticalRisks: number; openCriticalIssues: number;
  overdueMilestones: number;
  governanceAlerts: number;
  overAllocated: number;
}

export function scoreHealth(i: HealthInputs): { score: number; rag: string; factors: Record<string, number> } {
  let score = 100;
  const factors: Record<string, number> = {};

  const cpiPen = i.cpi < 1 ? clamp((1 - i.cpi) * 200, 0, 40) : 0;
  const spiPen = i.spi < 1 ? clamp((1 - i.spi) * 200, 0, 30) : 0;
  const util = i.bac > 0 ? i.actualCost / i.bac : 0;
  const budgetPen = util > 1 ? clamp((util - 1) * 100, 0, 20) : 0;
  const riskPen = Math.min(i.openCriticalRisks * 6, 24);
  const issuePen = Math.min(i.openCriticalIssues * 8, 24);
  const msPen = Math.min(i.overdueMilestones * 5, 15);
  const alertPen = Math.min(i.governanceAlerts * 5, 15);
  const resPen = i.overAllocated > 0 ? 10 : 0;

  factors.costPerformance = round2(cpiPen);
  factors.schedulePerformance = round2(spiPen);
  factors.budgetUtilization = round2(budgetPen);
  factors.criticalRisks = riskPen;
  factors.criticalIssues = issuePen;
  factors.overdueMilestones = msPen;
  factors.governanceAlerts = alertPen;
  factors.resourceCapacity = resPen;

  score = clamp(100 - (cpiPen + spiPen + budgetPen + riskPen + issuePen + msPen + alertPen + resPen), 0, 100);

  // Rule overrides — hard floors
  let rag = score >= 80 ? "GREEN" : score >= 60 ? "AMBER" : "RED";
  if (i.cpi < 0.85 || i.spi < 0.8) rag = rag === "RED" ? "RED" : "AMBER";
  if (i.cpi < 0.75 || i.spi < 0.7 || i.openCriticalIssues >= 3) rag = "RED";

  return { score: round2(score), rag, factors };
}

/** Recompute EVM + health for a project, persist snapshots, update project row, emit events. */
export async function recalcProjectHealth(projectId: string, triggeredBy = "SYSTEM"): Promise<{ score: number; rag: string }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: true,
      milestones: true,
      risks: { where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } } },
      issues: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
      alertEvents: { where: { status: "NEW" } },
    },
  });
  if (!project) return { score: 100, rag: "GREEN" };

  const evm = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, project.statusDate || new Date());
  const now = new Date();
  const overdueMilestones = project.milestones.filter((m) => m.dueDate && m.dueDate < now && m.status !== "COMPLETED").length;
  const criticalRisks = project.risks.filter((r) => r.severity === "CRITICAL" || r.score >= 16).length;
  const criticalIssues = project.issues.filter((i) => i.severity === "CRITICAL" || i.priority === "CRITICAL").length;
  const govAlerts = project.alertEvents.filter((a) => a.severity === "CRITICAL").length;

  const { score, rag, factors } = scoreHealth({
    cpi: evm.cpi, spi: evm.spi,
    costVariance: evm.costVariance, scheduleVariance: evm.scheduleVariance,
    eac: evm.eac, bac: evm.bac, actualCost: evm.ac,
    openCriticalRisks: criticalRisks, openCriticalIssues: criticalIssues,
    overdueMilestones, governanceAlerts: govAlerts, overAllocated: 0,
  });

  const prevRag = project.ragStatus;
  await db.project.update({
    where: { id: projectId },
    data: {
      healthScore: score,
      ragStatus: rag,
      progress: evm.percentComplete,
      forecastCost: evm.eac,
    },
  });
  await db.projectHealthSnapshot.create({
    data: {
      projectId, healthScore: score, ragStatus: rag,
      cpi: evm.cpi, spi: evm.spi,
      costVariance: evm.costVariance, scheduleVariance: evm.scheduleVariance,
      eac: evm.eac, bac: evm.bac,
      openRisks: project.risks.length, openIssues: project.issues.length,
      overdueMilestones, triggeredBy,
      notes: `Factors: ${JSON.stringify(factors)}`,
    },
  });
  if (prevRag !== rag) {
    emitRealtime("project:health", { projectId, score, rag, previousRag: prevRag }, `project:${projectId}`);
  }
  return { score, rag };
}
