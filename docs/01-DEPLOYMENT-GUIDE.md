# 01 — Deployment Guide

PM CONTROL TOWER ships as a self-contained package with three supported deployment
modes. All modes run the same two processes:

| Process | What it is | Default port |
|---|---|---|
| **app** | Next.js 16 standalone production server (UI + 104 API routes) | 3000 |
| **realtime** | Socket.IO gateway mini service (live event fan-out) | 3003 |

The database is a single SQLite file whose path is set by `DATABASE_URL`. The realtime
gateway is optional-but-recommended: without it the app still works fully — cross-session
live refresh degrades gracefully to per-session refresh.

---

## 1. Requirements

- **Docker mode**: Docker Engine 24+ with Compose v2 (2 GB RAM minimum for the build;
  512 MB steady-state for the running pair).
- **Bare metal**: Linux x64, Node.js ≥ 20.9 (or Bun ≥ 1.2), 2 GB RAM, ~1.5 GB disk for
  dependencies and build output. `openssl` recommended for secret generation.
- Network: one public port (80/443 behind a reverse proxy, or 3000 direct).

---

## 2. Environment variables (`.env`)

Copy `.env.example` → `.env`. Full reference:

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite URL. **Use an absolute path** (e.g. `file:/opt/pmct/db/pmct.db`, Docker: `file:/app/db/pmct.db`). Relative paths resolve against `prisma/` for the CLI but a different directory for the standalone runtime — absolute avoids both. |
| `JWT_SECRET` | ✅ | Signs authentication JWTs (12 h TTL). Generate: `openssl rand -hex 32`. |
| `REALTIME_SECRET_KEY` | ✅ | JWT verification key inside the realtime gateway — **must equal `JWT_SECRET`**. |
| `REALTIME_SECRET` | ✅ | Shared secret for the internal `POST /emit` publishing endpoint (API → gateway). Any random string. |
| `REALTIME_URL` | ✅ | Where the app publishes events: `http://127.0.0.1:3003` (bare metal) / `http://realtime:3003` (compose). |
| `REALTIME_PORT` | ✅ | Listen port of the gateway (3003). |
| `PORT` / `HOSTNAME` | — | Standalone server bind (`3000` / `127.0.0.1`, or `0.0.0.0` in containers). |
| `PMCT_CONFIG_JSON` | — | Optional PMO configuration bootstrap JSON (see Admin Guide). |
| `WEB_ORIGIN` | — | Optional public origin used by the config bootstrap. |

---

## 3. Mode A — Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env: JWT_SECRET=…, REALTIME_SECRET=…  (openssl rand -hex 32)
docker compose up -d --build
docker compose ps                 # both services healthy after ~60 s
curl -s http://localhost:3000/api/system/ready
```

What happens on first boot (entrypoint `deploy/docker-entrypoint.sh`):

1. `prisma db push` syncs the schema to `/app/db/pmct.db` (non-destructive).
2. `scripts/seed-if-empty.ts` detects an empty database and loads the **reference
   enterprise dataset** (12 users, 2 portfolios, 3 programs, 6 projects, full
   planning/execution/control cascade — see the Reference Data Guide).
3. The standalone server starts and the healthcheck polls `/api/system/ready`.

Useful operations:

```bash
docker compose logs -f app               # application logs
docker compose logs -f realtime          # gateway logs
docker compose restart app               # restart app only
docker compose down                      # stop (volume persists)
docker compose down -v                   # ⚠ destroy database volume too
docker compose exec app bun scripts/reset-password.ts ceo@pmct.io 'NewPass#2026'
```

**Change the exposed port** with `PMCT_PORT=8080 docker compose up -d`.

**Optional TLS edge** (`--profile tls`): runs Caddy with your certificates from
`deploy/tls/` (or automatic Let's Encrypt for public domains — see
`deploy/Caddyfile.prod`). Routes `/socket.io/*` to the gateway and everything else
to the app.

---

## 4. Mode B — Bare metal (Node 20+, PM2, nginx)

```bash
chmod +x deploy/*.sh
./deploy/setup.sh                # installs deps, writes .env (generated secrets),
                                 # db push + reference seed, production build
pm2 start deploy/ecosystem.config.js
pm2 save && pm2 startup          # survive reboots
```

`setup.sh --no-seed` deploys an **empty instance** (no reference data).

The PM2 ecosystem runs `pmct-app` (standalone server, fork mode — keep a single
writer process for SQLite) and `pmct-realtime` (gateway via `tsx`).

**Reverse proxy** — install `deploy/nginx.conf` (routes `/socket.io/` → :3003 with
WebSocket upgrade headers, everything else → :3000), then:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pmct.conf
sudo ln -s /etc/nginx/sites-available/pmct.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d pm.example.com        # TLS
```

A Caddy equivalent (`deploy/Caddyfile.prod`) is provided for Caddy-based shops.

---

## 5. Mode C — Bun runtime

Bun runs the whole stack natively (including TS seeds and the gateway):

```bash
bun install --frozen-lockfile
bunx prisma db push && bun run db:seed
bun run build
bun run start:bun &              # app
bun run realtime &               # gateway
```

---

## 6. Data persistence & backups

- Everything stateful lives in **one SQLite file** (`$DATABASE_URL`).
- **Docker**: the file lives in the `pmct-db` volume — copy from the host volume path,
  or run `deploy/backup.sh` against a bind-mounted `db/` directory.
- **Bare metal**: `deploy/backup.sh` performs an online, consistent `.backup`
  (sqlite3) with 14-generation retention; `deploy/restore.sh` restores a snapshot
  (stop the app first). Cron example:

  ```
  0 2 * * * /opt/pm-control-tower/deploy/backup.sh >> /var/log/pmct-backup.log 2>&1
  ```

---

## 7. Upgrades

1. Back up: `./deploy/backup.sh`.
2. Unpack the new release over the existing directory (or into a new directory with
   the same `.env`).
3. Reinstall dependencies (`npm ci` / `bun install --frozen-lockfile`).
4. `npx prisma db push` (schema is migrated non-destructively; additive fields are
   backfilled with defaults).
5. Rebuild: `npm run build`, then restart both processes.

Roll back = restore the previous backup file and the previous release directory.

---

## 8. Cloud notes (Render / Railway / Fly.io)

The platform runs on any container host:

- Deploy the included `Dockerfile`; set the env vars from § 2.
- Attach a **persistent disk** and point `DATABASE_URL` at it
  (e.g. `file:/var/data/pmct.db`) — container filesystems are ephemeral otherwise.
- Health probe path: `/api/system/ready` (public). `/api/health` is
  authentication-protected by design.
- WebSocket support must be enabled for realtime; if the platform proxies only HTTP,
  the app still works (graceful degradation).

### PostgreSQL migration (optional, for shared-cluster deployments)

The Prisma schema is written portable (enums/JSON modeled as `String`). To move to
PostgreSQL: change `datasource db.provider` to `"postgresql"`, point `DATABASE_URL` at
the cluster, adjust the two `String`-based JSON columns where you want native `Json`,
then `prisma db push`. Application code is unchanged.

---

## 9. Post-deployment checklist

- [ ] `GET /api/system/ready` returns `"status":"ready"` (db + realtime ok)
- [ ] Log in with a reference account **and change every demo password** (Admin → Users)
- [ ] `JWT_SECRET` / `REALTIME_SECRET` are unique random values, file `.env` is `chmod 600`
- [ ] TLS enabled (direct 3000 only on trusted internal networks)
- [ ] `deploy/backup.sh` scheduled and a first backup verified restorable
- [ ] Real users/roles created; reference accounts disabled or repurposed
- [ ] Import your organization's master data (Import/Export dropdowns, 13 entities)
      or start clean with `--no-seed`

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Cannot find module …/standalone/server.js` | The build was made with a different Next workspace root. Always run `node .next/standalone/server.js` from the project root — this package pins `outputFileTracingRoot` to prevent nesting when unpacked inside a parent directory that has its own lockfile. |
| Boot fails with `DATABASE_URL is required` | Env not loaded — systemd/PM2/compose must export `.env` values (setup.sh and compose do this automatically). |
| Login works, but lists stay stale across two browsers | Realtime gateway not reachable. Check `REALTIME_URL`, `REALTIME_SECRET`, gateway port, and that the proxy routes `/socket.io/`. The app still functions (single-session refresh). |
| Healthcheck flapping in Docker | Probe is `/api/system/ready`; ensure it returns 200 from inside the container (`docker compose exec app curl -s localhost:3000/api/system/ready`). |
| `401 Authentication required` from `/api/health` | Expected — that route is auth-protected. Use `/api/system/ready` for probes. |
| Seeded logins rejected after restore | You restored an older DB file. Use `scripts/reset-password.ts <email> <newpass>`. |
| Socket.IO 404 behind proxy | The proxy must forward `/socket.io/` to the **gateway port** (3003) with `Upgrade`/`Connection` headers — see `deploy/nginx.conf`. |
