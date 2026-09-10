// PM CONTROL TOWER — Role administration
// GET  /api/admin/roles — roles with permission set + user counts
// POST /api/admin/roles — create custom role with permission set

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE"),
  description: z.string().max(500).optional(),
  permissionCodes: z.array(z.string().min(1)).min(1, "At least one permission is required"),
});

export const GET = withApi(async () => {
  const [roles, permissions] = await Promise.all([
    db.role.findMany({
      orderBy: { level: "desc" },
      include: {
        permissions: { include: { permission: { select: { code: true, category: true, description: true } } } },
        _count: { select: { users: true } },
      },
    }),
    db.permission.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }] }),
  ]);
  return ok({
    roles: roles.map((r) => ({
      id: r.id, name: r.name, code: r.code, description: r.description,
      level: r.level, isSystem: r.isSystem, userCount: r._count.users,
      permissions: r.permissions.map((rp) => rp.permission),
    })),
    catalog: permissions,
    total: roles.length,
  });
}, { permission: "admin.users", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const nameExists = await db.role.findFirst({ where: { OR: [{ name: body.name }, { code: body.code }] }, select: { id: true } });
  if (nameExists) throw new ApiError(409, "A role with this name or code already exists");

  const permissions = await db.permission.findMany({ where: { code: { in: body.permissionCodes } } });
  const found = new Set(permissions.map((p) => p.code));
  const missing = body.permissionCodes.filter((c) => !found.has(c));
  if (missing.length > 0) throw new ApiError(400, `Unknown permission codes: ${missing.join(", ")}`);

  const role = await db.role.create({
    data: {
      name: body.name,
      code: body.code,
      description: body.description,
      level: 10,
      isSystem: false,
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
    },
    include: { permissions: { include: { permission: { select: { code: true, category: true } } } } },
  });

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "Role", entityId: role.id, entityName: role.name,
    after: { code: role.code, permissionCodes: [...found] },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: "WARNING",
  });
  return ok({ ...role, permissions: role.permissions.map((rp) => rp.permission) }, 201);
}, { permission: "admin.users", rateLimit: { limit: 30, windowMs: 60_000 } });
