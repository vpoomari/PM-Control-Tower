// PM CONTROL TOWER — Authentication API
// POST /api/auth/login — credential exchange for JWT (httpOnly cookie + bearer token)
// POST /api/auth/logout — clears session
// POST /api/auth/register — admin-only user creation
// GET  /api/auth/me — session introspection

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, fail, ApiError, parseBody } from "@/lib/api";
import { verifyPassword, signToken, getSessionUser, hashPassword, AUTH_COOKIE } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  if (action === "login") {
    return withApi(async () => {
      const body = await parseBody(req, loginSchema);
      const user = await db.user.findUnique({
        where: { email: body.email.toLowerCase() },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user || !user.isActive) throw new ApiError(401, "Invalid credentials");
      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        await db.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } } });
        throw new ApiError(401, "Invalid credentials");
      }
      const token = await signToken({ sub: user.id, email: user.email });
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0 } });
      await writeAudit({ userId: user.id, userName: user.name, role: user.userRoles[0]?.role.code, action: "LOGIN", entityType: "User", entityId: user.id, ipAddress: ip, userAgent: req.headers.get("user-agent") });
      const res = ok({ token, user: { id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin } });
      res.headers.append("Set-Cookie", `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
      return res;
    }, { auth: false, rateLimit: { limit: 30, windowMs: 60_000 } })(req);
  }

  if (action === "logout") {
    const session = await getSessionUser(req);
    if (session) await writeAudit({ userId: session.id, userName: session.name, role: session.roles[0], action: "LOGOUT", entityType: "User", entityId: session.id, ipAddress: ip });
    const res = ok({ loggedOut: true });
    res.headers.append("Set-Cookie", `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return res;
  }

  if (action === "register") {
    return withApi(async (ctx) => {
      if (!ctx.session) throw new ApiError(401, "Authentication required");
      if (!ctx.session.isSuperAdmin && !ctx.session.permissions.includes("admin.users")) throw new ApiError(403, "Only administrators can create users");
      const body = await parseBody(req, z.object({
        email: z.string().email(), name: z.string().min(2), password: z.string().min(8),
        title: z.string().optional(), roleCode: z.string().default("TEAM_MEMBER"),
      }));
      const exists = await db.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (exists) throw new ApiError(409, "User already exists");
      const role = await db.role.findUnique({ where: { code: body.roleCode } });
      if (!role) throw new ApiError(400, "Invalid role code");
      const user = await db.user.create({
        data: {
          email: body.email.toLowerCase(), name: body.name, passwordHash: await hashPassword(body.password),
          title: body.title, userRoles: { create: { roleId: role.id } },
        },
      });
      await writeAudit({ userId: ctx.session.id, userName: ctx.session.name, action: "CREATE", entityType: "User", entityId: user.id, entityName: user.name, after: { email: user.email, role: body.roleCode }, ipAddress: ctx.ip });
      return ok({ id: user.id, email: user.email, name: user.name });
    })(req);
  }

  return fail(404, "Unknown auth action");
};

export const GET = async (req: Request): Promise<Response> => {
  return withApi(async (ctx) => {
    return ok({ user: ctx.session });
  })(req);
};
