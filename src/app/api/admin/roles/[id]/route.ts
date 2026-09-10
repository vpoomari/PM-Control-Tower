// PM CONTROL TOWER — Role detail administration
// PATCH  /api/admin/roles/[id] — replace the permission set (system roles locked)
// DELETE /api/admin/roles/[id] — delete custom role (system / assigned roles guarded)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  permissionCodes: z.array(z.string().min(1)).min(1, "At least one permission is required"),
  description: z.string().max(500).optional(),
});

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const role = await db.role.findUnique({
    where: { id },
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });
  if (!role) throw new ApiError(404, "Role not found");
  if (role.isSystem) throw new ApiError(409, "System roles are immutable — clone into a custom role instead");

  const body = await parseBody(ctx.req, patchSchema);
  const permissions = await db.permission.findMany({ where: { code: { in: body.permissionCodes } } });
  const found = new Set(permissions.map((p) => p.code));
  const missing = body.permissionCodes.filter((c) => !found.has(c));
  if (missing.length > 0) throw new ApiError(400, `Unknown permission codes: ${missing.join(", ")}`);

  const before = role.permissions.map((rp) => rp.permission.code);
  const updated = await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: id, permissionId: p.id })) });
    if (body.description !== undefined) {
      await tx.role.update({ where: { id }, data: { description: body.description } });
    }
    return tx.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: { select: { code: true, category: true } } } } },
    });
  });

  const after = updated?.permissions.map((rp) => rp.permission.code) ?? [];
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "Role", entityId: id, entityName: role.name,
    before: { permissionCodes: before }, after: { permissionCodes: after },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: "WARNING",
  });
  return ok(updated);
}, { permission: "admin.users", rateLimit: { limit: 60, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const role = await db.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new ApiError(404, "Role not found");
  if (role.isSystem) throw new ApiError(409, "System roles cannot be deleted");
  if (role._count.users > 0) throw new ApiError(409, `Role is assigned to ${role._count.users} user(s) — unassign first`);

  await db.role.delete({ where: { id } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "DELETE", entityType: "Role", entityId: id, entityName: role.name,
    before: { code: role.code, isSystem: role.isSystem },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: "WARNING",
  });
  return ok({ deleted: true, id });
}, { permission: "admin.users", rateLimit: { limit: 60, windowMs: 60_000 } });
