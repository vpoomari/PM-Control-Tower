# 02 — Administrator Guide

Audience: PMO administrators (`PMO_ADMIN` role) and platform operators.
All screens live under **Admin** in the sidebar; all actions are recorded in the
audit trail.

---

## 1. Users

**Admin → Users** (`#/admin/users`).

- Create users with email (login), name, title, department and one primary role.
- Roles can be changed at any time; deactivation preserves history while blocking
  login (`isActive=false`).
- Passwords: set at creation; users inherit the initial password you communicate —
  enforce change-on-first-login by sharing credentials over a secure channel and
  asking users to rotate immediately. Lost admin access is recoverable from the
  server: `bun scripts/reset-password.ts <email> <new-password>` (also un-locks
  locked accounts and writes an audit entry).
- Authentication details: JWT (12 h), bcrypt-hashed passwords, failed-login lockout.
  See the Security Guide.

### Roles

Eight system roles ship out of the box (full matrix in `docs/07-RBAC-MATRIX.md`):

`EXECUTIVE` · `PMO_ADMIN` (full access) · `PORTFOLIO_MANAGER` · `PROGRAM_MANAGER` ·
`PROJECT_MANAGER` · `FINANCE` · `TEAM_MEMBER` · `AUDITOR` (read-only).

Every API route enforces permission codes server-side; the UI hides screens the
session cannot use. Role assignments take effect on the user's next login/refresh.

---

## 2. Import & Export (data exchange)

Every module header carries an **Import/Export** dropdown. This is the recommended
path for loading your organization's data and for periodic extracts.

| Capability | Detail |
|---|---|
| **Export CSV / JSON** | 22 entities (portfolios, programs, projects, requirements, tasks, milestones, resources, risks, issues, assumptions, changes, budget lines, users, timesheets, EVM periods, gates, baselines, health snapshots, governance rules, alerts, audit events…). JSON export includes all fields. |
| **Import template** | One-row sample with the exact columns per importable entity. |
| **Import from CSV** | 13 master-data entities. Header normalization accepts human labels or keys (case-insensitive); unknown columns are dropped with a warning. |

Import flow (safe by design): **pick file → server dry-run validation (rolled-back
transaction, nothing written) → per-row result table → Apply** (transactional upsert
by business code, e.g. `ProjectCode+Code`). Empty cells leave existing values
unchanged; row caps (2000) protect the service. All imports/exports are audited and
broadcast a realtime `data:imported` event so every open view refreshes.

Typical adoption path: export the reference dataset as CSV templates → fill with your
organization's data → import portfolios → programs → projects → resources → tasks →
RAID/financials.

---

## 3. PMO template library

**Admin → Templates** (`#/admin/templates`).

14 seeded templates (methodologies, industries) with version history. Apply a
template to scaffold a new project's WBS/tasks/milestones/gates. The library is
extensible: create templates via the UI; an optional `PMCT_CONFIG_JSON` environment
bootstrap can pre-provision configurations on boot (contact your deployment operator).

---

## 4. Governance rules engine

**Control → Governance** (`#/governance`).

Rules define thresholds on live metrics (e.g. `SPI LT 0.9`, `CPI LT 0.95`) with scope
`GLOBAL` or per project/program/portfolio. **Evaluate** runs all active rules and:

- creates `AlertEvent`s (severity, metric value vs threshold),
- pushes `ACTION_REQUIRED` inbox items to responsible users,
- triggers project health recalculation.

Five rules are pre-seeded; the seeded dataset intentionally contains 5 breaches so the
engine's output is visible on day one. Acknowledge/resolve alerts from the alerts
panel; execution counts and last-triggered timestamps are tracked per rule.

---

## 5. Automations & integrations

**Connect → Automations** (`#/automations`): rule → conditions → actions with full
execution history (attempts, duration, input/output JSON, failure counts).

**Connect → Integrations** (`#/integrations`): connector registry (8 seeded examples)
with credential vault entries (masked), sync direction/frequency, health score and
per-connector event log. Status is honest by default — connectors are `DISCONNECTED`
until you configure credentials.

**Connect → Webhooks** (`#/webhooks`): subscribe external endpoints to platform events
(HMAC-SHA256 signing, retry policy, delivery log with response codes).

---

## 6. Audit trail

**Admin → Audit** (`#/admin/audit`): every create/update/delete, import, export,
login and governance action is recorded (who, what, before/after JSON, IP, user agent,
severity). Filter by entity, user, action, severity, date. Recommended practice:
export monthly (CSV) into your compliance archive. The trail is append-only through
the API.

---

## 7. Administrative CLI reference

Run from the project root (inside Docker: prefix with `docker compose exec app`).

| Command | Purpose |
|---|---|
| `bun scripts/reset-password.ts <email> <newpass>` | Reset a password, clear lockout, audit-logged |
| `bun run db:seed` | Re-seed the **reference dataset** — ⚠ wipes existing data (see seed script) |
| `bun scripts/seed-if-empty.ts` | Seed only when DB is empty (used by Docker entrypoint) |
| `npx prisma db push` | Apply schema changes (upgrades) |
| `deploy/backup.sh` / `restore.sh` | Database backup / restore |
