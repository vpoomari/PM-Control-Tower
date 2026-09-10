// PM CONTROL TOWER — Complete Documentation Suite (.docx)
// Cover recipe R1 + DM-1 palette per docx skill design system. English document.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, BorderStyle, WidthType, ShadingType,
  TableLayoutType, SectionType, NumberFormat, TableOfContents, PageBreak, VerticalAlign,
} = require("docx");
const fs = require("fs");

// ---------- Palette (DM-1 Deep Cyan — tech/digital) ----------
const P = {
  bg: "162235", accent: "1B6B7A", accentBright: "37DCF2",
  title: "FFFFFF", subtitle: "B0B8C0", meta: "90989F", footer: "687078",
  primary: "162235", body: "24303C", muted: "5A6B7A",
  tableHeaderBg: "1B6B7A", tableHeaderText: "FFFFFF", tableLine: "C8DDE2", tableSurface: "EDF3F5",
};
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { ...noBorders, insideHorizontal: NB, insideVertical: NB };
const FONT = { ascii: "Calibri", eastAsia: "Calibri", hAnsi: "Calibri" };
const HFONT = { ascii: "Arial", eastAsia: "Arial", hAnsi: "Arial" };

// ---------- Cover helpers (from design-system.md) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."-_—–·/", ..." \t"]);
  const lines = []; let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) { if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; } }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) { const last = lines.pop(); lines[lines.length - 1] += last; }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // English chars ~ pt*10 twips wide
  const charWidth = (pt) => pt * 11;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45), rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}
function buildCoverR1(config) {
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accentBright, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accentBright, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accentBright, font: HFONT })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.title, font: HFONT })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitle, font: FONT })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 22, color: P.meta, font: FONT })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accentBright, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footer, font: HFONT }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footer, font: HFONT }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, verticalAlign: "top", children })],
    })],
  })];
}

// ---------- Body builders ----------
function h1(num, text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 160 },
    children: [new TextRun({ text: `${num}. ${text}`, bold: true, size: 30, color: P.primary, font: HFONT })],
  });
}
function h2(num, text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 },
    children: [new TextRun({ text: `${num} ${text}`, bold: true, size: 25, color: P.accent, font: HFONT })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 22, color: P.body, font: FONT, ...opts })],
  });
}
function bodyRuns(runs) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: 120 },
    children: runs.map((r) => new TextRun({ size: 22, color: P.body, font: FONT, ...r })),
  });
}
function bullet(text, bold = null) {
  const runs = [];
  if (bold) runs.push(new TextRun({ text: bold + " — ", bold: true, size: 22, color: P.body, font: FONT }));
  runs.push(new TextRun({ text, size: 22, color: P.body, font: FONT }));
  return new Paragraph({ bullet: { level: 0 }, spacing: { line: 312, after: 60 }, children: runs });
}
function codeLine(text) {
  return new Paragraph({
    spacing: { line: 276, after: 40 }, indent: { left: 360 },
    shading: { type: ShadingType.CLEAR, fill: P.tableSurface },
    children: [new TextRun({ text, size: 19, color: P.primary, font: { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "Consolas" } })],
  });
}
function tCell(text, opts = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: opts.fill || "FFFFFF" },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: P.tableLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: P.tableLine },
      left: { style: BorderStyle.SINGLE, size: 2, color: P.tableLine },
      right: { style: BorderStyle.SINGLE, size: 2, color: P.tableLine },
    },
    children: [new Paragraph({
      spacing: { line: 264 },
      children: [new TextRun({ text, size: 19, bold: !!opts.bold, color: opts.color || P.body, font: FONT })],
    })],
  });
}
function table(title, headers, rows, widths) {
  const out = [];
  out.push(new Paragraph({
    keepNext: true, spacing: { before: 160, after: 80 },
    children: [new TextRun({ text: title, bold: true, size: 21, color: P.muted, font: FONT })],
  }));
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((h) => tCell(h, { fill: P.tableHeaderBg, color: P.tableHeaderText, bold: true })),
  });
  const bodyRows = rows.map((r, i) => new TableRow({
    cantSplit: true,
    children: r.map((cell, j) => tCell(String(cell), { fill: i % 2 ? P.tableSurface : "FFFFFF" })),
  }));
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  }));
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

module.exports = {
  Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType, HeadingLevel, PageNumber,
  BorderStyle, SectionType, NumberFormat, TableOfContents, PageBreak,
  P, FONT, HFONT, buildCoverR1, h1, h2, body, bodyRuns, bullet, codeLine, table, fs,
};
