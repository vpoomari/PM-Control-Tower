# 01 · Platform Orientation

> Audience: everyone · Time: 20 minutes · Prerequisite: none

## Learning objectives

By the end of this module you can log in, navigate by permission-aware menu,
explain the portfolio hierarchy, and find any record in four clicks or fewer.

---

## 1. What the platform is

PM Control Tower is a single enterprise system for managing the full delivery
lifecycle:

```
PORTFOLIO  →  PROGRAM  →  PROJECT  →  WBS  →  TASKS  →  SCHEDULE
     ↑                                                     ↓
 BUDGETS / INVESTMENT          EVM · HEALTH · RAID · CHANGES · GATES
     ↑                                                     ↓
 LEADERSHIP REPORTING  ←  GOVERNANCE  ←  FINANCIALS  ←  ACTUALS/TIMESHEETS
```

Everything on a dashboard originates from operational records entered by the
team — there are no "manual" dashboard numbers.

## 2. Logging in

1. Open `http://localhost:3000` (or the deployed URL).
2. Enter your email and password. Seeded demo accounts (password `Pmct@2026`):

| Email | Person | Role |
|-------|--------|------|
| `ceo@pmct.io` | Alexandra Chen | Executive |
| `pmo@pmct.io` | Jordan Blake | PMO Administrator (super admin) |
| `portfolio@pmct.io` | Priya Nair | Portfolio Manager |
| `program@pmct.io` | Marcus Webb | Program Manager |
| `pm.sarah@pmct.io` | Sarah Okafor | Project Manager |
| `pm.david@pmct.io` | David Kim | Project Manager |
| `finance@pmct.io` | Elena Rodriguez | Finance Controller |
| `auditor@pmct.io` | Thomas Reed | Auditor |
| `liam@pmct.io` … `mia@pmct.io` | Liam, Ava, Noah, Mia | Team Members |

3. Your **home screen is chosen by your permissions** — executives land on the
   Executive Control Tower, delivery roles land on their Work Inbox, read-only
   roles land on Reports. You always start where you can act.

## 3. The screen anatomy

- **Top bar** — global search (`⌘K` / `Ctrl+K` searches projects, tasks, risks,
  docs and people), quick-create (`+`), notifications, help, avatar menu.
- **Left navigation** — grouped by lifecycle phase; items appear only if your
  role holds the required permission. A greyed-out world does not exist: if you
  cannot see it, your role is not meant to use it.
- **Content area** — every list supports filters, every form validates inline,
  every drawer saves without leaving the page.
- **Live badges** — green "Live · HH:MM" chips show when data was last
  generated; the platform updates dashboards in real time as teammates act.

## 4. Navigation groups (what lives where)

| Group | Purpose | Key screens |
|-------|---------|-------------|
| **Executive** | Portfolio command center | Executive Control Tower |
| **Portfolio** | Strategy hierarchy | Portfolios, Programs, Projects |
| **Plan** | Build the plan | Register, Requirements, WBS, Tasks, Agile, Schedule, Milestones, Baselines, Planning Lab |
| **Execute** | Run the work | Boards, Resources, Timesheets, Work Inbox, Focus Planner |
| **Control** | Performance & governance | Financials, Clients, Field Ops, Investment, EVM, Health, RAID, Changes, Gates, Governance, Integrity, CTO Tower, Prioritization |
| **Strategy & Knowledge** | Collective intelligence | Feedback & Roadmap, Docs, Message Boards, Proofing |
| **Intelligence** | Reporting & AI | Leadership Tower, Reports, Reporting Center, Analytics, AI Assistant |
| **Connect** | Automation & integrations | Integration Hub, Automations, Notifications, Webhooks, AI Gateway, Extensions |
| **Administration** | Platform control | Users, Roles, Templates, Audit Trail, Control Center, Configuration, Field Dictionary, Form Tab Builder |

## 5. The vocabulary (memorise these seven words)

| Term | Meaning |
|------|---------|
| **Baseline** | The approved snapshot of scope, schedule and cost — the yardstick for variance. |
| **EVM** | Earned Value Management — integrates scope, schedule and cost into CPI/SPI indices. |
| **RAG** | Red/Amber/Green health status of a project. |
| **RAID** | Risks, Assumptions, Issues, Dependencies — the exposure register. |
| **Stage Gate** | A governance checkpoint where a board decides: pass, hold, or fail. |
| **Change Request (CR)** | A governed proposal to alter scope/schedule/cost with impact analysis. |
| **Integrity / Freshness** | A 0–100 score telling you how current a project's feeds are. |

## 6. Hands-on exercise (5 min)

1. Log in as `pm.sarah@pmct.io` (Project Manager). Note your home screen.
2. Find **Planning Lab** in the menu; note which groups you *cannot* see.
3. Log out, log in as `ceo@pmct.io`. Compare the menu — which items appeared?
   Which disappeared?
4. Press `⌘K`, type `FLOW`, and open the PRJ-CZR-FLOW project from search.

**Discussion**: why does the platform hide screens instead of disabling buttons?
*(Answer: least-privilege — the menu itself is the first line of access control,
backed by server-side permission checks on every API call.)*

## 7. Key takeaways

- Your role decides your home screen **and** your menu — the product adapts to you.
- Global search (`⌘K`) is the fastest path to any record.
- Learn the seven vocabulary words; every module in this curriculum builds on them.
