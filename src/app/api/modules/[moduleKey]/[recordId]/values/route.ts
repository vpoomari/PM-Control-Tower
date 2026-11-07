// PM CONTROL TOWER — Custom field values for ONE business record
// GET /api/modules/[moduleKey]/[recordId]/values — all visible values for a record
// PUT /api/modules/[moduleKey]/[recordId]/values — validate + persist values
//
// Values are stored against the correct business record. Adding a field to one
// module never copies values into another module: the unique key is
// (fieldDefinitionId, moduleKey, recordId).

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { getModule, normalizeType } from "@/lib/engines/field-dictionary";
import { canViewField, computeFormulas, filterVisibleFields, listAssignments, logFieldAudit, readValues, resolveRecord, writeValues } from "@/lib/fields/store";

/** Modules whose records are append-only (no value writes). */
const READ_ONLY = new Set(["audit_trail"]);

async function assertRecord(moduleKey: string, recordId: string) {
  const ref = await resolveRecord(moduleKey, recordId);
  if (!ref.exists) throw new ApiError(404, `${getModule(moduleKey)?.recordNoun ?? "Record"} not found`);
  return ref;
}

/** Extra ownership guard for modules where contributors edit their own records. */
async function canWrite(moduleKey: string, recordId: string, session: { id: string; permissions: string[]; isSuperAdmin: boolean }): Promise<boolean> {
  const mod = getModule(moduleKey)!;
  if (hasPermission(session, mod.managePerm) || hasPermission(session, "admin.config")) return true;
  if (moduleKey === "timesheet" && hasPermission(session, "timesheet.own")) {
    const ts = await db.timesheet.findUnique({ where: { id: recordId }, select: { userId: true } });
    return ts?.userId === session.id;
  }
  return false;
}

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { moduleKey, recordId } = ctx.params;
  const mod = getModule(moduleKey);
  if (!mod) throw new ApiError(404, `Unknown module "${moduleKey}"`);
  if (!hasPermission(session, mod.viewPerm) && !hasPermission(session, "admin.config")) {
    throw new ApiError(403, `Permission denied: ${mod.viewPerm} or admin.config`);
  }
  await assertRecord(moduleKey, recordId);

  const subject = { roles: session.roles, isSuperAdmin: session.isSuperAdmin };
  const assignments = filterVisibleFields(await listAssignments(moduleKey, { includeHidden: true }), subject);
  const values = await readValues(moduleKey, [recordId]);
  const current = values[recordId] ?? {};
  const filtered: Record<string, unknown> = {};
  for (const a of assignments) {
    if (!canViewField({ sensitivity: a.field.sensitivity, visibleRolesJson: a.field.visibleRoles.join(",") }, subject)) continue;
    filtered[a.field.fieldKey] = current[a.field.fieldKey] ?? null;
  }
  return ok({ module: mod, recordId, assignments, values: filtered });
}, { rateLimit: { limit: 300, windowMs: 60_000 } });

const putSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  /** Re-evaluate FORMULA fields after the write (default true). */
  recompute: z.boolean().optional(),
});

export const PUT = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const { moduleKey, recordId } = ctx.params;
  const mod = getModule(moduleKey);
  if (!mod) throw new ApiError(404, `Unknown module "${moduleKey}"`);
  if (READ_ONLY.has(moduleKey)) throw new ApiError(403, `${mod.label} is read-only — field values cannot be edited`);
  if (!(await canWrite(moduleKey, recordId, session))) {
    throw new ApiError(403, `Permission denied: ${mod.managePerm} or admin.config`);
  }
  const ref = await assertRecord(moduleKey, recordId);
  const body = await parseBody(ctx.req, putSchema);

  const actor = { id: session.id, roles: session.roles, isSuperAdmin: session.isSuperAdmin };
  // canWrite() above already enforced the module-level gate (including the
  // timesheet-ownership rule the store cannot evaluate), so skip the store's
  // duplicate permission check but keep the field-level sensitivity gates.
  const result = await writeValues(moduleKey, recordId, body.values, actor, { preAuthorized: true });
  if (!result.ok) throw new ApiError(400, "Validation failed", result.errors);

  const hasFormula = (await listAssignments(moduleKey)).some((a) => normalizeType(a.field.dataType) === "FORMULA");
  const formulas = hasFormula && body.recompute !== false ? await computeFormulas(moduleKey, recordId) : {};

  const writtenKeys = Object.keys(result.values);
  if (writtenKeys.length) {
    // One audit row per dictionary field touched, linked to its definition so
    // the field's audit tab shows value history; moduleKey + recordId keep the
    // record-level trail intact.
    const idByKey = new Map(
      (await listAssignments(moduleKey, { includeHidden: true })).map((a) => [a.field.fieldKey, a.field.id]),
    );
    for (const key of writtenKeys) {
      await logFieldAudit({
        fieldDefinitionId: idByKey.get(key) ?? null,
        moduleKey, recordId,
        action: "VALUE_SET",
        summary: `Updated "${key}" on ${mod.recordNoun}${ref.label ? ` ${ref.label}` : ""}`,
        after: { fields: [key] },
        userId: session.id, userName: session.name, role: session.roles[0], ipAddress: ctx.ip,
      });
    }
  }

  const values = await readValues(moduleKey, [recordId]);
  return ok({ saved: Object.keys(result.values), values: { ...(values[recordId] ?? {}), ...formulas } });
}, { rateLimit: { limit: 180, windowMs: 60_000 } });
