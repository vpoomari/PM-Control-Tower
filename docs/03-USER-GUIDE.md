# 03 — User Guide

Audience: every persona — executives, PMO, portfolio/program/project managers,
finance, teams. The UI is a single-page workspace with hash navigation
(`#/dashboard`, `#/projects/<code>/schedule`, …), a global search (⌘K), quick-create
actions and live realtime refresh.

Screens adapt to your role: what you cannot act on is hidden, and the server
enforces the same rules.

---

## 1. Dashboard

The landing view after login: portfolio health donut (RAG + GREY), active projects,
investment vs budget, my inbox, my timesheet status, upcoming milestones, critical
alerts and capacity pressure. Every card is a drill-down into the underlying module.
For executives, an **Executive Control Tower** entry button opens the leadership
workspace directly.

## 2. Portfolio (`#/portfolios`, `#/programs`, `#/projects`)

- **Portfolios** group investments with strategic objectives, budget targets and
  roll-up health. **Programs** sit inside portfolios and carry their own budgets.
- **Projects register**: filter by business unit/health/status/owner; open any
  project to enter its **workspace** (below).
- Project fields worth knowing: sponsor, manager, phase, methodology, risk level,
  baseline vs current budget, planned/actual hours, progress, health (RAG + score).

## 3. Project workspace (`#/projects/<code>`)

Thirteen tabs, one source of truth per project:

| Tab | What you do there |
|---|---|
| Overview | Charter, objectives, success criteria, key facts, health summary |
| Scope | Requirements with acceptance criteria → linked to WBS |
| WBS | Tree editor (work packages, owners, planned cost/hours) |
| Tasks | Task register per WBS node, assignees, priorities, criticality |
| Schedule | **CPM view**: dependencies (FS/SS/FF/SF + lag), computed ES/EF/LS/LF, float, critical path, baseline vs current dates |
| Milestones | Due/baseline dates, critical flags, gate linkage |
| Baselines | Create/activate versioned baselines; compare current schedule vs baseline |
| Financials | Budget lines (baseline/current/actual/forecast), spend tracking |
| EVM | Period snapshots: PV/EV/AC → CPI, SPI, EAC, ETC, VAC, TCPI with trend charts |
| RAID | Risks, issues, assumptions with scores, owners, mitigation, escalation |
| Changes | Change requests with cost/schedule/risk impact and decision trail |
| Gates | Stage gates with criteria, evidence and approve/hold decisions |
| Health | Health score history + snapshot detail |

The engines work for you: saving tasks/dependencies recalculates the schedule
(CPM), timesheet approvals roll up actuals, EVM/health/governance recompute from
live data.

## 4. Plan module (cross-project views)

`#/register` (all projects), `#/requirements`, `#/wbs`, `#/tasks`, `#/schedule`
(Gantt with critical path), `#/milestones`, `#/baselines` — multi-project planning
views with the same editor components and Import/Export support.

## 5. Execute

- **Resources** (`#/resources`): register (skills, rates, capacity), capacity view
  with over/under-allocation, assignments.
- **Timesheets** (`#/timesheets`): weekly grid (activity, hours, start/end), submit
  week → approver queue (program managers) → approve/reject with reason → lock.
  Approved hours flow into project actuals automatically.
- **Inbox** (`#/inbox`): personal action queue (approvals, alerts, escalations,
  leadership actions) with links to the source records.
- **Planner** (`#/planner`): personal focus planner (day grid, planned vs actual).

## 6. Control (cross-project)

`#/financials` (portfolio budget/actual/forecast), `#/evm` (portfolio EVM with
CPI/SPI scatter and trends), `#/health` (health snapshots & trend board),
`#/raid` (cross-project risks/issues/assumptions), `#/changes`, `#/gates`,
`#/governance` (rules + alert backlog; see Admin Guide § 4).

## 7. Intelligence — Reports & the Executive Control Tower

**Reports** (`#/reports`): report library with CSV/JSON export across entities.

**Leadership Control Tower** (`#/reports/leadership`) — the flagship. Twenty tabs in
four groups; everything is computed from live operational data, never hand-typed:

- **Control Tower**: portfolio KPIs with RAG **and GREY (insufficient data — never
  shows green when data is missing)**, answer cards ("Are we within budget?"),
  exception-first feed (CRITICAL → decisions needed now → at risk → overdue → due
  soon → changes), traceable auto-insights (each sentence links to its source
  entity; missing facts are stated as *INSUFFICIENT DATA*), nothing-missed
  validation grid, 30/60/90-day outlook.
- **Portfolio**: one row per project — PM/business owner, health, progress, status,
  pending decisions, next milestone, forecast finish, last update — with drill-through
  to a per-project **Executive Status Report** (exec summary, 7-dimension health,
  planned vs actual vs variance, leadership actions with WHAT/WHO/BY-WHEN/
  IF-NO-DECISION) and print/PDF support.
- **Sub-reports**: What-Changed (vs last snapshot), Risks, Issues, Milestones,
  Financials (forecast trend vs previous report), Resources, Schedule, Dependencies
  (cross-project blocking + downstream impact), Decisions (raise → record lifecycle),
  Scope, Actions (central register), Deliverables, Quality, KPIs (targets vs actuals).
- **Meeting Mode**: nine numbered sections for steering meetings (dark projection
  view).
- **History & Schedules**: versioned Leadership Pack snapshots with headline
  comparison v(n-1)→v(n), scheduled report runs (daily/weekly/monthly) with
  in-app distribution to recipients.

**Generate Leadership Pack** button: creates the full executive pack as an audited,
versioned snapshot (and auto-escalates overdue decisions into critical actions).

## 8. Intelligence — Analytics & Assistant

`#/analytics`: trend dashboards. `#/assistant`: AI PM assistant (uses the configured
AI connector; data scope is logged with each execution). If the AI provider is not
configured/reachable, the rest of the platform is unaffected.

## 9. Connect & Admin

Automations, integrations, webhooks, notifications center, AI gateway, and the Admin
screens (users/roles/templates/audit) — see the Admin Guide.

---

## 10. Daily habits that make the tower work

1. Teams file timesheets weekly (approvals drive actuals → EVM → health).
2. PMs keep RAID + decisions current (the tower reads them — gaps show as GREY).
3. PMO evaluates governance rules periodically (or after major changes).
4. Executives read the Control Tower, act on the exception feed, and generate a
   Leadership Pack before each steering meeting (History keeps the week-over-week
   comparison).
