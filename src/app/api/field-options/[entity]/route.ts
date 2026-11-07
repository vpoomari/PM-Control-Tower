// PM CONTROL TOWER — Entity lookup options for ENTITY_LOOKUP dictionary fields
// GET /api/field-options/[entity] — small option lists (id + label) for the
//     entities an ENTITY_LOOKUP field may point at. Explicit whitelist: no
//     arbitrary table access.

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";

const SUPPORTED = ["project", "portfolio", "program", "client"] as const;

export const GET = withApi(async (ctx) => {
  const entity = ctx.params.entity;
  if (!(SUPPORTED as readonly string[]).includes(entity)) {
    throw new ApiError(404, `Unsupported entity "${entity}". Supported: ${SUPPORTED.join(", ")}`);
  }

  const take = 500;
  let records: { id: string; label: string }[] = [];
  if (entity === "project") {
    records = (await db.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take })).map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  } else if (entity === "portfolio") {
    records = (await db.portfolio.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take })).map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  } else if (entity === "program") {
    records = (await db.program.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take })).map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }));
  } else {
    records = (await db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take })).map((c) => ({ id: c.id, label: c.name }));
  }
  return ok({ entity, records });
}, { permission: ["project.view", "admin.config"], rateLimit: { limit: 300, windowMs: 60_000 } });
