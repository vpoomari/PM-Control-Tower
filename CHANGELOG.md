# Changelog — PM CONTROL TOWER

All notable changes to this deliverable are documented here.

## [1.0.0] — 2026-09-10

Initial production release of the complete platform.

### Platform (Portfolio → Program → Project → WBS → Tasks → Schedule → EVM → Governance → Leadership)

- **Foundation**: JWT authentication (12h tokens, bcrypt hashing, lockout),
  RBAC with 8 system roles / 32 permissions, rate-limited & audited API wrapper.
- **Portfolio hierarchy**: Portfolios → Programs → Projects with owners,
  sponsors, phases, methodologies, health (RAG + score) and investment data.
- **Planning**: Requirements, WBS tree, tasks, dependencies (FS/SF/SS/FF + lag),
  CPM schedule engine (ES/EF/LS/LF, float, critical path), milestones,
  versioned baselines with activate/compare.
- **Execution**: Resource register & capacity, assignments, weekly timesheets
  with submit → approve/reject → lock cascade and actuals roll-up, work inbox,
  focus planner.
- **Control**: Budget lines & financials, EVM engine (PV/EV/AC → CPI/SPI/EAC/
  ETC/VAC/TCPI with period history), project health engine with snapshots,
  RAID (risks/issues/assumptions), change requests, stage gates, governance
  rules engine (auto alerts + inbox + health recalcs), alert backlog.
- **Leadership Reporting & Executive Control Tower**: single-source aggregation
  engine — control tower KPIs with GREY "insufficient data" honesty, exception-
  first feed, traceable auto-insights, nothing-missed validation (16 checks),
  what-changed deltas vs last snapshot, 30/60/90 outlook, portfolio table,
  17 sub-reports (risks, issues, milestones, financials, resources, schedule,
  dependencies, decisions, scope, deliverables, actions, quality, KPIs),
  per-project executive status reports, one-click versioned Leadership Pack,
  report schedules with in-app distribution, decision & action registers,
  meeting mode, report history comparison.
- **Delivery & collaboration**: deliverables, quality records, meetings,
  decisions, stakeholders, communications, documents, vendors.
- **Connect**: integration hub with credential registry, webhook subscriptions
  with delivery log, automation rules with execution history, AI PM assistant
  connector gateway.
- **Admin**: users, roles, PMO template library (14 seeded templates),
  audit trail, configuration.
- **Data exchange**: CSV/JSON export for 22 entities; governed CSV import with
  dry-run validation for 13 master-data entities (upsert by business code).
- **Realtime**: Socket.IO gateway mini service (JWT-authenticated) with
  event-driven refetch across all modules.

### Deployment (this release)

- Docker multi-stage image + docker-compose (app + realtime + optional TLS edge),
  healthchecks wired to the public readiness probe.
- Bare-metal path: setup script, PM2 ecosystem, nginx/Caddy reverse-proxy
  configs (Socket.IO routing included), backup/restore scripts.
- Reference enterprise dataset: 12 users, 2 portfolios, 3 programs, 6 projects,
  full planning/execution/control cascade, leadership register — seedable on
  first boot (`seed-if-empty`).
- Operational CLIs: password reset, seed helpers.
- Documentation suite (10 guides) shipped under `docs/`.
