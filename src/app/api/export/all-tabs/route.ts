// PM CONTROL TOWER — GET /api/export/all-tabs?format=pdf|xlsx|csv
// Extracts every tab (module) the caller may view into ONE downloadable report:
//   pdf  (default) — branded cover, table of contents with page numbers, then one
//         paginated, word-wrapped section per tab (bounded for print);
//   xlsx — Excel workbook: Cover + Index sheets, then one sheet per tab;
//   csv  — single sectioned CSV file (UTF-8 BOM) with an index then one block per tab.
// Permission-filtered per entity (sections the caller cannot view are omitted).
// Every export is audited (action EXPORT) and rate-limited.

import { NextResponse } from "next/server";
import { withApi, ApiError, writeAudit } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { ENTITIES } from "@/lib/io/entities";
import { buildPdfReport, type PdfSection } from "@/lib/pdf";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { buildXlsx, type XlsxSheet } from "@/lib/xlsx";

export const runtime = "nodejs";

type Format = "pdf" | "xlsx" | "csv";

// Tab order mirrors the sidebar navigation groups. Keys must exist in ENTITIES.
const TAB_ORDER: { group: string; key: string }[] = [
  { group: "Portfolio", key: "portfolios" },
  { group: "Portfolio", key: "programs" },
  { group: "Portfolio", key: "projects" },
  { group: "Plan", key: "requirements" },
  { group: "Plan", key: "wbs-nodes" },
  { group: "Plan", key: "tasks" },
  { group: "Plan", key: "milestones" },
  { group: "Plan", key: "baselines" },
  { group: "Execute", key: "resources" },
  { group: "Execute", key: "timesheets" },
  { group: "Execute", key: "timesheet-entries" },
  { group: "Control", key: "budget-lines" },
  { group: "Control", key: "evm-periods" },
  { group: "Control", key: "health-snapshots" },
  { group: "Control", key: "risks" },
  { group: "Control", key: "issues" },
  { group: "Control", key: "assumptions" },
  { group: "Control", key: "changes" },
  { group: "Control", key: "stage-gates" },
  { group: "Control", key: "governance-rules" },
  { group: "Control", key: "alerts" },
  { group: "Administration", key: "users" },
  { group: "Administration", key: "audit-events" },
];

const MAX_ROWS_PER_TAB = 400;   // keep the PDF bounded; the tab's CSV export stays full fidelity
const MAX_COLS_PER_TAB = 16;    // beyond ~16 columns a landscape page becomes unreadable
const MAX_ROWS_TABULAR = 5_000; // per-tab cap shared by the XLSX and CSV renderers

const TITLE = "All Tabs — Workspace Export";
const SUBTITLE = "Every permitted module in one report: portfolios, planning, delivery, controls and administration data";
const EXPORT_ERROR_NOTE = "This tab could not be exported right now — try again or export it individually.";

const FORMAT_LABEL: Record<Format, string> = { pdf: "PDF", xlsx: "Excel", csv: "CSV" };
const CONTENT_TYPE: Record<Format, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

/** One tab's data, fetched once and rendered per format. */
interface ReportSection {
  group: string;
  label: string;
  columns: CsvColumn[];                        // full field set (PDF drops fields itself)
  rows: Record<string, unknown>[];             // sliced to MAX_ROWS_TABULAR at fetch
  total: number;                               // unsliced record count
  error?: string;
}

const truncationNote = (s: ReportSection): string =>
  s.total > s.rows.length
    ? `Showing the first ${MAX_ROWS_TABULAR.toLocaleString("en-US")} of ${s.total.toLocaleString("en-US")} records — use this tab's individual export for the full dataset.`
    : "";

// ---------- Renderers ----------

/** PDF sections: print bounds + the historic note wording (400 rows / 16 fields). */
function toPdfSections(secs: ReportSection[]): PdfSection[] {
  return secs.map((s) => {
    if (s.error) return { group: s.group, label: s.label, columns: [], rows: [], note: EXPORT_ERROR_NOTE };
    const notes: string[] = [];
    let columns = s.columns;
    if (columns.length > MAX_COLS_PER_TAB) {
      // Prefer dropping the opaque id column first; CSV export carries the full field set.
      columns = s.columns.filter((c) => c.key !== "id").slice(0, MAX_COLS_PER_TAB);
      notes.push(`Showing the first ${MAX_COLS_PER_TAB} of ${s.columns.length} fields — the tab's CSV export includes the full field set.`);
    }
    if (s.total > MAX_ROWS_PER_TAB) {
      notes.push(`Showing the first ${MAX_ROWS_PER_TAB} of ${s.total.toLocaleString("en-US")} records — use the tab's CSV export for the full dataset.`);
    }
    return {
      group: s.group, label: s.label, columns,
      rows: s.rows.slice(0, MAX_ROWS_PER_TAB),
      note: notes.join(" ") || undefined,
    };
  });
}

/** Single sectioned CSV: metadata lines, an index block, then one block per tab. */
function toReportCsv(secs: ReportSection[], generatedBy: string, stamp: Date): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const parts: string[] = [
    q(TITLE),
    q(SUBTITLE),
    q(`Generated by ${generatedBy}`),
    q(`Generated ${stamp.toISOString().replace("T", " ").slice(0, 16)} UTC`),
    "",
    toCsv(
      [
        { key: "group", label: "Group" }, { key: "tab", label: "Tab" },
        { key: "records", label: "Records" }, { key: "note", label: "Note" },
      ],
      secs.map((s) => ({
        group: s.group, tab: s.label, records: s.total,
        note: s.error ? EXPORT_ERROR_NOTE : truncationNote(s),
      })),
    ),
  ];
  for (const s of secs) {
    parts.push("");
    if (s.error) {
      parts.push(q(`# ${s.group} / ${s.label} — ${EXPORT_ERROR_NOTE}`));
      continue;
    }
    const shown = s.rows.length;
    const head = `# ${s.group} / ${s.label} — ${s.total.toLocaleString("en-US")} records`;
    parts.push(q(shown < s.total ? `${head} (showing the first ${shown.toLocaleString("en-US")})` : head));
    parts.push(toCsv(s.columns, s.rows));
  }
  return `${parts.join("\r\n")}\r\n`;
}

/** Excel workbook: Cover metadata, Index of tabs, then one sheet per exported tab. */
function toXlsxSheets(secs: ReportSection[], generatedBy: string, stamp: Date): XlsxSheet[] {
  const indexNote = (s: ReportSection) => (s.error ? EXPORT_ERROR_NOTE : truncationNote(s));
  const meta: XlsxSheet = {
    name: "Cover",
    freezeHeader: false,
    columns: [{ key: "field", label: "Field" }, { key: "value", label: "Value" }],
    rows: [
      { field: "Report", value: TITLE },
      { field: "Contents", value: SUBTITLE },
      { field: "Generated by", value: generatedBy },
      { field: "Generated", value: stamp.toISOString().replace("T", " ").slice(0, 16) },
      { field: "Tabs", value: secs.length },
      { field: "Records", value: secs.reduce((a, s) => a + s.total, 0) },
      { field: "Permission filter", value: "Only tabs you may view are included." },
    ],
  };
  const index: XlsxSheet = {
    name: "Index",
    columns: [
      { key: "group", label: "Group" }, { key: "tab", label: "Tab" },
      { key: "records", label: "Records" }, { key: "note", label: "Note" },
    ],
    rows: secs.map((s) => ({ group: s.group, tab: s.label, records: s.total, note: indexNote(s) })),
  };
  return [
    meta, index,
    ...secs.filter((s) => !s.error).map((s) => ({ name: s.label, columns: s.columns, rows: s.rows })),
  ];
}

// ---------- Route ----------

export const GET = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");

  const raw = (ctx.searchParams.get("format") ?? "pdf").toLowerCase();
  if (raw !== "pdf" && raw !== "xlsx" && raw !== "csv") {
    throw new ApiError(400, `Unsupported export format: ${raw} (expected pdf, xlsx or csv)`);
  }
  const format = raw as Format;

  const sections: ReportSection[] = [];
  let skipped = 0;
  for (const tab of TAB_ORDER) {
    const def = ENTITIES[tab.key];
    if (!def) continue;
    if (!hasPermission(session, def.viewPermission)) { skipped += 1; continue; }
    try {
      const rows = await def.exportRows({ scopeAll: true });
      sections.push({
        group: tab.group, label: def.label, columns: def.columns,
        rows: rows.slice(0, MAX_ROWS_TABULAR), total: rows.length,
      });
    } catch {
      sections.push({ group: tab.group, label: def.label, columns: def.columns, rows: [], total: 0, error: "export failed" });
    }
  }

  if (!sections.length) throw new ApiError(403, "You do not have permission to view any tabs");

  const stamp = new Date();
  const datePart = stamp.toISOString().slice(0, 10);
  const baseName = `pmct-all-tabs-${datePart}`;
  const rowCount = sections.reduce((a, s) => a + s.total, 0);

  void writeAudit({
    userId: session.id, userName: session.name, role: session.roles?.[0] ?? null,
    action: "EXPORT", entityType: "all-tabs", entityId: null, entityName: `All Tabs (${FORMAT_LABEL[format]})`,
    context: `${sections.length} sections, ${rowCount} rows, format=${format}${skipped ? `, ${skipped} tabs skipped (permissions)` : ""}`,
    severity: "INFO",
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });

  const headers = (filename: string) => ({
    "Content-Type": CONTENT_TYPE[format],
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Section-Count": String(sections.length),
    "X-Row-Count": String(rowCount),
  });

  if (format === "pdf") {
    const pdf = buildPdfReport({
      title: TITLE,
      subtitle: SUBTITLE,
      generatedBy: session.name,
      generatedAt: stamp,
      sections: toPdfSections(sections),
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: headers(`${baseName}.pdf`),
    });
  }

  if (format === "csv") {
    const csv = toReportCsv(sections, session.name, stamp);
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: headers(`${baseName}.csv`),
    });
  }

  const xlsx = buildXlsx(toXlsxSheets(sections, session.name, stamp));
  return new NextResponse(new Uint8Array(xlsx), {
    status: 200,
    headers: headers(`${baseName}.xlsx`),
  });
}, { rateLimit: { limit: 5, windowMs: 60_000 } });
