# PM Control Tower — AI-Enabled PMO Operating Procedures

**Version** 1.0 · **Effective** 2026-11-06 · **Owner** PMO Office · **Review** quarterly
**Audience** Project Managers (PM), Resource Managers (RM), Delivery Managers (DM) & PMO
**Single entry point** the **AI tab → AI Hub** (`#/ai`) — every AI feed in one place
**Related docs** `AI-BYOK-ARCHITECTURE.md` · `AI-FEATURE-ROADMAP.md` · `03-USER-GUIDE.md`

---

## 1. Purpose & scope

Enterprise project and resource management has shifted toward AI-driven forecasting,
automated governance and adaptive capacity planning. This document defines the
**operating procedures** by which PMs, RMs and DMs use those capabilities to drive and
complete projects — grounded entirely in the nine core capabilities below and mapped to
where each one lives in PM Control Tower.

| # | Capability | Role |
|---|---|---|
| A1 | Predictive AI & scenario modeling | PM |
| A2 | Hybrid methodologies (Kanban → Gantt rollup) | PM |
| A3 | Automated dependency mapping | PM |
| A4 | Integrated scope & change-request hub | PM |
| B1 | AI-powered capacity forecasting | RM |
| B2 | Dynamic workload heatmaps | RM |
| C1 | Live BI-grade financial tracking | DM / PMO |
| C2 | End-to-end value-stream metrics | DM / PMO |
| C3 | Automated governance workflows | DM / PMO |

Every procedure follows the same shape: **Trigger → Steps → Data points → Cadence →
Escalation → Guardrail.**

---

## 2. Operating principles (apply to all procedures)

1. **One truth.** All roles read the same live platform data. AI never becomes a second
   source of numbers — deterministic math (EVM, PERT, variance, velocity) is computed in
   the platform; the model only narrates computed figures.
2. **Governed AI.** Every AI call is permission-checked (`ai.use`), scoped to the
   caller's entitlements, rate-limited and persisted to the audit trail with prompt,
   status, tokens and duration. Watch the feed in **AI Hub** (`#/ai`).
3. **Honest fallback.** If the provider key, quota or network is unavailable, AI features
   degrade to verified heuristics and say so — a fallback chip is never a silent failure.
   Do not act on AI output without checking its status chip.
4. **Human in the loop.** AI proposes; the accountable role disposes. No schedule change,
   resource move, spend or approval executes without the named owner's confirmation.
5. **Dry-run first.** Data changes (imports, bulk edits) run validate → apply. Linkage is
   validated before anything is written; the dependency-ordered apply never breaks
   parent-child relationships.

---

## 3. Project Manager procedures

### A1 · Predictive AI & scenario modeling

**Trigger** — Weekly status cycle; any milestone trending late; velocity shift > 15% vs
the previous sprint; sponsor asks "what if".

**Steps**
1. Open **Planning Lab** (`#/tools`) and the **AI Feature Studio** (`#/ai-features`).
2. Model the candidate scenarios: *What-if* (f008), *Schedule recovery* (f003),
   *PERT estimator* (f012/f088), *Velocity forecast* (f045), *Cost forecast* (f016).
3. Let the engine flag **schedule risk and scope creep before they happen** — review the
   *Scope creep* check (f085) and the risk brainstorm (f009) outputs against your RAID.
4. Pick the recommended timeline adjustment; enter it as a proposal in **Schedule**
   (`#/schedule`) with the scenario evidence attached.
5. Communicate the adjusted timeline to RM (capacity impact) and DM (cost impact)
   the same day — see §6 collaboration.

**Data points** — task updates, velocity trends, baseline vs forecast dates, critical
path, PERT three-point estimates, milestone variance.

**Cadence** — Weekly (align with status reporting); before every stage gate.

**Escalation** — Scenario shows > 10 working-day slip or > 5% cost growth → DM + sponsor
within 24 h, with the recovery scenario attached.

**Guardrail** — The AI suggests; only the PM commits a timeline change, through the
normal schedule/baseline workflow. Scenario output is evidence, not approval.

### A2 · Hybrid methodologies (agile execution, Gantt governance)

**Trigger** — Continuous: the team executes in Kanban/Scrum while governance requires a
traditional timeline.

**Steps**
1. Execute work on **Boards** (`#/boards`) / **Agile Delivery** (`#/agile`) — columns,
   WIP limits, sprint flow.
2. Verify the **automatic roll-up** into the Gantt on **Schedule** (`#/schedule`) at each
   iteration close: every done card appears as a completed bar; every blocked card shows
   as at-risk.
3. Reconcile mismatches (a card moved but the Gantt did not) via **Data Integrity**
   (`#/integrity`) before the status report goes out.

**Data points** — story status, sprint velocity, rolled-up bars, iteration dates,
dependency links carried from cards to Gantt tasks.

**Cadence** — Continuous; reconciliation at every sprint close.

**Escalation** — Roll-up drift > 1 day on a governance milestone → DM (timeline is a
reported number).

**Guardrail** — Kanban is the team's truth for *doing*; the Gantt is the truth for
*promising*. Never promise from the board alone.

### A3 · Automated dependency mapping

**Trigger** — Any sub-task is delayed, re-estimated or re-assigned.

**Steps**
1. The delay **instantly recalculates** the ripple across cross-functional milestones —
   open **Schedule → Dependencies** (`#/schedule`) and the milestone view
   (`#/milestones`) to see impacted downstream work.
2. Identify every impacted owner across teams; send the ripple summary (impacted
   milestone, new date, float consumed) — one message, generated from the view.
3. Decide: recover internally (re-sequence, add float) or escalate to the DM for
   cross-team arbitration.
4. If dates move, update them in the platform the same day so the roll-up (A2) and the
   financial baseline (C1) stay aligned.

**Data points** — predecessor/successor links, float/slack consumed, ripple days,
impacted milestone owners.

**Cadence** — Event-driven (on every delay) + weekly dependency review.

**Escalation** — The ripple crosses another team's committed milestone → DM arbitrates
within 48 h.

**Guardrail** — Never silence a ripple by deleting a dependency; re-plan instead.

### A4 · Integrated scope & change-request hub

**Trigger** — Any client/stakeholder request that changes scope, cost, schedule or
quality.

**Steps**
1. Log the request in **Change Control** (`#/changes`) — one centralized record linking
   the client request to its **budget impact**.
2. Attach the impact analysis: schedule ripple (from A3), cost delta (from C1), resource
   demand (from B1).
3. Route through the **sign-off workflow** (stage gates `#/gates` / approvals): requester
   → PM → DM → sponsor, as configured.
4. No work starts before approval. Approved CRs update the baseline (C1) and the plan
   (A2) atomically; rejected ones stay on file with rationale.

**Data points** — CR description, cost impact, schedule impact, approver chain, status,
baseline delta.

**Cadence** — Per request; consolidated CR review weekly.

**Escalation** — Work discovered in progress without an approved CR → automatic
integrity/governance flag; DM decides revert-or-ratify within 2 sprints.

**Guardrail** — The hub is the only door for scope change. Verbal approvals are logged
as CRs within one business day.

---

## 4. Resource Manager procedures

### B1 · AI-powered capacity forecasting

**Trigger** — Weekly resource cycle; new project intake; any project whose burn rate
diverges > 10% from plan; hiring/re-assignment windows.

**Steps**
1. Open **Resources** (`#/resources`) for cross-project allocations in real time.
2. Run the AI forecasts: *Capacity demand* (f012), *Skill gap* (f040), *Workload
   rebalancer* (f021).
3. Map the **skill gaps**: which upcoming work has no (or thin) coverage — feed results
   to the DM for the make/buy/hire decision.
4. Predict **when resources get stretched too thin**: using current burn rates, mark
   anyone forecast > 90% allocation beyond two weeks as "at stretch" and pre-emptively
   re-plan with the owning PM (procedure B2).
5. Publish the forecast to the weekly planning pack (shared with PM & DM).

**Data points** — cross-project allocation %, skill tags vs demand, burn rate vs plan,
forecast stretch date, vacancies.

**Cadence** — Weekly (before the sprint/planning meeting); on every new intake.

**Escalation** — Forecast shows zero coverage for a committed milestone → DM within 24 h
with options (re-sequence, contract, hire).

**Guardrail** — Forecast ≠ assignment. Moves are agreed with the PM who owns the
delivery date before they are made.

### B2 · Dynamic workload heatmaps

**Trigger** — Daily glance; formally weekly; immediately when a dependent task slips
(A3 fires) or timesheet actuals land.

**Steps**
1. Open the workload heatmap (Resources `#/resources` → workload view) — **live
   individual workloads, actual vs allocated time**.
2. The heatmap **recalculates team bandwidth the moment a dependent task is delayed** —
   investigate every cell that turned hot since the last review.
3. Rebalance *before burnout*: move work across people with the same skills (B1 skill
   map), or trigger the *workload rebalancer* (f021) and confirm its suggestion with the
   PM.
4. Compare **actual vs allocated** at period close; feed variances into the next
   forecast (B1) and the value-stream metrics (C2).

**Data points** — allocation %, actual vs allocated hours, remaining capacity, overload
duration, skill tags.

**Cadence** — Daily glance, weekly formal review; event-driven on dependency slips.

**Escalation** — An individual > 110% of capacity for two consecutive weeks → DM + owning
PM must re-plan within the sprint; burnout risk is a delivery risk.

**Guardrail** — Heatmaps inform redistribution, never individual performance judgments —
use timesheet data for capacity, not for surveillance.

---

## 5. Delivery Manager & PMO procedures

### C1 · Live BI-grade financial tracking

**Trigger** — Continuous (dashboards are live); formally at weekly review and gate
entry.

**Steps**
1. Open **EVM** (`#/evm`), **Financials** (`#/financials`) and **Baselines**
   (`#/baselines`): the original budget and schedule are continuously compared against
   current reality.
2. Read the variance trio — **PV / EV / AC → CPI & SPI**, plus estimate-at-completion
   (EAC) and variance-at-completion (VAC).
3. Intervene **before margins slip**: any amber trend gets a recovery action the same
   week, not at month-end.
4. Gate reviews (A4) consume these numbers directly — one set of figures, no
   re-keying.

**Data points** — planned value, earned value, actual cost, CPI, SPI, budget variance %,
EAC/VAC, baseline date variance.

**Cadence** — Weekly review; at every gate; continuous on the dashboard.

**Escalation** — CPI < 0.90 or SPI < 0.90 for two consecutive weeks → formal recovery
plan to the sponsor; VAC breach → portfolio re-balancing decision.

**Guardrail** — Intervene on trends, not single-week noise; document the intervention in
the change log (A4).

### C2 · End-to-end value-stream metrics

**Trigger** — Monthly PMO review; whenever lead time grows while throughput is flat.

**Steps**
1. Open **Analytics** (`#/analytics`) / **PMO Analytics** (`#/insights`).
2. Review **cycle time, throughput and the reliable movement of work** through the
   delivery pipeline: intake → in-progress → review → done.
3. Locate the stage with the worst queue (highest WIP, longest wait) and raise one
   improvement experiment for the next cycle.
4. Track the experiment's effect next month — same metric, same cut.

**Data points** — cycle time (p50/p90), throughput per period, WIP by stage, queue wait
time, rework rate.

**Cadence** — Monthly.

**Escalation** — Cycle time trend up for two consecutive periods → improvement initiative
chartered by the PMO.

**Guardrail** — Improve the system, not the individual statistic — pair every metric with
its bottleneck hypothesis.

### C3 · Automated governance workflows

**Trigger** — Intake submitted, compliance check due, approval requested, SLA breach
approaching — all event-driven.

**Steps**
1. Configure standardized **intake, compliance and approval** processes as trigger-based
   rules in **Governance** (`#/governance`) and **Control Automations**
   (`#/automations`).
2. Rules execute automatically — approvals route, reminders fire, non-compliant items
   are flagged — cutting administrative overhead while maintaining strict delivery
   standards.
3. Review the automation/audit feed (and the AI Hub execution feed `#/ai`) for failures
   weekly; every automated decision is traceable.
4. Tune rules quarterly: retire rules that fire with no action taken; add rules for
   every new manual chase discovered.

**Data points** — rule hits, approval SLA attainment, compliance pass rate, exception
count, audit entries.

**Cadence** — Continuous execution; weekly failure review; quarterly rule audit.

**Escalation** — A failed rule touched a committed deliverable → DM immediately; missed
approval SLA twice → rule/process owner re-designs the path.

**Guardrail** — Automation enforces the process humans designed; changing the standard
is a governance decision (recorded), never a rule edit made ad hoc.

---

## 6. Cross-role collaboration — how the data points flow

The nine capabilities only produce value **together**: each role's output is the next
role's input, all from the same live data.

| Cadence | Workflow | PM does | RM does | DM/PMO does | Shared data point |
|---|---|---|---|---|---|
| Daily | Slip response | Flags the delayed sub-task (A3) | Recalculates bandwidth, re-balances (B2) | Watches margin trend (C1) | Ripple days → allocation % → CPI/SPI |
| Weekly | Planning cycle | Publishes scenarios + timeline (A1) | Publishes capacity forecast + skill gaps (B1) | Confirms capacity fits commitments | Velocity, burn rate, forecast stretch date |
| Per request | Change flow | Logs CR with impact (A4) | Prices the resource delta (B1) | Approves/rejects; updates baseline | CR cost + schedule impact |
| Per sprint | Hybrid reconciliation | Reconciles board → Gantt (A2) | Confirms actual vs allocated (B2) | Reports throughput (C2) | Story status → rolled-up bars → cycle time |
| Monthly | Value-stream review | Presents bottlenecks + experiments | Presents load/skill trends | Presents variance + governance SLAs | Cycle time, throughput, WIP, rule hits |
| Per gate | Governance decision | Submits evidence pack | Confirms resource continuity | Signs the gate (C3 automation routes it) | Baseline variance, compliance status |

**Standing rules for collaboration**
- **Escalations travel with their evidence** — every escalation above attaches the
  platform view (scenario, heatmap, variance) it came from; nobody re-builds a deck from
  screenshots.
- **The AI Hub (`#/ai`) is the shared activity feed** — all three roles can see what AI
  was asked, by whom, with what outcome; audit questions start there.
- **One number, one owner** — velocity (PM), capacity (RM), variance (DM) are owned
  definitions; if two roles compute them differently, the platform value wins and the
  definition is corrected in the dictionary (§7).

---

## 7. Data-point dictionary (the specific data points)

| Data point | Source (tab) | Owner | Primary users |
|---|---|---|---|
| Task updates / status | Tasks · Boards (`#/tasks`, `#/boards`) | PM | PM, DM |
| Velocity trend | Agile (`#/agile`) | PM | PM, RM |
| Schedule risk / forecast dates | Schedule (`#/schedule`) | PM | PM, DM |
| Scope creep flags | RAID · Changes (`#/raid`, `#/changes`) | PM | PM, DM |
| Dependency ripple / float | Schedule → Dependencies | PM | PM, RM, DM |
| CR cost & schedule impact | Change Control (`#/changes`) | PM | DM, sponsor |
| Cross-project allocation % | Resources (`#/resources`) | RM | RM, PM |
| Burn rate | Resources · Timesheets | RM | RM, DM |
| Skill gap vs demand | Resources (f040) | RM | RM, DM |
| Actual vs allocated time | Timesheets (`#/timesheets`) | RM | RM |
| PV / EV / AC, CPI / SPI, EAC / VAC | EVM (`#/evm`) | DM | DM, PMO |
| Baseline variance | Baselines (`#/baselines`) | DM | DM, PM |
| Cycle time / throughput / WIP | Analytics (`#/analytics`) | PMO | DM, PMO |
| Rule hits / approval SLA / compliance | Governance · Automations | PMO | DM, PMO |
| AI execution status, tokens, scope | **AI Hub (`#/ai`)** | PMO | all |

---

## 8. AI governance guardrails (platform-enforced)

- **Access** — AI surfaces require `ai.use`; provider configuration requires
  `admin.config` (admin-only, key material never leaves the server, masked in the UI).
- **Audit** — every execution is persisted (prompt, response status, tokens, duration,
  data scope, user); review the feed in AI Hub weekly (C3 cadence).
- **Honesty** — fallback statuses (no key / quota exhausted / provider error) are visible
  as chips; heuristic output must be labelled as such in anything that leaves the
  organization.
- **Data scope** — AI reads only what the calling user may read; no cross-role data
  leakage through prompts.
- **Rate & budget** — call rate limits and the token meter (quota) cap spend; the
  administrator sets the allowance in AI Provider Settings.
- **Human approval** — per §2.4: AI output enters a decision only through the owning
  role's normal approval path (CR, gate, baseline, assignment).

---

## 9. Capability → platform map

| Capability | Where in PM Control Tower |
|---|---|
| A1 Predictive AI & scenario modeling | Planning Lab `#/tools` · AI Feature Studio `#/ai-features` (f003, f008, f016, f045, f085) |
| A2 Hybrid methodologies | Boards `#/boards` · Agile `#/agile` → auto-rollup to Schedule `#/schedule` |
| A3 Automated dependency mapping | Schedule → Dependencies `#/schedule` · Milestones `#/milestones` |
| A4 Scope & change-request hub | Change Control `#/changes` · Stage Gates `#/gates` |
| B1 AI capacity forecasting | Resources `#/resources` · Studio f012, f021, f040 |
| B2 Dynamic workload heatmaps | Resources `#/resources` (workload) · Timesheets `#/timesheets` |
| C1 Live BI financial tracking | EVM `#/evm` · Financials `#/financials` · Baselines `#/baselines` |
| C2 Value-stream metrics | Analytics `#/analytics` · PMO Analytics `#/insights` |
| C3 Automated governance | Governance `#/governance` · Automations `#/automations` · Data Integrity `#/integrity` |
| **All AI feeds (entry point)** | **AI Hub `#/ai`** — provider status, token meter, live execution feed, launch cards |

---

## 10. Review & change control

- **Review cadence** — quarterly, or after any platform release that changes a mapped
  route (§9) or a data-point owner (§7).
- **Owner** — PMO Office; procedures are approved by the DM lead.
- **Change log** — append-only at the bottom of this file.
- **Feedback** — propose changes via the Feedback & Roadmap tab (`#/feedback`).

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-06 | Initial procedures: 9 capabilities across PM / RM / DM-PMO, cross-role workflows, data dictionary, AI governance guardrails. |
