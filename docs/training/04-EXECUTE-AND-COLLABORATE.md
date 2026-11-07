# 04 · Execute & Collaborate

> Audience: team leads, team members, PMs · Time: 30 minutes
> Prerequisite: modules 01 & 03 · Screens: Execute group + Strategy & Knowledge

## Learning objectives

Run the daily delivery loop: boards, own tasks, timesheets, the Work Inbox and
Focus Planner — plus the collaboration surfaces (docs, boards, proofing,
feedback) that keep knowledge in the platform.

---

## 1. Boards (`#/boards`)

Kanban execution of the plan:

- Columns mirror task status (To Do → In Progress → In Review → Done).
- **Drag a card** between columns — status updates flow to EVM, health and
  dashboards instantly.
- Cards show owner, project, priority and due date; overdue cards are marked.
- Filter by project, owner or swimlane (assignee/team).

> The same board engine powers Agile Delivery (`#/agile`) with sprints for
> teams that prefer sprint cadence over continuous flow.

## 2. Resources (`#/resources`)

Capacity management for the PMO:

- Each resource has a capacity (h/week) and current allocation from task
  assignments.
- The view highlights **over-allocations** (>100% load) — the same hot spots
  surface on the Executive dashboard.
- Use Planning Lab → Resource leveling for prescriptions on how to rebalance
  without breaking the critical path.

## 3. Timesheets (`#/timesheets`) — the fuel line

Timesheets convert effort into cost and earned value. Every downstream number
(actual cost, CPI, budget burn, freshness) depends on them.

**As a team member:**
1. Open Timesheets — the week grid shows your assigned tasks.
2. Enter hours per day; add a note where useful.
3. **Submit** for approval. Your entry locks to edits until returned.

**As an approver (PM/PMO):**
1. Open the approvals queue — submissions by person and project.
2. Check hours against plan; **approve** or **return with comment**.
3. Approved hours immediately:
   - post actual cost (Financials),
   - update earned value (EVM),
   - refresh data-freshness scores (Integrity),
   - fire `TIMESHEET_APPROVED` automations (e.g. notify finance).

> Training message to repeat: **no timesheets = the platform goes blind.**
> Freshness rails turn "timesheet hygiene" into a visible, scored KPI.

## 4. Work Inbox (`#/inbox`)

The personal action list — the default home for delivery roles:

- Everything awaiting **you**: task assignments, approvals, review requests,
  gate decisions, mentions.
- Work top-down; each item deep-links to its record.
- Empty inbox = nothing pending on you today.

## 5. Focus Planner (`#/planner`)

A personal time-blocking view over your tasks and meetings:

- See your week, drag tasks into focus blocks.
- Balances planned effort against capacity so you over-commit consciously.
- Pairs with Timesheets: plan the week on Monday, log it on Friday.

## 6. Field Operations (`#/field`)

For site/field teams: capture progress, observations and photos against tasks
from the field; updates attach to the project record and feed health.

## 7. Strategy & Knowledge

| Screen | Use it for |
|--------|-----------|
| **Docs & Knowledge** (`#/docs`) | Policies, SOPs, lessons learned — versioned, searchable from `⌘K` |
| **Message Boards** (`#/boards-hub`) | Topic discussions per project/program (async status, decisions) |
| **Proofing & Approvals** (`#/proofing`) | Review deliverables with markup; approve/reject with an audit trail |
| **Feedback & Roadmap** (`#/feedback`) | Collect ideas, triage into the product/project roadmap |

All four are permission-gated and searchable — the point is *tribal knowledge
becomes institutional knowledge*.

## 8. Notifications (`#/notifications`)

Everything the platform pushed at you — mentions, approvals, alert breaches,
gate requests. Each notification deep-links to its record; the bell icon shows
the unread count.

## 9. Exercise (15 min) — a day in the life of a team member

1. Log in as `liam@pmct.io` (Technical Lead). Your home is the Work Inbox.
2. Open your assigned tasks; move one on the board to In Progress.
3. Open Timesheets — log 6h today on your task; **submit**.
4. Log in as `pm.sarah@pmct.io` → approve Liam's timesheet.
5. Back as Liam: check the Integrity screen (`#/integrity`) — did the freshness
   score for your project improve? (Approvals are the #1 freshness driver.)
6. Post a status update on the project's Message Board; `⌘K` to find it again.

**Discussion**: you just fed cost, EVM, health, freshness and reporting with
three clicks. What happens to the executive dashboard tonight?

## 10. Key takeaways

- Boards and inbox = the daily loop; timesheets = the trust layer beneath every
  financial and EVM figure.
- Approvals cascade: timesheet → cost → EVM → alerts → automations → dashboards.
- Keep knowledge in Docs/Boards/Proofing so `⌘K` finds it, not your inbox.
