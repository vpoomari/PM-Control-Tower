# 07 · Automations & Administration

> Audience: PMO admins, platform owners · Time: 30 minutes
> Prerequisite: modules 01–05 · Screens: Connect group + Administration group

## Learning objectives

Configure the platform for your organisation: roles and permissions, custom
fields and form layouts, cross-entity automations, integrations/webhooks — and
verify everything through the audit trail.

---

## 1. Control Automations (`#/automations`) — the cross-entity engine

Rules that let entities react to each other automatically. Eleven triggers:

| Trigger | Typical use |
|---------|-------------|
| `TASK_OVERDUE` | Notify owner + escalate to PM after N days |
| `TIMESHEET_SUBMITTED` | Ping approver; warn if > 7 days unapproved |
| `TIMESHEET_APPROVED` | Notify finance; update cost alerts |
| `HEALTH_CHANGED` | Red project → summon PMO + sponsor note |
| `EVM_BREACH` | CPI/SPI < threshold → corrective-action workflow |
| `RAID_CREATED` | CRITICAL risk → notify program board |
| `CHANGE_REQUESTED` | Route CR to approver chain |
| `MILESTONE_MISSED` | Alert sponsor; flag on dashboards |
| `SCHEDULE_CHANGED` | Recompute impacts; notify dependents |
| `STATUS_CHANGED` | Phase transitions → trigger gates/notifications |
| `MANUAL` | On-demand run from a record |

Actions cover notifications, RAID/alert creation, governance updates and
webhook calls; **conditions** scope a rule ("only CRITICAL", "only portfolio X")
and every execution is logged.

**Scan now** (`/api/automations/scan`) evaluates rules across the portfolio with
24-hour deduplication — safe to run repeatedly, no duplicate storms.

## 2. Integration Hub (`#/integrations`)

Connected systems (email, chat, ticketing, ERP connectors): configure
credentials, sync direction and health. The CTO Tower (`#/technology`) monitors
integration/technical health.

## 3. Webhooks (`#/webhooks`)

Event subscriptions for your own systems: register an endpoint, choose event
types (project updated, alert created, gate decided…), inspect delivery
history with retry status. This is how the Control Tower feeds external data
warehouses or chatops.

## 4. AI Connector Gateway (`#/ai-gateway`) & Extension Hub (`#/extensions`)

- **AI Gateway** governs which AI connectors may run, with keys, limits and
  audit — AI actions stay supervised.
- **Extension Hub** manages optional platform extensions.

## 5. Administration (`Administration` group)

| Screen | Purpose |
|--------|---------|
| **Users** (`#/admin/users`) | Create/disable users, assign roles, reset passwords |
| **Roles & Permissions** (`#/admin/roles`) | Role templates + custom roles; permission matrix editor |
| **PMO Template Library** (`#/admin/templates`) | Organisational templates (WBS skeletons, report templates, gate criteria) |
| **Audit Trail** (`#/admin/audit`) | Immutable log: who changed what, when, before/after |
| **Control Center** (`#/admin-center`) | Platform health & config overview |
| **Configuration** (`#/admin/settings`) | Org settings, calendars, thresholds, RAG rules |
| **Field Dictionary** (`#/admin/fields`) | Dynamic custom fields per entity |
| **Form Tab Builder** (`#/admin/tabs`) | Arrange form tabs per entity type |

## 6. Roles — the eight templates

EXECUTIVE (100) · PMO_ADMIN (90, `*`) · PORTFOLIO_MANAGER (80) ·
PROGRAM_MANAGER (70) · PROJECT_MANAGER (60) · FINANCE (60) · AUDITOR (50,
read-only + audit) · TEAM_MEMBER (20).

Each carries a permission set (e.g. `executive.view`, `evm.manage`,
`timesheet.approve`, `gate.decide`). Custom roles mix permissions from the
matrix. Super admins (`*`) see everything.

> Teaching point: permissions gate the **menu**, the **UI actions** and the
> **API** — three layers, same source of truth.

## 7. Field Dictionary & Form Tab Builder — adapt without code

1. **Field Dictionary**: add a custom field to any entity — e.g. "Client Region"
   (select: EMEA/APAC/AMER) on Projects, or "Carbon Estimate" (number) on
   Tasks. Fields become filterable, reportable and API-visible instantly.
2. **Form Tab Builder**: reorganise entity forms into tabs that match your
   process — e.g. Project form → *General | Delivery | Commercial | Custom*.
3. No deployment needed — configuration is live for all users immediately.

## 8. Audit Trail — the accountability layer

Every create/update/delete and governance decision is recorded with actor,
timestamp and before/after snapshots. Filter by entity, user or action. During
incidents or audits, this screen answers "who changed this and when" in seconds.

## 9. Exercise (15 min) — configure like a PMO admin

1. Log in as `pmo@pmct.io`.
2. **Automations** → create: trigger `EVM_BREACH`, condition CPI < 0.90, action
   → notify finance + create alert. Run **Scan now** — check the execution log.
3. **Roles** → inspect the TEAM_MEMBER template — which permissions does it
   hold? Which screens disappear for Liam because of that?
4. **Field Dictionary** → add "Client Region" (select) to Projects.
5. **Form Tab Builder** → move it onto a "Commercial" tab of the Project form.
   Open a project — verify the field is live.
6. **Audit Trail** → find your own changes from this session.

**Discussion**: step 4–5 extended the data model and UX in under a minute with
no code and no deployment. What would your organisation configure first?

## 10. Key takeaways

- Automations connect entities: one event can cascade across the portfolio,
  deduplicated and audited.
- Roles = least privilege; Field Dictionary + Tab Builder = adapt without code.
- The Audit Trail makes the whole platform accountable by default.
