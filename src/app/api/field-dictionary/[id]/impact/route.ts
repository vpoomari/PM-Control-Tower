// PM CONTROL TOWER — Field Dictionary impact analysis
// GET /api/field-dictionary/[id]/impact?dataType=&status=&isRequired=&sensitivity=
//      Pre-save impact analysis for a proposed change to a shared definition:
//      modules using it, assignment + record counts, incompatible values and the
//      migration / approval actions the change implies.

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { impactFor } from "@/lib/fields/store";

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const field = await db.customFieldDefinition.findUnique({ where: { id }, select: { id: true } });
  if (!field) throw new ApiError(404, "Field not found");

  const num = (k: string) => {
    const v = ctx.searchParams.get(k);
    if (v === null || v === "") return undefined;
    return v === "true" ? true : v === "false" ? false : v;
  };

  const proposed: Record<string, unknown> = {};
  const dataType = ctx.searchParams.get("dataType");
  const status = ctx.searchParams.get("status");
  const sensitivity = ctx.searchParams.get("sensitivity");
  const label = ctx.searchParams.get("label");
  const options = ctx.searchParams.get("options");
  if (dataType) proposed.dataType = dataType;
  if (status) proposed.status = status;
  if (sensitivity) proposed.sensitivity = sensitivity;
  if (label) proposed.label = label;
  if (options !== null) proposed.options = options ? options.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const isRequired = num("isRequired");
  if (isRequired !== undefined) proposed.isRequired = isRequired;
  const isReadOnly = num("isReadOnly");
  if (isReadOnly !== undefined) proposed.isReadOnly = isReadOnly;

  const report = await impactFor(id, proposed);
  return ok(report);
}, { permission: "admin.config", rateLimit: { limit: 240, windowMs: 60_000 } });
