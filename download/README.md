# PM CONTROL TOWER v1.0.0 — Delivery Package

Enterprise Project, Program & Portfolio Management Platform
(Portfolio → Program → Project → WBS → Schedule → EVM → Governance → Leadership Reporting)

All artifacts in this folder were verified end-to-end on a clean install (16/16 smoke checks):
build → migrate → seed → boot → login → core APIs → Leadership Pack → RBAC enforcement.

---

## 1. Package contents

| File | Size | What it is |
|---|---|---|
| `PM-Control-Tower-1.0.0-deployable.zip` | ~818 KB (443 files) | Full source, Docker stack, ops scripts, seeds, docs |
| `PM-Control-Tower-1.0.0-dependencies-linux-x64.zip` | ~387 MB (63,941 entries) | Pre-built `node_modules/` for offline install (Linux x64, glibc + musl native binaries incl. Prisma engines, Next SWC, sharp) |
| `SHA256SUMS.txt` | — | Integrity manifest for both archives + all 11 documents |
| `documentation/` | 11 guides | Deployment, Admin, User, Architecture, API Reference, Data Model, RBAC Matrix, Reference Data, Operations Runbook, Security + index |

Verify after download:  `sha256sum -c SHA256SUMS.txt`

---

## 2. Quick start — Docker (recommended)

```bash
unzip PM-Control-Tower-1.0.0-deployable.zip && cd pm-control-tower
cp .env.example .env                  # set JWT_SECRET + REALTIME_SECRET (openssl rand -hex 32)
docker compose up -d --build          # app :3000 + realtime :3003 + persistent SQLite volume
open http://<host>:3000               # first boot auto-creates schema + seeds reference data
```

Optional TLS edge (Caddy, ports 80/443):  `docker compose --profile tls up -d`
(see `documentation/01-DEPLOYMENT-GUIDE.md`)

## 3. Quick start — Offline / air-gapped (Linux x64)

```bash
unzip PM-Control-Tower-1.0.0-deployable.zip && cd pm-control-tower
unzip ../PM-Control-Tower-1.0.0-dependencies-linux-x64.zip   # extracts node_modules/ here
cp .env.example .env
npx prisma generate && npx prisma db push
npm run db:seed:node
npm run build && npm start            # node .next/standalone/server.js
node mini-services/realtime/index.js  # or: npm run realtime (tsx)
```

## 4. Reference data (top-organization dataset)

First boot seeds a complete enterprise demo: 2 portfolios, 3 programs, 6 projects with WBS/CPM
schedules/baselines, RAID registers, budgets & forecasts, resource pool, governance gates,
decisions/actions/KPIs, and 12 users across every role.

Log in (change passwords on first use — see `documentation/10-SECURITY-GUIDE.md`):

| Account | Role |
|---|---|
| `ceo@pmct.io` | EXECUTIVE — Leadership Control Tower consumer |
| `pmo@pmct.io` | PMO_ADMIN — super admin (full administration) |
| `pm.sarah@pmct.io` | PROJECT_MANAGER |
| `finance@pmct.io` | FINANCE |
| `liam@pmct.io` | TEAM_MEMBER (timesheet flow demo) |

Full 12-account table + demo script: `documentation/08-REFERENCE-DATA-GUIDE.md`

## 5. Documentation index

| # | Guide | Read it for |
|---|---|---|
| 00 | `README.md` | Doc suite index & reading order |
| 01 | `01-DEPLOYMENT-GUIDE.md` | Docker / bare-metal / cloud, env vars, TLS, SQLite persistence |
| 02 | `02-ADMIN-GUIDE.md` | Users, roles, templates, integrations, system settings |
| 03 | `03-USER-GUIDE.md` | Day-to-day usage for every role |
| 04 | `04-ARCHITECTURE.md` | Stack, engines, realtime, security layers |
| 05 | `05-API-REFERENCE.md` | All 104 REST routes + RBAC requirements |
| 06 | `06-DATA-MODEL.md` | 57 Prisma models & relationships |
| 07 | `07-RBAC-MATRIX.md` | 32 permissions × 8 roles |
| 08 | `08-REFERENCE-DATA-GUIDE.md` | Seeded dataset, demo logins, guided demo script |
| 09 | `09-OPERATIONS-RUNBOOK.md` | Backup/restore, monitoring, upgrade, incident handling |
| 10 | `10-SECURITY-GUIDE.md` | AuthN/AuthZ, secrets, hardening checklist |

## 6. Requirements

- **Docker path**: Docker Engine 24+ with Compose v2 (2 CPU / 4 GB RAM minimum)
- **Bare-metal path**: Node.js ≥ 20.9 (or Bun ≥ 1.2), Linux x64 for the prebuilt bundle
- **Storage**: persistent volume for SQLite (`/app/db` in Docker) — back up with `deploy/backup.sh`

Support: see `documentation/09-OPERATIONS-RUNBOOK.md` for day-2 operations.
