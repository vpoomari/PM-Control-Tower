// PM CONTROL TOWER — Governance Engine
// Configurable threshold rules (LT / LTE / GT / GTE / EQ) evaluated against live
// project metrics. Breaches create AlertEvent → Work Inbox → Notification →
// Project Health recalculation → Executive Dashboard → Realtime event.

import { db } from "../db";
import { round2, safeDiv } from "../constants";
import { computeEVM } from "./evm";
import { recalcProjectHealth } from "./health";
import { emitRealtime } from "../realtime";
import { writeAudit } from "../audit";

export function evaluateOperator(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case "LT": return value < threshold;
    case "LTE": return value <= threshold;
    case "GT": return value > threshold;
    case "GTE": return value >= threshold;
    case "EQ": return Math.abs(value - threshold) < 0.005;
    default: return false;
  }
}

export interface ProjectMetrics {
  CPI: number; SPI: number; EAC: number; BUDGET_UTILIZATION: number;
  HEALTH_SCORE: number; COST_VARIANCE: number; SCHEDULE_VARIANCE_DAYS: number;
  OPEN_RISKS: number; OPEN_ISSUES: number;
}

export async function computeProjectMetrics(projectId: string): Promise<ProjectMetrics | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { tasks: true, risks: { where: { status: { in: ["OPEN", "ESCALATED"] } } }, issues: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } },
  });
  if (!project) return null;
  const evm = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, project.statusDate || new Date());
  const baselineFinish = project.baselineFinish || project.endDate;
  const scheduleVarDays = baselineFinish && project.endDate && project.endDate > baselineFinish
    ? Math.round((project.endDate.getTime() - baselineFinish.getTime()) / 86_400_000)
    : 0;
  return {
    CPI: evm.cpi, SPI: evm.spi, EAC: evm.eac,
    BUDGET_UTILIZATION: round2(safeDiv(project.actualCost, project.currentBudget || 1, 0) * 100),
    HEALTH_SCORE: project.healthScore,
    COST_VARIANCE: evm.costVariance,
    SCHEDULE_VARIANCE_DAYS: scheduleVarDays,
    OPEN_RISKS: project.risks.length, OPEN_ISSUES: project.issues.length,
  };
}

export interface GovernanceResult {
  evaluated: number;
  breaches: { projectId: string; ruleId: string; ruleName: string; metric: string; value: number; threshold: number; severity: string }[];
}

/** Evaluate all active rules (optionally scoped to one project). Deduplicates NEW alerts per project+rule. */
export async function evaluateGovernance(projectId?: string): Promise<GovernanceResult> {
  const rules = await db.governanceRule.findMany({ where: { isActive: true } });
  const projects = await db.project.findMany({
    where: projectId ? { id: projectId } : { status: { in: ["ACTIVE", "ON_HOLD", "DRAFT"] } },
    select: { id: true, name: true, code: true, ownerId: true, managerId: true, ragStatus: true, healthScore: true },
  });
  const result: GovernanceResult = { evaluated: 0, breaches: [] };

  for (const project of projects) {
    const metrics = await computeProjectMetrics(project.id);
    if (!metrics) continue;
    for (const rule of rules) {
      if (rule.scopeType === "PROJECT" && rule.scopeId && rule.scopeId !== project.id) continue;
      const value = (metrics as unknown as Record<string, number>)[rule.metric];
      if (value === undefined || value === null) continue;
      result.evaluated += 1;
      if (!evaluateOperator(value, rule.operator, rule.threshold)) continue;

      const dupe = await db.alertEvent.findFirst({
        where: { projectId: project.id, ruleId: rule.id, status: "NEW", createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      });
      if (dupe) continue;

      const alert = await db.alertEvent.create({
        data: {
          projectId: project.id, ruleId: rule.id,
          alertType: rule.metric.includes("CPI") || rule.metric.includes("SPI") || rule.metric === "EAC" ? "EVM_BREACH" : rule.metric === "BUDGET_UTILIZATION" ? "BUDGET_BREACH" : "GOVERNANCE",
          severity: rule.severity,
          title: `${rule.name} — ${project.code}`,
          message: `${rule.metric} = ${value} breached ${rule.operator} ${rule.threshold} on ${project.name}.`,
          metricValue: value, threshold: rule.threshold,
          source: "GOVERNANCE_ENGINE",
        },
      });
      result.breaches.push({ projectId: project.id, ruleId: rule.id, ruleName: rule.name, metric: rule.metric, value, threshold: rule.threshold, severity: rule.severity });

      await db.governanceRule.update({ where: { id: rule.id }, data: { executionCount: { increment: 1 }, lastTriggeredAt: new Date() } });

      // Route to PM / manager inboxes
      const targets = [project.ownerId, project.managerId].filter(Boolean) as string[];
      const pmoUsers = await db.user.findMany({ where: { userRoles: { some: { role: { code: { in: ["PMO_ADMIN", "PORTFOLIO_MANAGER"] } } } }, isActive: true }, select: { id: true } });
      const userIds = [...new Set([...targets, ...pmoUsers.map((u) => u.id)])];
      for (const uid of userIds) {
        await db.inboxItem.create({
          data: {
            userId: uid, category: rule.severity === "CRITICAL" ? "ESCALATIONS" : "GOVERNANCE",
            title: alert.title, message: alert.message, entityType: "AlertEvent", entityId: alert.id,
            projectId: project.id, priority: rule.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
            actionUrl: `#/governance`, sourceType: "GOVERNANCE_ENGINE",
          },
        });
        if (rule.actionNotify) {
          await db.notification.create({
            data: {
              userId: uid, notifType: "GOVERNANCE", category: "GOVERNANCE",
              title: alert.title, message: alert.message, entityType: "AlertEvent", entityId: alert.id,
              projectId: project.id, severity: rule.severity, actionUrl: "#/governance",
            },
          });
        }
      }
      emitRealtime("alert:created", { alertId: alert.id, projectId: project.id, severity: rule.severity, title: alert.title }, `project:${project.id}`);
    }

    if (result.breaches.some((b) => b.projectId === project.id) ) {
      const anyRule = result.breaches.find((b) => b.projectId === project.id)!;
      if (anyRule && rules.find((r) => r.id === anyRule.ruleId)?.actionRecalcHealth) {
        await recalcProjectHealth(project.id, "GOVERNANCE");
      }
    }
  }

  if (result.breaches.length) {
    await writeAudit({
      action: "EXECUTE", entityType: "GovernanceEngine", entityName: "Rule evaluation",
      after: { breaches: result.breaches.length, evaluated: result.evaluated }, severity: "WARNING",
      context: "Governance engine cycle",
    });
    emitRealtime("governance:changed", { breaches: result.breaches.length });
  }
  return result;
}
