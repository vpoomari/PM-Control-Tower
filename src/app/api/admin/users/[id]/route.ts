// PM CONTROL TOWER — User detail administration
// GET    /api/admin/users/[id] — profile, roles, recent audit activity
// PATCH  /api/admin/users/[id] — isActive / title / roleCode (role replace, audited)
// DELETE /api/admin/users/[id] — deactivate (soft) with last-active-admin guard

import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  title: z.string().max(120).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  roleCode: z.string().max(40).optional(),
});

async function countActiveAdmins(): Promise<number> {
  return db.user.count({
    where: { isActive: true, userRoles: { some: { role: { code: "PMO_ADMIN" } } } },
  });
}

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, title: true, department: true, phone: true,
      avatarColor: true, isActive: true, isSuperAdmin: true, lastLoginAt: true,
      failedLogins: true, lockedUntil: true, createdAt: true,
      userRoles: { select: { assignedAt: true, role: { select: { id: true, code: true, name: true, level: true, isSystem: true } } } },
      ownedProjects: { select: { id: true, code: true, name: true, ragStatus: true } },
    },
  });
  if (!user) throw new ApiError(404, "User not found");
  const recentAudits = await db.auditEvent.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok({ user: { ...user, roles: user.userRoles.map((ur) => ur.role) }, recentAudits });
}, { permission: "admin.users", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const user = await db.user.findUnique({ where: { id }, include: { userRoles: { include: { role: true } } } });
  if (!user) throw new ApiError(404, "User not found");
  const body = await parseBody(ctx.req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No fields to update");

  const before = {
    isActive: user.isActive, title: user.title,
    roleCodes: user.userRoles.map((ur) => ur.role.code),
  };

  let newRole: Role | null = null;
  if (body.roleCode !== undefined) {
    newRole = await db.role.findUnique({ where: { code: body.roleCode } });
    if (!newRole) throw new ApiError(400, `Unknown role code: ${body.roleCode}`);
  }
  // Last-active-admin guard on deactivation via PATCH too
  if (body.isActive === false) {
    const isAdmin = user.userRoles.some((ur) => ur.role.code === "PMO_ADMIN");
    if (isAdmin && (await countActiveAdmins()) <= 1) {
      throw new ApiError(409, "Cannot deactivate the only active PMO_ADMIN — promote another administrator first");
    }
  }

  const updated = await db.$transaction(async (tx) => {
    if (newRole) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.create({ data: { userId: id, roleId: newRole.id } });
    }
    return tx.user.update({
      where: { id },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.department !== undefined ? { department: body.department } : {}),
      },
      select: { id: true, email: true, name: true, title: true, isActive: true, userRoles: { select: { role: { select: { code: true, name: true } } } } },
    });
  });

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "User", entityId: id, entityName: user.name,
    before,
    after: { isActive: updated.isActive, title: updated.title, roleCodes: updated.userRoles.map((ur) => ur.role.code) },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: "WARNING",
    context: body.roleCode !== undefined ? "Role change" : "Profile update",
  });
  return ok(updated);
}, { permission: "admin.users", rateLimit: { limit: 60, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const user = await db.user.findUnique({ where: { id }, include: { userRoles: { include: { role: true } } } });
  if (!user) throw new ApiError(404, "User not found");
  if (!user.isActive) throw new ApiError(409, "User is already deactivated");

  const isAdmin = user.userRoles.some((ur) => ur.role.code === "PMO_ADMIN");
  if (isAdmin && (await countActiveAdmins()) <= 1) {
    throw new ApiError(409, "Cannot deactivate the only active PMO_ADMIN — promote another administrator first");
  }

  const updated = await db.user.update({ where: { id }, data: { isActive: false }, select: { id: true, name: true, isActive: true } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "DELETE", entityType: "User", entityId: id, entityName: user.name,
    before: { isActive: user.isActive }, after: { isActive: updated.isActive },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    severity: "WARNING",
    context: "Soft delete — user deactivated, records retained",
  });
  return ok({ deactivated: true, id: updated.id });
}, { permission: "admin.users", rateLimit: { limit: 60, windowMs: 60_000 } });
