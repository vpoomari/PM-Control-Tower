// PM CONTROL TOWER — Data Quality API (computed, never typed)
// GET /api/integrity/data-quality — enterprise data-quality checks + score per project.
// Checks: missing owner/sponsor/dates/budget, projects without recent updates,
// risks without owner/mitigation, tasks without assignee, resources without skills.

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { round2 } from "@/lib/constants";

export const GET = withApi(async () => {
  const [projects, risks, openTasks, resources] = await Promise.all([
    db.project.findMany({
      select: { id: true, code: true, name: true, ownerId: true, sponsorId: true, startDate: true, endDate: true, baselineBudget: true, currentBudget: true, healthScore: true, ragStatus: true, updatedAt: true },
    }),
    db.risk.findMany({ where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } }, select: { id: true, projectId: true, ownerName: true, mitigation: true, title: true } }),
    db.task.findMany({ where: { status: { in: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] } }, select: { id: true, projectId: true, assigneeId: true } }),
    db.resource.findMany({ select: { id: true, skills: true, name: true } }),
  ]);

  const staleCutoff = Date.now() - 14 * 86_400_000;
  const rows = projects.map((p) => {
    const issues: { check: string; detail: string }[] = [];
    if (!p.ownerId) issues.push({ check: "Missing owner", detail: "Project has no owner assigned" });
    if (!p.sponsorId) issues.push({ check: "Missing sponsor", detail: "No executive sponsor recorded" });
    if (!p.startDate || !p.endDate) issues.push({ check: "Missing dates", detail: "Start or end date missing" });
    if (!p.baselineBudget && !p.currentBudget) issues.push({ check: "Missing budget", detail: "No baseline or current budget" });
    if (p.updatedAt.getTime() < staleCutoff) issues.push({ check: "Stale project", detail: "No updates in 14+ days" });

    const pRisks = risks.filter((r) => r.projectId === p.id);
    const risksNoOwner = pRisks.filter((r) => !r.ownerName).length;
    const risksNoMitigation = pRisks.filter((r) => !r.mitigation).length;
    if (risksNoOwner) issues.push({ check: "Risks without owner", detail: `${risksNoOwner} open risk(s) missing an owner` });
    if (risksNoMitigation) issues.push({ check: "Risks without mitigation", detail: `${risksNoMitigation} open risk(s) missing mitigation` });

    const unassignedTasks = openTasks.filter((t) => t.projectId === p.id && !t.assigneeId).length;
    if (unassignedTasks) issues.push({ check: "Tasks without assignee", detail: `${unassignedTasks} open task(s) unassigned` });

    const noSkills = resources.filter((r) => !r.skills).length;

    const score = Math.max(0, 100 - issues.length * 12);
    return {
      project: { id: p.id, code: p.code, name: p.name, ragStatus: p.ragStatus, healthScore: p.healthScore },
      score,
      issues,
      riskTotals: { open: pRisks.length, noOwner: risksNoOwner, noMitigation: risksNoMitigation },
      unassignedTasks,
    };
  });

  const noSkillResources = resources.filter((r) => !r.skills).map((r) => r.name);
  const avg = rows.length ? round2(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 100;
  return ok({
    projects: rows.sort((a, b) => a.score - b.score),
    averageScore: avg,
    resourceIssues: { total: resources.length, withoutSkills: noSkillResources.length, names: noSkillResources.slice(0, 8) },
  });
}, { permission: "integrity.view", rateLimit: { limit: 240, windowMs: 60_000 } });
