// PM CONTROL TOWER — Module field assignments
// GET  /api/modules/[moduleKey]/fields — fields assigned to this module
// POST /api/modules/[moduleKey]/fields — assign existing dictionary fields (bulk)
//
// Assignment never creates a duplicate dictionary record: it links an existing
// Global Field Definition to ONE module with per-module display settings.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { getModule } from "@/lib/engines/field-dictionary";
import { assignFields, listAssignments, logFieldAudit, type AssignEntry } from "@/lib/fields/store";

function assertModuleManage(moduleKey: string, session: { permissions: string[]; isSuperAdmin: boolean } | null) {
  const mod = getModule(moduleKey);
  if (!mod) throw new ApiError(404, `Unknown module "${moduleKey}"`);
  if (!session) throw new ApiError(401, "Authentication required");
  if (!hasPermission(session, mod.managePerm) && !hasPermission(session, "admin.config")) {
    throw new ApiError(403, `Permission denied: ${mod.managePerm} or admin.config`);
  }
  return mod;
}

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const moduleKey = ctx.params.moduleKey;
  const mod = getModule(moduleKey);
  if (!mod) throw new ApiError(404, `Unknown module "${moduleKey}"`);
  if (!hasPermission(session, mod.viewPerm) && !hasPermission(session, "admin.config")) {
    throw new ApiError(403, `Permission denied: ${mod.viewPerm} or admin.config`);
  }

  const assignments = await listAssignments(moduleKey, { includeHidden: ctx.searchParams.get("includeHidden") === "true" || hasPermission(session, "admin.config") });
  return ok({ module: mod, assignments, sections: mod.sections });
}, { rateLimit: { limit: 300, windowMs: 60_000 } });

const assignSchema = z.object({
  assignments: z.array(z.object({
    fieldId: z.string().min(1),
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
  })).min(1).max(50),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const moduleKey = ctx.params.moduleKey;
  const mod = assertModuleManage(moduleKey, session);
  const body = await parseBody(ctx.req, assignSchema);

  const result = await assignFields(moduleKey, body.assignments as AssignEntry[], { id: session.id, name: session.name });

  if (result.assigned.length) {
    await logFieldAudit({
      moduleKey,
      action: "ASSIGN",
      summary: `Bulk-assigned ${result.assigned.length} field(s) to ${mod.label}`,
      after: { fields: result.assigned.map((a) => a.fieldKey), skipped: result.skipped },
      userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
    });
  }

  const assignments = await listAssignments(moduleKey, { includeHidden: true });
  return ok({ assigned: result.assigned, skipped: result.skipped, assignments }, result.assigned.length ? 201 : 200);
}, { rateLimit: { limit: 60, windowMs: 60_000 } });
