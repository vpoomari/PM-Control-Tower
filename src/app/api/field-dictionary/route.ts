// PM CONTROL TOWER — Field Dictionary API (global definitions)
// GET  /api/field-dictionary?q&dataType&categoryId&status&module&unused&sort
//      List dictionary definitions (with module usage + value counts).
// POST /api/field-dictionary — create a new global field definition.
//      Creating a definition does NOT assign it to any module — assignment is a
//      separate, per-module operation (POST /api/modules/:moduleKey/fields).

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { FIELD_SENSITIVITIES, FIELD_STATUSES, FIELD_TYPES } from "@/lib/engines/field-dictionary";
import { deriveFieldKey, listDefinitions, logFieldAudit, type DictField } from "@/lib/fields/store";
import type { SessionUser } from "@/lib/auth";

function isAdmin(session: SessionUser | null): boolean {
  return hasPermission(session, "admin.config");
}

/** Non-admin callers (module admins using "Add Field from Dictionary") only see
 *  fields that are usable in a module and that their sensitivity allows. */
function projectForCaller(session: SessionUser, fields: DictField[]): DictField[] {
  const roles = session.roles;
  if (session.isSuperAdmin || roles.includes("*") || roles.includes("PMO_ADMIN")) return fields;
  return fields.filter((f) => {
    if (!["ACTIVE", "DEPRECATED"].includes(f.status)) return false;
    if (!f.visibleRoles.length) return true;
    return f.visibleRoles.some((r) => roles.includes(r));
  });
}

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const admin = isAdmin(session);

  const fields = await listDefinitions({
    q: ctx.searchParams.get("q")?.trim() || undefined,
    dataType: ctx.searchParams.get("dataType")?.trim() || undefined,
    categoryId: ctx.searchParams.get("categoryId")?.trim() || undefined,
    status: ctx.searchParams.get("status")?.trim() || undefined,
    module: ctx.searchParams.get("module")?.trim() || undefined,
    unused: ctx.searchParams.get("unused") === "true",
    sort: ctx.searchParams.get("sort")?.trim() || undefined,
  });

  const visible = admin ? fields : projectForCaller(session, fields);
  const total = admin ? await db.customFieldDefinition.count() : visible.length;

  return ok({ fields: visible, total, admin });
}, { permission: ["admin.config", "project.view"], rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  label: z.string().min(2).max(120),
  fieldKey: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/, "Field key must be snake_case (a-z, 0-9, _)").optional(),
  description: z.string().max(1000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  fieldGroup: z.string().max(60).optional().nullable(),
  dataType: z.enum(FIELD_TYPES as unknown as [string, ...string[]]),
  // Nullable to match the edit schema and the admin form, which always sends
  // explicit nulls for "no options"/"no config" on types that don't use them.
  options: z.array(z.string().max(120)).max(200).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
  isRequired: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  isSearchable: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isSortable: z.boolean().optional(),
  isReportable: z.boolean().optional(),
  isExportable: z.boolean().optional(),
  status: z.enum(FIELD_STATUSES as unknown as [string, ...string[]]).optional(),
  sensitivity: z.enum(FIELD_SENSITIVITIES as unknown as [string, ...string[]]).optional(),
  visibleRoles: z.array(z.string().max(60)).max(20).optional().nullable(),
  editableRoles: z.array(z.string().max(60)).max(20).optional().nullable(),
  deprecationReason: z.string().max(500).optional().nullable(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  if (body.options?.length && !needsOptions(body.dataType)) {
    throw new ApiError(400, `Options are not used by the ${body.dataType} data type`);
  }
  if (body.categoryId) {
    const cat = await db.fieldCategory.findUnique({ where: { id: body.categoryId }, select: { id: true } });
    if (!cat) throw new ApiError(400, "Category not found");
  }

  const fieldKey = body.fieldKey || deriveFieldKey(body.name ?? "", body.label);
  const existing = await db.customFieldDefinition.findUnique({ where: { fieldKey }, select: { id: true, label: true } });
  if (existing) throw new ApiError(409, `Field key "${fieldKey}" already exists (used by "${existing.label}")`);

  const created = await db.customFieldDefinition.create({
    data: {
      fieldKey,
      name: body.name?.trim() || body.label.trim(),
      label: body.label.trim(),
      dataType: body.dataType,
      description: body.description ?? null,
      categoryId: body.categoryId ?? null,
      fieldGroup: body.fieldGroup ?? null,
      options: (body.options?.length ? body.options : null) as never,
      config: (body.config ?? null) as never,
      status: body.status ?? "ACTIVE",
      isActive: (body.status ?? "ACTIVE") === "ACTIVE",
      isRequired: body.isRequired ?? false,
      isReadOnly: body.isReadOnly ?? false,
      isSearchable: body.isSearchable ?? true,
      isFilterable: body.isFilterable ?? true,
      isSortable: body.isSortable ?? true,
      isReportable: body.isReportable ?? true,
      isExportable: body.isExportable ?? true,
      sensitivity: body.sensitivity ?? "INTERNAL",
      visibleRolesJson: body.visibleRoles?.length ? body.visibleRoles.join(",") : null,
      editableRolesJson: body.editableRoles?.length ? body.editableRoles.join(",") : null,
      deprecationReason: body.deprecationReason ?? null,
      version: 1,
      createdById: session.id,
      createdByName: session.name,
      updatedById: session.id,
      updatedByName: session.name,
    },
  });

  await logFieldAudit({
    fieldDefinitionId: created.id,
    action: "CREATE",
    summary: `Created field "${created.label}" (${created.fieldKey})`,
    after: { fieldKey, label: created.label, dataType: created.dataType, sensitivity: created.sensitivity, status: created.status },
    userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
  });

  return ok({ field: created }, 201);
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });

function needsOptions(dataType: string): boolean {
  return dataType === "SINGLE_SELECT" || dataType === "MULTI_SELECT";
}
