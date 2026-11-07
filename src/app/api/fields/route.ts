// PM CONTROL TOWER — Dynamic Field Dictionary API
// GET  /api/fields — list field definitions (q search, dataType/status filters, pagination)
// POST /api/fields — create a field definition (fieldKey unique; DROPDOWN requires options)

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { FIELD_DATA_TYPES, isFieldDataType, normalizeFieldConfig, normalizeOptions } from "@/lib/engines/custom-fields";

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

const createFieldSchema = z.object({
  fieldKey: z.string().trim().regex(FIELD_KEY_RE, "fieldKey must be snake_case (a-z, 0-9, _; max 64 chars)"),
  label: z.string().trim().min(1).max(80),
  dataType: z.enum(FIELD_DATA_TYPES),
  options: z.array(z.string().trim().min(1).max(120)).max(200).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
  description: z.string().trim().max(400).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const GET = withApi(async (ctx) => {
  const q = ctx.searchParams.get("q")?.trim() || undefined;
  const dataType = ctx.searchParams.get("dataType") || undefined;
  const status = ctx.searchParams.get("status") || undefined; // ACTIVE | INACTIVE | undefined=all
  const take = Math.min(Math.max(Number(ctx.searchParams.get("take") ?? 100) || 100, 1), 600);
  const skip = Math.max(Number(ctx.searchParams.get("skip") ?? 0) || 0, 0);

  if (dataType && !isFieldDataType(dataType)) throw new ApiError(400, `Invalid dataType "${dataType}"`);

  const where = {
    ...(q ? { OR: [{ fieldKey: { contains: q } }, { label: { contains: q } }] } : {}),
    ...(dataType ? { dataType } : {}),
    ...(status === "ACTIVE" ? { isActive: true } : status === "INACTIVE" ? { isActive: false } : {}),
  };

  const [fields, total] = await Promise.all([
    db.customFieldDefinition.findMany({
      where,
      orderBy: [{ fieldKey: "asc" }],
      take,
      skip,
      include: { _count: { select: { tabMappings: true } } },
    }),
    db.customFieldDefinition.count({ where }),
  ]);

  return ok({
    fields: fields.map((f) => ({
      ...f,
      options: f.options === null ? null : normalizeOptions(f.options),
      config: f.config === null ? null : normalizeFieldConfig(f.config),
      tabCount: f._count.tabMappings,
      _count: undefined,
    })),
    total,
    take,
    skip,
  });
}, { permission: "admin.config", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, createFieldSchema);
  const needsOptions = body.dataType === "DROPDOWN" || body.dataType === "MULTI_SELECT";
  if (needsOptions && normalizeOptions(body.options).length === 0) {
    throw new ApiError(400, `${body.dataType} fields require at least one option`);
  }

  const existing = await db.customFieldDefinition.findUnique({ where: { fieldKey: body.fieldKey } });
  if (existing) throw new ApiError(409, `Field key "${body.fieldKey}" already exists`);

  const field = await db.customFieldDefinition.create({
    data: {
      fieldKey: body.fieldKey,
      label: body.label,
      dataType: body.dataType,
      // only choice fields store options (keeps the dictionary clean)
      options: needsOptions ? normalizeOptions(body.options) : Prisma.DbNull,
      config: body.config === undefined || body.config === null
        ? Prisma.DbNull
        : (normalizeFieldConfig(body.config) as unknown as Prisma.InputJsonValue),
      description: body.description ?? null,
      isActive: body.isActive ?? true,
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "CustomFieldDefinition", entityId: field.id, entityName: field.label,
    after: field, ipAddress: ctx.ip,
  });

  return ok({
    ...field,
    options: field.options === null ? null : normalizeOptions(field.options),
    config: field.config === null ? null : normalizeFieldConfig(field.config),
  }, 201);
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
