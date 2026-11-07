// PM CONTROL TOWER — Dynamic Field Dictionary API (single field)
// GET    /api/fields/[id] — one definition
// PATCH  /api/fields/[id] — update label/dataType/options/description/isActive
// DELETE /api/fields/[id] — delete (tab mappings cascade; values purged from every project's customData)

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { FIELD_DATA_TYPES, normalizeFieldConfig, normalizeOptions, parseCustomData } from "@/lib/engines/custom-fields";

const patchFieldSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  dataType: z.enum(FIELD_DATA_TYPES).optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(200).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
  description: z.string().trim().max(400).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const field = await db.customFieldDefinition.findUnique({
    where: { id },
    include: { _count: { select: { tabMappings: true } } },
  });
  if (!field) throw new ApiError(404, "Field not found");
  return ok({
    ...field,
    options: field.options === null ? null : normalizeOptions(field.options),
    config: field.config === null ? null : normalizeFieldConfig(field.config),
    tabCount: field._count.tabMappings,
  });
}, { permission: "admin.config", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  const { id } = ctx.params;
  const before = await db.customFieldDefinition.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Field not found");

  const body = await parseBody(ctx.req, patchFieldSchema);

  // effective dataType after the patch — choice-field options validated against it
  const nextDataType = body.dataType ?? before.dataType;
  const needsOptions = nextDataType === "DROPDOWN" || nextDataType === "MULTI_SELECT";
  if (needsOptions) {
    const opts = normalizeOptions(body.options !== undefined ? body.options : before.options);
    if (opts.length === 0) throw new ApiError(400, `${nextDataType} fields require at least one option`);
  }

  const field = await db.customFieldDefinition.update({
    where: { id },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.dataType !== undefined ? { dataType: body.dataType } : {}),
      ...(body.options !== undefined
        ? { options: needsOptions ? normalizeOptions(body.options) : Prisma.DbNull }
        : {}),
      ...(body.config !== undefined
        ? { config: body.config === null ? Prisma.DbNull : normalizeFieldConfig(body.config) as unknown as Prisma.InputJsonValue }
        : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "CustomFieldDefinition", entityId: id, entityName: field.label,
    before, after: field, ipAddress: ctx.ip,
  });

  return ok({
    ...field,
    options: normalizeOptions(field.options),
    config: field.config === null ? null : normalizeFieldConfig(field.config),
  });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  const { id } = ctx.params;
  const field = await db.customFieldDefinition.findUnique({ where: { id } });
  if (!field) throw new ApiError(404, "Field not found");

  await db.customFieldDefinition.delete({ where: { id } }); // tabMappings cascade via FK

  // Purge the orphaned key from every project's customData (Json column —
  // no key-level delete on SQLite, so filter + update per affected row).
  const projects = await db.project.findMany({ where: { customData: { not: Prisma.DbNull } }, select: { id: true, customData: true } });
  let purged = 0;
  for (const p of projects) {
    const data = parseCustomData(p.customData);
    if (field.fieldKey in data) {
      delete data[field.fieldKey];
      await db.project.update({ where: { id: p.id }, data: { customData: data } });
      purged += 1;
    }
  }

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "DELETE", entityType: "CustomFieldDefinition", entityId: id, entityName: field.label,
    before: field, context: purged ? `Purged value from ${purged} project(s)` : undefined,
    ipAddress: ctx.ip, severity: "WARNING",
  });

  return ok({ deleted: true, id, purgedFromProjects: purged });
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
