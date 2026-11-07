// PM CONTROL TOWER — Tab Visibility API (admin-configured sidebar tabs).
// GET   /api/admin/nav-visibility   — hidden tab hrefs (any signed-in user; the
//                                     shell filters its sidebar on this list)
// PATCH /api/admin/nav-visibility   — replace the hidden list (admin.config,
//                                     audited, realtime "admin:changed" emitted)
//
// Hiding is DISPLAY-ONLY by design: it only removes tabs from the sidebar and
// sub-tab bar. Routes, deep links, the command palette, search, exports and
// every API keep working — no linkage is ever broken. Entries for tabs that no
// longer exist (retired routes) are ignored on read, so stale config can never
// corrupt navigation.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { NAV_HREFS } from "@/components/pmct/nav-items";

/** Read the hidden list, dropping stale hrefs from retired/renamed tabs. */
async function readHidden(): Promise<string[]> {
  let settings = await db.adminSettings.findUnique({ where: { id: "singleton" } });
  if (!settings) settings = await db.adminSettings.create({ data: { id: "singleton" } });
  try {
    const parsed: unknown = JSON.parse(settings.hiddenNavTabsJson || "[]");
    if (!Array.isArray(parsed)) return [];
    const known = new Set(NAV_HREFS);
    return parsed.filter((h): h is string => typeof h === "string" && known.has(h));
  } catch {
    return [];
  }
}

export const GET = withApi(async () => {
  return ok({ hidden: await readHidden(), totalTabs: NAV_HREFS.length });
}, { rateLimit: { limit: 300, windowMs: 60_000 } });

const patchSchema = z.object({
  hidden: z.array(z.string().min(1).max(200)).max(300),
});

export const PATCH = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, patchSchema);
  const known = new Set(NAV_HREFS);
  const unknown = body.hidden.filter((h) => !known.has(h));
  if (unknown.length) throw new ApiError(400, `Unknown tab(s): ${unknown.join(", ")}`);
  const hidden = [...new Set(body.hidden)];

  const settings = await db.adminSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", hiddenNavTabsJson: JSON.stringify(hidden) },
    update: { hiddenNavTabsJson: JSON.stringify(hidden) },
  });

  await writeAudit({
    userId: session.id,
    userName: session.name,
    action: "UPDATE",
    entityType: "AdminConfig:NavVisibility",
    entityId: "singleton",
    entityName: "Tab visibility",
    after: { hidden, hiddenCount: hidden.length, totalTabs: NAV_HREFS.length },
    severity: hidden.length ? "WARNING" : "INFO",
  });
  // Fan out so every open session (all users) refreshes its sidebar live.
  emitRealtime("admin:changed", { kind: "nav-visibility", hidden });

  return ok({ hidden, settings });
}, { permission: "admin.config", rateLimit: { limit: 60, windowMs: 60_000 } });
