// PM CONTROL TOWER — Scenario Sandbox API (branch & merge)
// GET    /api/integrity/scenarios?projectId= — scenario list
// POST   /api/integrity/scenarios {projectId, name} — fork a project into a sandbox
// PATCH  /api/integrity/scenarios {id, overrides} — apply overrides, run engines on the clone, return diff
// DELETE /api/integrity/scenarios?id= — discard

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { buildScenarioSnapshot, simulateScenario } from "@/lib/services/integrity";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  const scenarios = await db.scenario.findMany({
    where: projectId ? { projectId } : {},
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { project: { select: { code: true, name: true } } },
  });
  const shaped = scenarios.map((s) => {
    let summary: { tasks: { id: string; name: string; durationDays: number }[]; assignments: { id: string; resourceName: string }[] } = { tasks: [], assignments: [] };
    try { const snap = JSON.parse(s.snapshotJson); summary = { tasks: snap.tasks.map((t: { id: string; name: string; durationDays: number; isSummary: boolean }) => ({ id: t.id, name: t.name, durationDays: t.durationDays })).filter((t: { id: string }) => t), assignments: (snap.assignments ?? []).map((a: { id: string; resourceName: string }) => ({ id: a.id, resourceName: a.resourceName })) }; } catch { /* keep empty */ }
    return { id: s.id, name: s.name, projectId: s.projectId, status: s.status, createdByName: s.createdByName, createdAt: s.createdAt, changeRequestId: s.changeRequestId, project: s.project, summary };
  });
  return ok({ scenarios: shaped });
}, { permission: "integrity.view", rateLimit: { limit: 120, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({ projectId: z.string(), name: z.string().min(2).max(80) }));
  const snapshot = await buildScenarioSnapshot(body.projectId);
  const scenario = await db.scenario.create({
    data: { name: body.name, projectId: body.projectId, createdBy: session.id, createdByName: session.name, snapshotJson: JSON.stringify(snapshot) },
  });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "Scenario", entityId: scenario.id, entityName: scenario.name, after: { projectId: body.projectId } });
  return ok({ scenarioId: scenario.id, name: scenario.name, tasks: snapshot.tasks.length, assignments: snapshot.assignments.length }, 201);
}, { permission: "scenario.manage", rateLimit: { limit: 30, windowMs: 60_000 } });

const overridesSchema = z.object({
  id: z.string(),
  overrides: z.object({
    durationChanges: z.record(z.string(), z.number().positive().max(400)).optional(),
    removeAssignments: z.array(z.string()).optional(),
    reassignResource: z.object({ fromResourceId: z.string(), toResourceId: z.string(), toResourceName: z.string() }).optional(),
    budgetDelta: z.number().optional(),
  }),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, overridesSchema);
  const scenario = await db.scenario.findUnique({ where: { id: body.id } });
  if (!scenario) throw new ApiError(404, "Scenario not found");
  if (scenario.status !== "SANDBOX") throw new ApiError(409, "Scenario already resolved");
  const snapshot = JSON.parse(scenario.snapshotJson);
  const { diff } = simulateScenario(snapshot, body.overrides);
  await db.scenario.update({ where: { id: scenario.id }, data: { overridesJson: JSON.stringify(body.overrides), diffJson: JSON.stringify(diff) } });
  await writeAudit({ userId: session.id, userName: session.name, action: "UPDATE", entityType: "Scenario", entityId: scenario.id, entityName: scenario.name, after: { applied: diff.applied } });
  return ok({ scenarioId: scenario.id, diff });
}, { permission: "scenario.manage", rateLimit: { limit: 60, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session!;
  const id = ctx.searchParams.get("id");
  if (!id) throw new ApiError(400, "id required");
  const scenario = await db.scenario.findUnique({ where: { id } });
  if (!scenario) throw new ApiError(404, "Scenario not found");
  if (scenario.status !== "SANDBOX") throw new ApiError(409, "Merged scenarios are part of the audit trail and cannot be discarded");
  await db.scenario.update({ where: { id }, data: { status: "DISCARDED" } });
  await writeAudit({ userId: session.id, userName: session.name, action: "DISCARD", entityType: "Scenario", entityId: id, entityName: scenario.name });
  emitRealtime("scenario:merged", { scenarioId: id, status: "DISCARDED" }, `project:${scenario.projectId}`);
  return ok({ discarded: true });
}, { permission: "scenario.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
