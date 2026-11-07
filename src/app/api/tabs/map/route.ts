// PM CONTROL TOWER — Tab ↔ Field mapping API
// POST /api/tabs/map — replace a tab's field mappings in one transaction.
// Body: { tabId, fields: [{ fieldId, isRequired? }] }
// displayOrder is SERVER-normalized from array order (10, 20, 30 …) — the
// array order IS the display order, so clients can't send inconsistent gaps.
// Returns the fully-hydrated tab.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { getHydratedTab } from "@/lib/custom-tabs";

const mapSchema = z.object({
  tabId: z.string().min(1),
  fields: z.array(z.object({
    fieldId: z.string().min(1),
    isRequired: z.boolean().optional(),
    isReadOnly: z.boolean().optional(),
    fullWidth: z.boolean().optional(),
    showInReport: z.boolean().optional(),
  })).max(500),
});

export const POST = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, mapSchema);

  const tab = await db.projectTab.findUnique({ where: { id: body.tabId } });
  if (!tab) throw new ApiError(404, "Tab not found");

  // uniqueness within the payload (spec: @@unique([tabId, fieldId]))
  const seen = new Set<string>();
  for (const f of body.fields) {
    if (seen.has(f.fieldId)) throw new ApiError(400, "Duplicate field in mapping payload");
    seen.add(f.fieldId);
  }

  // all referenced fields must exist (and be active — mapping dead fields is a config bug)
  const fields = body.fields.length
    ? await db.customFieldDefinition.findMany({ where: { id: { in: [...seen] } } })
    : [];
  if (fields.length !== seen.size) {
    const found = new Set(fields.map((f) => f.id));
    const missing = [...seen].filter((fid) => !found.has(fid));
    throw new ApiError(400, `Field(s) not found: ${missing.join(", ")}`);
  }
  const inactive = fields.filter((f) => !f.isActive);
  if (inactive.length) {
    throw new ApiError(400, `Cannot map inactive field(s): ${inactive.map((f) => f.label).join(", ")}`);
  }

  const before = await db.tabFieldMapping.findMany({ where: { tabId: tab.id }, orderBy: { displayOrder: "asc" } });

  // transactional replace — partial failure never leaves a half-mapped tab
  await db.$transaction([
    db.tabFieldMapping.deleteMany({ where: { tabId: tab.id } }),
    db.tabFieldMapping.createMany({
      data: body.fields.map((f, i) => ({
        tabId: tab.id,
        fieldId: f.fieldId,
        displayOrder: (i + 1) * 10,
        isRequired: f.isRequired ?? false,
        isReadOnly: f.isReadOnly ?? false,
        fullWidth: f.fullWidth ?? false,
        showInReport: f.showInReport ?? true,
      })),
    }),
  ]);

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "UPDATE", entityType: "ProjectTab", entityId: tab.id, entityName: tab.name,
    before: { mappings: before }, after: { mappings: body.fields },
    context: `Assigned ${body.fields.length} field(s)`, ipAddress: ctx.ip,
  });

  return ok(await getHydratedTab(tab.id));
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
