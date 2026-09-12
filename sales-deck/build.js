// PM CONTROL TOWER — corporate sales deck builder (pptxgenjs)
const pptxgen = require("pptxgenjs");

const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
p.author = "dynamiq Solutions";
p.title = "PM Control Tower — Corporate Sales Presentation";

const W = 13.33, H = 7.5, M = 0.5;
const F = "Segoe UI";

// Palette — control-tower navy dominant, brand blue primary, amber accent
const DARK = "0A1C33";      // deep navy (cover/divider/closing bg)
const DARK2 = "13294A";     // panel on dark
const BG = "FFFFFF";        // content bg
const TINT = "F2F6FB";      // light band / card tint
const BLUE = "1D4ED8";      // primary
const BLUE_SOFT = "E7EEFC"; // blue tint
const NAVY_TXT = "0E2240";  // headings on light
const TXT = "1E2A3B";       // body
const MUT = "5D6E85";       // muted on light
const MUT_D = "9FB3CE";     // muted on dark
const AMBER = "F59E0B";     // accent
const GREEN = "0E9F6E";     // healthy
const RED = "DC2626";       // risk
const RING = "1B3757";      // radar ring on dark
const LINE = "DCE4EE";      // hairline on light

const shadow = () => ({ type: "outer", color: "0A1C33", blur: 7, offset: 2, angle: 90, opacity: 0.16 });
const bu = () => ({ code: "2022", indent: 12 });

function kicker(s, text, opts = {}) {
  s.addText(text.toUpperCase(), { x: opts.x ?? M, y: opts.y ?? 0.44, w: opts.w ?? 9, h: 0.3, fontFace: F, fontSize: 12, bold: true, charSpacing: 3, color: opts.color ?? BLUE, margin: 0 });
}
function slideTitle(s, text, opts = {}) {
  s.addText(text, { x: opts.x ?? M, y: opts.y ?? 0.74, w: opts.w ?? 12.33, h: opts.h ?? 0.62, fontFace: F, fontSize: 30, bold: true, color: opts.color ?? NAVY_TXT, margin: 0 });
}
function pageNo(s, n) {
  s.addText(String(n).padStart(2, "0"), { x: W - 0.85, y: H - 0.42, w: 0.45, h: 0.28, fontFace: F, fontSize: 12, color: MUT, align: "right", margin: 0 });
}
function sourceLine(s, text, y = H - 0.44) {
  s.addText(text, { x: M, y, w: 10.5, h: 0.28, fontFace: F, fontSize: 12, color: MUT, margin: 0 });
}
function card(s, x, y, w, h, fill = BG, r = 0.09) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, rectRadius: r, shadow: shadow(), line: { color: "E6EBF2", width: 0.75 } });
}
function chipBox(s, x, y, w, h, fill, text, color, fs = 12, boldTxt = true) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, rectRadius: Math.min(0.09, h / 2), line: { type: "none" } });
  s.addText(text, { x, y: y - 0.015, w, h, fontFace: F, fontSize: fs, bold: boldTxt, color, align: "center", valign: "middle", margin: 0 });
}
function radar(s, cx, cy, radii) {
  radii.forEach((r) => s.addShape(p.shapes.OVAL, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { type: "none" }, line: { color: RING, width: 1 } }));
}
function dot(s, x, y, d, c) { s.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color: c }, line: { type: "none" } }); }
function arrowRight(s, x, y, size = 0.26, color = "B7C4D6") {
  s.addShape(p.shapes.CHEVRON, { x, y, w: size, h: size * 0.86, fill: { color }, line: { type: "none" } });
}

/* ============================================================ S1 · COVER */
let s = p.addSlide();
s.background = { color: DARK };
radar(s, 10.6, 3.75, [0.75, 1.5, 2.3, 3.1, 3.9]);
dot(s, 11.85, 2.0, 0.16, GREEN); dot(s, 9.6, 4.9, 0.16, AMBER); dot(s, 12.3, 4.35, 0.16, BLUE);
dot(s, 10.1, 2.5, 0.12, "3E5E86"); dot(s, 11.3, 3.1, 0.12, "3E5E86"); dot(s, 9.2, 3.4, 0.12, "3E5E86");
s.addText("PM CONTROL TOWER", { x: 11.95, y: 5.9, w: 1.3, h: 0.2, fontFace: F, fontSize: 7, color: "27405F", align: "center", margin: 0 });
s.addText("ENTERPRISE PROJECT · PROGRAM · PORTFOLIO MANAGEMENT", { x: M, y: 1.35, w: 9.5, h: 0.32, fontFace: F, fontSize: 13, bold: true, charSpacing: 3, color: AMBER, margin: 0 });
s.addText("PM CONTROL\nTOWER", { x: M, y: 1.78, w: 9.6, h: 2.15, fontFace: F, fontSize: 66, bold: true, color: "FFFFFF", margin: 0, lineSpacingMultiple: 0.98 });
s.addText([
  { text: "One platform. Complete project intelligence. ", options: { color: "D7E2F2" } },
  { text: "Greater outcomes.", options: { color: AMBER } },
], { x: M, y: 4.15, w: 9.4, h: 0.55, fontFace: F, fontSize: 24, bold: true, margin: 0 });
s.addText("Portfolio → Program → Project → Delivery — one source of truth for scope, schedule, cost, risk, EVM and governance. Self-hosted, realtime, audit-ready.", { x: M, y: 4.85, w: 8.2, h: 0.75, fontFace: F, fontSize: 14, color: MUT_D, margin: 0 });
s.addShape(p.shapes.LINE, { x: M, y: 6.35, w: 3.2, h: 0, line: { color: "27405F", width: 1 } });
s.addText("dynamiq Solutions  ·  Corporate Sales Presentation  ·  2026", { x: M, y: 6.5, w: 8, h: 0.3, fontFace: F, fontSize: 12, color: MUT_D, margin: 0 });

/* ============================================================ S2 · WHAT IT DOES */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "What the application does");
slideTitle(s, "A control tower for the entire delivery enterprise");
s.addText([
  { text: "Leadership never has to ask a project manager for status. ", options: { bold: true, color: NAVY_TXT } },
  { text: "PM Control Tower continuously aggregates live operational data into decision-ready views, exception-first feeds and one-click executive reporting.", options: { color: TXT } },
], { x: M, y: 1.5, w: 12.33, h: 0.75, fontFace: F, fontSize: 16, margin: 0 });

const chain = ["PORTFOLIO", "PROGRAM", "PROJECT", "WBS · TASKS", "SCHEDULE · CPM", "EVM", "GOVERNANCE", "LEADERSHIP"];
const cw = 1.42, gap = 0.129, cy = 2.85, ch = 0.92;
chain.forEach((c, i) => {
  const x = M + i * (cw + gap);
  const isLast = i === chain.length - 1;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: cy, w: cw, h: ch, rectRadius: 0.08, fill: { color: isLast ? NAVY_TXT : (i % 2 ? DARK2 : BLUE) }, line: { type: "none" }, shadow: shadow() });
  s.addText(c, { x, y: cy, w: cw, h: ch, fontFace: F, fontSize: 11.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0.02 });
  if (!isLast) arrowRight(s, x + cw + 0.015, cy + ch / 2 - 0.11, 0.13, AMBER);
});
s.addText("Every layer writes to one governed data model — roll-ups, health and forecasts are computed, never re-typed.", { x: M, y: 4.0, w: 11.5, h: 0.35, fontFace: F, fontSize: 13, italic: true, color: MUT, margin: 0 });

const stats = [["57", "data models"], ["104", "API routes"], ["8", "computation engines"], ["62", "view modules"], ["2", "realtime services"]];
stats.forEach((st, i) => {
  const x = M + i * 2.51;
  card(s, x, 4.65, 2.3, 1.75, i === 2 ? BLUE_SOFT : TINT, 0.08);
  s.addText(st[0], { x, y: 4.9, w: 2.3, h: 0.75, fontFace: F, fontSize: 40, bold: true, color: i === 2 ? BLUE : NAVY_TXT, align: "center", margin: 0 });
  s.addText(st[1], { x, y: 5.72, w: 2.3, h: 0.35, fontFace: F, fontSize: 12.5, color: MUT, align: "center", margin: 0 });
});
sourceLine(s, "Platform footprint: PM Control Tower v1.0.0 product specification.");
pageNo(s, 2);

/* ============================================================ S3 · THE PROBLEM */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "The business problem");
slideTitle(s, "Delivery is flying blind — and it shows up in the P&L");
const probs = [
  ["9.9%", "of every dollar invested is wasted through poor project performance", RED],
  ["28\u00D7", "less money wasted by organizations with mature delivery practices", BLUE],
  ["34%", "of projects mostly or always meet their original goals and business intent", AMBER],
];
probs.forEach((pr, i) => {
  const x = M + i * 4.18;
  card(s, x, 1.7, 3.95, 2.5, TINT, 0.1);
  s.addText(pr[0], { x, y: 1.95, w: 3.95, h: 1.1, fontFace: F, fontSize: 60, bold: true, color: pr[2], align: "center", margin: 0 });
  s.addText(pr[1], { x: x + 0.3, y: 3.1, w: 3.35, h: 0.95, fontFace: F, fontSize: 13.5, color: TXT, align: "center", margin: 0 });
});
card(s, M, 4.55, 12.33, 1.9, BG, 0.1);
s.addText("What this looks like inside the enterprise", { x: M + 0.35, y: 4.75, w: 8, h: 0.3, fontFace: F, fontSize: 14, bold: true, color: NAVY_TXT, margin: 0 });
s.addText([
  { text: "Status decks assembled by hand every week — out of date the moment they are sent.", options: { bullet: bu(), breakLine: true } },
  { text: "Portfolio, finance and delivery each hold a different version of the truth in spreadsheets.", options: { bullet: bu(), breakLine: true } },
  { text: "Risks and cost overruns surface at steering committees — after the decision window has closed.", options: { bullet: bu() } },
], { x: M + 0.35, y: 5.1, w: 11.6, h: 1.25, fontFace: F, fontSize: 13.5, color: TXT, paraSpaceAfter: 6, margin: 0 });
sourceLine(s, "Sources: PMI, Pulse of the Profession (2018); Wellingtone, State of Project Management.");
pageNo(s, 3);

/* ============================================================ S4 · WHAT IT SOLVES */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Business problems it solves");
slideTitle(s, "From status-chasing to self-reporting delivery");
const pairs = [
  ["Manual status decks", "Views computed live from operational data — never re-typed"],
  ["Scattered spreadsheets", "One governed data model: 57 models, one source of truth"],
  ["Risks surface too late", "Governance rules watch thresholds and push alerts to inboxes"],
  ["Cost & schedule blind spots", "CPM + EVM engines quantify float, CPI, SPI and forecast"],
  ["Decisions without traceability", "Full audit trail on every change, approval and gate decision"],
];
pairs.forEach((pr, i) => {
  const y = 1.62 + i * 1.06;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y, w: 4.55, h: 0.88, rectRadius: 0.08, fill: { color: "FDEEEE" }, line: { type: "none" } });
  s.addText(pr[0], { x: M + 0.25, y, w: 4.1, h: 0.88, fontFace: F, fontSize: 14.5, bold: true, color: RED, valign: "middle", margin: 0 });
  arrowRight(s, 5.25, y + 0.31, 0.26, AMBER);
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 5.75, y, w: 7.08, h: 0.88, rectRadius: 0.08, fill: { color: BLUE_SOFT }, line: { type: "none" } });
  s.addText(pr[1], { x: 6.0, y, w: 6.7, h: 0.88, fontFace: F, fontSize: 14.5, color: NAVY_TXT, valign: "middle", margin: 0 });
});
pageNo(s, 4);

/* ============================================================ S5 · KEY FEATURES */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Key features");
slideTitle(s, "Eight engines of control, one platform");
const feats = [
  ["CPM Schedule Engine", "ES/EF/LS/LF, float and critical path recomputed on every change", BLUE],
  ["EVM Engine", "CPI, SPI, EAC, ETC, VAC, TCPI with period-over-period history", BLUE],
  ["Health & Governance", "RAG snapshots; threshold rules raise alerts straight to inboxes", GREEN],
  ["Resources & Capacity", "Register, rates, utilization and over-allocation flags", BLUE],
  ["Timesheet Cascade", "Submit → approve → lock flows straight into actuals and cost", BLUE],
  ["Work Inbox & Planner", "Personal action stream plus weekly focus-time planning", GREEN],
  ["RAID · Change · Gates", "Risks, issues, assumptions, change requests, stage-gate decisions", AMBER],
  ["Leadership Pack", "One-click, versioned, comparable executive reporting", AMBER],
];
feats.forEach((f, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * 6.32, y = 1.66 + row * 1.32;
  card(s, x, y, 6.0, 1.14, BG, 0.09);
  chipBox(s, x + 0.22, y + 0.3, 0.54, 0.54, f[2], "", "FFFFFF", 12);
  dot(s, x + 0.42, y + 0.5, 0.14, "FFFFFF");
  s.addText(f[0], { x: x + 0.95, y: y + 0.14, w: 4.9, h: 0.32, fontFace: F, fontSize: 15, bold: true, color: NAVY_TXT, margin: 0 });
  s.addText(f[1], { x: x + 0.95, y: y + 0.5, w: 4.9, h: 0.52, fontFace: F, fontSize: 12.5, color: MUT, margin: 0 });
});
pageNo(s, 5);

/* ============================================================ S6 · MODULES */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Dashboard & modules");
slideTitle(s, "One platform, seven governed domains");
const domains = [
  ["PORTFOLIO", "Portfolios · Programs · Projects · RAG health · Budgets", BLUE],
  ["PLAN", "Requirements · WBS · Tasks · Schedule · Milestones · Baselines", BLUE],
  ["EXECUTE", "Resources · Timesheets · Work Inbox · Focus Planner", GREEN],
  ["CONTROL", "Financials · EVM · RAID · Change · Gates · Governance", AMBER],
  ["INTELLIGENCE", "Executive Tower · Leadership Pack · Analytics · AI Assistant", BLUE],
  ["CONNECT", "Integrations · Webhooks · Automations · AI Gateway", GREEN],
  ["ADMIN", "Users · Roles · Templates · Audit Trail · Configuration", AMBER],
];
domains.forEach((d, i) => {
  const col = i % 4, row = Math.floor(i / 4);
  const x = M + col * 3.19, y = 1.66 + row * 2.42, w = 2.99, h = 2.2;
  card(s, x, y, w, h, row === 1 && col === 3 ? TINT : BG, 0.1);
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: x + 0.24, y: y + 0.24, w: 0.5, h: 0.5, rectRadius: 0.08, fill: { color: d[2] }, line: { type: "none" } });
  s.addText(d[0], { x: x + 0.88, y: y + 0.3, w: w - 1.0, h: 0.4, fontFace: F, fontSize: 14, bold: true, charSpacing: 1, color: NAVY_TXT, margin: 0 });
  s.addText(d[1], { x: x + 0.24, y: y + 0.95, w: w - 0.48, h: 1.1, fontFace: F, fontSize: 12.5, color: MUT, margin: 0 });
});
s.addText([
  { text: "62 view modules", options: { bold: true, color: BLUE } },
  { text: " — every screen reads from the same engines, so a number changed once is changed everywhere.", options: { color: MUT } },
], { x: M, y: 6.6, w: 12.33, h: 0.35, fontFace: F, fontSize: 13, margin: 0 });
pageNo(s, 6);

/* ============================================================ S7 · HOW EACH FEATURE IS USED */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "How each feature is used");
slideTitle(s, "Built around how each role actually works");
const roles = [
  ["EXECUTIVE", BLUE, "Opens the Executive Control Tower — exceptions first, RAG with honest GREY, 30/60/90 outlook — decides stage gates, exports the Leadership Pack."],
  ["PMO ADMIN", AMBER, "Provisions users across 8 roles / 32 permissions, applies PMO templates to new projects, tunes governance thresholds, monitors the audit trail."],
  ["PROJECT MANAGER", GREEN, "Builds WBS and CPM schedule, baselines, tracks CPI/SPI and RAID, routes change requests — status writes itself as the team works."],
  ["TEAM MEMBER", BLUE, "Plans the week in Focus Planner, works the personal inbox, files weekly timesheets that flow into real cost and EVM — no separate reporting."],
];
roles.forEach((r, i) => {
  const y = 1.66 + i * 1.32;
  card(s, M, y, 12.33, 1.14, i % 2 ? TINT : BG, 0.09);
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M + 0.22, y: y + 0.28, w: 2.5, h: 0.58, rectRadius: 0.29, fill: { color: r[1] }, line: { type: "none" } });
  s.addText(r[0], { x: M + 0.22, y: y + 0.265, w: 2.5, h: 0.58, fontFace: F, fontSize: 12.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText(r[2], { x: M + 3.0, y: y + 0.12, w: 9.1, h: 0.92, fontFace: F, fontSize: 13.5, color: TXT, valign: "middle", margin: 0 });
});
pageNo(s, 7);

/* ============================================================ S8 · WORKFLOW & AUTOMATION */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Workflow & automation");
slideTitle(s, "One cascade: from timesheet to boardroom");
const flow = [
  ["1", "Timesheet\nsubmitted", BLUE],
  ["2", "Approved\n& locked", BLUE],
  ["3", "Actuals & cost\nroll-up", BLUE],
  ["4", "EVM period\nCPI / SPI", GREEN],
  ["5", "Health\nsnapshot", GREEN],
  ["6", "Governance\nevaluation", AMBER],
];
flow.forEach((f, i) => {
  const x = M + i * 2.13, y = 1.72, w = 1.86, h = 1.5;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: f[2] }, line: { type: "none" }, shadow: shadow() });
  s.addText(f[0], { x: x + 0.12, y: y + 0.1, w: 0.5, h: 0.4, fontFace: F, fontSize: 20, bold: true, color: "FFFFFF", margin: 0 });
  s.addText(f[1], { x: x + 0.12, y: y + 0.55, w: w - 0.24, h: 0.85, fontFace: F, fontSize: 13, bold: true, color: "FFFFFF", margin: 0, lineSpacingMultiple: 1.02 });
  if (i < 5) arrowRight(s, x + w + 0.045, y + 0.62, 0.17, "9AA9BD");
});
s.addText([
  { text: "Step 6 fans out automatically:  ", options: { bold: true, color: NAVY_TXT } },
  { text: "alerts land in role inboxes, automations fire, leadership views refresh in realtime — zero human assembly.", options: { color: TXT } },
], { x: M, y: 3.5, w: 12.33, h: 0.4, fontFace: F, fontSize: 14, margin: 0 });
card(s, M, 4.1, 12.33, 2.35, TINT, 0.1);
s.addText("Automation rules react to triggers", { x: M + 0.35, y: 4.32, w: 8, h: 0.32, fontFace: F, fontSize: 14, bold: true, color: NAVY_TXT, margin: 0 });
const autos = [
  ["TASK_OVERDUE", "PM alerted, task flagged on the register"],
  ["CRITICAL_RISK", "Executive escalation raised in inbox"],
  ["BUDGET_BREACH", "Finance controller notified"],
  ["HEALTH_DROP", "Steering review queued, snapshot kept"],
];
autos.forEach((a, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + 0.35 + col * 5.95, y = 4.78 + row * 0.82;
  chipBox(s, x, y, 1.95, 0.52, NAVY_TXT, a[0], "FFFFFF", 11.5);
  s.addText(a[1], { x: x + 2.1, y, w: 3.75, h: 0.52, fontFace: F, fontSize: 12.5, color: TXT, valign: "middle", margin: 0 });
});
sourceLine(s, "A Socket.IO realtime gateway pushes every engine result to connected screens instantly.");
pageNo(s, 8);

/* ============================================================ S9 · BENEFITS */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Benefits");
slideTitle(s, "Benefits that compound at every level");
const bens = [
  ["MANAGEMENT", BLUE, ["One source of truth across portfolios", "Capacity & over-allocation visible daily", "Governance exceptions in one queue", "Fewer, shorter status meetings"]],
  ["TEAMS", GREEN, ["Focus time planned, protected and linked to tasks", "One inbox for everything that needs action", "Timesheets feed real EVM — they count", "Less reporting admin, more delivery"]],
  ["LEADERSHIP", AMBER, ["Decision-ready views, exceptions first", "One-click, versioned board pack", "Traceable insight behind every number", "Honest GREY status — never fake green"]],
];
bens.forEach((b, i) => {
  const x = M + i * 4.18;
  card(s, x, 1.66, 3.95, 4.5, i === 2 ? BLUE_SOFT : TINT, 0.1);
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: x + 0.3, y: 1.94, w: 2.2, h: 0.52, rectRadius: 0.26, fill: { color: b[1] }, line: { type: "none" } });
  s.addText(b[0], { x: x + 0.3, y: 1.925, w: 2.2, h: 0.52, fontFace: F, fontSize: 12, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText(b[2].map((t, j) => ({ text: t, options: { bullet: bu(), breakLine: j < b[2].length - 1 } })), { x: x + 0.32, y: 2.72, w: 3.35, h: 3.2, fontFace: F, fontSize: 13, color: TXT, paraSpaceAfter: 10, margin: 0 });
});
s.addText([
  { text: "GREY honesty: ", options: { bold: true, color: NAVY_TXT } },
  { text: "when data is missing, the tower shows GREY — not a comforting green. Executives trust what they see.", options: { color: MUT } },
], { x: M, y: 6.45, w: 12.33, h: 0.4, fontFace: F, fontSize: 13, margin: 0 });
pageNo(s, 9);

/* ============================================================ S10 · REPORTS & ANALYTICS */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Reports & analytics");
slideTitle(s, "Analytics that answer, not decorate");
card(s, M, 1.62, 6.7, 4.7, BG, 0.1);
s.addText("Earned value by project — CPI / SPI at latest period close", { x: M + 0.3, y: 1.82, w: 6.1, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: NAVY_TXT, margin: 0 });
s.addChart(p.charts.BAR, [
  { name: "CPI (cost)", labels: ["ERP-001", "DATA-002", "PORT-003", "MOB-004"], values: [1.02, 0.78, 0.71, 0.95] },
  { name: "SPI (schedule)", labels: ["ERP-001", "DATA-002", "PORT-003", "MOB-004"], values: [0.88, 0.81, 0.49, 1.06] },
], {
  x: M + 0.25, y: 2.25, w: 6.2, h: 3.6, barDir: "col", barGapWidthPct: 60,
  chartColors: [BLUE, AMBER], chartArea: { fill: { color: "FFFFFF" } },
  catAxisLabelColor: MUT, valAxisLabelColor: MUT, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
  valAxisMaxVal: 1.2, valAxisMajorUnit: 0.2, valGridLine: { color: "E6EBF2", size: 0.5 }, catGridLine: { style: "none" },
  showValue: true, dataLabelPosition: "outEnd", dataLabelColor: NAVY_TXT, dataLabelFontSize: 10, dataLabelFormatCode: "0.00",
  showLegend: true, legendPos: "b", legendColor: MUT, legendFontSize: 11, valAxisLabelFormatCode: "0.0",
});
const reps = [
  ["Executive Control Tower", "Exception-first feed, RAG + GREY, traceable insights, 30/60/90 outlook"],
  ["Leadership Pack", "One-click, versioned, comparable — board-ready in minutes"],
  ["17 sub-reports", "Schedule, cost, resources, RAID, governance, change and more"],
  ["What-Changed & Analytics", "Diff any period; explore trends across the portfolio"],
  ["AI PM Assistant", "Ask in natural language — governed access to all delivery data"],
];
reps.forEach((r, i) => {
  const y = 1.62 + i * 0.96;
  card(s, 7.5, y, 5.33, 0.8, i === 1 ? BLUE_SOFT : TINT, 0.08);
  s.addText(r[0], { x: 7.75, y: y + 0.09, w: 4.9, h: 0.3, fontFace: F, fontSize: 13.5, bold: true, color: NAVY_TXT, margin: 0 });
  s.addText(r[1], { x: 7.75, y: y + 0.4, w: 4.9, h: 0.34, fontFace: F, fontSize: 11.5, color: MUT, margin: 0 });
});
sourceLine(s, "Chart: reference deployment sample data (illustrative).");
pageNo(s, 10);

/* ============================================================ S11 · ROI */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "ROI & productivity impact");
slideTitle(s, "The productivity math favors the tower");
const rois = [
  ["6–10 h", "per project manager, per week — recovered from assembling status (est.)", BLUE],
  ["≤ 1 day", "from operational event to executive visibility via the realtime cascade", GREEN],
  ["9.9%", "of project investment is the waste pool mature practices recover", AMBER],
];
rois.forEach((r, i) => {
  const x = M + i * 4.18;
  card(s, x, 1.66, 3.95, 2.2, TINT, 0.1);
  s.addText(r[0], { x, y: 1.88, w: 3.95, h: 0.95, fontFace: F, fontSize: 48, bold: true, color: r[2], align: "center", margin: 0 });
  s.addText(r[1], { x: x + 0.3, y: 2.88, w: 3.35, h: 0.85, fontFace: F, fontSize: 12.5, color: TXT, align: "center", margin: 0 });
});
card(s, M, 4.2, 6.7, 2.35, BG, 0.1);
s.addText("PM hours per week on reporting (per PM)", { x: M + 0.3, y: 4.4, w: 6, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: NAVY_TXT, margin: 0 });
s.addChart(p.charts.BAR, [{ name: "Hours", labels: ["Spreadsheets & decks", "With PM Control Tower"], values: [9, 2] }], {
  x: M + 0.25, y: 4.8, w: 6.2, h: 1.6, barDir: "bar", barGapWidthPct: 45,
  chartColors: [RED, GREEN], varyColors: true, chartArea: { fill: { color: "FFFFFF" } },
  catAxisLabelColor: TXT, valAxisLabelColor: MUT, catAxisLabelFontSize: 11.5, valAxisLabelFontSize: 10,
  valGridLine: { style: "none" }, catGridLine: { style: "none" }, valAxisHidden: true,
  showValue: true, dataLabelPosition: "outEnd", dataLabelColor: NAVY_TXT, dataLabelFontSize: 12, showLegend: false,
});
card(s, 7.5, 4.2, 5.33, 2.35, BLUE_SOFT, 0.1);
s.addText("Where the payback comes from", { x: 7.8, y: 4.4, w: 4.8, h: 0.3, fontFace: F, fontSize: 13.5, bold: true, color: NAVY_TXT, margin: 0 });
s.addText([
  { text: "Status reporting effort collapses into the work itself", options: { bullet: bu(), breakLine: true } },
  { text: "Earlier intervention on lagging projects protects margin", options: { bullet: bu(), breakLine: true } },
  { text: "One platform replaces spreadsheet sprawl and tool patchworks", options: { bullet: bu() } },
], { x: 7.8, y: 4.8, w: 4.75, h: 1.6, fontFace: F, fontSize: 12.5, color: TXT, paraSpaceAfter: 8, margin: 0 });
sourceLine(s, "Hour figures are illustrative estimates; the 9.9% waste figure is sourced (PMI, 2018).");
pageNo(s, 11);

/* ============================================================ S12 · USE CASES */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Use cases");
slideTitle(s, "Where it earns its keep on day one");
const cases = [
  ["ERP & technology rollouts", "Critical-path control across vendors; cutover gates with evidence; UAT defect and RAID pressure visible in one view.", BLUE],
  ["Cloud & infrastructure migration", "Wave planning with dependencies, burn tracked by EVM, spend governance on experimental workloads.", GREEN],
  ["Regulated & compliance programs", "Stage gates with documented decisions, change control discipline, audit trail that satisfies the second line of defense.", AMBER],
  ["PMO stand-up & transformation", "Deploy RAG standards, templates and portfolio governance in weeks — with the reference dataset as a working model.", BLUE],
];
cases.forEach((c, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * 6.32, y = 1.7 + row * 2.42;
  card(s, x, y, 6.0, 2.22, BG, 0.1);
  chipBox(s, x + 0.25, y + 0.28, 0.56, 0.56, c[2], String(i + 1), "FFFFFF", 18);
  s.addText(c[0], { x: x + 1.0, y: y + 0.3, w: 4.8, h: 0.55, fontFace: F, fontSize: 15.5, bold: true, color: NAVY_TXT, valign: "middle", margin: 0 });
  s.addText(c[1], { x: x + 0.25, y: y + 1.05, w: 5.5, h: 1.05, fontFace: F, fontSize: 12.5, color: MUT, margin: 0 });
});
pageNo(s, 12);

/* ============================================================ S13 · WHY ADOPT (dark) */
s = p.addSlide(); s.background = { color: DARK };
radar(s, 12.1, 0.9, [0.6, 1.2, 1.8, 2.4]);
kicker(s, "Why corporations should adopt it", { color: AMBER });
s.addText("Decisions are only as good\nas the data beneath them.", { x: M, y: 1.15, w: 11.5, h: 1.9, fontFace: F, fontSize: 40, bold: true, color: "FFFFFF", margin: 0, lineSpacingMultiple: 1.02 });
const whys = [
  ["Self-hosted control", "Runs in your data center or your cloud — delivery data never leaves your perimeter."],
  ["Real-time truth", "Engines compute health, EVM and forecasts continuously — the tower is always current."],
  ["Governed delivery", "Thresholds, gates, change control and audit are enforced by the system, not by memory."],
  ["Fast time-to-value", "Reference dataset, templates and one-click packs make the first steering meeting productive."],
];
whys.forEach((wv, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * 6.32, y = 3.5 + row * 1.62;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: 6.0, h: 1.42, rectRadius: 0.09, fill: { color: DARK2 }, line: { color: "1E3A5F", width: 0.75 } });
  s.addText(wv[0], { x: x + 0.3, y: y + 0.16, w: 5.4, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: AMBER, margin: 0 });
  s.addText(wv[1], { x: x + 0.3, y: y + 0.54, w: 5.4, h: 0.75, fontFace: F, fontSize: 12.5, color: "C9D6E8", margin: 0 });
});
pageNo(s, 13);

/* ============================================================ S14 · IMPLEMENTATION */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Implementation & onboarding");
slideTitle(s, "Live in four weeks — not four months");
const impl = [
  ["Deploy", "DAY 1", "Docker Compose or bare metal; schema and reference enterprise dataset created on first boot.", BLUE],
  ["Configure", "WEEK 1", "8 system roles / 32 permissions, PMO template library, governance thresholds and inboxes.", BLUE],
  ["Migrate", "WEEK 2", "Governed CSV import with dry-run validation across 13 master-data entities; CSV/JSON export for 22.", GREEN],
  ["Adopt", "WEEKS 3–4", "Teams onboard in the work inbox and planner; realtime gateway live; first Leadership Pack shipped.", AMBER],
];
impl.forEach((im, i) => {
  const x = M + i * 3.19, y = 1.9, w = 2.99, h = 3.1;
  card(s, x, y, w, h, BG, 0.1);
  s.addShape(p.shapes.OVAL, { x: x + 0.24, y: y + 0.24, w: 0.66, h: 0.66, fill: { color: im[3] }, line: { type: "none" } });
  s.addText(String(i + 1), { x: x + 0.24, y: y + 0.22, w: 0.66, h: 0.66, fontFace: F, fontSize: 22, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText(im[0], { x: x + 1.05, y: y + 0.3, w: w - 1.2, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: NAVY_TXT, margin: 0 });
  chipBox(s, x + 0.24, y + 1.12, 1.35, 0.42, TINT, im[1], BLUE, 11.5);
  s.addText(im[2], { x: x + 0.24, y: y + 1.72, w: w - 0.48, h: 1.25, fontFace: F, fontSize: 12.5, color: MUT, margin: 0 });
  if (i < 3) arrowRight(s, x + w + 0.02, y + 1.4, 0.16, AMBER);
});
card(s, M, 5.35, 12.33, 1.1, BLUE_SOFT, 0.09);
s.addText([
  { text: "Included from day one:  ", options: { bold: true, color: NAVY_TXT } },
  { text: "reference enterprise dataset  ·  10-product documentation set  ·  operations runbook  ·  audit-ready event history  ·  executive demo data", options: { color: TXT } },
], { x: M + 0.35, y: 5.35, w: 11.7, h: 1.1, fontFace: F, fontSize: 13.5, valign: "middle", margin: 0 });
pageNo(s, 14);

/* ============================================================ S15 · SECURITY & SCALE */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Security & scalability");
slideTitle(s, "Enterprise-grade by design, not by add-on");
const secs = [
  ["Identity & access", "JWT sessions with 8 system roles and 32 granular permissions; super-admin isolation.", BLUE],
  ["Full traceability", "Audit event recorded on every create, update, approval and gate decision — exportable.", BLUE],
  ["Your perimeter", "Self-hosted on-premises, private cloud or Docker — delivery data never leaves your control.", GREEN],
  ["Built to scale", "PostgreSQL in production, stateless app tier, Socket.IO gateway, containerized rollout.", GREEN],
  ["Data discipline", "Governed imports validate before commit; history-preserving guards block destructive deletes.", AMBER],
  ["Operable", "Env-based secrets, deployment guide, operations runbook and health endpoints included.", AMBER],
];
secs.forEach((sec, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = M + col * 6.32, y = 1.7 + row * 1.62;
  card(s, x, y, 6.0, 1.42, row % 2 ? TINT : BG, 0.09);
  dot(s, x + 0.28, y + 0.3, 0.2, sec[2]);
  s.addText(sec[0], { x: x + 0.62, y: y + 0.16, w: 5.2, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: NAVY_TXT, margin: 0 });
  s.addText(sec[1], { x: x + 0.62, y: y + 0.54, w: 5.15, h: 0.8, fontFace: F, fontSize: 12.5, color: MUT, margin: 0 });
});
sourceLine(s, "Platform detail: PM Control Tower security & architecture documentation (v1.0.0).");
pageNo(s, 15);

/* ============================================================ S16 · DIFFERENTIATION */
s = p.addSlide(); s.background = { color: BG };
kicker(s, "Competitive differentiation");
slideTitle(s, "Why not spreadsheets — or the legacy suite?");
const th = (t) => ({ text: t, options: { fill: { color: NAVY_TXT }, color: "FFFFFF", bold: true, fontFace: F, fontSize: 13, align: "center", valign: "middle" } });
const pm = (t) => ({ text: t, options: { fill: { color: BLUE_SOFT }, color: NAVY_TXT, bold: true, fontFace: F, fontSize: 12, align: "center", valign: "middle" } });
const td = (t) => ({ text: t, options: { color: TXT, fontFace: F, fontSize: 12, align: "center", valign: "middle" } });
const lb = (t) => ({ text: t, options: { color: NAVY_TXT, bold: true, fontFace: F, fontSize: 12.5, align: "left", valign: "middle" } });
s.addTable([
  [lb(""), th("PM Control Tower"), th("Spreadsheets"), th("Legacy PPM suites")],
  [lb("Time to value"), pm("Weeks"), td("Immediate, then chaos"), td("Months of configuration")],
  [lb("CPM + EVM engines"), pm("Built-in, always on"), td("Manual formulas"), td("Paid add-on modules")],
  [lb("Governance & alerts"), pm("Rules engine → inbox"), td("None"), td("Batch reports next day")],
  [lb("Audit trail"), pm("Every change recorded"), td("None"), td("Partial")],
  [lb("Leadership reporting"), pm("One-click, versioned"), td("Hand-built decks"), td("Consultant-configured")],
  [lb("Realtime updates"), pm("Live via gateway"), td("Stale on arrival"), td("Nightly synchronization")],
  [lb("Hosting"), pm("Self-hosted or your cloud"), td("n/a"), td("Vendor cloud only")],
], { x: M, y: 1.62, w: 12.33, colW: [2.7, 3.31, 3.16, 3.16], rowH: 0.52, border: { pt: 0.75, color: LINE }, fill: { color: "FFFFFF" }, margin: 0.06 });
s.addText([
  { text: "The difference that matters:  ", options: { bold: true, color: NAVY_TXT } },
  { text: "PM Control Tower computes the truth instead of collecting it.", options: { color: MUT } },
], { x: M, y: 6.6, w: 12.33, h: 0.35, fontFace: F, fontSize: 13, margin: 0 });
pageNo(s, 16);

/* ============================================================ S17 · CTA (dark) */
s = p.addSlide(); s.background = { color: DARK };
radar(s, 1.3, 6.3, [0.55, 1.15, 1.75, 2.35]);
kicker(s, "Call to action", { color: AMBER });
s.addText("Take control from one tower.", { x: M, y: 1.0, w: 12.3, h: 0.95, fontFace: F, fontSize: 44, bold: true, color: "FFFFFF", margin: 0 });
s.addText("See your own portfolio inside PM Control Tower within two weeks.", { x: M, y: 2.0, w: 11, h: 0.45, fontFace: F, fontSize: 17, color: MUT_D, margin: 0 });
const cta = [
  ["1", "Scoping workshop", "Half a day with your PMO — map portfolios, programs and governance thresholds.", BLUE],
  ["2", "Guided pilot", "Two weeks on one real program: WBS to EVM to governance, with your data.", GREEN],
  ["3", "Executive readout", "Your first Leadership Pack presented to the steering committee — the decision writes itself.", AMBER],
];
cta.forEach((c, i) => {
  const x = M + i * 4.18, y = 2.85, w = 3.95, h = 2.5;
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: DARK2 }, line: { color: "1E3A5F", width: 0.75 } });
  s.addShape(p.shapes.OVAL, { x: x + 0.28, y: y + 0.26, w: 0.62, h: 0.62, fill: { color: c[3] }, line: { type: "none" } });
  s.addText(c[0], { x: x + 0.28, y: y + 0.24, w: 0.62, h: 0.62, fontFace: F, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
  s.addText(c[1], { x: x + 1.05, y: y + 0.36, w: w - 1.25, h: 0.45, fontFace: F, fontSize: 16, bold: true, color: "FFFFFF", margin: 0 });
  s.addText(c[2], { x: x + 0.28, y: y + 1.12, w: w - 0.56, h: 1.25, fontFace: F, fontSize: 12.5, color: "C9D6E8", margin: 0 });
});
s.addShape(p.shapes.LINE, { x: M, y: 5.85, w: 12.33, h: 0, line: { color: "27405F", width: 1 } });
s.addText([
  { text: "dynamiq Solutions — PM Control Tower team", options: { bold: true, color: "FFFFFF", breakLine: true } },
  { text: "sales@dynamiq.solutions   ·   dynamiq.solutions/pmct", options: { color: MUT_D } },
], { x: M, y: 6.1, w: 9, h: 0.85, fontFace: F, fontSize: 13.5, margin: 0, paraSpaceAfter: 4 });
s.addText("PLAN · EXECUTE · MONITOR · GOVERN · DELIVER", { x: 7.8, y: 6.55, w: 5.03, h: 0.3, fontFace: F, fontSize: 12, bold: true, charSpacing: 2, color: AMBER, align: "right", margin: 0 });

p.writeFile({ fileName: "PM-Control-Tower-Sales-Deck.pptx" }).then(() => console.log("WROTE DECK"));
