// PM CONTROL TOWER — GET /api/export/[entity]
// Full-fidelity export of any registered entity as CSV (Excel-ready, UTF-8 BOM) or JSON.
// ?template=1 returns a one-row import template. Every export is audited (action EXPORT).

import { NextResponse } from "next/server";
import { withApi, ok, ApiError, writeAudit } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { getEntity } from "@/lib/io/entities";
import { toCsv } from "@/lib/csv";

export const GET = withApi(async (ctx) => {
  const key = ctx.params.entity ?? "";
  const def = getEntity(key);
  if (!def) throw new ApiError(404, `Unknown export entity: ${key}`);
  if (!hasPermission(ctx.session, def.viewPermission)) {
    throw new ApiError(403, `Permission denied: ${def.viewPermission}`);
  }

  const template = ctx.searchParams.get("template") === "1";
  const meta = ctx.searchParams.get("meta") === "1";
  const format = (ctx.searchParams.get("format") ?? "csv").toLowerCase();
  const projectId = ctx.searchParams.get("projectId");
  const stamp = new Date().toISOString().slice(0, 10);

  if (meta) {
    return ok({ entity: key, label: def.label, columns: def.columns, importable: Boolean(def.managePermission) });
  }

  if (template) {
    // Examples are written with label keys (as users see them); map to column keys for CSV.
    const sample = Object.keys(def.example).length
      ? [Object.fromEntries(def.columns.map((c) => [c.key, def.example[c.label] ?? ""]))]
      : [];
    const csv = toCsv(def.columns, sample);
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pmct-${key}-import-template.csv"`,
      },
    });
  }

  const rows = await def.exportRows({ projectId, scopeAll: true });

  if (format === "json") {
    return ok({ entity: key, label: def.label, columns: def.columns, count: rows.length, rows });
  }

  const csv = toCsv(def.columns, rows);
  const session = ctx.session;
  void writeAudit({
    userId: session?.id, userName: session?.name, role: session?.roles?.[0] ?? null,
    action: "EXPORT", entityType: key, entityId: null, entityName: def.label,
    context: `${rows.length} rows (${format})`, severity: "INFO",
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pmct-${key}-${stamp}.csv"`,
      "X-Row-Count": String(rows.length),
    },
  });
}, { rateLimit: { limit: 60, windowMs: 60_000 } });
