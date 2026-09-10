# PM CONTROL TOWER

**Enterprise Project, Program & Portfolio Management Platform**

Portfolio → Program → Project → WBS → Tasks → Schedule → EVM → Governance → **Leadership Reporting**

PM CONTROL TOWER is a complete, self-hosted PPM platform built for enterprise PMOs and executive
leadership. Its defining capability: **leadership never needs to ask a project manager for status** —
the system continuously aggregates live operational data into decision-ready views, exception-first
feeds, traceable insights and one-click executive reporting packs.

---

## Capability map

| Domain | Capabilities |
|---|---|
| **Portfolio** | Portfolios, programs, projects (owners, sponsors, phases, methodologies, RAG health, budgets) |
| **Plan** | Requirements, WBS tree, tasks, dependencies, **CPM schedule engine** (ES/EF/LS/LF, float, critical path), milestones, versioned baselines |
| **Execute** | Resource register & capacity, assignments, weekly timesheets (submit → approve → lock cascade), work inbox, focus planner |
| **Control** | Budget lines & financials, **EVM engine** (CPI/SPI/EAC/ETC/VAC/TCPI + history), health engine with snapshots, RAID, change requests, stage gates, **governance rules engine** (auto alerts → inbox → health recalc) |
| **Intelligence** | **Executive Control Tower** (RAG + GREY honesty, exception-first feed, traceable insights, 30/60/90 outlook), **Leadership Pack** (one-click, versioned, comparable), 17 sub-reports, executive status reports, What-Changed, report schedules, analytics, AI assistant |
| **Connect** | Integration hub, webhook subscriptions with delivery log, automation rules, AI connector gateway |
| **Admin** | Users, roles (8 system roles / 32 permissions), PMO template library, full audit trail |
| **Data exchange** | CSV/JSON export for 22 entities; governed CSV import (dry-run validation) for 13 master-data entities |

**Footprint**: 57 data models · 104 API routes · 8 computation engines · 62 view modules ·
48 UI components · Socket.IO realtime gateway.

---

## Quick start

### Option A — Docker Compose (recommended)

```bash
# 1. Unpack and enter
unzip pm-control-tower-1.0.0-deployable.zip && cd pm-control-tower

# 2. Configure secrets
cp .env.example .env
#   → set JWT_SECRET and REALTIME_SECRET (openssl rand -hex 32)

# 3. Build & start (app + realtime gateway + persistent DB volume)
docker compose up -d --build

# 4. Open http://<host>:3000 and log in with the reference dataset
#    (see docs/08-REFERENCE-DATA-GUIDE.md)
```

The first boot automatically creates the schema and loads the reference enterprise
dataset (empty-database detection). Data persists in the `pmct-db` volume.

### Option B — Bare metal (Linux, Node 20+)

```bash
./deploy/setup.sh              # deps → .env (generated secrets) → DB → seed → build
npm run start                  # terminal 1: app on 127.0.0.1:3000
npm run realtime:node          # terminal 2: realtime gateway on 127.0.0.1:3003
# front with deploy/nginx.conf (TLS via certbot) — or run under PM2:
pm2 start deploy/ecosystem.config.js
```

> ⚠️ **First-login checklist**: change all demo passwords (Admin → Users), keep `JWT_SECRET`
> private, enable TLS, and schedule `deploy/backup.sh`. See `docs/10-SECURITY-GUIDE.md`.

---

## What's in this package

```
pm-control-tower/
├── src/                    Application source (app, views, components, engines, libs)
├── prisma/schema.prisma    Data model (57 models, SQLite)
├── scripts/                Seeds (reference enterprise dataset), CLIs (password reset, …)
├── mini-services/realtime  Socket.IO gateway (independent bun project)
├── deploy/                 Entrypoint, nginx/Caddy configs, PM2, setup/backup/restore scripts, TLS
├── docs/                   Complete documentation suite (10 guides — see index below)
├── Dockerfile              Multi-stage production image
├── docker-compose.yml      Two-service deployment + optional TLS edge
├── package.json            Scripts + pinned dependencies
├── package-lock.json       npm install / npm ci (Node 20+)
├── bun.lock                Bun 1.2+ installs
├── .env.example            Environment template with explanations
├── LICENSE · CHANGELOG.md · VERSION
```

### Dependencies

Two lockfiles ship with the package so dependencies are exactly reproducible:

- **npm / Node 20+**: `npm ci` (uses `package-lock.json`)
- **Bun 1.2+**: `bun install --frozen-lockfile` (uses `bun.lock`)
- **Docker**: dependencies are installed inside the image build — nothing else needed.

For **air-gapped** environments, a companion archive
`pm-control-tower-1.0.0-dependencies-linux-x64.zip` (pre-built `node_modules`)
may be provided — unpack it in the project root instead of running an install.

---

## Documentation index

| Doc | Contents |
|---|---|
| `docs/01-DEPLOYMENT-GUIDE.md` | Docker / bare-metal / Bun / cloud deployments, env vars, TLS, upgrades |
| `docs/02-ADMIN-GUIDE.md` | Users & roles, import/export, templates, governance, integrations, audit |
| `docs/03-USER-GUIDE.md` | Module-by-module usage incl. Executive Control Tower & Leadership Pack |
| `docs/04-ARCHITECTURE.md` | Stack, engines, realtime, security layers, repo layout |
| `docs/05-API-REFERENCE.md` | All 104 API routes grouped by domain |
| `docs/06-DATA-MODEL.md` | All 57 data models grouped by domain |
| `docs/07-RBAC-MATRIX.md` | Roles × permissions matrix |
| `docs/08-REFERENCE-DATA-GUIDE.md` | The seeded top-organization dataset, logins, customization |
| `docs/09-OPERATIONS-RUNBOOK.md` | Backups, monitoring, upgrades, incident playbooks |
| `docs/10-SECURITY-GUIDE.md` | Authentication, authorization, hardening checklist |

---

## Tech stack

Next.js 16 (App Router, standalone output) · TypeScript 5 · Tailwind CSS 4 + shadcn/ui ·
Prisma ORM + SQLite (single-file, zero-admin database) · Socket.IO 4 · JWT (jose) + bcrypt ·
Recharts · Bun or Node 20+ runtime.

SQLite keeps the platform **self-contained and operations-light** (one file to back up);
the Prisma schema uses portable types so a PostgreSQL migration is a `provider` change
plus schema push (see `docs/01-DEPLOYMENT-GUIDE.md` § 7).
