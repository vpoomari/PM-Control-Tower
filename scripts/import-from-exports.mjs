// PM CONTROL TOWER — Import exported pmct-*.csv files back into the app.
//
// Parses each export file (RFC 4180 — mirrors src/lib/csv.ts parseCsv), orders parents
// before children where the engine needs it, validates preconditions against the live DB,
// then POSTs { rows, mode } to /api/import/[entity] (the app's own governed import engine,
// same code path the UI "Import / Export" dialog uses). Baselines are import-locked by
// that engine (snapshot entity), so those rows are inserted directly via Prisma; the CPM
// schedule fields (total/free float, earliest/latest) that the engine doesn't accept are
// patched directly afterwards from the export values instead of recomputing (a recalc
// would need the dependency rows, which are not part of this export set).
//
// Usage (run from the project root):
//   node scripts/import-from-exports.mjs list               — inventory + preflight checks
//   node scripts/import-from-exports.mjs validate           — dry-run through the API
//   node scripts/import-from-exports.mjs apply              — apply imports + baseline + CPM patch
// Env: PMCT_DIR (CSV dir), PMCT_BASE (app base URL), PMCT_EMAIL/PMCT_PASSWORD (login).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// ---- Config ----
const DIR = process.env.PMCT_DIR || "C:\\Users\\vinod\\Downloads";
const BASE = process.env.PMCT_BASE || "http://localhost:3000";
const EMAIL = process.env.PMCT_EMAIL || "pmo@pmct.io";
const PASSWORD = process.env.PMCT_PASSWORD || "Pmct@2026";
const mode = process.argv[2] || "list"; // list | validate | apply
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;

const db = new PrismaClient();

// ---- CSV parsing (RFC 4180 — mirrors src/lib/csv.ts) ----
function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false; }
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}
function csvToObjects(text) {
  const table = parseCsv(text);
  if (!table.length) return { headers: [], rows: [] };
  const headers = table[0].map((h) => h.trim());
  const objs = table.slice(1).map((cells) => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = (cells[idx] ?? "").trim(); });
    return o;
  });
  return { headers, rows: objs };
}

// ---- Import plan: business-keyed entities through /api/import/[entity] ----
const PLAN = [
  { entity: "portfolios",  file: "pmct-portfolios-2026-10-21.csv",     order: 1,  want: 1 },
  { entity: "programs",    file: "pmct-programs-2026-10-21.csv",       order: 2,  want: 1 },
  { entity: "projects",    file: "pmct-projects-2026-10-21.csv",       order: 3,  want: 1 },
  { entity: "users",       file: "pmct-users-2026-10-21 (1).csv",      order: 4,  want: 18 },
  { entity: "resources",   file: "pmct-resources-2026-10-21.csv",      order: 5,  want: 10 },
  { entity: "wbs-nodes",   file: "pmct-wbs-nodes-2026-10-21 (1).csv",  order: 6,  want: 35, topo: "wbs"  },
  { entity: "tasks",       file: "pmct-tasks-2026-10-21.csv",          order: 7,  want: 364, topo: "task" },
  { entity: "milestones",  file: "pmct-milestones-2026-10-21.csv",     order: 8,  want: 10 },
  { entity: "risks",       file: "pmct-risks-2026-10-21.csv",          order: 9,  want: 19 }, // 57 physical lines: quoted cells embed newlines
  { entity: "issues",      file: "pmct-issues-2026-10-21.csv",         order: 10, want: 3 },
  { entity: "assumptions", file: "pmct-assumptions-2026-10-21.csv",    order: 11, want: 4 },
];
// Snapshot entity the import engine deliberately refuses: insert directly.
const BASELINE_FILE = "pmct-baselines-2026-10-21.csv";
// Stale exports from the pre-reset demo DB (projects since deleted): not part of plan.
const SKIPPED = [
  "pmct-programs-2026-10-20.csv (demo programs for deleted portfolio PTF-DT)",
  "pmct-tasks-2026-10-20.csv (demo tasks for deleted projects PRJ-ERP-001 etc.)",
  "pmct-wbs-nodes-2026-10-21.csv 329-B variant (WBS of deleted project PRJ-GV-01)",
  "pmct-*-import-template.csv (blank templates, no data)",
];

// ---- Parent-first topological ordering ----
function topoOrder(rows, mode) {
  if (mode !== "wbs" && mode !== "task") return rows;
  const byKey = new Map(rows.map((r) => [r.Code, r]));
  const done = new Set();
  const out = [];
  const visit = (r, stack) => {
    if (done.has(r)) return;
    if (stack.has(r)) throw new Error(`Cycle detected in ${mode} parents at ${r.Code}`);
    stack.add(r);
    const pc = r["Parent Code"];
    if (pc && byKey.has(pc)) visit(byKey.get(pc), stack);
    stack.delete(r);
    done.add(r);
    out.push(r);
  };
  for (const r of rows) visit(r, new Set());
  return out;
}

// ---- Auth ----
async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body?.data?.token) throw new Error(`Login failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.token;
}
async function importEntity(token, entity, rows, importMode) {
  const res = await fetch(`${BASE}/api/import/${entity}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ rows, mode: importMode }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${entity} import failed: ${res.status} ${JSON.stringify(body).slice(0, 400)}`);
  return body.data;
}

// ---- Helpers ----
function readFile(name) {
  const p = join(DIR, name);
  if (!existsSync(p)) throw new Error(`Missing file: ${p}`);
  return readFileSync(p, "utf8");
}
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Main ----
const token = await login();
console.log(`Logged in as ${EMAIL}; base=${BASE}; mode=${mode}`);

// Load all plan files first (needed for cross-file preflight).
const loaded = PLAN.map((p) => {
  const { headers, rows } = csvToObjects(readFile(p.file));
  return { ...p, headers, rawRows: rows };
});

// Preflight: project references, assignee emails, parent chains.
const csvUsers = loaded.find((l) => l.entity === "users");
const dbUsers = await db.user.findMany({ select: { email: true } });
const dbEmails = new Set(dbUsers.map((u) => u.email.toLowerCase()));
const csvEmails = csvUsers.rawRows.map((r) => (r.Email || "").trim().toLowerCase());
const knownEmails = new Set([...dbEmails, ...csvEmails]);
const dbProjects = await db.project.findMany({ select: { code: true } });
const dbProjectCodes = new Set(dbProjects.map((p) => p.code));

const problems = [];
for (const l of loaded) {
  const pCodes = uniq(l.rawRows.map((r) => r["Project Code"]));
  const fCodes = uniq(l.rawRows.map((r) => r["Portfolio Code"]));
  const rCodes = uniq(l.rawRows.map((r) => r["Program Code"] ?? (r["Parent Code"] ? "" : "")));
  if (pCodes.length && pCodes.some((c) => c && !dbProjectCodes.has(c))) {
    // projects import runs first — projects may not exist yet in list mode; only fatal for
    // entities whose parent project is NOT covered by the projects file (which covers none).
    void rCodes; void fCodes;
  }
  l.pre = {
    projectCodes: pCodes.filter(Boolean),
    portfolioCodes: fCodes.filter(Boolean),
    programCodes: (l.entity === "projects" ? l.rawRows.map((r) => r["Program Code"]) : []).filter(Boolean),
  };
  if (l.entity !== "projects" && l.entity !== "wbs-nodes" && l.entity !== "tasks" && !("Project Code" in (l.headers || {})) && l.want !== pCodes.filter(Boolean).length) {
    // nothing to enforce here
  }
}
for (const l of loaded) {
  for (const c of l.pre.projectCodes) {
    if (!dbProjectCodes.has(c) && l.entity !== "projects") {
      problems.push(`${l.file}: project "${c}" not in DB`);
    }
  }
}
// users: new emails? (import would create them with default password Welcome@2026)
const newEmails = csvEmails.filter((e) => e && !dbEmails.has(e));
if (newEmails.length) problems.push(`users: NEW logins will be created (default pw Welcome@2026): ${newEmails.join(", ")}`);
// tasks: parents resolvable within file
const tasks = loaded.find((l) => l.entity === "tasks");
const taskCodes = new Set(tasks.rawRows.map((r) => r.Code));
const missingParents = uniq(tasks.rawRows.filter((r) => r["Parent Code"] && !taskCodes.has(r["Parent Code"])).map((r) => `${r.Code}→${r["Parent Code"]}`));
if (missingParents.length) problems.push(`tasks: parents not in file: ${missingParents.slice(0, 20).join(", ")}`);
const taskEmails = uniq(tasks.rawRows.map((r) => r["Assignee Email"])).filter(Boolean);
const unknownAssignees = taskEmails.filter((e) => !knownEmails.has(e.toLowerCase()));
if (unknownAssignees.length) problems.push(`tasks: assignee users not in DB or users CSV: ${unknownAssignees.join(", ")}`);
// wbs: parents resolvable within file
const wbs = loaded.find((l) => l.entity === "wbs-nodes");
const wbsCodes = new Set(wbs.rawRows.map((r) => r.Code));
const missingWbsParents = uniq(wbs.rawRows.filter((r) => r["Parent Code"] && !wbsCodes.has(r["Parent Code"])).map((r) => `${r.Code}→${r["Parent Code"]}`));
if (missingWbsParents.length) problems.push(`wbs: parents not in file: ${missingWbsParents.slice(0, 20).join(", ")}`);

// ---- list mode: report only ----
if (mode === "list") {
  console.log("\n=== Files loaded");
  for (const l of loaded) {
    const ordered = l.topo ? topoOrder(l.rawRows, l.topo) : l.rawRows;
    console.log(`  ${String(l.order).padStart(2)}. ${l.entity.padEnd(11)} ${l.rawRows.length} rows (expect ${l.want})  ${l.file}${l.topo ? " [parents-first]" : ""}`);
    if (ordered.length !== l.rawRows.length) console.log(`      !! topo order count mismatch`);
  }
  console.log(`  +  baseline   ${csvToObjects(readFile(BASELINE_FILE)).rows.length} rows (direct insert)  ${BASELINE_FILE}`);
  console.log("\n=== Skipping:"); for (const s of SKIPPED) console.log(`  - ${s}`);
  console.log("\n=== Preflight");
  if (problems.length) { console.log("  PROBLEMS:"); for (const p of problems) console.log(`  ! ${p}`); }
  else console.log("  all clear");
  console.log(`\n  DB projects: ${[...dbProjectCodes].join(", ")}`);
  const counts = {
    portfolio: await db.portfolio.count(), program: await db.program.count(), project: await db.project.count(),
    task: await db.task.count(), wbs: await db.wBSNode.count(), milestone: await db.milestone.count(),
    baseline: await db.baseline.count(), resource: await db.resource.count(), risk: await db.risk.count(),
    issue: await db.issue.count(), assumption: await db.assumption.count(),
  };
  console.log(`  DB now: ${JSON.stringify(counts)}`);
  await db.$disconnect();
  process.exit(0);
}

if (problems.length) {
  console.error("Preflight problems — aborting. Fix or re-run with problems acknowledged.\n" + problems.map((p) => ` ! ${p}`).join("\n"));
  await db.$disconnect();
  process.exit(2);
}

// ---- Run imports in dependency order ----
console.log(`\n=== ${mode === "validate" ? "DRY RUN" : "APPLY"} import`);
const totals = { created: 0, updated: 0, failed: 0 };
for (const l of loaded) {
  if (only && l.entity !== only) continue;
  const rows = l.topo ? topoOrder(l.rawRows, l.topo) : l.rawRows;
  let r;
  try { r = await importEntity(token, l.entity, rows, mode); }
  catch (e) { console.error(`  ${l.entity}: ${e.message}`); totals.failed += 1; await sleep(600); continue; }
  totals.created += r.created; totals.updated += r.updated; totals.failed += r.failed;
  console.log(`  ${r.label.padEnd(16)} created=${r.created} updated=${r.updated} failed=${r.failed} / ${r.total}`);
  if (r.failed) {
    const errs = r.results.filter((x) => x.action === "error").slice(0, 8);
    for (const e of errs) console.error(`     row ${e.row} [${e.key}] ${e.message}`);
  }
  await sleep(600); // stay well under the 20/min import rate limit
}

// ---- Baseline (import-locked entity → direct insert) + CPM fields patch (apply only) ----
if (mode === "apply" && (!only || only === "baselines" || only === "cpm")) {
  const bl = csvToObjects(readFile(BASELINE_FILE));
  const project = await db.project.findUnique({ where: { code: "PRJ-CZR-FLOW" }, select: { id: true, code: true } });
  let inserted = 0;
  for (const row of bl.rows) {
    const data = {
      projectId: project.id, version: Number(row.Version) || 1, name: row.Name,
      description: row.Description || null, status: row.Status || "DRAFT",
      baselineStart: row["Baseline Start"] ? new Date(row["Baseline Start"]) : null,
      baselineFinish: row["Baseline Finish"] ? new Date(row["Baseline Finish"]) : null,
      baselineHours: Number(row["Baseline Hours"]) || 0,
      baselineCost: Number(row["Baseline Cost"]) || 0,
      activatedAt: row["Activated At"] ? new Date(row["Activated At"]) : null,
      createdBy: row["Created By"] || null,
    };
    let attempt = 0;
    for (;;) {
      try {
        await db.baseline.upsert({
          where: { id: row.ID },
          create: { id: row.ID, ...data },
          update: data,
        });
        inserted += 1; break;
      } catch (e) {
        if (attempt++ < 4 && /SQLITE_BUSY|locked/i.test(String(e))) { await sleep(400); continue; }
        throw e;
      }
    }
  }
  console.log(`  Baselines        inserted=${inserted} / ${bl.rows.length}`);

  // CPM schedule intelligence: patch pooled fields from the export (no dependency rows in
  // the export set, so live recalculation would be wrong — keep exported values).
  const tasksFile = csvToObjects(readFile(PLAN.find((p) => p.entity === "tasks").file));
  const project2 = await db.project.findUnique({ where: { code: "PRJ-CZR-FLOW" }, select: { id: true } });
  const dbTasks = await db.task.findMany({ where: { projectId: project2.id }, select: { id: true, code: true } });
  const byCode = new Map(dbTasks.map((t) => [t.code, t.id]));
  const day = (s) => (s ? new Date(s) : null);
  let patched = 0, unmatched = 0;
  for (const row of tasksFile.rows) {
    const id = byCode.get(row.Code);
    if (!id) { unmatched += 1; continue; }
    const data = {
      totalFloat: Number(row["Total Float"]) || 0,
      freeFloat: Number(row["Free Float"]) || 0,
      earliestStart: day(row["Earliest Start"]),
      earliestFinish: day(row["Earliest Finish"]),
      latestStart: day(row["Latest Start"]),
      latestFinish: day(row["Latest Finish"]),
    };
    let attempt = 0;
    for (;;) {
      try { await db.task.update({ where: { id }, data }); patched += 1; break; }
      catch (e) {
        if (attempt++ < 4 && /SQLITE_BUSY|locked/i.test(String(e))) { await sleep(400); continue; }
        throw e;
      }
    }
  }
  console.log(`  CPM fields       patched=${patched} unmatched=${unmatched}`);
}

console.log(`\n=== Totals: created=${totals.created} updated=${totals.updated} failed=${totals.failed}`);
await db.$disconnect();
process.exit(totals.failed ? 1 : 0);
