#!/usr/bin/env node
// PM CONTROL TOWER — Vercel build helper: derive the PostgreSQL schema variant.
//
// prisma/schema.prisma stays on provider = "sqlite" for local development.
// Vercel deploys run PostgreSQL (Vercel Postgres / Neon), and Prisma's datasource
// provider must be static in the schema, so this script writes a build-time
// variant with only the provider swapped:
//
//   prisma/schema.prisma          provider = "sqlite"       (checked in — local dev)
//   prisma/schema.vercel.prisma   provider = "postgresql"   (generated — gitignored)
//
// Everything else (models, String-encoded JSON columns, cuid() ids) is identical,
// so the single checked-in schema remains the source of truth.
//
// Usage: node scripts/prepare-vercel.mjs
// Exports: prepareVercelSchema() — also called by scripts/vercel-db.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "prisma", "schema.prisma");
const OUTPUT = join(ROOT, "prisma", "schema.vercel.prisma");

const DATASOURCE = /datasource\s+db\s*{[^}]*?provider\s*=\s*"([^"]+)"/s;

export function prepareVercelSchema() {
  const src = readFileSync(SOURCE, "utf8");
  const match = src.match(DATASOURCE);
  if (!match) {
    throw new Error(`no "datasource db" block found in ${SOURCE}`);
  }
  let out;
  if (match[1] === "sqlite") {
    out = src.replace(DATASOURCE, (block) => block.replace('provider = "sqlite"', 'provider = "postgresql"'));
  } else if (match[1] === "postgresql") {
    out = src;
  } else {
    throw new Error(`unexpected datasource provider "${match[1]}" (expected "sqlite" or "postgresql")`);
  }
  writeFileSync(OUTPUT, out);
  return OUTPUT;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const written = prepareVercelSchema();
    console.log(`[prepare-vercel] wrote ${written} (provider = "postgresql")`);
  } catch (err) {
    console.error(`[prepare-vercel] ${err.message}`);
    process.exit(1);
  }
}
