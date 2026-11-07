// PM CONTROL TOWER — Bulk custom field values for a module's records
// GET /api/modules/[moduleKey]/values?recordIds=a,b,c
//      Returns { assignments, values: { [recordId]: { [fieldKey]: value } } }
//      Used by list views / tables / exports to hydrate custom columns in one call.

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { getModule } from "@/lib/engines/field-dictionary";
import { filterVisibleFields, listAssignments, readValues } from "@/lib/fields/store";

const MAX_IDS = 1000;

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const moduleKey = ctx.params.moduleKey;
  const mod = getModule(moduleKey);
  if (!mod) throw new ApiError(404, `Unknown module "${moduleKey}"`);
  if (!hasPermission(session, mod.viewPerm) && !hasPermission(session, "admin.config")) {
    throw new ApiError(403, `Permission denied: ${mod.viewPerm} or admin.config`);
  }

  const raw = ctx.searchParams.get("recordIds") ?? "";
  const recordIds = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);
  if (!recordIds.length) return ok({ assignments: [], values: {}, recordIds: [] });

  const subject = { roles: session.roles, isSuperAdmin: session.isSuperAdmin };
  const all = await listAssignments(moduleKey, { includeHidden: true });
  // Only fields the caller may see, and only those shown in a table/grid.
  const assignments = filterVisibleFields(all, subject).filter((a) => a.isVisible && a.isInTable);

  const values = await readValues(moduleKey, recordIds);
  return ok({ assignments, values, recordIds });
}, { rateLimit: { limit: 300, windowMs: 60_000 } });
