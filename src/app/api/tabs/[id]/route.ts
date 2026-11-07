// PM CONTROL TOWER — Project Tab API (single tab)
// PATCH  /api/tabs/[id] — rename and/or reorder
// DELETE /api/tabs/[id] — delete tab (mappings cascade; stored customData is untouched)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { getHydratedTab } from "@/lib/custom-tabs";

const patchTabSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  order: z.number().int().min(0).max(9999).optional(),
  description: z.string().trim().max(240).optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const { id } = ctx.params;
  const before = await db.projectTab.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Tab not found");

  const body = await parseBody(ctx.req, patchTabSchema);

  if (body.name && body.name !== before.name) {
    const dupe = await db.projectTab.findFirst({ where: { name: body.name, NOT: { id } } });
    if (dupe) throw new ApiError(409, `A tab named "${body.name}" already exists`);
  }

  const tab = await db.projectTab.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.order !== undefined ? { order: body.order } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "ProjectTab", entityId: id, entityName: tab.name,
    before, after: tab, ipAddress: ctx.ip,
  });

  return ok(await getHydratedTab(id));
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id } = ctx.params;
  const tab = await db.projectTab.findUnique({ where: { id } });
  if (!tab) throw new ApiError(404, "Tab not found");

  await db.projectTab.delete({ where: { id } }); // TabFieldMapping rows cascade

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "ProjectTab", entityId: id, entityName: tab.name,
    before: tab, ipAddress: ctx.ip, severity: "WARNING",
  });

  return ok({ deleted: true, id });
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
