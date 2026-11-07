// PM CONTROL TOWER — Field Dictionary category (single)
// PATCH /api/field-categories/[id] — rename / recolor / reorder / deactivate
// DELETE /api/field-categories/[id] — delete (fields keep their data, category unsets)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { logFieldAudit } from "@/lib/fields/store";

const patchSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(300).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const body = await parseBody(ctx.req, patchSchema);
  const before = await db.fieldCategory.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Category not found");

  const updated = await db.fieldCategory.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  await logFieldAudit({
    action: "UPDATE",
    summary: `Updated field category "${updated.name}"`,
    before: { name: before.name, isActive: before.isActive },
    after: { name: updated.name, isActive: updated.isActive },
    userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
  });
  return ok({ category: updated });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const before = await db.fieldCategory.findUnique({
    where: { id },
    include: { _count: { select: { fields: true } } },
  });
  if (!before) throw new ApiError(404, "Category not found");
  if (before._count.fields > 0) {
    throw new ApiError(409, `"${before.name}" still contains ${before._count.fields} field(s). Reassign or clear their category first.`);
  }
  await db.fieldCategory.delete({ where: { id } });
  await logFieldAudit({
    action: "DELETE",
    summary: `Deleted field category "${before.name}"`,
    before: { key: before.key, name: before.name },
    userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
  });
  return ok({ deleted: true, id });
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
