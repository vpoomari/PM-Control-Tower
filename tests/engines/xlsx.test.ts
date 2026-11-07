// PM CONTROL TOWER — XLSX writer unit tests (pure, DB-free, deterministic)
// Covers the hand-rolled workbook container in src/lib/xlsx.ts: ZIP parts, XML
// escaping, cell typing (string/number/boolean/Date), column refs and sheet-name rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx, sanitizeSheetName, type XlsxSheet } from "../../src/lib/xlsx";

// Minimal store-only ZIP reader (this writer never compresses — flags/method are 0).
function readZipEntries(buf: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder();
  let o = 0;
  while (o + 30 <= buf.length && dv.getUint32(o, true) === 0x04034b50) {
    const method = dv.getUint16(o + 8, true);
    const size = dv.getUint32(o + 18, true);
    const nameLen = dv.getUint16(o + 26, true);
    const extraLen = dv.getUint16(o + 28, true);
    const name = dec.decode(buf.subarray(o + 30, o + 30 + nameLen));
    const start = o + 30 + nameLen + extraLen;
    assert.equal(method, 0, `entry ${name} must be store-only`);
    out.set(name, dec.decode(buf.subarray(start, start + size)));
    o = start + size;
  }
  // The loop stopped at the central directory; EOCD is the final 22 bytes (no zip comment).
  assert.equal(dv.getUint32(buf.length - 22, true), 0x06054b50, "missing ZIP end-of-central-directory");
  return out;
}

const sheet = (name: string, columns: XlsxSheet["columns"], rows: XlsxSheet["rows"]): XlsxSheet =>
  ({ name, columns, rows });

test("xlsx: builds every required OOXML part", () => {
  const zip = readZipEntries(buildXlsx([sheet("Data", [{ key: "a", label: "A" }], [{ a: 1 }])]));
  for (const part of [
    "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml",
  ]) {
    assert.ok(zip.has(part), `missing ${part}`);
  }
  const wb = zip.get("xl/workbook.xml")!;
  assert.match(wb, /<sheet name="Data" sheetId="1" r:id="rId1"\/>/);
  assert.match(zip.get("xl/_rels/workbook.xml.rels")!, /styles\.xml/);
  assert.match(zip.get("[Content_Types].xml")!, /sheet\.main\+xml/);
});

test("xlsx: cell typing, escaping and header style", () => {
  const zip = readZipEntries(buildXlsx([sheet("Types",
    [{ key: "n", label: "Num" }, { key: "s", label: "Txt" }, { key: "b", label: "Flag" }, { key: "d", label: "Day" }],
    [
      { n: 42, s: `<a & "b">`, b: true, d: new Date(Date.UTC(2026, 0, 15)) },
      { n: 7 },                                       // sparse: missing fields are skipped
    ])]));
  const xml = zip.get("xl/worksheets/sheet1.xml")!;

  // Header row is styled (s="1") and escaped.
  assert.match(xml, /<row r="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Num<\/t><\/is><\/c>/);
  // Number stays a plain numeric cell; text is escaped inline string.
  assert.match(xml, /<c r="A2"><v>42<\/v><\/c>/);
  assert.ok(xml.includes("a &amp; &quot;b&quot;"), "text must be XML-escaped");
  assert.ok(!xml.includes("<a &"), "raw markup must never leak");
  // Boolean as b-typed 1/0.
  assert.match(xml, /<c r="C2" t="b"><v>1<\/v><\/c>/);
  // Date as Excel serial with the date style (2026-01-15 → 46037).
  assert.match(xml, /<c r="D2" s="2"><v>46037<\/v><\/c>/);
  // Blanks are omitted (sparse cells): 4 header + 4 row-2 + 1 row-3 cell.
  assert.equal((xml.match(/<c /g) ?? []).length, 9);
});

test("xlsx: column references roll over A→Z→AA", () => {
  const columns = Array.from({ length: 28 }, (_, i) => ({ key: `k${i}`, label: `C${i}` }));
  const zip = readZipEntries(buildXlsx([sheet("Wide", columns, [])]));
  const xml = zip.get("xl/worksheets/sheet1.xml")!;
  assert.ok(xml.includes('r="Z1"'), "26th column is Z");
  assert.ok(xml.includes('r="AA1"'), "27th column is AA");
  assert.ok(xml.includes('r="AB1"'), "28th column is AB");
  assert.match(xml, /<dimension ref="A1:AB1"\/>/);
});

test("xlsx: sheet names are sanitized and unique", () => {
  const used = new Set<string>();
  assert.equal(sanitizeSheetName("Plan / 2026 [x:y]", used), "Plan - 2026 -x-y-");
  const a = sanitizeSheetName("Risk[]Issue", used);           // [] replaced
  assert.ok(!/[[\]:*?/\\]/.test(a), `invalid chars remain in ${a}`);
  const b = sanitizeSheetName("x".repeat(50), used);          // >31 chars truncated
  assert.ok(b.length <= 31, `too long: ${b.length}`);
  const c = sanitizeSheetName("Alpha", used);                 // first use
  const d = sanitizeSheetName("Alpha", used);                 // duplicate suffixed
  assert.equal(c, "Alpha");
  assert.equal(d, "Alpha (2)");
  const e = sanitizeSheetName("   ", used);                   // empty → fallback
  assert.ok(e.length > 0);
  const f = sanitizeSheetName("History", used);               // reserved word
  assert.notEqual(f.toLowerCase(), "history");
  const g = sanitizeSheetName("'quoted'", used);              // no edge apostrophes
  assert.ok(!g.startsWith("'") && !g.endsWith("'"), g);
});

test("xlsx: duplicate tab labels get unique sheet names in workbook.xml", () => {
  const zip = readZipEntries(buildXlsx([
    sheet("Tasks", [{ key: "a", label: "A" }], [{ a: 1 }]),
    sheet("Tasks", [{ key: "a", label: "A" }], [{ a: 2 }]),
  ]));
  const wb = zip.get("xl/workbook.xml")!;
  assert.ok(wb.includes('name="Tasks"'));
  assert.ok(wb.includes('name="Tasks (2)"'));
  assert.ok(zip.has("xl/worksheets/sheet2.xml"));
});

test("xlsx: rejects an empty workbook", () => {
  assert.throws(() => buildXlsx([]), /at least one sheet/);
});
