// PM CONTROL TOWER — Agile Delivery API (Command Center v3.0)
// GET    /api/agile?projectId&sprintId — sprints + epics + task cards (kanban/backlog)
// POST   /api/agile                    — create sprint or epic
// PATCH  /api/agile                    — move task card (status/sprint/epic/story points/order)
// DELETE /api/agile?type=SPRINT|EPIC&id= — remove sprint or epic

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { TASK_STATUS } from "@/lib/constants";

async function recomputeSprintPoints(sprintIds: string[]) {
  const ids = [...new Set(sprintIds.filter(Boolean))];
  for (const sprintId of ids) {
    const total = await db.task.aggregate({ where: { sprintId }, _sum: { storyPoints: true } });
    await db.sprint.update({ where: { id: sprintId }, data: { committedPoints: total._sum.storyPoints ?? 0 } }).catch(() => undefined);
  }
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const sprintId = ctx.searchParams.get("sprintId")?.trim();

  const projects = await db.project.findMany({
    where: projectId ? { id: projectId } : {},
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: "asc" },
    take: 200,
  });
  const projectIds = projects.map((p) => p.id);

  const [sprints, epics, tasks] = await Promise.all([
    db.sprint.findMany({
      where: sprintId ? { id: sprintId } : { projectId: { in: projectIds } },
      orderBy: [{ status: "asc" }, { startDate: "asc" }],
    }),
    db.epic.findMany({ where: { projectId: { in: projectIds } }, orderBy: { code: "asc" } }),
    db.task.findMany({
      where: {
        projectId: { in: projectIds },
        ...(sprintId ? { sprintId } : {}),
      },
      select: {
        id: true, projectId: true, code: true, name: true, status: true, priority: true,
        progress: true, storyPoints: true, sprintId: true, epicId: true, backlogOrder: true,
        endDate: true, assigneeId: true, updatedAt: true,
        assignee: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      },
      orderBy: [{ backlogOrder: "asc" }, { code: "asc" }],
      take: 800,
    }),
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  return ok({
    projects,
    sprints,
    epics,
    tasks: tasks.map((t) => ({ ...t, project: t.projectId ? projectById.get(t.projectId) ?? null : null })),
    summary: {
      sprintCount: sprints.length,
      activeSprint: sprints.find((s) => s.status === "ACTIVE") ?? null,
      backlogCards: tasks.filter((t) => !t.sprintId).length,
      totalPoints: tasks.reduce((s, t) => s + (t.storyPoints || 0), 0),
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const sprintSchema = z.object({
  type: z.literal("SPRINT"),
  projectId: z.string().min(1),
  name: z.string().min(2).max(120),
  goal: z.string().max(2000).optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]).default("PLANNED"),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

const epicSchema = z.object({
  type: z.literal("EPIC"),
  projectId: z.string().min(1),
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(20),
  colorHex: z.string().max(9).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]).default("OPEN"),
  businessValue: z.string().max(2000).optional().nullable(),
});

const createSchema = z.discriminatedUnion("type", [sprintSchema, epicSchema]);

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, createSchema);
  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true } });
  if (!project) throw new ApiError(404, "Project not found");

  if (body.type === "SPRINT") {
    if (body.status === "ACTIVE") {
      const activeCount = await db.sprint.count({ where: { projectId: body.projectId, status: "ACTIVE" } });
      if (activeCount > 0) throw new ApiError(400, "Only one active sprint per project is allowed");
    }
    const created = await db.sprint.create({
      data: {
        projectId: body.projectId, name: body.name, goal: body.goal ?? null,
        status: body.status, startDate: body.startDate ?? null, endDate: body.endDate ?? null,
      },
    });
    await writeAudit({
      userId: session.id, userName: session.name, role: session.roles[0],
      action: "CREATE", entityType: "Sprint", entityId: created.id, entityName: created.name,
      after: { projectId: body.projectId, status: created.status }, ipAddress: ctx.ip,
    });
    emitRealtime("agile:changed", { projectId: body.projectId, sprintId: created.id, action: "SPRINT_CREATED" }, `project:${body.projectId}`);
    return ok({ sprint: created }, 201);
  }

  const created = await db.epic.create({
    data: {
      projectId: body.projectId, name: body.name, code: body.code,
      colorHex: body.colorHex || "#2563eb", status: body.status, businessValue: body.businessValue ?? null,
    },
  });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Epic", entityId: created.id, entityName: created.name,
    after: { projectId: body.projectId, code: created.code }, ipAddress: ctx.ip,
  });
  emitRealtime("agile:changed", { projectId: body.projectId, epicId: created.id, action: "EPIC_CREATED" }, `project:${body.projectId}`);
  return ok({ epic: created }, 201);
}, { permission: "agile.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

const patchSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(TASK_STATUS).optional(),
  sprintId: z.string().nullable().optional(),
  epicId: z.string().nullable().optional(),
  storyPoints: z.coerce.number().min(0).max(200).optional(),
  backlogOrder: z.coerce.number().int().optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, patchSchema);
  const task = await db.task.findUnique({
    where: { id: body.taskId },
    select: { id: true, code: true, name: true, projectId: true, sprintId: true, status: true, storyPoints: true },
  });
  if (!task) throw new ApiError(404, "Task not found");

  if (body.sprintId) {
    const sprint = await db.sprint.findUnique({ where: { id: body.sprintId }, select: { id: true, projectId: true } });
    if (!sprint) throw new ApiError(404, "Sprint not found");
    if (sprint.projectId !== task.projectId) throw new ApiError(400, "Sprint belongs to a different project");
  }
  if (body.epicId) {
    const epic = await db.epic.findUnique({ where: { id: body.epicId }, select: { id: true, projectId: true } });
    if (!epic) throw new ApiError(404, "Epic not found");
    if (epic.projectId !== task.projectId) throw new ApiError(400, "Epic belongs to a different project");
  }

  const updated = await db.task.update({
    where: { id: body.taskId },
    data: {
      ...(body.status !== undefined ? { status: body.status, ...(body.status === "COMPLETED" ? { progress: 100 } : {}) } : {}),
      ...(body.sprintId !== undefined ? { sprintId: body.sprintId } : {}),
      ...(body.epicId !== undefined ? { epicId: body.epicId } : {}),
      ...(body.storyPoints !== undefined ? { storyPoints: body.storyPoints } : {}),
      ...(body.backlogOrder !== undefined ? { backlogOrder: body.backlogOrder } : {}),
    },
  });

  if (task.sprintId || body.sprintId !== undefined) {
    await recomputeSprintPoints([task.sprintId ?? "", body.sprintId ?? ""].filter(Boolean) as string[]);
  }

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "UPDATE", entityType: "Task", entityId: updated.id, entityName: updated.name,
    before: { status: task.status, sprintId: task.sprintId, storyPoints: task.storyPoints },
    after: { status: updated.status, sprintId: updated.sprintId, storyPoints: updated.storyPoints },
    ipAddress: ctx.ip,
  });
  emitRealtime("agile:changed", { projectId: updated.projectId, taskId: updated.id, action: "TASK_MOVED" }, `project:${updated.projectId}`);
  return ok({ task: updated });
}, { permission: "inbox.use", rateLimit: { limit: 300, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session!;
  const type = ctx.searchParams.get("type");
  const id = ctx.searchParams.get("id");
  if (!id || (type !== "SPRINT" && type !== "EPIC")) throw new ApiError(400, "type must be SPRINT or EPIC, with id");

  if (type === "SPRINT") {
    const sprint = await db.sprint.findUnique({ where: { id }, select: { id: true, name: true, projectId: true } });
    if (!sprint) throw new ApiError(404, "Sprint not found");
    await db.sprint.delete({ where: { id } });
    await writeAudit({
      userId: session.id, userName: session.name, role: session.roles[0],
      action: "DELETE", entityType: "Sprint", entityId: sprint.id, entityName: sprint.name, ipAddress: ctx.ip,
    });
    emitRealtime("agile:changed", { projectId: sprint.projectId, sprintId: sprint.id, action: "SPRINT_DELETED" }, `project:${sprint.projectId}`);
    return ok({ deleted: true });
  }
  const epic = await db.epic.findUnique({ where: { id }, select: { id: true, name: true, projectId: true } });
  if (!epic) throw new ApiError(404, "Epic not found");
  await db.epic.delete({ where: { id } });
  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "DELETE", entityType: "Epic", entityId: epic.id, entityName: epic.name, ipAddress: ctx.ip,
  });
  emitRealtime("agile:changed", { projectId: epic.projectId, epicId: epic.id, action: "EPIC_DELETED" }, `project:${epic.projectId}`);
  return ok({ deleted: true });
}, { permission: "agile.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
