// PM CONTROL TOWER — CSV engine (RFC 4180): stringify for export, parse for import.
// Shared by /api/export, /api/import templates and the client-side import dialog.

export interface CsvColumn {
  key: string;
  label: string;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "boolean") s = value ? "TRUE" : "FALSE";
  else s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize rows to CSV text using the given column order. */
export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const head = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(","));
  return [head, ...lines].join("\r\n");
}

/** Parse CSV text into an array of arrays (handles quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ""); // strip BOM
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

/** Convert parsed CSV (header + data rows) into objects keyed by snake/camel header cell. */
export function csvToObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const table = parseCsv(text);
  if (!table.length) return { headers: [], rows: [] };
  const headers = table[0].map((h) => h.trim());
  const rows = table.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (cells[idx] ?? "").trim(); });
    return obj;
  });
  return { headers, rows };
}

/** Column labels are human headers; keys are stable identifiers. Accept either on import. */
export function normalizeHeader(header: string, columns: CsvColumn[]): string | null {
  const h = header.trim().toLowerCase();
  const byLabel = columns.find((c) => c.label.toLowerCase() === h);
  if (byLabel) return byLabel.key;
  const byKey = columns.find((c) => c.key.toLowerCase() === h);
  if (byKey) return byKey.key;
  return null;
}

// ---- Import value coercion helpers (shared by the entity registry) ----

export function toBool(v: string | undefined, fallback: boolean): boolean {
  if (!v) return fallback;
  const s = v.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return fallback;
}

export function toNum(v: string | undefined, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function toNumOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toStr(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

export function toDate(v: string | undefined): Date | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  // Accept YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY and full ISO — CSV is Excel-adjacent.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateStr(d: unknown): string {
  if (!(d instanceof Date)) return "";
  return d.toISOString().slice(0, 10);
}

export function isoStr(d: unknown): string {
  return d instanceof Date ? d.toISOString() : "";
}
