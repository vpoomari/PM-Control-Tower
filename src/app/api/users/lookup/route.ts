// PM CONTROL TOWER — User lookup API
// GET /api/users/lookup — minimal active-user list (id, name, title) for
// USER_LOOKUP custom fields. Deliberately light and readable by project.view
// (the full /api/admin/users requires admin.users, which end users lack).

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";

export const GET = withApi(async () => {
  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true },
  });
  return ok({ users });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });
