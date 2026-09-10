// PM CONTROL TOWER — User administration
// GET  /api/admin/users — users with roles, last login, counters
// POST /api/admin/users — create user + assign role

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(2).max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  title: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  roleCode: z.string().min(2).max(40),
});

export const GET = withApi(async () => {
  const [users, total] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, title: true, department: true,
        avatarColor: true, isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true,
        userRoles: { select: { role: { select: { id: true, code: true, name: true, level: true } } } },
        _count: { select: { auditEvents: true, notifications: true, ownedProjects: true, assignedTasks: true } },
      },
    }),
    db.user.count(),
  ]);
  // passwordHash is intentionally excluded by the select above — never serialized
  return ok({
    users: users.map((u) => ({ ...u, roles: u.userRoles.map((ur) => ur.role), userRoles: undefined })),
    total,
    active: users.filter((u) => u.isActive).length,
  });
}, { permission: "admin.users", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);
  const email = body.email.toLowerCase();
  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw new ApiError(409, "A user with this email already exists");
  const role = await db.role.findUnique({ where: { code: body.roleCode } });
  if (!role) throw new ApiError(400, `Unknown role code: ${body.roleCode}`);

  const user = await db.user.create({
    data: {
      email, name: body.name, title: body.title, department: body.department,
      passwordHash: await hashPassword(body.password),
      userRoles: { create: { roleId: role.id } },
    },
    select: { id: true, email: true, name: true, title: true, isActive: true },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "User", entityId: user.id, entityName: user.name,
    after: { email: user.email, title: user.title, roleCode: body.roleCode },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(user, 201);
}, { permission: "admin.users", rateLimit: { limit: 30, windowMs: 60_000 } });
