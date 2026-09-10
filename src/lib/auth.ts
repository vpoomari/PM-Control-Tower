// PM CONTROL TOWER — Authentication (JWT + bcrypt)
// Secrets are loaded from environment only. Sandbox provides a dev fallback;
// production deployments MUST set JWT_SECRET (see Deployment Guide).

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";

const JWT_ALG = "HS256";
const TOKEN_TTL = "12h";
export const AUTH_COOKIE = "pmct_token";

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "pmct-sandbox-dev-secret-change-in-production-0f4a9b";
  return new TextEncoder().encode(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  roles: string[];        // role codes
  permissions: string[];  // permission codes
  avatarColor: string;
  title: string | null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(payload: { sub: string; email: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setIssuer("pm-control-tower")
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<{ sub: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "pm-control-tower" });
    return { sub: String(payload.sub), email: String(payload.email) };
  } catch {
    return null;
  }
}

export function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Resolve the authenticated user + RBAC grants from a request. Returns null when unauthenticated. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user || !user.isActive) return null;
  const roles: string[] = [];
  const permissions = new Set<string>();
  for (const ur of user.userRoles) {
    roles.push(ur.role.code);
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }
  return {
    id: user.id, email: user.email, name: user.name,
    isSuperAdmin: user.isSuperAdmin, roles, permissions: [...permissions],
    avatarColor: user.avatarColor, title: user.title,
  };
}
