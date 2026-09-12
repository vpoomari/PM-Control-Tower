# CHANGELOG

## 1.2.2 — DATA QUALITY ENGINE + MASTER PLATFORM AUDIT (2026-09-13)

- **Data Quality dashboard** (Integrity Layer): computed DQ score per project — owner/sponsor/dates/budget presence, 14-day staleness, RAID hygiene (owner + mitigation), unassigned open tasks, resources without skills. New Data Quality tab in Data Integrity.
- **docs/12-MASTER-PLATFORM-AUDIT.md** — full 42-section coverage audit: what exists, what is partial, what is roadmap.

## 1.2.1 — EVM full-field period form (2026-09-13)

- EVM page now has three tabs: **Cockpit** (live computed), **Full form — all fields** (period-close entry for status date, period window, BAC/PV/EV/AC with every derived metric — CPI/SPI/EAC/ETC/VAC/TCPI/CV/SV/%complete — computed live, overridable only deliberately), and **What is EVM?** (an explainer of the method, formulas and how the platform keeps EVM honest).
- POST /api/evm accepts full-field manual periods, tagged source MANUAL_PERIOD, audited, health recalculated via the cascade.

## 1.2.0 — INTEGRITY LAYER HARDENING (2026-09-13)

- **Freshness**: SystemConfig with configurable warn/degrade/critical thresholds + 24h grace window (configurable); degraded tiles render diagonal-hatched, translucent, with tooltips.
- **Evidence bundles**: downloadable ZIP (INDEX.txt human-readable index + manifest.json + docs/*.json), pure dependency-free ZIP writer.
- **Monte Carlo**: async worker queue — POST enqueues (202), worker drains QUEUED→RUNNING→COMPLETE/FAILED, UI polls / listens for simulation:completed; calendar dates ("Mar 14 – Apr 2 (P50–P80)") + P10–P90 confidence-band fan chart.
- **Scenario merge**: rebase-on-current-actuals conflict resolution — duration deltas rebase against drifted production values, vanished assignments skip, decisions recorded in the CR.
- **Chat-native approvals**: signed HMAC-SHA256 expiring deep links (jose) for timesheet/gate/change approvals with human-readable decision pages; status honestly CONFIGURED (external chat channels untested).
- **Benefits**: promised vs delivered vs remaining waterfall chart.
- 26/26 engine unit tests green (ZIP CRC vectors, grace window, rebase deltas added).

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.2.0 — INTEGRITY LAYER HARDENING (2026-09-13)

- **Freshness**: SystemConfig with configurable warn/degrade/critical thresholds + 24h grace window (configurable); degraded tiles render diagonal-hatched, translucent, with tooltips.
- **Evidence bundles**: downloadable ZIP (INDEX.txt human-readable index + manifest.json + docs/*.json), pure dependency-free ZIP writer.
- **Monte Carlo**: async worker queue — POST enqueues (202), worker drains QUEUED→RUNNING→COMPLETE/FAILED, UI polls / listens for simulation:completed; calendar dates ("Mar 14 – Apr 2 (P50–P80)") + P10–P90 confidence-band fan chart.
- **Scenario merge**: rebase-on-current-actuals conflict resolution — duration deltas rebase against drifted production values, vanished assignments skip, decisions recorded in the CR.
- **Chat-native approvals**: signed HMAC-SHA256 expiring deep links (jose) for timesheet/gate/change approvals with human-readable decision pages; status honestly CONFIGURED (external chat channels untested).
- **Benefits**: promised vs delivered vs remaining waterfall chart.
- 26/26 engine unit tests green (ZIP CRC vectors, grace window, rebase deltas added).

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.2.1 — EVM full-field period form (2026-09-13)

- EVM page now has three tabs: **Cockpit** (live computed), **Full form — all fields** (period-close entry for status date, period window, BAC/PV/EV/AC with every derived metric — CPI/SPI/EAC/ETC/VAC/TCPI/CV/SV/%complete — computed live, overridable only deliberately), and **What is EVM?** (an explainer of the method, formulas and how the platform keeps EVM honest).
- POST /api/evm accepts full-field manual periods, tagged source MANUAL_PERIOD, audited, health recalculated via the cascade.

## 1.2.0 — INTEGRITY LAYER HARDENING (2026-09-13)

- **Freshness**: SystemConfig with configurable warn/degrade/critical thresholds + 24h grace window (configurable); degraded tiles render diagonal-hatched, translucent, with tooltips.
- **Evidence bundles**: downloadable ZIP (INDEX.txt human-readable index + manifest.json + docs/*.json), pure dependency-free ZIP writer.
- **Monte Carlo**: async worker queue — POST enqueues (202), worker drains QUEUED→RUNNING→COMPLETE/FAILED, UI polls / listens for simulation:completed; calendar dates ("Mar 14 – Apr 2 (P50–P80)") + P10–P90 confidence-band fan chart.
- **Scenario merge**: rebase-on-current-actuals conflict resolution — duration deltas rebase against drifted production values, vanished assignments skip, decisions recorded in the CR.
- **Chat-native approvals**: signed HMAC-SHA256 expiring deep links (jose) for timesheet/gate/change approvals with human-readable decision pages; status honestly CONFIGURED (external chat channels untested).
- **Benefits**: promised vs delivered vs remaining waterfall chart.
- 26/26 engine unit tests green (ZIP CRC vectors, grace window, rebase deltas added).

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.2.0 — INTEGRITY LAYER HARDENING (2026-09-13)

- **Freshness**: SystemConfig with configurable warn/degrade/critical thresholds + 24h grace window (configurable); degraded tiles render diagonal-hatched, translucent, with tooltips.
- **Evidence bundles**: downloadable ZIP (INDEX.txt human-readable index + manifest.json + docs/*.json), pure dependency-free ZIP writer.
- **Monte Carlo**: async worker queue — POST enqueues (202), worker drains QUEUED→RUNNING→COMPLETE/FAILED, UI polls / listens for simulation:completed; calendar dates ("Mar 14 – Apr 2 (P50–P80)") + P10–P90 confidence-band fan chart.
- **Scenario merge**: rebase-on-current-actuals conflict resolution — duration deltas rebase against drifted production values, vanished assignments skip, decisions recorded in the CR.
- **Chat-native approvals**: signed HMAC-SHA256 expiring deep links (jose) for timesheet/gate/change approvals with human-readable decision pages; status honestly CONFIGURED (external chat channels untested).
- **Benefits**: promised vs delivered vs remaining waterfall chart.
- 26/26 engine unit tests green (ZIP CRC vectors, grace window, rebase deltas added).

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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

## 1.1.0 — THE INTEGRITY LAYER (2026-09-12)

Eight first-of-their-kind features on one operational model (constitution: every number computed, every mutation audited, AI drafts / humans approve, staleness never silent, randomness always seeded):

- **Data Freshness Integrity Engine** — per-feed staleness (timesheets/ledger/tasks/RAID/gates) vs configurable cadences; composite worst-feed score; DATA AS OF chips, degrading tiles, executive freshness rail; critical staleness raises alerts + health deduction.
- **Evidence Bundle Export** — one-click audit-grade bundle (baselines, changes, gates, timesheets, ledger, health, audit) with a SHA-256 hash chain; re-verification passes/fails and pinpoints tampered documents.
- **P80 Probabilistic Forecasting** — seeded (mulberry32) Monte Carlo over the existing CPM engine; P10/P50/P80/P90 for finish, milestones and cost + per-task criticality index; stale runs flagged, never silently served.
- **Say/Do Calibration** — median(actual/planned) factors per team/work-type/project with MAD confidence; advisory-only planning suggestions; blame-free framing.
- **Scenario Sandbox** — fork a project, apply overrides, re-run the SAME engines on the clone, quantified diff; merge converts the sandbox into a Change Request inside one audited transaction. Production roll-ups structurally cannot read sandbox rows.
- **Agentic Steering Pack** — AI drafts the weekly pack + replan proposals (SPI < 0.9 for 3 periods); every draft requires a recorded human decision; append-only once decided.
- **Benefits Realization** — benefit profiles activate when the final gate passes; portfolio value promised/delivered/at-risk; strategic health overlay (green delivery with no delivered value = strategically amber).
- **RBAC + realtime** — new integrity.view/manage, scenario.manage, benefits.manage permissions; freshness.changed, simulation.completed, scenario.merged, benefits.updated, ai.action events.


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
