// PM CONTROL TOWER — Project Audit Trail API
// GET /api/projects/[id]/audit — plan-domain audit events for this project (direct + task-scoped)

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";

const PLAN_ENTITY_TYPES = ["Project", "Task", "WBSNode", "Dependency", "Milestone", "Baseline", "Requirement"];

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  // Task-scoped audit events (tasks created/deleted/rescheduled write under entityType "Task")
  const taskIds = (
    await db.task.findMany({ where: { projectId: id }, select: { id: true }, take: 500 })
  ).map((t) => t.id);

  const events = await db.auditEvent.findMany({
    where: {
      OR: [
        { entityType: { in: PLAN_ENTITY_TYPES }, entityId: id },
        { entityType: "Task", entityId: { in: taskIds } },
        // Plan-domain writers stamp context with the project id — keeps history visible
        // even after the referenced task/node/milestone itself was deleted.
        { entityType: { in: PLAN_ENTITY_TYPES }, context: { contains: id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ok({ projectId: id, projectName: project.name, items: events, total: events.length });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });
