// PM CONTROL TOWER — Project Tab API
// GET  /api/tabs — all tabs with mapped fields, hydrated + ordered in ONE query
//                   (include: { fields: { orderBy: displayOrder, include: { field: true } } })
//                   Readable by any project viewer — the DynamicFormRenderer needs it.
// POST /api/tabs — create a tab (order defaults to next slot)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { listHydratedTabs } from "@/lib/custom-tabs";

export const GET = withApi(async () => {
  return ok({ tabs: await listHydratedTabs() });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createTabSchema = z.object({
  name: z.string().trim().min(1).max(60),
  order: z.number().int().min(0).max(9999).optional(),
  description: z.string().trim().max(240).optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, createTabSchema);

  const dupe = await db.projectTab.findFirst({ where: { name: body.name } });
  if (dupe) throw new ApiError(409, `A tab named "${body.name}" already exists`);

  let nextOrder = body.order;
  if (nextOrder === undefined) {
    const max = (await db.projectTab.aggregate({ _max: { order: true } }))._max.order;
    nextOrder = max === null ? 1 : max + 1;
  }

  const tab = await db.projectTab.create({
    data: { name: body.name, order: nextOrder, description: body.description ?? null },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "ProjectTab", entityId: tab.id, entityName: tab.name,
    after: tab, ipAddress: ctx.ip,
  });

  return ok(tab, 201);
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
