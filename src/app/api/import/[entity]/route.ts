// PM CONTROL TOWER — POST /api/import/[entity]
// Governed CSV import: { rows, mode } where mode is "validate" (dry-run, reports what
// WOULD change) or "apply" (transactional upsert). Every applied import is audited and
// fans out a realtime event. Requires the entity's manage permission.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, ok, ApiError, writeAudit } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { emitRealtime } from "@/lib/realtime";
import { getEntity, runImport, IMPORT_MAX_ROWS, type RowResult } from "@/lib/io/entities";

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(IMPORT_MAX_ROWS),
  mode: z.enum(["validate", "apply"]),
});

export const POST = withApi(async (ctx) => {
  const key = ctx.params.entity ?? "";
  const def = getEntity(key);
  if (!def) throw new ApiError(404, `Unknown import entity: ${key}`);
  if (!def.managePermission) throw new ApiError(405, `${def.label} cannot be imported`);
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  if (!hasPermission(ctx.session, def.managePermission)) {
    throw new ApiError(403, `Permission denied: ${def.managePermission}`);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await ctx.req.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new ApiError(400, `Invalid import payload: ${e.issues[0]?.message ?? "validation failed"}`);
    }
    throw new ApiError(400, "Invalid JSON body");
  }

  const { results } = await runImport(def, body.rows, ctx.session, body.mode);
  const errors = results.filter((r: RowResult) => r.action === "error");
  const created = results.filter((r: RowResult) => r.action === "created").length;
  const updated = results.filter((r: RowResult) => r.action === "updated").length;

  if (body.mode === "apply" && (created > 0 || updated > 0)) {
    void writeAudit({
      userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles?.[0] ?? null,
      action: "IMPORT", entityType: key, entityId: null, entityName: def.label,
      after: { created, updated, failed: errors.length },
      context: `CSV import: ${created} created, ${updated} updated, ${errors.length} failed`,
      severity: errors.length ? "WARNING" : "INFO",
      ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    });
    emitRealtime("data:imported", { entity: key, created, updated, failed: errors.length, by: ctx.session.name });
  }

  return ok({
    mode: body.mode,
    entity: key,
    label: def.label,
    total: results.length,
    created,
    updated,
    failed: errors.length,
    results,
  });
}, { rateLimit: { limit: 20, windowMs: 60_000 } });
