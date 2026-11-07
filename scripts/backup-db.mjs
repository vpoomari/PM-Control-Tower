// PM CONTROL TOWER — DB-level backup pair (with data + without data).
// Produces two date-stamped SQLite files in backups\:
//   pmct-db-with-data-<stamp>.db     full data snapshot via VACUUM INTO
//                                    (consistent and safe while the app runs)
//   pmct-db-schema-only-<stamp>.db   complete schema, ZERO rows (structure only)
// Prints a verification table (per-table row counts) and SHA256 checksums.
//
// Usage:  node scripts/backup-db.mjs [-Stamp 20261030-120000]
//         npm run db:backup
//
// Restore: stop the app, copy either file over db\custom.db, start the app.
//   - with-data     -> all users + data exactly as at snapshot time
//   - schema-only   -> empty database with the full current structure
//                      (equivalent to `npx prisma db push` on a fresh file)

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stampArg = process.argv.indexOf("-Stamp");
const stamp = stampArg > -1 ? process.argv[stampArg + 1] : new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const srcDb = path.join(repoRoot, "db", "custom.db");
const outDir = path.join(repoRoot, "backups");
const outFull = path.join(outDir, `pmct-db-with-data-${stamp}.db`);
const outSchema = path.join(outDir, `pmct-db-schema-only-${stamp}.db`);

if (!fs.existsSync(srcDb)) { console.error(`source database not found: ${srcDb}`); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const ok = (m) => console.log(`[PMCT] ${m}`);
const fail = (m) => { console.error(`[PMCT] FAIL: ${m}`); process.exit(1); };

// ---- 1. With-data snapshot: VACUUM INTO (online-safe, transactionally consistent)
const src = new DatabaseSync(srcDb, { readOnly: true });
try {
  src.exec(`VACUUM INTO '${outFull.replace(/'/g, "''")}'`);
} finally { src.close(); }
ok(`with-data snapshot: ${path.basename(outFull)} (${(fs.statSync(outFull).size / 1048576).toFixed(1)} MB)`);

// ---- 2. Schema-only: replay every DDL statement (tables, indexes, triggers,
//         views) into a fresh file. Excludes SQLite-internal tables.
const schema = new DatabaseSync(outSchema);
try {
  const ddl = new DatabaseSync(srcDb, { readOnly: true });
  try {
    const rows = ddl
      .prepare(
        "SELECT type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END, rowid",
      )
      .all();
    for (const r of rows) schema.exec(r.sql);
    ok(`schema-only: ${rows.length} DDL statements replayed`);
  } finally { ddl.close(); }
} finally { schema.close(); }

// ---- 3. Verify
const listTables = (file) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
  } finally { db.close(); }
};
const countRows = (file, table) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return Number(db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get().c); }
  catch { return -1; } finally { db.close(); }
};

const srcTables = listTables(srcDb);
const fullTables = listTables(outFull);
const schemaTables = listTables(outSchema);
if (srcTables.length !== fullTables.length || srcTables.length !== schemaTables.length) {
  fail(`table count mismatch: source=${srcTables.length} with-data=${fullTables.length} schema-only=${schemaTables.length}`);
}

const rows = [];
for (const t of srcTables) {
  const s = countRows(srcDb, t);
  const f = countRows(outFull, t);
  const e = countRows(outSchema, t);
  if (s !== f) fail(`row-count mismatch in ${t}: source=${s} snapshot=${f}`);
  if (e !== 0) fail(`schema-only file has ${e} row(s) in ${t}`);
  rows.push({ table: t, source: s, withData: f, schemaOnly: e });
}
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("TABLE", 30)}${pad("SOURCE", 10)}${pad("WITH-DATA", 12)}SCHEMA-ONLY`);
for (const r of rows) console.log(`${pad(r.table, 30)}${pad(r.source, 10)}${pad(r.withData, 12)}${r.schemaOnly}`);
console.log(`${pad(`${srcTables.length} tables`, 30)}${pad(rows.reduce((a, r) => a + Math.max(r.source, 0), 0), 10)}${pad(rows.reduce((a, r) => a + Math.max(r.withData, 0), 0), 12)}0\n`);

// ---- 4. Checksums
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
for (const f of [outFull, outSchema]) {
  ok(`SHA256  ${path.basename(f)}  ${sha256(f)}`);
}
ok("DB backup pair complete — see the matching BACKUP-REPORT-*.md in backups\\ for restore steps.");
