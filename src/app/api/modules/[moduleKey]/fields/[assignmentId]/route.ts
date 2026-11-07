// PM CONTROL TOWER — Module field assignment (single)
// PATCH  /api/modules/[moduleKey]/fields/[assignmentId] — per-module display settings
// DELETE /api/modules/[moduleKey]/fields/[assignmentId] — unassign (values retained by default)

import { z } from "zod";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { getModule } from "@/lib/engines/field-dictionary";
import { removeAssignment, updateAssignment } from "@/lib/fields/store";
import { db } from "@/lib/db";

function assertModuleManage(moduleKey: string, session: { permissions: string[]; isSuperAdmin: boolean } | null) {
  const mod = getModule(moduleKey);
  if (!mod) throw new ApiError(404, `Unknown module "${moduleKey}"`);
  if (!session) throw new ApiError(401, "Authentication required");
  if (!hasPermission(session, mod.managePerm) && !hasPermission(session, "admin.config")) {
    throw new ApiError(403, `Permission denied: ${mod.managePerm} or admin.config`);
  }
  return mod;
}

const patchSchema = z.object({
  section: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  displayLabel: z.string().max(120).optional().nullable(),
  isRequired: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  isInForm: z.boolean().optional(),
  isInTable: z.boolean().optional(),
  isInDetail: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isSortable: z.boolean().optional(),
  validationOverrides: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { moduleKey, assignmentId } = ctx.params;
  assertModuleManage(moduleKey, session);
  const body = await parseBody(ctx.req, patchSchema);

  const existing = await db.moduleFieldAssignment.findUnique({ where: { id: assignmentId }, select: { moduleKey: true } });
  if (!existing) throw new ApiError(404, "Assignment not found");
  if (existing.moduleKey !== moduleKey) throw new ApiError(404, "Assignment does not belong to this module");

  const updated = await updateAssignment(assignmentId, body, { id: session.id, name: session.name });
  if (!updated) throw new ApiError(404, "Assignment not found");
  return ok({ assignment: updated });
}, { rateLimit: { limit: 180, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { moduleKey, assignmentId } = ctx.params;
  assertModuleManage(moduleKey, session);
  const purgeValues = ctx.searchParams.get("purgeValues") === "true";

  const existing = await db.moduleFieldAssignment.findUnique({ where: { id: assignmentId }, select: { moduleKey: true } });
  if (!existing) throw new ApiError(404, "Assignment not found");
  if (existing.moduleKey !== moduleKey) throw new ApiError(404, "Assignment does not belong to this module");

  const removed = await removeAssignment(assignmentId, { id: session.id, name: session.name }, { purgeValues });
  if (!removed) throw new ApiError(404, "Assignment not found");
  return ok({ removed: true, ...removed, purgeValues });
}, { rateLimit: { limit: 60, windowMs: 60_000 } });
