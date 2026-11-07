// PM CONTROL TOWER — GET /api/io/entities
// Session-filtered list of every registered import/export entity (src/lib/io/entities):
// key, label, permissions, importable flag and the canonical column set that drives
// CSV auto-mapping in the "Data Importing and Exporting" hub. Entities whose view
// permission the caller lacks are omitted entirely.

import { withApi, ok } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { ENTITIES } from "@/lib/io/entities";

export const GET = withApi(async (ctx) => {
  const entities = Object.entries(ENTITIES)
    .filter(([, def]) => hasPermission(ctx.session, def.viewPermission))
    .map(([key, def]) => ({
      key,
      label: def.label,
      viewPermission: def.viewPermission,
      managePermission: def.managePermission ?? null,
      importable: Boolean(def.managePermission),
      columns: def.columns.map((c) => ({ key: c.key, label: c.label })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return ok({
    entities,
    importableCount: entities.filter((e) => e.importable).length,
    exportableCount: entities.length,
  });
}, { rateLimit: { limit: 120, windowMs: 60_000 } });
