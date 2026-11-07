// PM CONTROL TOWER — Project Tab API (duplicate)
// POST /api/tabs/[id]/duplicate — clone a tab with every field mapping and
// its settings (required / read-only / full-width / report flags) intact.
// The copy lands at the end of the tab strip with a unique "(copy)" name.

import { db } from "@/lib/db";
import { withApi, ok, ApiError, writeAudit } from "@/lib/api";
import { getHydratedTab } from "@/lib/custom-tabs";

const MAX_TABS = 100;

function copyName(base: string): string {
  const stem = base.replace(/ \(copy( \d+)?\)$/, "");
  const trimmed = stem.slice(0, 50);
  return `${trimmed} (copy)`.slice(0, 60);
}

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params;
  const source = await db.projectTab.findUnique({
    where: { id },
    include: { fields: { orderBy: { displayOrder: "asc" } } },
  });
  if (!source) throw new ApiError(404, "Tab not found");

  const count = await db.projectTab.count();
  if (count >= MAX_TABS) throw new ApiError(400, `Tab limit reached (${MAX_TABS})`);

  // "Name (copy)", then "Name (copy 2)", "Name (copy 3)" …
  let name = copyName(source.name);
  for (let i = 2; i <= MAX_TABS + 1; i++) {
    const clash = await db.projectTab.findFirst({ where: { name } });
    if (!clash) break;
    name = `${copyName(source.name).replace(/\)$/, "").trim()} ${i})`.slice(0, 60);
  }

  const max = (await db.projectTab.aggregate({ _max: { order: true } }))._max.order;

  const created = await db.projectTab.create({
    data: {
      name,
      order: max === null ? 1 : max + 1,
      description: source.description,
      fields: {
        create: source.fields.map((m) => ({
          fieldId: m.fieldId,
          displayOrder: m.displayOrder,
          isRequired: m.isRequired,
          isReadOnly: m.isReadOnly,
          fullWidth: m.fullWidth,
          showInReport: m.showInReport,
        })),
      },
    },
  });

  await writeAudit({
    userId: ctx.session?.id, userName: ctx.session?.name, role: ctx.session?.roles[0],
    action: "CREATE", entityType: "ProjectTab", entityId: created.id, entityName: created.name,
    after: { duplicatedFrom: source.name, fields: source.fields.length },
    context: `Duplicated tab "${source.name}" with ${source.fields.length} field(s)`,
    ipAddress: ctx.ip,
  });

  return ok(await getHydratedTab(created.id), 201);
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
