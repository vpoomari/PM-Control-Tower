# 08 — Reference Data Guide (Top-Organization Dataset)

A fresh deployment boots with a **complete reference enterprise dataset** — a
diversified global group running a large transformation portfolio. It exists so that
every screen, engine and report is meaningfully populated on day one, and so that
evaluators and training cohorts see a realistic, internally consistent organization.

Load it with `bun run db:seed` (or automatically on first Docker boot via
`scripts/seed-if-empty.ts`). **Seeding wipes existing data** — never run it against a
live instance.

---

## 1. The reference organization

A diversified global enterprise operating in 42 countries with 2.4M retail
customers, executing an enterprise-wide digital transformation alongside growth
investments. Structure:

```
Portfolio PTF-DT — Enterprise Digital Transformation ($12.5M target, strategic
│                  objective: cut legacy estate 60% by 2028, lift digital revenue)
├── Program PRG-CSM — Core Systems Modernization ($7.8M)
│   ├── PRJ-ERP-001  Global ERP Implementation        (AMBER, HIGH risk,  $3.6M)
│   ├── PRJ-DATA-002 Enterprise Data Platform        (RED,   HIGH risk,  $1.8M)
│   └── PRJ-CLD-005 Cloud Infrastructure Migration   (AMBER, MEDIUM risk, $1.3M)
└── Program PRG-CXP — Customer Experience Platform ($3.2M)
    ├── PRJ-PORT-003 Customer Self-Service Portal    (GREEN, TESTING phase, $1.4M)
    └── PRJ-MOB-004 Mobile Banking Application       (GREEN, AGILE,        $1.15M)

Portfolio PTF-GI — Growth & Innovation ($6M target)
└── Program PRG-NMX — New Market Expansion ($2.4M)
    └── PRJ-CRM-006 CRM Consolidation                (DRAFT/INITIATION,    $0.75M)
```

The dataset is deliberately **not all-green**: two troubled projects (one RED with
governance breaches, one AMBER ERP program with a vendor-contract decision overdue
by 3 days), an honest GREY data-gap case, and an overdue leadership decision —
so the exception-first Control Tower, governance engine and escalation logic have
something real to show.

## 2. Users & logins

All reference accounts share the initial password **`Pmct@2026`**
(⚠ change every password before go-live — Admin → Users, or
`bun scripts/reset-password.ts`).

| Email | Name | Role | Persona |
|---|---|---|---|
| `ceo@pmct.io` | Alexandra Chen | EXECUTIVE | COO — gate decisions, tower consumer |
| `pmo@pmct.io` | Jordan Blake | PMO_ADMIN (super admin) | Head of PMO — full administration |
| `portfolio@pmct.io` | Priya Nair | PORTFOLIO_MANAGER | Investment management |
| `program@pmct.io` | Marcus Webb | PROGRAM_MANAGER | Program delivery, timesheet approvals |
| `pm.sarah@pmct.io` | Sarah Okafor | PROJECT_MANAGER | Senior PM (ERP, Portal, Cloud) |
| `pm.david@pmct.io` | David Kim | PROJECT_MANAGER | PM (Data Platform, Mobile, CRM) |
| `finance@pmct.io` | Elena Rodriguez | FINANCE | Budget/forecast control |
| `auditor@pmct.io` | Thomas Reed | AUDITOR | Read-only + audit trail |
| `liam@pmct.io` | Liam Foster | TEAM_MEMBER | Technical lead (timesheet flow demo) |
| `ava@pmct.io` | Ava Martinez | TEAM_MEMBER | Senior engineer |
| `noah@pmct.io` | Noah Andersen | TEAM_MEMBER | Business analyst |
| `mia@pmct.io` | Mia Tanaka | TEAM_MEMBER | QA lead |

PMO/PM accounts have linked Resource profiles (EMP-010…012) so their personal
timesheet editor works out of the box.

## 3. What is seeded (volumes)

| Area | Contents |
|---|---|
| RBAC | 32 permissions, 8 system roles, 12 users |
| Structure | 2 portfolios, 3 programs, 6 projects |
| Planning | WBS trees, requirements, **104-style task registers** per project, dependencies, milestones, stage gates, activated baselines |
| Execution | 13 resources, 14 assignments, 12 timesheets processed through the real approval cascade |
| Financial | Budget lines per project; EVM calibrated to **CPI 0.85–1.04 / SPI 0.80–1.02**; 3 EVM history periods; quarterly forecasts |
| RAID | 9 risks, 6 issues, 5 assumptions, 4 change requests |
| Governance | 5 threshold rules evaluated (30 checks → **5 live breaches**), acknowledged alert backlog |
| Delivery | Deliverables, quality records, meetings, stakeholders, vendors, documents |
| Connect | 8 integration connectors (1 ACTIVE, rest honestly DISCONNECTED/CONFIGURING), 1 webhook, AI connector + sample AI execution |
| Engagement | Inbox items, notifications, focus planner for all 12 users |
| Admin | 14 templates with version history |
| Leadership | 6 register decisions (incl. 1 overdue CRITICAL vendor amendment), 5 action items, 5 strategic KPIs |

The seed runs the **real engine cascade** (CPM reschedule → timesheet approvals →
actuals roll-up → EVM calibration → health snapshots → governance evaluation →
automations), so all derived numbers are consistent with source data — exactly what
a production deployment would compute.

## 4. Experiencing the intended story

1. Log in as `pmo@pmct.io` → **Leadership Control Tower** (`#/reports/leadership`):
   the tower shows red/amber/grey classification, the exception feed puts the
   overdue DEC-101 vendor-contract decision first, insights cite their source
   entities, and the validation grid flags genuine data gaps.
2. Drill into `PRJ-DATA-002` (RED): health 10-ish, schedule slippage, critical
   risks/issues — the Executive Status Report proposes leadership actions with
   WHAT/WHO/BY-WHEN/IF-NO-DECISION.
3. As `ceo@pmct.io`: record the DEC-101 decision (gate.decide) → watch the tower
   exception feed clear it on the next load.
4. As `liam@pmct.io`: file a timesheet → as `program@pmct.io` approve it → actuals
   and EVM shift → governance may raise alerts → the tower reflects the change.
5. Generate a **Leadership Pack**, then change something and generate another —
   History compares versions headline-to-headline.

## 5. Customizing / replacing the data

| Goal | How |
|---|---|
| Deploy **empty** | `./deploy/setup.sh --no-seed` (bare metal) or run `prisma db push` without seeding (Docker: enter container, `bunx prisma db push` on an emptied volume) |
| Load **your organization** | Use the Import/Export dropdowns (13 importable entities, dry-run first): export a module's CSV as template → fill → import. Recommended order: portfolios → programs → projects → users/resources → tasks/milestones → RAID/financials |
| Keep reference data as sandbox | Create your real portfolios/projects alongside, then disable reference accounts you don't need (Admin → Users) |
| **Wipe and re-seed** | `bun run db:seed` — ⚠ destroys current data |
| Reset one password | `bun scripts/reset-password.ts <email> <newpass>` |

> Rename suggestion: the seeded domain (`pmct.io` emails) is a neutral placeholder.
> For customer-facing demos, create your own users and update profile fields via
> Admin → Users; reference accounts can be deactivated at any time.
