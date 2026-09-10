// PM CONTROL TOWER — WBS Node API
// PATCH  /api/projects/[id]/wbs/[nodeId] — update fields / move parent (cycle-safe, subtree renumbered)
// DELETE /api/projects/[id]/wbs/[nodeId] — delete (guarded; ?force=1 cascades descendant tasks+nodes)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { rollupWbsActuals } from "@/lib/engines/rollup";

const wbsUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  plannedHours: z.coerce.number().min(0).optional(),
  plannedCost: z.coerce.number().min(0).optional(),
  orderIndex: z.coerce.number().int().min(0).optional(),
  parentId: z.string().nullable().optional(),
  nodeType: z.enum(["SUMMARY", "WORK_PACKAGE"]).optional(),
});

function nextSiblingIndex(siblingCodes: string[], hasParent: boolean): number {
  let max = 0;
  for (const c of siblingCodes) {
    const seg = hasParent ? c.split(".").pop() ?? "" : c;
    const n = Number(seg);
    if (Number.isFinite(n) && Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

export const PATCH = withApi(async (ctx) => {
  const { id, nodeId } = ctx.params;
  const before = await db.wBSNode.findFirst({ where: { id: nodeId, projectId: id } });
  if (!before) throw new ApiError(404, "WBS node not found in this project");

  const body = await parseBody(ctx.req, wbsUpdateSchema);

  // ---- Parent move (cycle-safe) + subtree renumbering ----
  if (body.parentId !== undefined && body.parentId !== before.parentId) {
    if (body.parentId === nodeId) throw new ApiError(400, "A node cannot be its own parent");
    let newParent: { id: string; code: string; level: number } | null = null;
    if (body.parentId) {
      const p = await db.wBSNode.findFirst({ where: { id: body.parentId, projectId: id }, select: { id: true, code: true, level: true } });
      if (!p) throw new ApiError(400, "Target parent WBS node not found in this project");
      // Walk up the ancestor chain from the new parent — hitting the moved node means a cycle
      let cursor: string | null = p.id;
      let depth = 0;
      while (cursor && depth < 100) {
        if (cursor === nodeId) throw new ApiError(400, "Move rejected: target parent is a descendant of the node (cycle)");
        const parentRow = await db.wBSNode.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = parentRow?.parentId ?? null;
        depth += 1;
      }
      newParent = p;
    }

    const allNodes = await db.wBSNode.findMany({ where: { projectId: id }, select: { id: true, parentId: true, code: true, level: true, orderIndex: true } });
    const childrenOf = new Map<string | null, { id: string; code: string; level: number; orderIndex: number }[]>();
    for (const n of allNodes) {
      const list = childrenOf.get(n.parentId) ?? [];
      list.push(n);
      childrenOf.set(n.parentId, list);
    }

    // Collect subtree (node + descendants)
    const subtree: { id: string; parentId: string | null }[] = [];
    const collect = (pid: string) => {
      for (const c of childrenOf.get(pid) ?? []) {
        subtree.push({ id: c.id, parentId: c.id });
        collect(c.id);
      }
    };
    collect(nodeId);

    // New code for the moved node among its new siblings (excluding itself)
    const newSiblingCodes = (childrenOf.get(newParent?.id ?? null) ?? [])
      .filter((s) => s.id !== nodeId)
      .map((s) => s.code);
    const nextIdx = nextSiblingIndex(newSiblingCodes, Boolean(newParent));
    const rootCode = newParent ? `${newParent.code}.${nextIdx}` : `${nextIdx}`;
    const rootLevel = newParent ? newParent.level + 1 : 1;

    // Renumber subtree: compute (id → {code, level}) walking down from the moved node
    const updates: { id: string; code: string; level: number; parentId: string | null }[] = [
      { id: nodeId, code: rootCode, level: rootLevel, parentId: newParent?.id ?? null },
    ];
    const assign = (parentId: string, parentCode: string, parentLevel: number) => {
      const kids = (childrenOf.get(parentId) ?? []).filter((c) => c.id !== nodeId);
      kids.sort((a, b) => a.orderIndex - b.orderIndex);
      kids.forEach((kid, i) => {
        const kidCode = `${parentCode}.${i + 1}`;
        updates.push({ id: kid.id, code: kidCode, level: parentLevel + 1, parentId: kid.id });
        assign(kid.id, kidCode, parentLevel + 1);
      });
    };
    assign(nodeId, rootCode, rootLevel);

    // Apply: re-parent the moved node first, then codes/levels for the whole subtree
    await db.wBSNode.update({ where: { id: nodeId }, data: { parentId: newParent?.id ?? null } });
    for (const u of updates) {
      await db.wBSNode.update({ where: { id: u.id }, data: { code: u.code, level: u.level } });
    }
  }

  const rest = { ...body };
  delete rest.parentId; // parent move already handled above with subtree renumbering
  const node = await db.wBSNode.update({ where: { id: nodeId }, data: rest });

  await rollupWbsActuals(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "WBSNode", entityId: nodeId, entityName: `${node.code} ${node.name}`,
    before, after: node, ipAddress: ctx.ip, context: `Project ${id}`,
  });
  emitRealtime("wbs:changed", { projectId: id, action: "updated", nodeId: node.id, code: node.code }, projectRoom(id));

  return ok(node);
}, { permission: "wbs.manage", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id, nodeId } = ctx.params;
  const force = ctx.searchParams.get("force") === "1";
  const node = await db.wBSNode.findFirst({ where: { id: nodeId, projectId: id } });
  if (!node) throw new ApiError(404, "WBS node not found in this project");

  const [childCount, taskCount] = await Promise.all([
    db.wBSNode.count({ where: { parentId: nodeId } }),
    db.task.count({ where: { wbsId: nodeId } }),
  ]);
  if ((childCount > 0 || taskCount > 0) && !force) {
    throw new ApiError(409, `WBS node has ${childCount} child node(s) and ${taskCount} task(s). Repeat with ?force=1 to delete descendants and their tasks.`);
  }

  // Collect descendants deepest-first
  const allNodes = await db.wBSNode.findMany({ where: { projectId: id }, select: { id: true, parentId: true, level: true } });
  const descendantIds: string[] = [];
  const collect = (pid: string) => {
    for (const c of allNodes.filter((n) => n.parentId === pid)) {
      descendantIds.push(c.id);
      collect(c.id);
    }
  };
  collect(nodeId);
  const allWbsIds = [nodeId, ...descendantIds];

  await db.task.deleteMany({ where: { wbsId: { in: allWbsIds } } });
  const ordered = allNodes.filter((n) => allWbsIds.includes(n.id)).sort((a, b) => b.level - a.level);
  for (const n of ordered) {
    await db.wBSNode.delete({ where: { id: n.id } });
  }

  await rollupWbsActuals(id);
  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "WBSNode", entityId: nodeId, entityName: `${node.code} ${node.name}`,
    before: { node, descendantCount: descendantIds.length, deletedTaskCount: allWbsIds.length },
    ipAddress: ctx.ip, severity: descendantIds.length ? "WARNING" : "INFO", context: `Project ${id}`,
  });
  emitRealtime("wbs:changed", { projectId: id, action: "deleted", nodeId, code: node.code, descendants: descendantIds.length }, projectRoom(id));

  return ok({ deleted: true, id: nodeId, descendantsDeleted: descendantIds.length });
}, { permission: "wbs.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
