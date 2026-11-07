// PM CONTROL TOWER — GET /api/export/all?format=xlsx|json
// One-click "Export everything": every dataset the session may view, in linkage order
// (parents first — IMPORT_ORDER, then the read-only datasets), as ONE downloadable
//   xlsx  — Cover (AI-written summary when AI is available, static otherwise) + Index
//          + one sheet per dataset;
//   json  — a single archive { generatedAt, cover, datasets: [...] } in the same order.
// Per-dataset row cap keeps a full-platform bundle downloadable (the per-dataset export
// remains the full-fidelity path). Permission-filtered per entity, audited, rate-limited.

import { NextResponse } from "next/server";
import { withApi, ApiError, writeAudit } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { ENTITIES } from "@/lib/io/entities";
import { IMPORT_ORDER } from "@/lib/io/model";
import { buildXlsx, type XlsxSheet } from "@/lib/xlsx";
import { askAIResult } from "@/lib/ai/ai-service";

export const runtime = "nodejs";

const MAX_ROWS = 5000;
const CONTENT_TYPE = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
} as const;

interface BundleSection {
  key: string;
  label: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  total: number;
  error?: string;
}

/** Datasets in linkage order: importable parents first, then everything else. */
function exportOrder(): string[] {
  const rest = Object.keys(ENTITIES).filter((k) => !IMPORT_ORDER.includes(k));
  return [...IMPORT_ORDER.filter((k) => ENTITIES[k]), ...rest];
}

const STATIC_COVER =
  "Full export of the datasets visible to the requesting account, assembled in dependency "
  + "order (parents before children) so codes and e-mail references stay resolvable.";

async function aiCover(
  sections: BundleSection[],
  generatedBy: string,
  rowCount: number,
): Promise<{ text: string; source: string }> {
  const counts = sections.map((s) => `${s.label}: ${s.total}`).join(", ");
  const prompt = [
    `Write a cover note (plain text, max 60 words, no markdown) for a PM CONTROL TOWER data export.`,
    `Exported by ${generatedBy}. ${sections.length} datasets, ${rowCount} total rows.`,
    `Dataset row counts: ${counts.slice(0, 1200)}`,
  ].join("\n");
  const r = await askAIResult(
    prompt,
    "You write concise, factual cover notes for project-management data exports. Output plain text only.",
  );
  if (r.status === "ok" && !r.fallback && r.text.trim()) {
    return { text: r.text.trim().replace(/\s+/g, " ").slice(0, 1200), source: `AI (${r.model ?? r.provider ?? "provider"})` };
  }
  return { text: STATIC_COVER, source: `static fallback (AI: ${r.status})` };
}

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");

  const raw = (ctx.searchParams.get("format") ?? "xlsx").toLowerCase();
  if (raw !== "xlsx" && raw !== "json") {
    throw new ApiError(400, `Unsupported export format: ${raw} (expected xlsx or json)`);
  }
  const format = raw as "xlsx" | "json";

  const sections: BundleSection[] = [];
  let skipped = 0;
  for (const key of exportOrder()) {
    const def = ENTITIES[key];
    if (!def) continue;
    if (!hasPermission(session, def.viewPermission)) { skipped += 1; continue; }
    try {
      const rows = await def.exportRows({ scopeAll: true });
      sections.push({
        key, label: def.label, columns: def.columns,
        rows: rows.slice(0, MAX_ROWS), total: rows.length,
      });
    } catch {
      sections.push({ key, label: def.label, columns: def.columns, rows: [], total: 0, error: "export failed" });
    }
  }
  if (!sections.length) throw new ApiError(403, "You do not have permission to view any dataset");

  const stamp = new Date();
  const rowCount = sections.reduce((a, s) => a + s.total, 0);
  const cover = await aiCover(sections, session.name, rowCount);
  const datePart = stamp.toISOString().slice(0, 10);
  const baseName = `pmct-export-all-${datePart}`;
  const truncations = sections.filter((s) => s.total > s.rows.length);

  void writeAudit({
    userId: session.id, userName: session.name, role: session.roles?.[0] ?? null,
    action: "EXPORT", entityType: "all", entityId: null,
    entityName: `All datasets (${format.toUpperCase()})`,
    context: `${sections.length} datasets, ${rowCount} rows, format=${format}, cover=${cover.source}${skipped ? `, ${skipped} datasets skipped (permissions)` : ""}${truncations.length ? `, ${truncations.length} dataset(s) capped at ${MAX_ROWS}` : ""}`,
    severity: "INFO",
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });

  const headers = (filename: string) => ({
    "Content-Type": CONTENT_TYPE[format],
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Dataset-Count": String(sections.length),
    "X-Row-Count": String(rowCount),
  });

  if (format === "json") {
    const bundle = {
      generatedAt: stamp.toISOString(),
      generatedBy: session.name,
      cover,
      order: "linkage (parents before children)",
      datasets: sections.map((s) => ({
        entity: s.key,
        label: s.label,
        columns: s.columns,
        rows: s.rows,
        total: s.total,
        truncated: s.total > s.rows.length ? MAX_ROWS : null,
        error: s.error ?? null,
      })),
    };
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: headers(`${baseName}.json`),
    });
  }

  const note = (s: BundleSection) =>
    s.error ? s.error : s.total > s.rows.length ? `first ${s.rows.length} of ${s.total} rows` : "";
  const sheets: XlsxSheet[] = [
    {
      name: "Cover",
      freezeHeader: false,
      columns: [{ key: "field", label: "Field" }, { key: "value", label: "Value" }],
      rows: [
        { field: "Export", value: "PM CONTROL TOWER — all datasets" },
        { field: "Generated by", value: session.name },
        { field: "Generated", value: stamp.toISOString().replace("T", " ").slice(0, 16) },
        { field: "Datasets", value: sections.length },
        { field: "Records", value: rowCount },
        { field: "Order", value: "Linkage order (parents before children)" },
        { field: "Permission filter", value: "Only datasets you may view are included." },
        { field: "Cover note", value: cover.text },
        { field: "Cover source", value: cover.source },
      ],
    },
    {
      name: "Index",
      columns: [
        { key: "dataset", label: "Dataset" },
        { key: "key", label: "Key" },
        { key: "records", label: "Records" },
        { key: "note", label: "Note" },
      ],
      rows: sections.map((s) => ({ dataset: s.label, key: s.key, records: s.total, note: note(s) })),
    },
    ...sections.filter((s) => !s.error).map((s) => ({ name: s.label, columns: s.columns, rows: s.rows })),
  ];
  const xlsx = buildXlsx(sheets);
  return new NextResponse(new Uint8Array(xlsx), {
    status: 200,
    headers: headers(`${baseName}.xlsx`),
  });
}, { rateLimit: { limit: 10, windowMs: 60_000 } });
