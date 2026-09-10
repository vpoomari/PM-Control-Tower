#!/usr/bin/env bash
# ==============================================================
# PM CONTROL TOWER — Docker entrypoint
# 1. Ensures DATABASE_URL is set and the DB directory exists
# 2. Pushes the Prisma schema (idempotent, non-destructive to tables)
# 3. Seeds the reference enterprise dataset on first boot only
# 4. Executes the container command (Next.js standalone server)
# ==============================================================
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (e.g. file:/app/db/pmct.db)}"

DB_PATH="${DATABASE_URL#file:}"
DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"
echo "[pmct] Database file: $DB_PATH"

echo "[pmct] Syncing Prisma schema…"
bunx prisma db push --skip-generate

echo "[pmct] Ensuring reference data…"
bun scripts/seed-if-empty.ts

echo "[pmct] Starting: $*"
exec "$@"
