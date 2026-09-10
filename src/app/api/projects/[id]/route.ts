// PM CONTROL TOWER — Project Detail API
// GET    /api/projects/[id] — full control-tower bundle (plan + execute + control data)
// PATCH  /api/projects/[id] — update charter/objectives/status/priority/dates/budget/statusDate
// DELETE /api/projects/[id] — delete (guarded: planning artifacts require ?force=1)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { PROJECT_STATUS, PRIORITY } from "@/lib/constants";

const projectUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().optional().nullable(),
  programId: z.string().optional().nullable(),
  portfolioId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  sponsorId: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  phase: z.string().optional(),
  methodology: z.string().optional(),
  riskLevel: z.string().optional(),
  billingType: z.string().optional(),
  currency: z.string().trim().length(3).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  baselineStart: z.coerce.date().optional().nullable(),
  baselineFinish: z.coerce.date().optional().nullable(),
  currentBudget: z.coerce.number().min(0).optional(),
  baselineBudget: z.coerce.number().min(0).optional(),
  forecastCost: z.coerce.number().min(0).optional(),
  charter: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  successCriteria: z.string().optional().nullable(),
  statusDate: z.coerce.date().optional().nullable(),
});

interface WbsTreeNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  description: string | null;
  nodeType: string;
  level: number;
  orderIndex: number;
  ownerName: string | null;
  plannedHours: number;
  plannedCost: number;
  actualHours: number;
  actualCost: number;
  progress: number;
  taskCount: number;
  children: WbsTreeNode[];
}

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      program: { include: { portfolio: { select: { id: true, code: true, name: true } } } },
      portfolio: { select: { id: true, code: true, name: true } },
      owner: { select: { id: true, name: true, email: true, title: true, avatarColor: true } },
    },
  });
  if (!project) throw new ApiError(404, "Project not found");

  const [wbsNodes, tasks, dependencies, milestones, baselines, requirements, assignments, budgetLines, latestEvm, snapshots, stageGates, counts] = await Promise.all([
    db.wBSNode.findMany({ where: { projectId: id }, orderBy: [{ level: "asc" }, { orderIndex: "asc" }] }),
    db.task.findMany({
      where: { projectId: id },
      orderBy: [{ code: "asc" }],
      include: { wbs: { select: { id: true, code: true, name: true } }, assignee: { select: { id: true, name: true, avatarColor: true } } },
    }),
    db.dependency.findMany({
      where: { projectId: id },
      include: {
        predecessor: { select: { id: true, code: true, name: true } },
        successor: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.milestone.findMany({ where: { projectId: id }, orderBy: { dueDate: "asc" } }),
    db.baseline.findMany({ where: { projectId: id }, orderBy: { version: "desc" } }),
    db.requirement.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    db.assignment.findMany({
      where: { projectId: id },
      include: { resource: { select: { id: true, name: true, title: true, department: true, capacityHoursPerWeek: true, availabilityStatus: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.budgetLine.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
    db.evmPeriod.findMany({ where: { projectId: id }, orderBy: { statusDate: "desc" }, take: 1 }),
    db.projectHealthSnapshot.findMany({ where: { projectId: id }, orderBy: { capturedAt: "desc" }, take: 12 }),
    db.stageGate.findMany({ where: { projectId: id }, orderBy: { sequence: "asc" } }),
    db.project.findUnique({ where: { id }, select: { _count: { select: { risks: true, issues: true, changeRequests: true, alertEvents: true, assumptions: true, deliverables: true } } } }),
  ]);

  // Flat WBS → nested tree (ordered by orderIndex), with direct task rollups
  const taskCountByWbs = new Map<string, number>();
  for (const t of tasks) {
    if (t.wbsId) taskCountByWbs.set(t.wbsId, (taskCountByWbs.get(t.wbsId) ?? 0) + 1);
  }
  const nodeMap = new Map<string, WbsTreeNode>();
  for (const n of wbsNodes) {
    nodeMap.set(n.id, {
      id: n.id, parentId: n.parentId, code: n.code, name: n.name, description: n.description,
      nodeType: n.nodeType, level: n.level, orderIndex: n.orderIndex, ownerName: n.ownerName,
      plannedHours: n.plannedHours, plannedCost: n.plannedCost, actualHours: n.actualHours, actualCost: n.actualCost,
      progress: n.progress, taskCount: taskCountByWbs.get(n.id) ?? 0, children: [],
    });
  }
  const wbsTree: WbsTreeNode[] = [];
  for (const node of nodeMap.values()) {
    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else wbsTree.push(node);
  }
  const byOrder = (a: WbsTreeNode, b: WbsTreeNode) => a.orderIndex - b.orderIndex;
  wbsTree.sort(byOrder);
  for (const node of nodeMap.values()) node.children.sort(byOrder);

  return ok({
    project,
    program: project.program,
    portfolio: project.portfolio,
    owner: project.owner,
    wbsTree,
    wbsNodes,
    tasks,
    dependencies,
    milestones,
    baselines,
    requirements,
    assignments,
    budgetLines,
    latestEvmPeriod: latestEvm[0] ?? null,
    healthSnapshots: snapshots,
    stageGates,
    counts: {
      risks: counts?._count.risks ?? 0,
      issues: counts?._count.issues ?? 0,
      changeRequests: counts?._count.changeRequests ?? 0,
      alertEvents: counts?._count.alertEvents ?? 0,
      assumptions: counts?._count.assumptions ?? 0,
      deliverables: counts?._count.deliverables ?? 0,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const { id } = ctx.params;
  const before = await db.project.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, projectUpdateSchema);

  if (body.programId !== undefined && body.programId) {
    const program = await db.program.findUnique({ where: { id: body.programId }, select: { id: true, portfolioId: true } });
    if (!program) throw new ApiError(400, "Program not found");
  }
  if (body.portfolioId) {
    const portfolio = await db.portfolio.findUnique({ where: { id: body.portfolioId }, select: { id: true } });
    if (!portfolio) throw new ApiError(400, "Portfolio not found");
  }
  for (const uid of [body.ownerId, body.managerId, body.sponsorId]) {
    if (uid) {
      const u = await db.user.findUnique({ where: { id: uid }, select: { id: true } });
      if (!u) throw new ApiError(400, "Referenced user not found");
    }
  }

  const project = await db.project.update({ where: { id }, data: body });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "Project", entityId: id, entityName: project.name,
    before, after: project, ipAddress: ctx.ip,
  });
  if (body.status && body.status !== before.status) {
    await writeAudit({
      userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
      action: "STATUS_CHANGE", entityType: "Project", entityId: id, entityName: project.name,
      before: { status: before.status }, after: { status: body.status },
      context: `Lifecycle transition ${before.status} → ${body.status}`,
      ipAddress: ctx.ip, severity: body.status === "CANCELLED" ? "WARNING" : "INFO",
    });
  }
  emitRealtime("project:updated", { projectId: id, status: project.status, ragStatus: project.ragStatus }, projectRoom(id));

  return ok(project);
}, { permission: "project.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id } = ctx.params;
  const force = ctx.searchParams.get("force") === "1";
  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new ApiError(404, "Project not found");

  const [taskCount, wbsCount, baselineCount] = await Promise.all([
    db.task.count({ where: { projectId: id } }),
    db.wBSNode.count({ where: { projectId: id } }),
    db.baseline.count({ where: { projectId: id } }),
  ]);
  if ((taskCount > 0 || wbsCount > 0 || baselineCount > 0) && !force) {
    throw new ApiError(409, `Project has planning artifacts (${taskCount} tasks, ${wbsCount} WBS nodes, ${baselineCount} baselines). Repeat with ?force=1 to cascade-delete.`);
  }

  await db.project.delete({ where: { id } });
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "Project", entityId: id, entityName: project.name,
    before: project, ipAddress: ctx.ip, severity: "WARNING",
  });
  emitRealtime("project:updated", { entity: "project", action: "deleted", id });

  return ok({ deleted: true, id });
}, { permission: "project.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
