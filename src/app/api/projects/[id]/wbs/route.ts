// PM CONTROL TOWER — Project WBS API
// GET  /api/projects/[id]/wbs — nested WBS tree with per-node task rollups
// POST /api/projects/[id]/wbs — create node (auto code, derived level; SUMMARY | WORK_PACKAGE)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rollupWbsActuals } from "@/lib/engines/rollup";

interface WbsTaskRef {
  id: string;
  code: string;
  name: string;
  status: string;
  progress: number;
  plannedHours: number;
  actualHours: number;
  assigneeName: string | null;
}

interface WbsTreeItem {
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
  taskRollup: { plannedHours: number; actualHours: number; avgProgress: number };
  tasks: WbsTaskRef[];
  children: WbsTreeItem[];
}

const wbsCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  nodeType: z.enum(["SUMMARY", "WORK_PACKAGE"]).optional(),
  ownerName: z.string().optional().nullable(),
  plannedHours: z.coerce.number().min(0).optional(),
  plannedCost: z.coerce.number().min(0).optional(),
  orderIndex: z.coerce.number().int().min(0).optional(),
});

/** Next numeric index among siblings (robust to deletions: scans suffix of existing codes). */
function nextSiblingIndex(siblingCodes: string[], hasParent: boolean): number {
  let max = 0;
  for (const c of siblingCodes) {
    const seg = hasParent ? c.split(".").pop() ?? "" : c;
    const n = Number(seg);
    if (Number.isFinite(n) && Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const nodes = await db.wBSNode.findMany({
    where: { projectId: id },
    orderBy: [{ level: "asc" }, { orderIndex: "asc" }],
    include: {
      tasks: {
        select: { id: true, code: true, name: true, status: true, progress: true, plannedHours: true, actualHours: true, assignee: { select: { name: true } } },
        orderBy: { code: "asc" },
      },
    },
  });

  const byId = new Map<string, WbsTreeItem>();
  for (const n of nodes) {
    const rollup = n.tasks.reduce(
      (acc, t) => ({ plannedHours: acc.plannedHours + t.plannedHours, actualHours: acc.actualHours + t.actualHours, progSum: acc.progSum + t.progress }),
      { plannedHours: 0, actualHours: 0, progSum: 0 }
    );
    byId.set(n.id, {
      id: n.id, parentId: n.parentId, code: n.code, name: n.name, description: n.description,
      nodeType: n.nodeType, level: n.level, orderIndex: n.orderIndex, ownerName: n.ownerName,
      plannedHours: n.plannedHours, plannedCost: n.plannedCost, actualHours: n.actualHours, actualCost: n.actualCost,
      progress: n.progress, taskCount: n.tasks.length,
      taskRollup: {
        plannedHours: rollup.plannedHours,
        actualHours: rollup.actualHours,
        avgProgress: n.tasks.length ? rollup.progSum / n.tasks.length : 0,
      },
      tasks: n.tasks.map((t) => ({
        id: t.id, code: t.code, name: t.name, status: t.status, progress: t.progress,
        plannedHours: t.plannedHours, actualHours: t.actualHours, assigneeName: t.assignee?.name ?? null,
      })),
      children: [],
    });
  }
  const tree: WbsTreeItem[] = [];
  for (const item of byId.values()) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent) parent.children.push(item);
    else tree.push(item);
  }
  const byOrder = (a: WbsTreeItem, b: WbsTreeItem) => a.orderIndex - b.orderIndex;
  tree.sort(byOrder);
  for (const item of byId.values()) item.children.sort(byOrder);

  return ok({ projectId: id, tree, flatCount: nodes.length });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const body = await parseBody(ctx.req, wbsCreateSchema);

  let parent: { id: string; code: string; level: number } | null = null;
  if (body.parentId) {
    const p = await db.wBSNode.findFirst({ where: { id: body.parentId, projectId: id }, select: { id: true, code: true, level: true } });
    if (!p) throw new ApiError(400, "Parent WBS node not found in this project");
    parent = p;
  }

  const siblings = await db.wBSNode.findMany({
    where: { projectId: id, parentId: parent?.id ?? null },
    select: { code: true, orderIndex: true },
  });
  const nextIdx = nextSiblingIndex(siblings.map((s) => s.code), Boolean(parent));
  const code = parent ? `${parent.code}.${nextIdx}` : `${nextIdx}`;
  const orderIndex = body.orderIndex ?? siblings.reduce((m, s) => Math.max(m, s.orderIndex), 0) + 1;
  const level = parent ? parent.level + 1 : 1;

  const node = await db.wBSNode.create({
    data: {
      projectId: id,
      parentId: parent?.id ?? null,
      code,
      name: body.name,
      description: body.description ?? null,
      nodeType: body.nodeType ?? "WORK_PACKAGE",
      level,
      orderIndex,
      ownerName: body.ownerName ?? null,
      plannedHours: body.plannedHours ?? 0,
      plannedCost: body.plannedCost ?? 0,
    },
  });

  await rollupWbsActuals(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "WBSNode", entityId: node.id, entityName: `${node.code} ${node.name}`,
    after: node, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("wbs:changed", { projectId: id, action: "created", nodeId: node.id, code: node.code }, projectRoom(id));

  return ok(node, 201);
}, { permission: "wbs.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
