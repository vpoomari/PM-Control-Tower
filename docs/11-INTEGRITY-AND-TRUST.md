# 11 — INTEGRITY & TRUST (The Integrity Layer)

The Integrity Layer is what makes PM Control Tower the only enterprise PPM platform
where the dashboard tells you when it is lying, the forecast admits its uncertainty,
the organization remembers its estimation mistakes, decisions are tested before they
are made, value is tracked after go-live, and every number survives an audit.

## Data Freshness Integrity Engine
Every feed (timesheets, cost ledger, tasks, RAID, gates) carries an expected cadence
(defaults 7/7/3/14/30 days, configurable per project). `computeFreshness` derives
staleness = ageDays / cadence per feed; the composite score is min-based (the worst
feed dominates). Levels: CURRENT < 1.0x ≤ WARN < 1.5x ≤ DEGRADE < 2.5x ≤ CRITICAL.
- Executive tiles carry a DATA AS OF chip; breaching 1.5x degrades tiles visually.
- The Executive Control Tower shows a live freshness rail ranked by score.
- CRITICAL staleness raises a de-duplicated ACTION_REQUIRED inbox item and deducts
  up to 12 points from project health (stale data is unknown risk).
- Cascade: timesheet approval / task / RAID / gate mutations recalc freshness and
  emit `freshness.changed`.

## Evidence Bundle Export
`POST /api/integrity/evidence {projectId}` gathers the complete project record
(baselines, change requests, gate decisions, timesheets + entries, health snapshots,
audit slice) into a SHA-256 hash chain where each document's hash includes the
previous hash. `POST .../verify` re-derives the chain against CURRENT records:
PASS, or FAIL with the first altered document ref. Manifests are append-only.

## P80 Probabilistic Forecasting (Monte Carlo)
`POST /api/integrity/simulate {projectId, seed?, iterations?}` samples every task
duration from its estimate (PERT approximated via Irwin–Hall, or exact triangular)
and runs the **existing** CPM engine unchanged per iteration. Aggregates
P10/P50/P80/P90 for project finish, milestone finishes and cost, plus a criticality
index per task. PRNG: mulberry32, documented; same seed → identical percentiles.
Schedule changes flag older runs `stale` — stale results are never served silently.

## Say/Do Calibration
`factor = median(actualDuration / plannedDuration)` per team / work-type / project
scope, with MAD-based confidence and a minimum sample size (5). Advisory only:
planning overlays suggest ("UAT tasks historically take 1.8× planned") and never
silently override. Individual-planner scope is not enabled.

## Scenario Sandbox (Branch & Merge)
`POST /api/integrity/scenarios` deep-clones a project's operational subset into a
JSON snapshot. Overrides (task durations, assignment removal/reassignment, budget)
are applied to the clone; the SAME CPM engine computes the simulated finish; the
diff quantifies finish/cost/assignment deltas. `POST .../merge` applies the deltas
in ONE audited transaction, creates the Change Request, and marks the scenario
MERGED. Production roll-ups never read scenario rows — isolation is structural.

## Agentic Steering Pack (draft-first)
`POST /api/integrity/ai-actions` composes a weekly steering pack from live engine
outputs (KPI deltas, top risks, decisions needed, freshness, P80 outlook). When SPI
has held below 0.90 for three consecutive periods, the pack flags a re-plan
proposal. **AI never auto-executes**: every action requires APPROVED/REJECTED by a
recorded human reviewer; decided actions are immutable.

## Benefits Realization
Benefit profiles (revenue / cost saving / capacity / KPI) are tracked per project
and activate when the project's FINAL stage gate passes. Benefit actuals post
cumulative-to-period values; the portfolio view reports promised / delivered /
at-risk, and a strategic overlay flags a green-delivery project that is not
realizing value as strategically AMBER. Every mutation is audited and emits
`benefits.updated`.

## RBAC
New permissions: `integrity.view` (EXECUTIVE+, PM, teams), `integrity.manage`
(PMO/program/project managers), `scenario.manage` (PMO/portfolio/program),
`benefits.manage` (PMO/portfolio/program/project managers). All mutations audited.
