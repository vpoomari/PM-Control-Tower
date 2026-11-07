// PM CONTROL TOWER — Form Tab Builder configuration export
// GET /api/tabs/export — the whole custom-field configuration as one JSON
// document (dictionary + tabs + mappings with their settings). Used for
// backup, environment migration and review of the form configuration.
// Import: POST /api/tabs/import (same document shape).

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";
import { normalizeFieldConfig, normalizeOptions } from "@/lib/engines/custom-fields";

export const GET = withApi(async () => {
  const [fields, tabs] = await Promise.all([
    db.customFieldDefinition.findMany({ orderBy: { fieldKey: "asc" } }),
    db.projectTab.findMany({
      orderBy: { order: "asc" },
      include: { fields: { orderBy: { displayOrder: "asc" }, include: { field: true } } },
    }),
  ]);

  return ok({
    version: 1,
    exportedAt: new Date().toISOString(),
    fields: fields.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      dataType: f.dataType,
      options: f.options === null ? null : normalizeOptions(f.options),
      config: f.config === null ? null : normalizeFieldConfig(f.config),
      description: f.description,
      isActive: f.isActive,
    })),
    tabs: tabs.map((t) => ({
      name: t.name,
      order: t.order,
      description: t.description,
      fields: t.fields.map((m) => ({
        fieldKey: m.field.fieldKey,
        isRequired: m.isRequired,
        isReadOnly: m.isReadOnly,
        fullWidth: m.fullWidth,
        showInReport: m.showInReport,
      })),
    })),
  });
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
