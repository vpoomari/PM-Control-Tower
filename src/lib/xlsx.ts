// PM CONTROL TOWER — XLSX writer (minimal OOXML spreadsheet, dependency-free)
// Hand-rolled workbook builder for the all-tabs report: assembles the ZIP container
// through the existing store-only zip engine (Excel accepts STORE entries) with
// inline-string cells — no sharedStrings, no external spreadsheet library.
// Supports string/number/boolean/Date cells, a styled header row, frozen top row,
// auto column widths and Excel-serial dates with an ISO display format.

import { buildZip } from "@/lib/engines/zip";

export interface XlsxColumn { key: string; label: string }

export interface XlsxSheet {
  name: string;                                  // raw tab label; sanitized internally
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
  freezeHeader?: boolean;                        // freeze row 1 (default: true)
}

// Fixed cellXfs indices inside styles.xml (kept in sync with STYLES below).
const S_HEADER = 1;
const S_DATE = 2;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);   // Excel day-0 (accounts for the 1900 leap bug)
const MAX_CELL_CHARS = 32_767;                   // Excel per-cell text limit
const MAX_COL_WIDTH = 60;

const XML_ESC: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};

/** Escape text for XML content/attributes and drop characters XML forbids. */
function escXml(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"']/g, (c) => XML_ESC[c]);
}

/** 0-based column index → A, B, … Z, AA, AB, … */
function colRef(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Days since the Excel epoch (fractional day keeps the time of day). */
function excelSerial(d: Date): number {
  return (d.getTime() - EXCEL_EPOCH_MS) / 86_400_000;
}

/**
 * Make a valid, unique worksheet name: ≤31 chars, no []:*?/\, no apostrophe at the
 * ends, no reserved "History", never colliding with a name already used.
 */
export function sanitizeSheetName(raw: string, used: Set<string>): string {
  let base = (raw || "")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/[\[\]:*?/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  if (!base) base = `Sheet${used.size + 1}`;
  if (base.toLowerCase() === "history") base = "History data";
  if (base.length > 31) base = base.slice(0, 31).trim();
  if (!base) base = `Sheet${used.size + 1}`;

  let name = base;
  for (let n = 2; used.has(name); n += 1) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
  }
  used.add(name);
  return name;
}

/** Render one worksheet part. */
function sheetXml(sheet: XlsxSheet): string {
  const { columns, rows } = sheet;
  const width = (idx: number): number => {
    let max = columns[idx]?.label.length ?? 8;
    const probe = Math.min(rows.length, 100);
    for (let r = 0; r < probe; r += 1) {
      const v = rows[r][columns[idx]?.key ?? ""];
      if (v === null || v === undefined) continue;
      const len = v instanceof Date ? 10 : String(v).length;
      if (len > max) max = len;
    }
    return Math.min(Math.max(max + 2, 8), MAX_COL_WIDTH);
  };

  const cols = columns.map((_, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${width(i).toFixed(2)}" customWidth="1"/>`).join("");

  const cellOf = (v: unknown, ref: string, style?: number): string => {
    const s = style !== undefined ? ` s="${style}"` : "";
    if (v instanceof Date) return `<c r="${ref}" s="${S_DATE}"><v>${excelSerial(v)}</v></c>`;
    if (typeof v === "number") {
      return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>`
        : `<c r="${ref}"${s} t="inlineStr"><is><t>${escXml(String(v))}</t></is></c>`;
    }
    if (typeof v === "bigint") return `<c r="${ref}"${s}><v>${v}</v></c>`;
    if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
    const text = String(v).slice(0, MAX_CELL_CHARS);
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escXml(text)}</t></is></c>`;
  };

  const rowXml: string[] = [];
  const headerCells = columns
    .map((c, i) => cellOf(c.label, `${colRef(i)}1`, S_HEADER))
    .join("");
  rowXml.push(`<row r="1">${headerCells}</row>`);

  for (let r = 0; r < rows.length; r += 1) {
    const rn = r + 2;
    const cells: string[] = [];
    for (let i = 0; i < columns.length; i += 1) {
      const v = rows[r][columns[i].key];
      if (v === null || v === undefined || v === "") continue;   // sparse: skip blanks
      cells.push(cellOf(v, `${colRef(i)}${rn}`));
    }
    if (cells.length) rowXml.push(`<row r="${rn}">${cells.join("")}</row>`);
  }

  const lastRef = `${colRef(Math.max(columns.length - 1, 0))}${rows.length + 1}`;
  const freeze = sheet.freezeHeader === false ? "" :
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${lastRef}"/>` +
    freeze +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rowXml.join("")}</sheetData>` +
    `</worksheet>`;
}

// styles.xml — 4 cell formats: 0 normal, 1 bold header on tint, 2 ISO date, 3 bold label.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFDCE9F5"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_OD_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT_SHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const CT_WORKSHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const CT_STYLES = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";

/**
 * Build a complete .xlsx workbook from sheets. Returns raw ZIP bytes ready to
 * stream as an attachment. Throws when given no sheets.
 */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (!sheets.length) throw new Error("buildXlsx: at least one sheet is required");

  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: sanitizeSheetName(s.name, used) }));

  const sheetRels = named.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${NS_OD_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const stylesRelId = named.length + 1;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_OD_REL}">` +
    `<sheets>${named.map((s, i) =>
      `<sheet name="${escXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    `</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${NS_PKG_REL}">${sheetRels}` +
    `<Relationship Id="rId${stylesRelId}" Type="${NS_OD_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT_SHEET}"/>` +
    named.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT_WORKSHEET}"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="${CT_STYLES}"/>` +
    `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_OD_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  return buildZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/styles.xml", content: STYLES },
    ...named.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(s),
    })),
  ]);
}
