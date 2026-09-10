// PM CONTROL TOWER — Audit trail query (read-only)
// GET /api/audit?entityType&entityId&userId&action&q&from&to&severity&take

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";

export const GET = withApi(async (ctx) => {
  const sp = ctx.searchParams;
  const entityType = sp.get("entityType");
  const entityId = sp.get("entityId");
  const userId = sp.get("userId");
  const action = sp.get("action");
  const severity = sp.get("severity");
  const q = sp.get("q");
  const from = sp.get("from");
  const to = sp.get("to");
  const takeParam = Number(sp.get("take") ?? 100);
  if (Number.isNaN(takeParam) || takeParam < 1) throw new ApiError(400, "Invalid take parameter");
  const take = Math.min(500, Math.max(1, Math.floor(takeParam)));

  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;
  if (from && (Number.isNaN(fromDate?.getTime() ?? NaN))) throw new ApiError(400, "Invalid `from` date");
  if (to && (Number.isNaN(toDate?.getTime() ?? NaN))) throw new ApiError(400, "Invalid `to` date");

  const events = await db.auditEvent.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(severity ? { severity } : {}),
      ...(fromDate || toDate ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
      ...(q ? { OR: [{ userName: { contains: q } }, { entityName: { contains: q } }, { action: { contains: q } }, { entityType: { contains: q } }, { context: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return ok({ events, count: events.length });
}, { permission: "admin.audit", rateLimit: { limit: 300, windowMs: 60_000 } });
