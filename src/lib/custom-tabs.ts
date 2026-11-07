// PM CONTROL TOWER — Dynamic Field Configuration Engine (db-backed helpers)
// Hydration queries shared by API routes. Kept out of route files because
// Next.js route modules may only export HTTP handlers.

import { db } from "@/lib/db";
import { normalizeFieldConfig, normalizeOptions, type HydratedTab } from "@/lib/engines/custom-fields";

/**
 * Fully-hydrated tabs in ONE query per the spec:
 * include: { fields: { orderBy: { displayOrder }, include: { field: true } } }
 */
export async function listHydratedTabs(): Promise<HydratedTab[]> {
  const tabs = await db.projectTab.findMany({
    orderBy: { order: "asc" },
    include: {
      fields: {
        orderBy: { displayOrder: "asc" },
        include: { field: true },
      },
    },
  });
  return tabs.map((t) => ({
    id: t.id,
    name: t.name,
    order: t.order,
    description: t.description,
    fields: t.fields.map((m) => ({
      displayOrder: m.displayOrder,
      isRequired: m.isRequired,
      isReadOnly: m.isReadOnly,
      fullWidth: m.fullWidth,
      showInReport: m.showInReport,
      field: {
        id: m.field.id,
        fieldKey: m.field.fieldKey,
        label: m.field.label,
        dataType: m.field.dataType,
        options: m.field.options === null ? null : normalizeOptions(m.field.options),
        config: m.field.config === null ? null : normalizeFieldConfig(m.field.config),
        description: m.field.description,
        isActive: m.field.isActive,
      },
    })),
  }));
}

/** One tab, fully hydrated (or null). */
export async function getHydratedTab(id: string): Promise<HydratedTab | null> {
  const tabs = await listHydratedTabs();
  return tabs.find((t) => t.id === id) ?? null;
}
