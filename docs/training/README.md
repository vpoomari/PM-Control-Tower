# PM CONTROL TOWER — Training Program

> Version 3.1.0 · Training pack for the Enterprise Project, Program & Portfolio
> Management Platform (Portfolio → Program → Project → WBS → Schedule → EVM →
> Governance → Leadership Reporting).

## What this pack is

A facilitator-ready curriculum for training any audience — executives, PMO staff,
project managers, finance controllers and delivery team members — on the PM
Control Tower. Every module maps to real screens, real buttons and real data in
the application. Nothing here is conceptual: if it is written down, you can click
it.

## The documents

| # | Document | Audience | Time |
|---|----------|----------|------|
| 01 | [Platform Orientation](01-PLATFORM-ORIENTATION.md) | Everyone | 20 min |
| 02 | [Executive Control Tower](02-EXECUTIVE-CONTROL-TOWER.md) | Executives, PMO | 30 min |
| 03 | [Plan the Work](03-PLAN-THE-WORK.md) | PMs, planners | 45 min |
| 04 | [Execute & Collaborate](04-EXECUTE-AND-COLLABORATE.md) | Team leads, members | 30 min |
| 05 | [Control Performance](05-CONTROL-PERFORMANCE.md) | PMs, finance, PMO | 45 min |
| 06 | [Intelligence & Reporting](06-INTELLIGENCE-AND-REPORTING.md) | Executives, PMO | 30 min |
| 07 | [Automations & Administration](07-AUTOMATIONS-AND-ADMINISTRATION.md) | Admins, PMO | 30 min |
| 08 | [Hands-On Workshop](08-HANDS-ON-WORKSHOP.md) | Mixed groups | 90 min |
| 09 | [FAQ & Quick Reference](09-FAQ-AND-QUICK-REFERENCE.md) | Everyone | Keep handy |

## Learning paths by role

**Executive (COO, sponsor)** — 01 → 02 → 06 → 08 (station A)
Learn to read the Control Tower, drill into any number, and consume the
Leadership bundle in weekly governance.

**PMO administrator** — all modules
Owns the platform end to end: data model, governance queues, automations,
reporting templates, user administration.

**Project / Program manager** — 01 → 03 → 05 → 04 → 08 (station B)
Plans the project (WBS, schedule, baseline), controls it (EVM, RAID, changes,
gates) and leads the team through execution.

**Finance controller** — 01 → 05 (financials + EVM) → 06
Budgets, actuals, forecasts, billing and cost performance.

**Team member** — 01 → 04 → 08 (station C)
Boards, own tasks, timesheets, work inbox.

**Auditor** — 01 → 05 (governance, integrity) → 07 (audit trail)
Read-only oversight with a complete, immutable evidence trail.

## Suggested formats

- **2-hour overview workshop** — modules 01, 02, 03 (live demo), 08 stations.
- **Half-day deep dive** — all modules with hands-on exercises in each.
- **Role-based onboarding** — one learning path above, one-to-one or small group.

## Facilitator setup (10 minutes before)

1. Start the platform (`start.bat` on Windows, or `npm run dev`) and open
   `http://localhost:3000`.
2. Log in as the persona you will demo: `pmo@pmct.io` / `Pmct@2026`
   (PMO Administrator, sees everything). All seeded users share this password.
3. Open the **Executive Control Tower** (`#/dashboard`) — this is the home screen
   for executives and PMO.
4. Optional: run the automation scan (**Connect → Control Automations → Scan now**)
   so the automations module shows fresh execution history.
5. Optional: **Intelligence → Reporting Center** already ships with 177 published
   report templates across 13 categories — browse by category during module 06.

## Golden rules to repeat in every session

1. **Every number has a source.** No figure on any dashboard is decorative —
   click it and it drills into the operational record that produced it.
2. **Plan → Execute → Monitor → Control → Govern → Deliver.** The platform
   mirrors this loop; data flows forward automatically.
3. **The Integrity Layer is the trust contract.** Freshness scores tell you
   whether the data behind a decision is current — check them before acting.
4. **Governance is embedded, not bolted on.** Stage gates, change control,
   approvals and audit trail are part of the daily flow, not a separate system.
