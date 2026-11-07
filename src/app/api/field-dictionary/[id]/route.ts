// PM CONTROL TOWER — Field Dictionary API (single definition)
// GET    /api/field-dictionary/[id] — definition + usage summary
// PATCH  /api/field-dictionary/[id] — update a definition.
//        Changes that can affect stored data (key, data type, options, status,
//        sensitivity, required) require an impact analysis first: the UI calls
//        /impact, then re-sends with acknowledgeImpact: true.
// DELETE /api/field-dictionary/[id] — guarded delete.
//        Refuses while values exist unless ?purgeValues=true (authorized purge)
//        or the field has never been assigned (safe delete).

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withApi, ok, fail, ApiError, parseBody } from "@/lib/api";
import { FIELD_SENSITIVITIES, FIELD_STATUSES, FIELD_TYPES } from "@/lib/engines/field-dictionary";
import { getDefinition, impactFor, logFieldAudit, usageSnapshot } from "@/lib/fields/store";

const patchSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  label: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  fieldGroup: z.string().max(60).optional().nullable(),
  dataType: z.enum(FIELD_TYPES as unknown as [string, ...string[]]).optional(),
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
  acknowledgeImpact: z.boolean().optional(),
});

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const field = await getDefinition(id);
  if (!field) throw new ApiError(404, "Field not found");
  const usage = await usageSnapshot(id);
  return ok({ field, usage });
}, { permission: ["admin.config", "project.view"], rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const body = await parseBody(ctx.req, patchSchema);

  const before = await getDefinition(id);
  if (!before) throw new ApiError(404, "Field not found");

  // ---- impact gate: risky changes need the analysis acknowledged ----
  const proposed: Record<string, unknown> = {};
  if (body.dataType !== undefined) proposed.dataType = body.dataType;
  if (body.options !== undefined) proposed.options = body.options ?? [];
  if (body.isRequired !== undefined) proposed.isRequired = body.isRequired;
  if (body.isReadOnly !== undefined) proposed.isReadOnly = body.isReadOnly;
  if (body.status !== undefined) proposed.status = body.status;
  if (body.sensitivity !== undefined) proposed.sensitivity = body.sensitivity;
  if (body.label !== undefined) proposed.label = body.label;

  const report = await impactFor(id, proposed);
  const needsAck = report.findings.some((f) => f.requiresApproval && f.severity !== "none");
  if (needsAck && body.acknowledgeImpact !== true) {
    return fail(409, "This change affects existing data. Review the impact analysis, then resend with acknowledgeImpact: true.", report);
  }

  if (body.categoryId) {
    const cat = await db.fieldCategory.findUnique({ where: { id: body.categoryId }, select: { id: true } });
    if (!cat) throw new ApiError(400, "Category not found");
  }
  const nextStatus = body.status ?? before.status;
  const nextDataType = body.dataType ?? before.dataType;

  const data: Prisma.CustomFieldDefinitionUpdateInput = {
    ...(body.name !== undefined ? { name: body.name?.trim() || before.name } : {}),
    ...(body.label !== undefined ? { label: body.label.trim() } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
    ...(body.fieldGroup !== undefined ? { fieldGroup: body.fieldGroup } : {}),
    ...(body.dataType !== undefined ? { dataType: body.dataType } : {}),
    ...(body.options !== undefined ? { options: (body.options?.length ? body.options : null) as never } : {}),
    ...(body.config !== undefined ? { config: (body.config ?? null) as never } : {}),
    ...(body.isRequired !== undefined ? { isRequired: body.isRequired } : {}),
    ...(body.isReadOnly !== undefined ? { isReadOnly: body.isReadOnly } : {}),
    ...(body.isSearchable !== undefined ? { isSearchable: body.isSearchable } : {}),
    ...(body.isFilterable !== undefined ? { isFilterable: body.isFilterable } : {}),
    ...(body.isSortable !== undefined ? { isSortable: body.isSortable } : {}),
    ...(body.isReportable !== undefined ? { isReportable: body.isReportable } : {}),
    ...(body.isExportable !== undefined ? { isExportable: body.isExportable } : {}),
    ...(body.status !== undefined ? { status: body.status, isActive: body.status === "ACTIVE" } : {}),
    ...(body.sensitivity !== undefined ? { sensitivity: body.sensitivity } : {}),
    ...(body.visibleRoles !== undefined ? { visibleRolesJson: body.visibleRoles?.length ? body.visibleRoles.join(",") : null } : {}),
    ...(body.editableRoles !== undefined ? { editableRolesJson: body.editableRoles?.length ? body.editableRoles.join(",") : null } : {}),
    ...(body.deprecationReason !== undefined ? { deprecationReason: body.deprecationReason } : {}),
    version: { increment: 1 },
    updatedById: session.id,
    updatedByName: session.name,
  };

  const updated = await db.customFieldDefinition.update({ where: { id }, data });

  // Keep assignment-level required/read-only defaults in step with the global
  // definition when the global default tightens (never loosen silently).
  if (body.isRequired === true) {
    await db.moduleFieldAssignment.updateMany({ where: { fieldDefinitionId: id }, data: { isRequired: true } });
  }
  if (body.isReadOnly === true) {
    await db.moduleFieldAssignment.updateMany({ where: { fieldDefinitionId: id }, data: { isReadOnly: true } });
  }

  await logFieldAudit({
    fieldDefinitionId: id,
    action: body.status && body.status !== before.status ? (body.status === "DEPRECATED" ? "DEPRECATE" : body.status === "ACTIVE" ? "ACTIVATE" : "ARCHIVE") : "UPDATE",
    summary: `Updated field "${updated.label}" (v${before.version} → v${updated.version})`,
    before: { label: before.label, dataType: before.dataType, status: before.status, options: before.options, isRequired: before.isRequired, sensitivity: before.sensitivity, visibleRoles: before.visibleRoles },
    after: { label: updated.label, dataType: updated.dataType, status: updated.status, options: updated.options, isRequired: updated.isRequired, sensitivity: updated.sensitivity, visibleRoles: updated.visibleRolesJson },
    userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
  });

  return ok({ field: updated, impact: report });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const purgeValues = ctx.searchParams.get("purgeValues") === "true";

  const before = await getDefinition(id);
  if (!before) throw new ApiError(404, "Field not found");

  const valueCount = await db.customFieldValue.count({ where: { fieldDefinitionId: id } });
  if (valueCount > 0 && !purgeValues) {
    throw new ApiError(409, `"${before.label}" holds ${valueCount} stored value(s). Deprecate it instead, or delete with ?purgeValues=true to authorize a destructive purge.`, {
      valueCount,
      assignments: before.assignmentCount,
      recommendation: "Deprecate the field — historical values are preserved and remain readable.",
    });
  }

  await db.$transaction(async (tx) => {
    if (purgeValues) await tx.customFieldValue.deleteMany({ where: { fieldDefinitionId: id } });
    await tx.customFieldDefinition.delete({ where: { id } }); // assignments + mappings cascade
    await tx.fieldAuditLog.create({
      data: {
        fieldDefinitionId: null,
        action: "DELETE",
        summary: `Deleted field "${before.label}" (${before.fieldKey})${purgeValues ? ` and purged ${valueCount} value(s)` : ""}`,
        beforeJson: JSON.stringify({ fieldKey: before.fieldKey, label: before.label, dataType: before.dataType, valueCount }),
        userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
      },
    });
  });

  // Legacy v3.2 Tab Builder compatibility: purge the key from project customData.
  const projects = await db.project.findMany({
    where: { customData: { not: Prisma.DbNull } },
    select: { id: true, customData: true },
  });
  for (const p of projects) {
    const data = p.customData as Record<string, unknown> | null;
    if (data && typeof data === "object" && before.fieldKey in data) {
      const next = { ...data };
      delete next[before.fieldKey];
      await db.project.update({ where: { id: p.id }, data: { customData: next as Prisma.InputJsonValue } });
    }
  }

  return ok({ deleted: true, id, valueCount, purged: purgeValues });
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
