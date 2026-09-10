#!/usr/bin/env bash
# ==============================================================
# PM CONTROL TOWER — SQLite backup
# Safe online backup when sqlite3 CLI is available (WAL-consistent);
# otherwise falls back to a plain file copy (stop the app for a
# guaranteed-consistent copy on very busy systems).
#   ./deploy/backup.sh [target-dir]     (default ./backups)
# Cron example (daily 02:00, keep 14):
#   0 2 * * * /opt/pm-control-tower/deploy/backup.sh >> /var/log/pmct-backup.log 2>&1
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && { set -a; source .env; set +a; }
: "${DATABASE_URL:?DATABASE_URL not set — provide .env}"

TARGET_DIR="${1:-./backups}"
mkdir -p "$TARGET_DIR"
DB_PATH="${DATABASE_URL#file:}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$TARGET_DIR/pmct-$STAMP.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$OUT'"
else
  cp "$DB_PATH" "$OUT"
fi
gzip -f "$OUT"
echo "✓ Backup written: $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"

# Retention: keep the 14 most recent archives
ls -1t "$TARGET_DIR"/pmct-*.db.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "✓ Retention applied (14 most recent kept in $TARGET_DIR)"
