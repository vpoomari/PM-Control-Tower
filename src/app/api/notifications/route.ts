// PM CONTROL TOWER — Notifications inbox
// GET /api/notifications — my notifications (unread first), optional ?unread=1, with counts

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";

export const GET = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const userId = ctx.session.id;
  const unreadOnly = ctx.searchParams.get("unread") === "1";

  const [notifications, total, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 100,
    }),
    db.notification.count({ where: { userId } }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return ok({ notifications, counts: { total, unread, read: total - unread } });
}, { permission: "inbox.use", rateLimit: { limit: 600, windowMs: 60_000 } });
