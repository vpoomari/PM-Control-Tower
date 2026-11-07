// PM CONTROL TOWER — Field Dictionary categories
// GET  /api/field-categories — categories with per-category field counts
// POST /api/field-categories — create a category

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { logFieldAudit } from "@/lib/fields/store";

export const GET = withApi(async () => {
  const categories = await db.fieldCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { fields: true, assignments: true } } },
  });
  return ok({
    categories: categories.map((c) => ({
      id: c.id, key: c.key, name: c.name, description: c.description, color: c.color,
      sortOrder: c.sortOrder, isActive: c.isActive, createdAt: c.createdAt,
      fieldCount: c._count.fields, assignmentCount: c._count.assignments,
    })),
  });
}, { permission: ["admin.config", "project.view"], rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  key: z.string().min(2).max(48).regex(/^[a-z][a-z0-9_]*$/, "Category key must be snake_case").optional(),
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const key = (body.key || body.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const existing = await db.fieldCategory.findUnique({ where: { key }, select: { id: true } });
  if (existing) throw new ApiError(409, `Category "${key}" already exists`);

  const created = await db.fieldCategory.create({
    data: { key, name: body.name.trim(), description: body.description ?? null, color: body.color ?? null, sortOrder: body.sortOrder ?? 0 },
  });
  await logFieldAudit({
    action: "CREATE", moduleKey: null,
    summary: `Created field category "${created.name}"`,
    after: { key, name: created.name },
    userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
  });
  return ok({ category: created }, 201);
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
