# 07 — RBAC Matrix (Roles × Permissions)

Source: `src/lib/rbac.ts` (`PERMISSION_CATALOG`, `ROLE_TEMPLATES`). Permissions are
enforced **server-side on every API route**; the UI mirrors them by hiding screens
and actions a role cannot use. Users may hold multiple roles; grants union.
`PMO_ADMIN` carries the `*` wildcard; `User.isSuperAdmin` bypasses all checks
(break-glass, use sparingly).

## Permission catalog (32)

| Code | Category | Description |
|---|---|---|
| `executive.view` | EXECUTIVE | View executive control tower and roll-ups |
| `reports.view` | EXECUTIVE | View reports and analytics |
| `portfolio.view` | PORTFOLIO | View portfolios |
| `portfolio.manage` | PORTFOLIO | Create and manage portfolios |
| `program.view` | PORTFOLIO | View programs |
| `program.manage` | PORTFOLIO | Create and manage programs |
| `project.view` | PROJECT | View projects |
| `project.manage` | PROJECT | Create and manage projects |
| `wbs.manage` | PLAN | Manage WBS, tasks, schedule, baselines |
| `schedule.manage` | PLAN | Manage schedule and dependencies |
| `baseline.manage` | PLAN | Create and activate baselines |
| `resource.view` | EXECUTE | View resources and capacity |
| `resource.manage` | EXECUTE | Manage resource register and assignments |
| `timesheet.own` | EXECUTE | Submit own timesheets |
| `timesheet.approve` | EXECUTE | Approve/reject team timesheets |
| `inbox.use` | EXECUTE | Use work inbox and focus planner |
| `financial.view` | CONTROL | View financials, budget, forecast |
| `financial.manage` | CONTROL | Manage budget lines and forecasts |
| `evm.view` | CONTROL | View EVM metrics |
| `evm.manage` | CONTROL | Create EVM snapshots |
| `raid.manage` | CONTROL | Manage risks, issues, assumptions |
| `change.manage` | CONTROL | Manage change requests |
| `gate.decide` | CONTROL | Decide stage gates |
| `governance.manage` | CONTROL | Manage governance rules and alerts |
| `integration.view` | CONNECT | View integration hub |
| `integration.manage` | CONNECT | Configure integrations and webhooks |
| `automation.manage` | CONNECT | Manage control automations |
| `ai.use` | CONNECT | Use AI PM Assistant |
| `admin.users` | ADMIN | Manage users and roles |
| `admin.templates` | ADMIN | Manage PMO template library |
| `admin.audit` | ADMIN | View audit trail |
| `admin.config` | ADMIN | System configuration |

## Role matrix

| Permission | EXEC (100) | PMO (90) | PfM (80) | PgmM (70) | PM (60) | FIN (60) | AUD (50) | TEAM (20) |
|---|---|---|---|---|---|---|---|---|
| executive.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| reports.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| portfolio.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| portfolio.manage | | | ✓ | | | | | |
| program.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| program.manage | | | ✓ | | | | | |
| project.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| project.manage | | | ✓ | ✓ | ✓ | | | |
| wbs.manage | | | | ✓ | ✓ | | | |
| schedule.manage | | | | ✓ | ✓ | | | |
| baseline.manage | | | | ✓ | ✓ | | | |
| resource.view | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| resource.manage | | | | ✓ | ✓ | | | |
| timesheet.own | | | | | ✓ | | | ✓ |
| timesheet.approve | | | | ✓ | ✓ | | | |
| inbox.use | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| financial.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| financial.manage | | | | ✓ | ✓ | ✓ | | |
| evm.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| evm.manage | | | | | ✓ | | | |
| raid.manage | | | | ✓ | ✓ | | | |
| change.manage | | | | ✓ | ✓ | | | |
| gate.decide | ✓ | ✓ | | | | | | |
| governance.manage | | | ✓ | | | | | |
| integration.view | | ✓ | | | | | ✓ | |
| integration.manage | | ✓ | | | | | | |
| automation.manage | | ✓ | | | ✓ | | | |
| ai.use | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| admin.users | | ✓ | | | | | | |
| admin.templates | | ✓ | | | | | | |
| admin.audit | | ✓ | | | | | ✓ | |
| admin.config | | ✓ | | | | | | |

*(EXEC = Executive, PMO = PMO Administrator `*`, PfM = Portfolio Manager,
PgmM = Program Manager, PM = Project Manager, FIN = Finance Controller,
AUD = Auditor, TEAM = Team Member.)*

## Behavioral consequences (examples)

- **Executive**: sees the Control Tower and every roll-up; can decide gates; cannot
  edit projects — the tower's "Leadership Actions" is the sanctioned write path.
- **Auditor**: read-only across delivery data **plus** the full audit trail.
- **Team Member**: project view, own timesheets, inbox — leadership bundle returns
  `403` (verified).
- **Program/Project Manager**: full planning + RAID + timesheet approvals, but no
  governance-rule or user administration.
- A session's exact grants are always visible via `GET /api/auth/me`
  (`roles` + `permissions` arrays).
