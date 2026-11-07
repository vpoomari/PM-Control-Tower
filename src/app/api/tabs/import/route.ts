// PM CONTROL TOWER — Form Tab Builder configuration import
// POST /api/tabs/import — apply an exported configuration document:
//   • fields are upserted by fieldKey (immutable machine name)
//   • tabs are upserted by name; their field mappings are REPLACED
//   • runs in one transaction — a rejected document changes nothing
// Body: the document returned by GET /api/tabs/export.

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { FIELD_DATA_TYPES, normalizeFieldConfig, normalizeOptions } from "@/lib/engines/custom-fields";

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
const MAX_FIELDS = 600;
const MAX_TABS = 100;

const importSchema = z.object({
  version: z.number().int().optional(),
  fields: z.array(z.object({
    fieldKey: z.string().trim().regex(FIELD_KEY_RE, "fieldKey must be snake_case (a-z, 0-9, _)"),
    label: z.string().trim().min(1).max(80),
    dataType: z.enum(FIELD_DATA_TYPES),
    options: z.array(z.string().trim().min(1).max(120)).max(200).optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional().nullable(),
    description: z.string().trim().max(400).optional().nullable(),
    isActive: z.boolean().optional(),
  })).max(MAX_FIELDS),
  tabs: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    order: z.number().int().min(0).max(9999).optional(),
    description: z.string().trim().max(240).optional().nullable(),
    fields: z.array(z.object({
      fieldKey: z.string().min(1),
      isRequired: z.boolean().optional(),
      isReadOnly: z.boolean().optional(),
      fullWidth: z.boolean().optional(),
      showInReport: z.boolean().optional(),
    })).max(500),
  })).max(MAX_TABS),
});

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, importSchema);

  if (!body.fields.length && !body.tabs.length) {
    throw new ApiError(400, "Nothing to import — the document has no fields and no tabs");
  }

  // ---- structural validation before anything is written ----
  const seenKeys = new Set<string>();
  for (const f of body.fields) {
    if (seenKeys.has(f.fieldKey)) throw new ApiError(400, `Duplicate field key "${f.fieldKey}" in the document`);
    seenKeys.add(f.fieldKey);
    const options = normalizeOptions(f.options);
    if ((f.dataType === "DROPDOWN" || f.dataType === "MULTI_SELECT") && options.length === 0) {
      throw new ApiError(400, `Field "${f.fieldKey}" is ${f.dataType} and needs at least one option`);
    }
  }

  const known = new Set(body.fields.map((f) => f.fieldKey));
  // tabs may reference fields that already exist in the dictionary but are not
  // part of this document — resolve those against the database
  const referenced = new Set(body.tabs.flatMap((t) => t.fields.map((f) => f.fieldKey)));
  const external = [...referenced].filter((k) => !known.has(k));
  const externalDefs = external.length
    ? await db.customFieldDefinition.findMany({ where: { fieldKey: { in: external } }, select: { fieldKey: true } })
    : [];
  const resolvable = new Set(externalDefs.map((f) => f.fieldKey));
  const unresolved = external.filter((k) => !resolvable.has(k));
  if (unresolved.length) {
    throw new ApiError(400, `Unknown field key(s) referenced by tabs: ${unresolved.join(", ")}`);
  }

  const seenNames = new Set<string>();
  for (const t of body.tabs) {
    const norm = t.name.toLowerCase();
    if (seenNames.has(norm)) throw new ApiError(400, `Duplicate tab name "${t.name}" in the document`);
    seenNames.add(norm);
  }

  const existingTabCount = await db.projectTab.count();
  if (existingTabCount + body.tabs.length > MAX_TABS) {
    throw new ApiError(400, `Import would exceed the ${MAX_TABS} tab limit`);
  }

  // ---- transactional apply ----
  const stats = { fieldsCreated: 0, fieldsUpdated: 0, tabsCreated: 0, tabsUpdated: 0, mappingsApplied: 0 };

  await db.$transaction(async (tx) => {
    for (const f of body.fields) {
      const options = normalizeOptions(f.options);
      const config = f.config === undefined || f.config === null
        ? Prisma.DbNull
        : normalizeFieldConfig(f.config) as unknown as Prisma.InputJsonValue;
      const hasOptions = f.dataType === "DROPDOWN" || f.dataType === "MULTI_SELECT";
      const data = {
        label: f.label,
        dataType: f.dataType,
        options: hasOptions ? options : Prisma.DbNull, // stale options are cleared when a type no longer uses them
        config,
        description: f.description ?? null,
        isActive: f.isActive ?? true,
      };
      const existing = await tx.customFieldDefinition.findUnique({ where: { fieldKey: f.fieldKey } });
      if (existing) {
        await tx.customFieldDefinition.update({ where: { id: existing.id }, data });
        stats.fieldsUpdated += 1;
      } else {
        await tx.customFieldDefinition.create({ data: { fieldKey: f.fieldKey, ...data } });
        stats.fieldsCreated += 1;
      }
    }

    let nextOrder = (await tx.projectTab.aggregate({ _max: { order: true } }))._max.order ?? 0;
    for (const t of body.tabs) {
      const existing = await tx.projectTab.findFirst({ where: { name: t.name } });
      let tabId: string;
      if (existing) {
        await tx.projectTab.update({
          where: { id: existing.id },
          data: { description: t.description ?? existing.description, ...(t.order !== undefined ? { order: t.order } : {}) },
        });
        tabId = existing.id;
        stats.tabsUpdated += 1;
      } else {
        nextOrder += 1;
        const created = await tx.projectTab.create({
          data: { name: t.name, order: t.order ?? nextOrder, description: t.description ?? null },
        });
        tabId = created.id;
        stats.tabsCreated += 1;
      }

      // mappings are REPLACED so the tab matches the document exactly
      await tx.tabFieldMapping.deleteMany({ where: { tabId } });
      if (t.fields.length) {
        const rows: { tabId: string; fieldId: string; isRequired: boolean; isReadOnly: boolean; fullWidth: boolean; showInReport: boolean }[] = [];
        for (const m of t.fields) {
          const def = await tx.customFieldDefinition.findUnique({ where: { fieldKey: m.fieldKey }, select: { id: true } });
          if (!def) throw new ApiError(400, `Field "${m.fieldKey}" not found`);
          rows.push({
            tabId, fieldId: def.id,
            isRequired: m.isRequired ?? false,
            isReadOnly: m.isReadOnly ?? false,
            fullWidth: m.fullWidth ?? false,
            showInReport: m.showInReport ?? true,
          });
        }
        await tx.tabFieldMapping.createMany({
          data: rows.map((r, i) => ({ ...r, displayOrder: (i + 1) * 10 })),
        });
        stats.mappingsApplied += rows.length;
      }
    }
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "ProjectTab", entityId: "config-import", entityName: "Form configuration import",
    after: stats,
    context: `Imported ${body.fields.length} field(s) and ${body.tabs.length} tab(s)`,
    ipAddress: ctx.ip, severity: "WARNING",
  });

  return ok({ ...stats, importedFields: body.fields.length, importedTabs: body.tabs.length });
}, { permission: "admin.config", rateLimit: { limit: 20, windowMs: 60_000 } });
