// PM CONTROL TOWER — API framework: auth guard, RBAC, validation, rate limiting,
// structured errors, audit hooks. All route handlers use withApi().

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, SessionUser } from "./auth";
import { hasPermission } from "./rbac";
import { writeAudit } from "./audit";
import { ApiError } from "./errors";

export { ApiError };
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: message, details }, { status });
}

export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
}

// ---- In-memory rate limiter (per process) ----
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) throw new ApiError(429, "Rate limit exceeded. Retry shortly.");
}

interface ApiOptions {
  auth?: boolean;                 // default true
  permission?: string | string[]; // RBAC permission code(s) — array = ANY-of grants access
  rateLimit?: { limit: number; windowMs: number };
}

export interface ApiCtx {
  session: SessionUser | null;
  req: Request;
  ip: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
}

/** Wrap a route handler with security + error handling. Supports dynamic route params. */
export function withApi(
  handler: (ctx: ApiCtx) => Promise<NextResponse | Response>,
  opts: ApiOptions = {}
) {
  return async (req: Request, routeCtx?: { params?: Promise<Record<string, string>> | Record<string, string> }): Promise<NextResponse | Response> => {
    const ip = getClientIp(req);
    const url = new URL(req.url);
    try {
      if (opts.rateLimit) rateLimit(`${ip}:${url.pathname}`, opts.rateLimit.limit, opts.rateLimit.windowMs);
      const authRequired = opts.auth !== false;
      const session = await getSessionUser(req);
      if (authRequired && !session) throw new ApiError(401, "Authentication required");
      const needed = opts.permission ? (Array.isArray(opts.permission) ? opts.permission : [opts.permission]) : [];
      if (needed.length && !needed.some((p) => hasPermission(session, p))) {
        throw new ApiError(403, `Permission denied: ${needed.join(" or ")}`);
      }
      const rawParams = routeCtx?.params;
      const params = rawParams ? (rawParams instanceof Promise ? await rawParams : rawParams) : {};
      return await handler({ session, req, ip, searchParams: url.searchParams, params });
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, err.message, err.details);
      if (err instanceof z.ZodError) return fail(400, "Validation failed", err.issues);
      console.error(`[api] ${req.method} ${url.pathname}`, err);
      return fail(500, "Internal server error");
    }
  };
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, "Invalid JSON body"); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Validation failed", parsed.error.issues);
  return parsed.data;
}

export { writeAudit };
