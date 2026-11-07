// PM CONTROL TOWER — Field Dictionary audit trail
// GET /api/field-dictionary/audit?fieldId&moduleKey&limit — lifecycle, assignment
//     and value-change history for the dictionary.

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { listFieldAudit } from "@/lib/fields/store";

export const GET = withApi(async (ctx) => {
  const fieldId = ctx.searchParams.get("fieldId")?.trim() || undefined;
  const moduleKey = ctx.searchParams.get("moduleKey")?.trim() || undefined;
  const limit = Number(ctx.searchParams.get("limit") ?? "100");

  const logs = await listFieldAudit({ fieldId, moduleKey, limit: Number.isFinite(limit) ? limit : 100 });
  const total = await db.fieldAuditLog.count({
    where: { ...(fieldId ? { fieldDefinitionId: fieldId } : {}), ...(moduleKey ? { moduleKey } : {}) },
  });
  return ok({ logs, total });
}, { permission: "admin.config", rateLimit: { limit: 300, windowMs: 60_000 } });
