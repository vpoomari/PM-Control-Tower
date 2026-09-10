# 09 — Operations Runbook

Audience: platform operators / DevOps. Companion to the Deployment Guide.

---

## 1. Daily & weekly operations

| Cadence | Task | Command / check |
|---|---|---|
| Continuous | Service health | `curl -s localhost:3000/api/system/ready` → `"status":"ready"` (Docker healthcheck does this every 30 s) |
| Daily | Backup | `deploy/backup.sh` via cron (02:00 suggested) — 14 generations retained |
| Weekly | Restore drill | Restore the newest backup into a scratch directory and boot against it |
| Weekly | Disk space | DB grows slowly (~1 MB seeded); watch logs and backups dir |
| Monthly | Audit export | Admin → Audit → Export CSV into compliance archive |
| Monthly | Dependency review | `npm audit` / `bun pm audit`; plan patch upgrades |

## 2. Logs

| Mode | App logs | Gateway logs |
|---|---|---|
| Docker | `docker compose logs -f app` | `docker compose logs -f realtime` |
| PM2 | `pm2 logs pmct-app` | `pm2 logs pmct-realtime` |
| systemd (example) | `journalctl -u pmct-app -f` | `journalctl -u pmct-realtime -f` |

The application logs route-handler errors with stack traces; audit trail rows are
the business-level log of who changed what.

## 3. Health & monitoring

- **Readiness** (public): `GET /api/system/ready` → db reachable + row counts +
  realtime gateway reachable. Point load balancers / Docker / uptime robots here.
- **Authenticated deep health**: `GET /api/system/health`.
- **Metrics to watch**: response time of `/api/reports/leadership` (heaviest
  aggregate), DB file size, memory of the app process (PM2 restarts at 1 GB by
  default), socket connection count (`curl localhost:3003/health` → clients).
- **Synthetic checks**: login → `GET /api/portfolios` → `GET /api/reports/leadership`
  with a service account (least-privilege TEAM_MEMBER must get 403 on the latter —
  a free RBAC regression test).

## 4. Upgrade procedure

See Deployment Guide § 7. Summary: backup → replace code → `npm ci` →
`npx prisma db push` → `npm run build` → restart app + gateway. Schema changes in
this product line are additive; `db push` is non-destructive. Verify with the
readiness probe plus one screen per domain.

## 5. Incident playbooks

### 5.1 App down / unhealthy
1. `docker compose ps` (or `pm2 status`) — which process?
2. Logs (§ 2) — most common: missing env (boot fails fast with a clear message),
   or port conflict (`PORT`/`HOSTNAME`).
3. Restart the app only: `docker compose restart app` / `pm2 restart pmct-app`.
4. If DB is corrupted (rare on SQLite): restore from last backup (§ 6).

### 5.2 Database locked / slow writes
SQLite allows a single writer; long transactions are rare in normal use.
1. Check for a stuck import: imports are capped at 2000 rows and transactional.
2. Restart the app process (releases any lingering connection).
3. Consider moving to PostgreSQL for high-concurrency deployments (Deployment
   Guide § 8).

### 5.3 Realtime not updating other sessions
1. `curl localhost:3003/health` → gateway alive?
2. From the app container: `REALTIME_URL` reachable? (`REALTIME_URL=http://realtime:3003`
   in compose, `http://127.0.0.1:3003` bare metal.)
3. Proxy must forward `/socket.io/` with WebSocket upgrade headers (nginx conf
   provided). If the gateway is down, **the platform keeps working** — refreshes
   degrade to per-session; fix at leisure.

### 5.4 Disk full
1. Backups directory pruning is automatic (14 kept) — check cron actually runs.
2. Old logs (`docker system prune`, `pm2 flush`).
3. DB file: archive and truncate the audit table is **not** recommended (compliance);
   move to PostgreSQL or extend the disk.

### 5.5 Forgot an admin password / locked out
`bun scripts/reset-password.ts ceo@pmct.io 'NewPass#2026'` — clears lockout, resets
password, writes an audit row. (In Docker: `docker compose exec app bun scripts/…`.)

### 5.6 Suspected bad import
Imports are transactional — a failed apply leaves no partial rows. If a *successful*
import needs undo: restore pre-import backup, or surgically export → fix CSV →
re-import (upsert updates, never duplicates, when business codes match).

## 6. Backup & restore (quick reference)

```bash
./deploy/backup.sh /var/backups/pmct          # online, gzip, keep 14
./deploy/restore.sh /var/backups/pmct/pmct-20260910-020000.db.gz
# stop app → restore → start app → verify /api/system/ready
```

Docker volumes: the DB lives in `pmct-db`; to copy out:
`docker compose cp app:/app/db/pmct.db ./pmct-snapshot.db` (stop app first for a
quiesced copy, or rely on restore drills).

## 7. Support handoff checklist

When escalating an issue, include: deployment mode + version (`VERSION`), the
readiness probe JSON, relevant log excerpts, the audit rows around the incident,
and (if data-related) a fresh backup file — never raw secrets.
