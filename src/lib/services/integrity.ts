// PM CONTROL TOWER — Integrity Layer service orchestration.
// Engines compute (pure); services orchestrate (DB reads/writes, audit, realtime).

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { computeFreshness, FreshnessResult } from "@/lib/engines/freshness";
import { buildChain, verifyChain, EvidenceDoc } from "@/lib/engines/evidence";
import { runSimulation } from "@/lib/engines/montecarlo";
import { computeFactors } from "@/lib/engines/calibration";
import { rollupBenefits } from "@/lib/engines/benefits";
import { applyOverrides, computeScenarioDiff, deepClone, rebaseOverrides, ScenarioOverrides, ScenarioSnapshot } from "@/lib/engines/scenario";

export async function getFreshnessConfig() {
  let cfg = await db.systemConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) cfg = await db.systemConfig.create({ data: { id: "singleton" } });
  return cfg;
}

export async function updateFreshnessConfig(data: { freshnessWarn?: number; freshnessDegrade?: number; freshnessCritical?: number; freshnessGraceHours?: number }) {
  await getFreshnessConfig();
  return db.systemConfig.update({ where: { id: "singleton" }, data });
}

const DEFAULT_CADENCES: Record<string, number> = { timesheets: 7, ledger: 7, tasks: 3, raid: 14, gates: 30 };

/** Compute per-feed lastUpdate from live operational rows — staleness is always derived, never typed. */
async function feedLastUpdates(projectId: string): Promise<Record<string, Date>> {
  const [lastEntry, lastApproved, lastTask, lastLedgerTask, lastRisk, lastIssue, lastGate, project] = await Promise.all([
    db.timesheetEntry.findFirst({ where: { task: { projectId } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.timesheet.findFirst({ where: { status: "APPROVED", resource: { assignments: { some: { projectId } } } }, orderBy: { approvedAt: "desc" }, select: { approvedAt: true } }),
    db.task.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.task.findFirst({ where: { projectId, actualCost: { gt: 0 } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.risk.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.issue.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.stageGate.findFirst({ where: { projectId, decisionDate: { not: null } }, orderBy: { decisionDate: "desc" }, select: { decisionDate: true } }),
    db.project.findUnique({ where: { id: projectId }, select: { updatedAt: true, createdAt: true } }),
  ]);
  const fallback = project?.updatedAt ?? project?.createdAt ?? new Date();
  return {
    timesheets: lastApproved?.approvedAt ?? lastEntry?.createdAt ?? fallback,
    ledger: lastLedgerTask?.updatedAt ?? fallback,
    tasks: lastTask?.updatedAt ?? fallback,
    raid: (lastRisk?.updatedAt && lastIssue?.updatedAt) ? (lastRisk.updatedAt > lastIssue.updatedAt ? lastRisk.updatedAt : lastIssue.updatedAt) : (lastRisk?.updatedAt ?? lastIssue?.updatedAt ?? fallback),
    gates: lastGate?.decisionDate ?? fallback,
  };
}

export async function computeProjectFreshness(projectId: string): Promise<(FreshnessResult & { projectId: string }) | null> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, code: true } });
  if (!project) return null;
  const existing = await db.freshnessMetric.findMany({ where: { projectId } });
  const cadence = (feed: string) => existing.find((m) => m.feed === feed)?.expectedCadenceDays ?? DEFAULT_CADENCES[feed] ?? 7;
  const updates = await feedLastUpdates(projectId);
  const feeds = Object.entries(updates).map(([feed, lastUpdate]) => ({ feed, lastUpdate, expectedCadenceDays: cadence(feed) }));
  const cfg = await getFreshnessConfig();
  const result = computeFreshness(feeds, new Date(), { thresholds: { warn: cfg.freshnessWarn, degrade: cfg.freshnessDegrade, critical: cfg.freshnessCritical }, graceHours: cfg.freshnessGraceHours });
  // Persist cadence + lastUpdate snapshot (config lives here; computation is always live)
  for (const f of feeds) {
    await db.freshnessMetric.upsert({
      where: { projectId_feed: { projectId, feed: f.feed } },
      create: { projectId, feed: f.feed, lastUpdate: f.lastUpdate, expectedCadenceDays: f.expectedCadenceDays },
      update: { lastUpdate: f.lastUpdate, expectedCadenceDays: f.expectedCadenceDays },
    });
  }
  return { projectId, ...result };
}

export async function recalcProjectFreshness(projectId: string): Promise<void> {
  const before = await computeProjectFreshness(projectId);
  if (!before) return;
  emitRealtime("freshness:changed", { projectId, level: before.level, score: before.score }, `project:${projectId}`);
  if (before.level === "CRITICAL") {
    const title = `Data freshness critical — ${before.worstFeed} feed stale`;
    const dup = await db.inboxItem.findFirst({ where: { projectId, title, status: "OPEN" }, select: { id: true } });
    if (!dup) {
      const pmoRoles = await db.role.findFirst({ where: { code: "PMO_ADMIN" }, include: { users: { take: 1, select: { userId: true } } } });
      const pmoId = pmoRoles?.users[0]?.userId;
      if (pmoId) await db.inboxItem.create({ data: { userId: pmoId, projectId, category: "ACTION_REQUIRED", priority: "HIGH", title, message: "A critical feed breached its freshness cadence — dashboard figures may not reflect reality.", sourceType: "FRESHNESS", actionUrl: "#/integrity" } });
    }
  }
}

// ---------- Evidence ----------
export async function buildEvidenceBundle(projectId: string, session: { id: string; name: string }) {
  const [project, baselines, crs, gates, timesheets, entries, health, audits] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, status: true, baselineBudget: true, currentBudget: true, actualCost: true, healthScore: true, ragStatus: true } }),
    db.baseline.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.stageGate.findMany({ where: { projectId }, orderBy: { sequence: "asc" } }),
    db.timesheet.findMany({ where: { resource: { assignments: { some: { projectId } } } }, orderBy: { weekStart: "asc" } }),
    db.timesheetEntry.findMany({ where: { task: { projectId } }, orderBy: { createdAt: "asc" }, take: 500 }),
    db.projectHealthSnapshot.findMany({ where: { projectId }, orderBy: { capturedAt: "asc" } }),
    db.auditEvent.findMany({ where: { entityType: { in: ["Project", "ChangeRequest", "StageGate", "Baseline", "Timesheet"] }, entityId: projectId }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  if (!project) throw new Error("Project not found");
  const docs: EvidenceDoc[] = [
    { ref: `project:${project.id}`, kind: "PROJECT_RECORD", content: JSON.stringify(project) },
    ...baselines.map((b) => ({ ref: `baseline:${b.id}`, kind: "BASELINE", content: JSON.stringify(b) })),
    ...crs.map((c) => ({ ref: `change:${c.id}`, kind: "CHANGE_REQUEST", content: JSON.stringify(c) })),
    ...gates.map((g) => ({ ref: `gate:${g.id}`, kind: "GATE_DECISION", content: JSON.stringify(g) })),
    ...timesheets.map((t) => ({ ref: `timesheet:${t.id}`, kind: "TIMESHEET", content: JSON.stringify(t) })),
    ...entries.map((e) => ({ ref: `entry:${e.id}`, kind: "TIMESHEET_ENTRY", content: JSON.stringify(e) })),
    ...health.map((h) => ({ ref: `health:${h.id}`, kind: "HEALTH_SNAPSHOT", content: JSON.stringify(h) })),
    ...audits.map((a) => ({ ref: `audit:${a.id}`, kind: "AUDIT", content: JSON.stringify(a) })),
  ];
  const manifest = buildChain(docs);
  const bundle = await db.evidenceBundle.create({
    data: {
      projectId, createdBy: session.id, createdByName: session.name,
      docCount: docs.length, manifestHash: manifest.manifestHash, manifestJson: JSON.stringify(manifest), status: "VALID", verifiedAt: new Date(),
    },
  });
  await writeAudit({ userId: session.id, userName: session.name, action: "EXPORT", entityType: "EvidenceBundle", entityId: bundle.id, entityName: `Evidence bundle — ${project.code}`, after: { docCount: docs.length, manifestHash: manifest.manifestHash }, severity: "NOTICE" });
  return { bundle, docCount: docs.length, manifestHash: manifest.manifestHash };
}

export async function verifyEvidenceBundle(bundleId: string) {
  const bundle = await db.evidenceBundle.findUnique({ where: { id: bundleId } });
  if (!bundle) throw new Error("Bundle not found");
  const manifest = JSON.parse(bundle.manifestJson);
  const [baselines, crs, gates, timesheets, entries, health, audits, project] = await Promise.all([
    db.baseline.findMany({ where: { projectId: bundle.projectId }, orderBy: { createdAt: "asc" } }),
    db.changeRequest.findMany({ where: { projectId: bundle.projectId }, orderBy: { createdAt: "asc" } }),
    db.stageGate.findMany({ where: { projectId: bundle.projectId }, orderBy: { sequence: "asc" } }),
    db.timesheet.findMany({ where: { resource: { assignments: { some: { projectId: bundle.projectId } } } }, orderBy: { weekStart: "asc" } }),
    db.timesheetEntry.findMany({ where: { task: { projectId: bundle.projectId } }, orderBy: { createdAt: "asc" }, take: 500 }),
    db.projectHealthSnapshot.findMany({ where: { projectId: bundle.projectId }, orderBy: { capturedAt: "asc" } }),
    db.auditEvent.findMany({ where: { entityType: { in: ["Project", "ChangeRequest", "StageGate", "Baseline", "Timesheet"] }, entityId: bundle.projectId }, orderBy: { createdAt: "asc" }, take: 300 }),
    db.project.findUnique({ where: { id: bundle.projectId }, select: { id: true, code: true, name: true, status: true, baselineBudget: true, currentBudget: true, actualCost: true, healthScore: true, ragStatus: true } }),
  ]);
  const docs: EvidenceDoc[] = [
    { ref: `project:${project!.id}`, kind: "PROJECT_RECORD", content: JSON.stringify(project) },
    ...baselines.map((b) => ({ ref: `baseline:${b.id}`, kind: "BASELINE", content: JSON.stringify(b) })),
    ...crs.map((c) => ({ ref: `change:${c.id}`, kind: "CHANGE_REQUEST", content: JSON.stringify(c) })),
    ...gates.map((g) => ({ ref: `gate:${g.id}`, kind: "GATE_DECISION", content: JSON.stringify(g) })),
    ...timesheets.map((t) => ({ ref: `timesheet:${t.id}`, kind: "TIMESHEET", content: JSON.stringify(t) })),
    ...entries.map((e) => ({ ref: `entry:${e.id}`, kind: "TIMESHEET_ENTRY", content: JSON.stringify(e) })),
    ...health.map((h) => ({ ref: `health:${h.id}`, kind: "HEALTH_SNAPSHOT", content: JSON.stringify(h) })),
    ...audits.map((a) => ({ ref: `audit:${a.id}`, kind: "AUDIT", content: JSON.stringify(a) })),
  ];
  const res = verifyChain(docs, manifest);
  await db.evidenceBundle.update({ where: { id: bundleId }, data: { status: res.pass ? "VALID" : "TAMPERED", verifiedAt: new Date() } });
  return res;
}

// ---------- Calibration ----------
export async function recomputeCalibration() {
  const completed = await db.task.findMany({
    where: { status: "COMPLETED", durationDays: { gt: 0 }, endDate: { not: null }, startDate: { not: null } },
    select: { id: true, projectId: true, code: true, name: true, durationDays: true, startDate: true, endDate: true, assigneeId: true, project: { select: { name: true, code: true } } },
    take: 2000,
  });
  const rows = completed.map((t) => {
    const actualDays = Math.max(0.5, (t.endDate!.getTime() - t.startDate!.getTime()) / 86_400_000);
    const workTypeCode = t.code.split(".").slice(0, 2).join(".") || t.code;
    return [
      { scopeType: "project" as const, scopeId: t.projectId, label: `${t.project.code} — ${t.project.name}`, planned: t.durationDays, actual: actualDays },
      { scopeType: "workType" as const, scopeId: `${t.projectId}:${workTypeCode}`, label: `${t.project.code} · ${workTypeCode}`, planned: t.durationDays, actual: actualDays },
    ];
  }).flat();
  const factors = computeFactors(rows, { minSamples: 5 });
  for (const f of factors) {
    await db.calibrationFactor.upsert({
      where: { scopeType_scopeId: { scopeType: f.scopeType, scopeId: f.scopeId } },
      create: { scopeType: f.scopeType, scopeId: f.scopeId, label: f.label, factor: f.factor, sampleSize: f.sampleSize, mad: f.mad },
      update: { label: f.label, factor: f.factor, sampleSize: f.sampleSize, mad: f.mad, computedAt: new Date() },
    });
  }
  return factors;
}

// ---------- Simulation ----------
export async function computeSimulationData(projectId: string, opts: { seed?: number; iterations?: number }) {
  const [project, tasks, deps, estimates, milestones] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, statusDate: true, createdAt: true, baselineBudget: true, currentBudget: true } }),
    db.task.findMany({ where: { projectId }, select: { id: true, name: true, durationDays: true, isSummary: true, estimate: true } }),
    db.dependency.findMany({ where: { projectId }, select: { predecessorId: true, successorId: true, depType: true, lagDays: true } }),
    db.taskEstimate.findMany({ where: { taskId: { in: (await db.task.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id) } } }),
    db.milestone.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);
  if (!project) throw new Error("Project not found");
  const estByTask = new Map(estimates.map((e) => [e.taskId, e]));
  const mcTasks = tasks.map((t) => ({
    id: t.id, name: t.name, durationDays: t.durationDays, isSummary: t.isSummary,
    estimate: estByTask.get(t.id) ? { optimistic: estByTask.get(t.id)!.optimistic, likely: estByTask.get(t.id)!.likely, pessimistic: estByTask.get(t.id)!.pessimistic, distribution: estByTask.get(t.id)!.distribution as "PERT" | "TRIANGULAR" } : undefined,
  }));
  const budget = project.currentBudget ?? project.baselineBudget ?? 0;
  const durationDays = mcTasks.filter((t) => !t.isSummary).reduce((s, t) => s + t.durationDays, 0) || 1;
  const dailyCost = budget > 0 ? budget / Math.max(durationDays, 1) : 0;
  const result = runSimulation({ tasks: mcTasks, deps: deps as never, baseCost: budget, dailyCost, milestones: milestones.map((m) => ({ id: m.id, name: m.name, taskId: null })) }, { seed: opts.seed, iterations: opts.iterations });
  return { result, projectName: project.name, projectCode: project.code, projectStart: (project.statusDate ?? project.createdAt)?.toISOString() ?? new Date().toISOString(), budget };
}

export async function runAndStoreSimulation(projectId: string, opts: { seed?: number; iterations?: number }) {
  await db.simulationRun.updateMany({ where: { projectId, stale: false }, data: { stale: true } });
  const { result, projectName, projectCode, projectStart, budget } = await computeSimulationData(projectId, opts);
  const run = await db.simulationRun.create({
    data: { projectId, seed: result.seed, iterations: result.iterations, resultsJson: JSON.stringify({ ...result, projectStart, budget }), status: "COMPLETE" },
  });
  emitRealtime("simulation:completed", { projectId, runId: run.id, finish: result.finish }, `project:${projectId}`);
  return { run, result: { ...result, projectStart, budget }, projectName, projectCode };
}

// ---------- Scenario ----------
export async function buildScenarioSnapshot(projectId: string): Promise<ScenarioSnapshot> {
  const [project, tasks, deps, assignments] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, statusDate: true, createdAt: true, currentBudget: true, baselineBudget: true } }),
    db.task.findMany({ where: { projectId }, select: { id: true, name: true, durationDays: true, isSummary: true } }),
    db.dependency.findMany({ where: { projectId }, select: { predecessorId: true, successorId: true, depType: true, lagDays: true } }),
    db.assignment.findMany({ where: { projectId }, select: { id: true, resourceId: true, allocationPercent: true, taskId: true, resource: { select: { name: true } } } }),
  ]);
  if (!project) throw new Error("Project not found");
  return {
    projectId, projectName: project.name, projectStart: (project.statusDate ?? project.createdAt)?.toISOString() ?? null,
    budget: project.currentBudget ?? project.baselineBudget ?? 0,
    tasks: tasks.map((t) => ({ id: t.id, name: t.name, durationDays: t.durationDays, isSummary: t.isSummary })),
    deps: deps as never,
    assignments: assignments.map((a) => ({ id: a.id, resourceId: a.resourceId, resourceName: a.resource.name, allocationPercent: a.allocationPercent, taskId: a.taskId })),
  };
}

export function simulateScenario(snapshot: ScenarioSnapshot, overrides: ScenarioOverrides) {
  const { simulated, applied } = applyOverrides(deepClone(snapshot), overrides);
  const diff = computeScenarioDiff(snapshot, simulated, applied);
  return { simulated, diff };
}

export async function mergeScenario(scenarioId: string, session: { id: string; name: string; roles: string[] }) {
  const scenario = await db.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario) throw new Error("Scenario not found");
  if (scenario.status !== "SANDBOX") throw new Error("Scenario already resolved");
  const rawOverrides: ScenarioOverrides = JSON.parse(scenario.overridesJson);
  const snapshot: ScenarioSnapshot = JSON.parse(scenario.snapshotJson);
  // Rebase on current actuals: production may have drifted since the branch.
  const [currentTasks, currentAssignments] = await Promise.all([
    db.task.findMany({ where: { projectId: scenario.projectId }, select: { id: true, durationDays: true } }),
    db.assignment.findMany({ where: { projectId: scenario.projectId }, select: { id: true } }),
  ]);
  const { rebased: overrides, decisions: rebaseDecisions } = rebaseOverrides(
    snapshot, rawOverrides,
    { tasks: currentTasks.map((t) => ({ id: t.id, name: t.id, durationDays: t.durationDays, isSummary: false })), assignmentIds: new Set(currentAssignments.map((a) => a.id)) },
  );
  const { diff } = simulateScenario(snapshot, overrides);
  const rebaseNotes = rebaseDecisions.filter((d) => d.kind !== "APPLIED").map((d) => d.kind + ": " + d.note);

  const crCount = await db.changeRequest.count({ where: { projectId: scenario.projectId } });
  const result = await db.$transaction(async (tx) => {
    if (overrides.durationChanges) {
      for (const [taskId, days] of Object.entries(overrides.durationChanges)) {
        await tx.task.updateMany({ where: { id: taskId, projectId: scenario.projectId }, data: { durationDays: days } });
      }
    }
    if (overrides.removeAssignments?.length) {
      await tx.assignment.deleteMany({ where: { id: { in: overrides.removeAssignments }, projectId: scenario.projectId } });
    }
    if (overrides.reassignResource) {
      await tx.assignment.updateMany({ where: { projectId: scenario.projectId, resourceId: overrides.reassignResource.fromResourceId }, data: { resourceId: overrides.reassignResource.toResourceId } });
    }
    if (overrides.budgetDelta) {
      await tx.project.update({ where: { id: scenario.projectId }, data: { currentBudget: { increment: overrides.budgetDelta } } });
    }
    const cr = await tx.changeRequest.create({
      data: {
        projectId: scenario.projectId,
        code: `CR-SCN-${String(crCount + 1).padStart(3, "0")}`,
        title: `Scenario merge — ${scenario.name}`,
        description: `Merged from scenario sandbox. Applied: ${diff.applied.join("; ") || "no overrides"}. Schedule impact ${diff.finishDeltaDays >= 0 ? "+" : ""}${diff.finishDeltaDays}d, budget impact ${diff.budgetDelta}. Rebase: ${rebaseNotes.join("; ") || "clean (no drift)"}.`,
        reason: "SCENARIO_MERGE", category: "SCOPE", requesterId: session.id, requesterName: session.name,
        scheduleImpactDays: diff.finishDeltaDays, impactCost: diff.budgetDelta, status: "APPROVED",
        decidedBy: session.name,
      },
    });
    const updated = await tx.scenario.update({ where: { id: scenarioId }, data: { status: "MERGED", mergedAt: new Date(), diffJson: JSON.stringify({ ...diff, rebaseDecisions }), changeRequestId: cr.id } });
    return { cr, scenario: updated };
  });
  emitRealtime("scenario:merged", { scenarioId, projectId: scenario.projectId, crId: result.cr.id }, `project:${scenario.projectId}`);
  await writeAudit({ userId: session.id, userName: session.name, role: session.roles[0], action: "MERGE", entityType: "Scenario", entityId: scenarioId, entityName: scenario.name, after: { changeRequestId: result.cr.id, diff }, ipAddress: "internal", severity: "WARNING" });
  return result;
}

// ---------- Benefits ----------
export async function benefitsRollupForProject(projectId: string) {
  const profiles = await db.benefitProfile.findMany({ where: { projectId }, include: { actuals: { orderBy: { period: "asc" } } } });
  const cumulative: Record<string, number> = {};
  for (const p of profiles) cumulative[p.id] = p.actuals.length ? p.actuals[p.actuals.length - 1].value : 0;
  return { profiles, rollup: rollupBenefits(profiles, cumulative) };
}

export async function portfolioBenefitsRollup() {
  const projects = await db.project.findMany({ select: { id: true, code: true, name: true, ragStatus: true } });
  const out: Array<{ project: { id: string; code: string; name: string; ragStatus: string }; profiles: any[]; rollup: ReturnType<typeof rollupBenefits> }> = [];
  for (const p of projects) {
    const r = await benefitsRollupForProject(p.id);
    if (r.profiles.length === 0) continue;
    out.push({ project: p, ...r });
  }
  return out;
}

// ---------- Evidence ZIP export (human-readable index + manifest + docs) ----------
import { buildZip } from "@/lib/engines/zip";

async function collectEvidenceDocs(projectId: string): Promise<EvidenceDoc[]> {
  const [project, baselines, crs, gates, timesheets, entries, health, audits] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, status: true, baselineBudget: true, currentBudget: true, actualCost: true, healthScore: true, ragStatus: true } }),
    db.baseline.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.stageGate.findMany({ where: { projectId }, orderBy: { sequence: "asc" } }),
    db.timesheet.findMany({ where: { resource: { assignments: { some: { projectId } } } }, orderBy: { weekStart: "asc" } }),
    db.timesheetEntry.findMany({ where: { task: { projectId } }, orderBy: { createdAt: "asc" }, take: 500 }),
    db.projectHealthSnapshot.findMany({ where: { projectId }, orderBy: { capturedAt: "asc" } }),
    db.auditEvent.findMany({ where: { entityType: { in: ["Project", "ChangeRequest", "StageGate", "Baseline", "Timesheet"] }, entityId: projectId }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  if (!project) throw new Error("Project not found");
  return [
    { ref: "project:" + project.id, kind: "PROJECT_RECORD", content: JSON.stringify(project) },
    ...baselines.map((b) => ({ ref: "baseline:" + b.id, kind: "BASELINE", content: JSON.stringify(b) })),
    ...crs.map((c) => ({ ref: "change:" + c.id, kind: "CHANGE_REQUEST", content: JSON.stringify(c) })),
    ...gates.map((g) => ({ ref: "gate:" + g.id, kind: "GATE_DECISION", content: JSON.stringify(g) })),
    ...timesheets.map((t) => ({ ref: "timesheet:" + t.id, kind: "TIMESHEET", content: JSON.stringify(t) })),
    ...entries.map((e) => ({ ref: "entry:" + e.id, kind: "TIMESHEET_ENTRY", content: JSON.stringify(e) })),
    ...health.map((h) => ({ ref: "health:" + h.id, kind: "HEALTH_SNAPSHOT", content: JSON.stringify(h) })),
    ...audits.map((a) => ({ ref: "audit:" + a.id, kind: "AUDIT", content: JSON.stringify(a) })),
  ];
}

export async function buildEvidenceZip(bundleId: string): Promise<{ zip: Uint8Array; projectCode: string }> {
  const bundle = await db.evidenceBundle.findUnique({ where: { id: bundleId }, include: { project: { select: { code: true } } } });
  if (!bundle) throw new Error("Bundle not found");
  const manifest = JSON.parse(bundle.manifestJson);
  const docs = await collectEvidenceDocs(bundle.projectId);
  const lines = [
    "PM CONTROL TOWER - EVIDENCE BUNDLE",
    "==================================",
    "Project:  " + bundle.project.code,
    "Exported: " + bundle.createdAt.toISOString() + " by " + bundle.createdByName,
    "Documents: " + bundle.docCount,
    "Chain:    SHA-256 (each hash includes the previous hash)",
    "Manifest: " + bundle.manifestHash,
    "",
    ...manifest.entries.map((e: { index: number; kind: string; ref: string }) => String(e.index + 1).padStart(3, " ") + ". [" + e.kind + "] " + e.ref),
    "",
    "Verify with: POST /api/integrity/evidence/" + bundle.id + "/verify",
    "Any alteration to a stored record breaks the chain visibly.",
  ];
  const entries = [
    { name: "INDEX.txt", content: lines.join("\n") },
    { name: "manifest.json", content: JSON.stringify(manifest, null, 2) },
    ...docs.map((d) => ({ name: "docs/" + d.ref.replace(/[^a-zA-Z0-9._-]/g, "_") + ".json", content: d.content })),
  ];
  return { zip: buildZip(entries), projectCode: bundle.project.code };
}
