// PM CONTROL TOWER — Template backup builder
// Creates a ZIP of the platform CODE + CONFIG only (no runtime data) for reuse:
//   node scripts/make-template-backup.mjs
// Output: backups/pmct-template-v<version>-<timestamp>.zip
//
// Excluded: databases, .env (secrets), node_modules, build/dev caches, logs,
// screenshots, scratch/tool results, downloads/exports, generated decks,
// agent build notes, and historical run logs (worklog/CHANGELOG stay in the
// live repo but are not part of a fresh template).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const stampId = new Date().toISOString().slice(0, 19).replace(/[^0-9]/g, "");

const DIR_EXCLUDES = new Set([
  "node_modules", "dist", "out", ".next", ".next-brand-check", ".next-brand-dev",
  ".zscripts", ".zwork", "backups", "_backups", "tool-results",
  "gui-test-screenshots", "download", ".git", "agent-ctx",
]);

// base-name rules (lowercased)
const FILE_EXCLUDE_BASE = new Set([
  "worklog.md", "changelog.md", // run history — lives in the live repo, not in a fresh template
  ".env", ".env.vercel", ".env.local",
  ".DS_Store", "tsconfig.tsbuildinfo", "pmct-template-deploy-check.txt",
]);

const FILE_EXCLUDE_RE = /\.(db|db-journal|db-wal|db-shm|log|tsbuildinfo|cpuprofile)$/i;

// per-directory file excludes (dir path relative to ROOT, \-normalized → predicate on base name)
const DIR_FILE_EXCLUDES = new Map([
  ["sales-deck", (base) => /\.(pptx|zip)$/i.test(base)], // generated deck/evidence outputs
]);

function excluded(relPath, base, isDir) {
  const parts = relPath.split(/[\\/]/);
  for (const p of parts.slice(0, -1)) if (DIR_EXCLUDES.has(p)) return true;
  if (isDir && DIR_EXCLUDES.has(base)) return true; // skip the excluded dir itself (and its subtree)
  const own = DIR_FILE_EXCLUDES.get(parts.slice(0, -1).join("/"));
  if (own && own(base)) return true;
  if (FILE_EXCLUDE_BASE.has(base.toLowerCase())) return true;
  if (FILE_EXCLUDE_RE.test(base)) return true;
  return false;
}

const zipName = `pmct-template-v${version}-${stampId}.zip`;
const zipPath = path.join(ROOT, "backups", zipName);
const staging = path.join(os.tmpdir(), `pmct-template-staging-${stampId}`);

fs.mkdirSync(path.join(ROOT, "backups"), { recursive: true });
fs.rmSync(staging, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });

fs.cpSync(ROOT, staging, { recursive: true, filter: (src) => {
  if (src === ROOT) return true;
  let isDir = false;
  try { isDir = fs.statSync(src).isDirectory(); } catch { return false; }
  return !excluded(path.relative(ROOT, src), path.basename(src), isDir);
} });

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}
const copied = countFiles(staging);

// --- extra template files ---------------------------------------------------
fs.writeFileSync(
  path.join(staging, "RESTORE-TEMPLATE.md"),
  [
    "# PM Control Tower — clean template (no data)",
    "",
    `Built ${new Date().toISOString()} from v${version}. Platform code + config only.`,
    "",
    "## Restore",
    "",
    "```bash",
    "npm install              # or bun install",
    "cp .env.example .env     # then edit .env:",
    "  #  DATABASE_URL        file:/absolute/path/to/db/pmct.db  (this db/ folder exists)",
    "  #  JWT_SECRET          openssl rand -hex 32",
    "  #  REALTIME_SECRET_KEY (same value as JWT_SECRET)",
    "  #  REALTIME_SECRET     (any random string)",
    "npx prisma generate",
    "npx prisma db push       # creates an EMPTY database containing the schema",
    "npm run dev              # http://localhost:3000",
    "",
    "# Optional demo dataset:  npm run db:seed / npm run seed:integrity / npm run seed:command-center",
    "# Optional realtime:      npm run realtime",
    "# Production:             docs/01-DEPLOYMENT-GUIDE.md (Docker / standalone)",
    "```",
    "",
    "Production note: the clean database has no user accounts. Register the first",
    "admin via an admin seed script (scripts/seed.ts) or promote a registered user.",
    "",
    "## Intentionally excluded (by design, see .env.example + gitignore)",
    "- db/*.db runtime data (schema ships in prisma/schema.prisma; seeds rebuild demo data)",
    "- .env machine-local secrets (.env.example is the reference)",
    "- node_modules, .next*/ build caches, logs, screenshots, tool-results, download/",
    "- agent-ctx/, worklog.md, CHANGELOG.md — build history stays in the live repo",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(staging, "db", "README.md"),
  "Runtime databases live in this folder (excluded from the template by design).\n" +
    "Set DATABASE_URL in .env to an absolute path inside it (e.g. file:C:/data/pmct.db),\n" +
    "then run: npx prisma generate && npx prisma db push\n\n" +
    "Optional demo data: see scripts/seed*.ts — npm run db:seed\n",
);

// --- zip --------------------------------------------------------------------
execSync(`tar -a -c -f "${zipPath}" .`, { cwd: staging, stdio: "pipe" });

// --- verify: no databases, secrets, caches inside ---------------------------
const listing = execSync(`tar -tf "${zipName}"`, { cwd: path.join(ROOT, "backups") })
  .toString().split(/\r?\n/).filter(Boolean);
const bad = listing.filter((e) => {
  const b = e.toLowerCase();
  return (
    (b.includes(".env") && !b.includes(".env.example")) ||
    b.includes("node_modules/") ||
    b.includes("tool-results") ||
    /(^|[\\/])\.next/.test(b) ||
    /\.(db|db-journal|db-wal|db-shm|log)$/i.test(b) ||
    /(^|[\\/])(worklog|changelog)\./.test(b)
  );
});

fs.rmSync(staging, { recursive: true, force: true });

const size = fs.statSync(zipPath).size;
console.log(`template backup: backups/${zipName}`);
console.log(`source files copied: ${copied} · zip entries: ${listing.length} · size: ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(bad.length
  ? `UNEXPECTED entries (${bad.length}): ${bad.slice(0, 5).join(", ")}`
  : "verified clean: no databases, secrets, caches, logs or node_modules inside");
