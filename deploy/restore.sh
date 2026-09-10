#!/usr/bin/env bash
# ==============================================================
# PM CONTROL TOWER — Restore a backup
#   ./deploy/restore.sh backups/pmct-20260910-020000.db.gz
# Stops nothing automatically — stop the app (pm2 stop pmct-app /
# docker compose stop app) before restoring to avoid writer conflicts.
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && { set -a; source .env; set +a; }
: "${DATABASE_URL:?DATABASE_URL not set — provide .env}"

ARCHIVE="${1:?Usage: deploy/restore.sh <backup.db.gz>}"
[[ -f "$ARCHIVE" ]] || { echo "✗ Archive not found: $ARCHIVE"; exit 1; }

DB_PATH="${DATABASE_URL#file:}"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$DB_PATH" "$DB_PATH.pre-restore-$STAMP"
echo "• Current database saved as $DB_PATH.pre-restore-$STAMP"

gunzip -c "$ARCHIVE" > "$DB_PATH"
echo "✓ Restored $ARCHIVE → $DB_PATH"
echo "  Start the app again and verify: curl -s localhost:3000/api/system/ready"
