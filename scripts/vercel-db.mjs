#!/usr/bin/env node
// PM CONTROL TOWER — Postgres database helper for Vercel deployments.
//
// Commands:
//   setup     Prepare the PostgreSQL schema variant, generate the Prisma client,
//             `prisma db push`, and seed — only when the database is empty.
//             This is the first half of the Vercel buildCommand (see vercel.json).
//   push      db push only (generates prisma/schema.vercel.prisma if missing).
//   seed      Seed only when the database has no users (fresh deploy).
//             Mirrors the start.bat fresh-install seed chain.
//   restore   Regenerate the LOCAL SQLite Prisma client. Run this after testing
//             against Postgres, otherwise local dev keeps talking to Postgres.
//
// Connection URL resolution (first match wins):
//   1. --url=postgresql://...            CLI flag
//   2. DATABASE_URL / POSTGRES_PRISMA_URL              (pooled, runtime)
//      DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING (direct, DDL/seed)
//      (Vercel's Postgres/Neon integration injects both automatically)
//   3. postgresql:// lines in .env.vercel (local testing against a hosted DB)
//
// The script refuses to run when the resolved URL is missing or points at
// SQLite (file:) — that is exactly the state that 500s on Vercel today.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareVercelSchema } from "./prepare-vercel.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_CLI = join(ROOT, "node_modules", "prisma", "build", "index.js");
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const VERCEL_SCHEMA = join(ROOT, "prisma", "schema.vercel.prisma");
const SQLITE_SCHEMA = join(ROOT, "prisma", "schema.prisma");

// Same order as the start.bat fresh-install chain (npm runner path).
const SEED_CHAIN = [
  "seed.ts",
  "seed-leadership.ts",
  "seed-integrity.ts",
  "seed-technology.ts",
  "seed-connectors.ts",
  "seed-connectors2.ts",
  "seed-reporting.ts",
];

function log(msg) {
  console.log(`[vercel-db] ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`[vercel-db] ERROR: ${msg}`);
  console.error(
    [
      "",
      "  Vercel deploys need a PostgreSQL database. Attach one in the Vercel dashboard:",
      "    Storage → Create Database → Postgres (Neon) → connect to this project.",
      "  The integration injects DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED",
      "  automatically, and the build (vercel.json) then pushes the schema and seeds.",
      "",
      "  For local testing against a hosted DB, put a postgresql:// URL in .env.vercel",
      "  (gitignored) or pass --url=postgresql://...",
    ].join("\n")
  );
  process.exit(code);
}

function readDotenvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !line.trim().startsWith("#")) {
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

function resolveUrls(args) {
  const flag = args.find((a) => a.startsWith("--url="));
  const fileEnv = readDotenvFile(join(ROOT, ".env.vercel"));
  const env = process.env;
  const pooled =
    (flag ? flag.slice(6) : "") ||
    env.DATABASE_URL ||
    env.POSTGRES_PRISMA_URL ||
    fileEnv.DATABASE_URL ||
    fileEnv.POSTGRES_PRISMA_URL ||
    "";
  const direct =
    (flag ? flag.slice(6) : "") ||
    env.DATABASE_URL_UNPOOLED ||
    env.POSTGRES_URL_NON_POOLING ||
    fileEnv.DATABASE_URL_UNPOOLED ||
    fileEnv.POSTGRES_URL_NON_POOLING ||
    pooled;
  const source = flag
    ? "--url flag"
    : env.DATABASE_URL || env.POSTGRES_PRISMA_URL || env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING
      ? "environment"
      : existsSync(join(ROOT, ".env.vercel"))
        ? ".env.vercel"
        : "none";
  return { pooled, direct, source };
}

function requirePostgresUrl(url, source) {
  if (!url) {
    fail(`no PostgreSQL URL found (looked at --url, env vars, .env.vercel; source: ${source}).`);
  }
  if (url.startsWith("file:")) {
    fail(
      `resolved URL is SQLite (${url}) — refusing to run against the local dev database.\n` +
        `  Vercel needs a postgresql:// URL from the Postgres/Neon integration.`
    );
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    fail(`resolved URL is not a postgresql:// URL (source: ${source}).`);
  }
}

function run(label, cli, cliArgs, extraEnv = {}) {
  log(label);
  const res = spawnSync(cli, cliArgs, {
    stdio: "inherit",
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) fail(`${label}: ${res.error.message}`);
  if (res.status !== 0) fail(`${label} failed (exit ${res.status}).`, res.status ?? 1);
}

function prisma(args, extraEnv) {
  run(`prisma ${args[0]}`, process.execPath, [PRISMA_CLI, ...args], extraEnv);
}

async function countUsers(cliUrl) {
  process.env.DATABASE_URL = cliUrl;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    return await client.user.count();
  } finally {
    await client.$disconnect();
  }
}

async function seedIfEmpty(cliUrl) {
  const users = await countUsers(cliUrl);
  if (users > 0) {
    log(`seed skipped — database already initialized (${users} users).`);
    return;
  }
  log("empty database detected — running the fresh-install seed chain…");
  for (const script of SEED_CHAIN) {
    run(`seed ${script}`, process.execPath, [TSX_CLI, join("scripts", script)], { DATABASE_URL: cliUrl });
  }
  log("seed complete.");
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith("--"));
  if (!cmd) {
    fail("usage: node scripts/vercel-db.mjs <setup|push|seed|restore> [--url=postgresql://...]");
  }

  if (cmd === "restore") {
    prisma(["generate", "--schema", SQLITE_SCHEMA]);
    log("restored the local SQLite Prisma client (prisma/schema.prisma).");
    return;
  }

  const urls = resolveUrls(args);
  requirePostgresUrl(urls.direct, urls.source);

  if (cmd === "push" || cmd === "setup") {
    const written = prepareVercelSchema();
    log(`wrote ${written} (provider = "postgresql")`);
  }

  if (cmd === "push") {
    prisma(["db", "push", "--accept-data-loss", "--skip-generate", "--schema", VERCEL_SCHEMA], {
      DATABASE_URL: urls.direct,
    });
    return;
  }

  if (cmd === "seed") {
    await seedIfEmpty(urls.direct);
    return;
  }

  if (cmd === "setup") {
    if (!process.env.VERCEL) {
      console.warn(
        "[vercel-db] WARNING: not running on Vercel — the local Prisma client is now the\n" +
          "[vercel-db]          PostgreSQL variant. Run `node scripts/vercel-db.mjs restore`\n" +
          "[vercel-db]          when you are done, or local dev will try to reach Postgres."
      );
    }
    prisma(["generate", "--schema", VERCEL_SCHEMA]);
    prisma(["db", "push", "--accept-data-loss", "--skip-generate", "--schema", VERCEL_SCHEMA], {
      DATABASE_URL: urls.direct,
    });
    await seedIfEmpty(urls.direct);
    log("setup complete (schema variant + client + push + seed).");
    return;
  }

  fail(`unknown command "${cmd}" (expected setup | push | seed | restore).`);
}

main().catch((err) => {
  fail(err?.stack || String(err));
});
