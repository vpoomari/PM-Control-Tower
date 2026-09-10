// PM CONTROL TOWER — Work Inbox API
// GET /api/inbox?category&status — priority-ordered inbox + unread counts per category

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { INBOX_CATEGORIES } from "@/lib/constants";

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const ITEM_STATUSES = ["OPEN", "DONE", "DISMISSED"];

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const category = ctx.searchParams.get("category") || "ALL";
  const status = ctx.searchParams.get("status");

  if (!INBOX_CATEGORIES.includes(category as (typeof INBOX_CATEGORIES)[number])) {
    throw new ApiError(400, `Invalid category. Use one of: ${INBOX_CATEGORIES.join(", ")}`);
  }
  if (status && !ITEM_STATUSES.includes(status)) {
    throw new ApiError(400, `Invalid status. Use one of: ${ITEM_STATUSES.join(", ")}`);
  }

  const items = await db.inboxItem.findMany({
    where: {
      userId: session.id,
      ...(category !== "ALL" ? { category } : {}),
      ...(status ? { status } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Raw ordering in JS: CRITICAL first, then createdAt desc
  items.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    return pa - pb || b.createdAt.getTime() - a.createdAt.getTime();
  });

  const grouped = await db.inboxItem.groupBy({
    by: ["category"],
    where: { userId: session.id, status: "OPEN" },
    _count: { _all: true },
  });
  const unreadCounts: Record<string, number> = { ALL: 0, ACTION_REQUIRED: 0, MENTIONS: 0, APPROVALS: 0, ALERTS: 0, GOVERNANCE: 0, ESCALATIONS: 0 };
  let totalUnread = 0;
  for (const g of grouped) {
    unreadCounts[g.category] = g._count._all;
    totalUnread += g._count._all;
  }
  unreadCounts.ALL = totalUnread;

  return ok({
    items,
    unreadCounts,
    total: items.length,
    category,
    status: status || "ANY",
  });
}, { permission: "inbox.use", rateLimit: { limit: 300, windowMs: 60_000 } });


