# Field Dictionary & Dynamic Field Configuration — Guide

> PM Control Tower v3.1.0 · Added 2026-10-30 · Status: implemented, tested, browser-verified
>
> Define a custom field **once** in a governed dictionary, then reuse it across any
> of the **23 supported modules**, with per-module configuration and typed values
> stored against the correct records. No code changes, no schema migrations, no
> duplicate fields.

---

## 1. What it solves

Before this capability, adding a field meant a code change (Prisma model column +
UI + export + search). The Field Dictionary makes fields **configuration, not
code**: an admin defines "Delivery Confidence" once, assigns it to Projects and
Risks, and every list view, record sheet, filter, CSV export and global search
picks it up automatically — with per-module settings (label, section, required,
visibility, sensitivity) and a full audit trail.

**Key properties**

| Property | Behaviour |
|---|---|
| Define once, reuse everywhere | One `CustomFieldDefinition` can be assigned to any subset of the 23 modules; values stay isolated per module + record |
| Typed values | 17 data types mapped to correctly-typed SQLite columns (`valueText` / `valueNumber` / `valueDate` / `valueBool` / `valueJson`) |
| Non-destructive | Removing an assignment or deprecating a field **keeps** stored values; destructive delete is refused (409) while values exist unless explicitly purged |
| Immutable key | `fieldKey` can never change after creation (renaming a key would orphan every stored value) |
| Governed | RBAC + field-level sensitivity gates on view and edit; every lifecycle action and value write is audited |
| Legacy compatible | The existing v3.2 `CustomFieldDefinition` model was **extended**, not replaced; legacy Tab-Builder `Project.customData` is merged on read for the `project` module |

---

## 2. Architecture — three layers

```
┌────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Global dictionary        CustomFieldDefinition (+Category)│
│   "Delivery Confidence" — TEXT, ACTIVE, sensitivity INTERNAL, …      │
├────────────────────────────────────────────────────────────────────┤
│ Layer 2 — Per-module assignment    ModuleFieldAssignment            │
│   Projects → section "general", required, shown in table            │
│   Risks    → section "analysis", optional, form-only                │
├────────────────────────────────────────────────────────────────────┤
│ Layer 3 — Per-record values        CustomFieldValue                 │
│   (fieldDefinitionId, moduleKey, recordId) → typed value columns    │
└────────────────────────────────────────────────────────────────────┘
        + FieldAuditLog  — every CREATE / UPDATE / ASSIGN / VALUE_SET / DELETE
        + FieldCategory  — dictionary grouping (governance, delivery, …)
```

- **Layer 1** lives in `src/lib/engines/field-dictionary.ts` (pure engine:
  validation, pack/unpack, formula evaluation, RBAC gates, impact analysis) and
  `src/lib/fields/store.ts` (Prisma persistence).
- **Layer 2** is what makes a field *visible in a module*: a module only shows
  dictionary fields that have an assignment row. Assignment settings
  (section, sort order, required, read-only, in-form/in-table/in-detail,
  filterable/sortable, display-label override) are per module and do not
  disturb the global definition.
- **Layer 3** keys values by `(fieldDefinitionId, moduleKey, recordId)` — the
  same field assigned to Projects and Risks stores completely separate values
  for a project record and a risk record.

### Data model (SQLite, via `prisma db push` — no migrations folder in this repo)

| Table | Purpose |
|---|---|
| `CustomFieldDefinition` | *(extended v3.2)* the global field: key, label, type, options/config, sensitivity, status, flags |
| `FieldCategory` | dictionary categories |
| `ModuleFieldAssignment` | Layer 2: one row per (field, module) with per-module display rules |
| `CustomFieldValue` | Layer 3: typed value columns per (field, module, record) |
| `FieldAuditLog` | audit entries: action, before/after JSON, actor, module, links to definition and assignment |

Values are packed into the type-correct column (`TEXT→valueText`,
`INTEGER/DECIMAL/CURRENCY/PERCENTAGE/FORMULA→valueNumber`,
`DATE/DATETIME→valueDate`, `CHECKBOX→valueBool`, `MULTI_SELECT/JSON→valueJson`),
which keeps numeric sorting and range filters native to SQLite.

---

## 3. The 23 supported modules

| Area | Modules |
|---|---|
| Portfolio | `portfolio`, `program`, `project` |
| Plan | `requirement`, `wbs_node`, `task`, `milestone`, `baseline` |
| Execute | `resource`, `timesheet`, `timesheet_entry` |
| Control | `budget_line`, `evm_period`, `health_snapshot`, `risk`, `issue`, `assumption`, `change_request`, `stage_gate`, `governance_rule`, `governance_alert` |
| Administration | `user`, `audit_trail` |

Each module declares its own view/manage permissions (e.g. `raid.manage` for
risk/issue/assumption, `wbs.manage` for tasks/WBS nodes, `timesheet.own` +
ownership for timesheets) and its allowed form sections. Unsupported
combinations (e.g. `ENTITY_LOOKUP` on `user`/`audit_trail`) are rejected at
assignment time by the registry.

## 4. The 17 field types

| Group | Types |
|---|---|
| Text | `TEXT`, `LONG_TEXT`, `URL`, `EMAIL`, `PHONE` |
| Number | `INTEGER`, `DECIMAL`, `CURRENCY`, `PERCENTAGE` |
| Date | `DATE`, `DATETIME` |
| Choice | `CHECKBOX`, `SINGLE_SELECT`, `MULTI_SELECT` (selects use dictionary `options`) |
| Reference | `USER_LOOKUP`, `ENTITY_LOOKUP` (validated against live records) |
| Computed | `FORMULA` (server-computed, read-only; safe arithmetic evaluator — no arbitrary code) |

---

## 5. Admin guide — the dictionary screen

**Route:** `#/admin/fields` (Administration → Fields) · **Permission:** `admin.config`

- **New Field** — name, label, immutable key (auto-derived from the label,
  editable until created), type, category, options (for selects), sensitivity,
  status, description, and the flags `isSearchable` / `isExportable` /
  `isRequired` / `isReadOnly`.
- **Edit** — everything except the key. Changing the **type** runs an impact
  analysis first: if stored values exist, saving requires an explicit
  acknowledgement (typed confirmation in the dialog) and is audited as
  `TYPE_CHANGED`.
- **Duplicate** — clones the definition with a new key (`…-copy`), never the values.
- **Deprecate / Archive** — soft states. Existing values remain readable
  everywhere; **new writes are blocked**; the field stays in exports for
  historical fidelity (deprecated) or is hidden from new assignments (archived).
- **Delete** — refused with **409** while any stored value exists
  ("deprecate instead"); an explicit `?purgeValues=true` delete (audited)
  removes values first. Empty fields delete normally.
- **Categories tab** — create/rename/reorder dictionary categories; deleting a
  category keeps its fields (they simply lose the category link).
- **Impact & usage** — for any field: which modules it is assigned to, how many
  assignments, how many stored values, per-module value counts, and the audit
  trail (CREATE / UPDATE / ASSIGN / ASSIGNMENT_UPDATE / VALUE_SET / DELETE).

## 6. Module guide — using fields in a module

Every module view (all 23) has, next to its title:

- **Add Field** — search the global dictionary (by name, key, description or
  category), multi-select fields, bulk-add. Already-assigned fields are marked
  "In this module" and skipped; duplicates are reported, never double-assigned.
  Requires the module's manage permission **or** `admin.config`.
- **Configure Fields** — per-module settings for assigned fields: section,
  order, required, read-only, visibility, and where the field appears
  (form / table / detail), plus filters. Includes **Remove from module**
  (keeps values — they stay in exports and impact views).
- **Record row → "Custom fields" button** — a side sheet with the module's
  fields for that one record, rendered with the right control per type
  (date picker, currency, multi-select, user picker, …). Required fields are
  enforced; deprecated/archived fields are shown read-only with their value
  preserved. The sheet refreshes each time it opens.
- **Table columns** — assignments flagged "in table" appear as real columns in
  the module's data table, type-formatted and sortable where the type allows.
- **Detail dialogs / panels** — assignments flagged "in detail" render in
  record detail surfaces (for card-grid views such as Portfolios, in the
  detail-dialog footer).

### Cross-cutting integrations

- **CSV export** (`/api/export/{entity}`) — custom columns are appended, headed
  by the display label, for fields flagged exportable.
- **Global search** (`/api/search`) — searchable TEXT-ish values surface in a
  dedicated **Custom fields** result group with a direct route to the owning
  record.
- **Command palette** (⌘K / Ctrl-K) — the same Custom-fields group, each hit
  navigating straight to the record in its module.

---

## 7. API reference

All routes use the platform wrappers (`withApi` → auth + RBAC + rate limit,
`ok()/fail()`, `writeAudit`, realtime `field:changed` events). Responses are
`{ success, data }` / `{ success, error }`.

| Method & path | Purpose |
|---|---|
| `GET /api/field-dictionary` | list/search definitions (`q`, `status`, `type`, `category`, `module`, paging) |
| `POST /api/field-dictionary` | create definition (409 on duplicate key) |
| `GET/PATCH/DELETE /api/field-dictionary/[id]` | read / edit (impact-gated) / guarded delete (`?purgeValues=true`) |
| `GET /api/field-dictionary/[id]/impact` | impact analysis: modules, assignments, value counts |
| `GET /api/field-dictionary/audit` | audit entries (filter by field or module) |
| `GET/POST /api/field-categories` · `PATCH/DELETE /api/field-categories/[id]` | category CRUD |
| `GET/POST /api/modules/[moduleKey]/fields` | list assignments / bulk assign from dictionary (duplicates skipped + reported) |
| `PATCH/DELETE /api/modules/[moduleKey]/fields/[assignmentId]` | per-module settings / remove assignment (values retained) |
| `GET/PUT /api/modules/[moduleKey]/values?recordIds=…` | bulk read / typed write for visible records |
| `GET/PUT /api/modules/[moduleKey]/[recordId]/values` | single-record read / write (timesheet ownership honoured) |
| `GET /api/field-options/[entity]` | lookup options for `ENTITY_LOOKUP` fields |

Example — assign a field to two modules and set a value:

```bash
# 1) define once
curl -X POST /api/field-dictionary -d \
  '{"name":"Delivery Confidence","label":"Delivery Confidence",
    "fieldKey":"ui_delivery_confidence","dataType":"TEXT"}'

# 2) reuse on Projects and Risks (same definition id)
curl -X POST /api/modules/project/fields -d '{"entries":[{"fieldId":"<id>"}]}'
curl -X POST /api/modules/risk/fields    -d '{"entries":[{"fieldId":"<id>"}]}'

# 3) typed value against the right record
curl -X PUT /api/modules/project/<projectId>/values \
  -d '{"values":{"ui_delivery_confidence":"On track for Q3 gate"}}'
```

---

## 8. Governance & security

- **Permissions** — dictionary administration requires `admin.config`; module
  assignment and value writes require the module's manage permission **or**
  `admin.config` (enforced at the API route *and* again in the store as
  defence-in-depth; timesheets additionally honour `timesheet.own` ownership).
  No new RBAC permission was introduced, so `sync:rbac` stays untouched.
- **Sensitivity** — a field may carry multiple classifications (e.g. INTERNAL +
  PERSONAL_DATA); on **writes every classification must pass** (strictest wins),
  and PERSONAL_DATA/CONFIDENTIAL fields require an explicit editable-role grant
  even when no roles are configured. Views are gated by the visible-roles list.
- **Immutable key** — `fieldKey` is rejected (409) on any rename attempt.
- **Non-destructive lifecycle** — deprecate/archive keep values readable;
  unassigning keeps values; delete refuses while values exist (409) unless an
  audited purge is explicitly requested.
- **Audit** — every definition change (before/after JSON), assignment change,
  and value write (one row per field touched, linked to the definition) lands
  in `FieldAuditLog` with actor, role and module.

---

## 9. Testing

| Suite | Command | Result (2026-10-30) |
|---|---|---|
| Engine unit tests | `npm run test:engines` | 27/27 pass |
| DB integration tests | `npm run test:integration` | 11/11 pass |
| Full suite | `npm run test` | **198/198 pass** |
| HTTP smoke (live server) | `node scripts/smoke-fields.mjs` | **38/38 pass** |
| Type check | `npx tsc --noEmit` | exit 0 |
| Browser e2e | manual driver (login → create → assign → value → column/sheet/export/search/palette → reuse on 2nd module → delete guard → purge) | all pass; DB restored to pristine afterwards |

Notable bugs the tests caught and fixed during implementation: a missing module
permission gate plus an array-vs-CSV sensitivity bypass in the value writer; the
admin create schema rejecting the explicit `null`s the form always sends; the
record sheet rendering a stale snapshot when opened; value-audit rows not linked
to their field definition.

---

## 10. Backups & restore

Backups live in `backups/` and are date-stamped (`YYYYMMDD-HHMMSS`). See the
matching `BACKUP-REPORT-*.md` in that folder for checksums, contents and the
exact restore steps of each artifact. Summary:

| Artifact | Contents | Made by |
|---|---|---|
| `pmct-full-backup-<stamp>.zip` | source + docs + **consistent DB snapshot** + `.env` + manifest | `powershell -File scripts\backup-pair.ps1` |
| `pmct-app-backup-<stamp>.zip` | source + docs, **no database, no `.env`** (safe to share) | same run |
| `pmct-db-with-data-<stamp>.db` | DB-only snapshot (`VACUUM INTO`, safe while the app runs) | `npm run db:backup` |
| `pmct-db-schema-only-<stamp>.db` | DB schema with **zero rows** (structure only) | same run |

Restore in short: full zip → extract, point `DATABASE_URL` at the extracted
`db/custom.db`, `npm ci && npx prisma generate`, `npm run dev`. App zip →
extract, copy `.env.example` → `.env`, set `DATABASE_URL`, `npx prisma generate`,
`npx prisma db push`, optionally seed. DB pair → replace `db/custom.db` with
either file (schema-only needs `npx prisma db push --accept-data-loss` skipped —
the structure is already complete).

---

## 11. Limitations

- **Portfolio** renders as a card grid (no kit DataTable), so its custom fields
  appear in the detail dialog rather than as table columns; gates/audit/
  financials/EVM/health/timesheets/WBS views use hand-mapped table cells — same
  data and gates, not column spreads.
- **FORMULA** fields are server-computed and read-only in the sheet;
  `audit_trail` values are read-only by design.
- Dictionary administration rides on the existing `admin.config` permission and
  module assignment on each module's manage permission — no dedicated
  `fields.admin` permission exists yet (adding one would require an RBAC sync).
- Legacy `Project.customData` (Tab Builder) is merged on read for the `project`
  module only; it is not migrated into the dictionary automatically.
- Formula evaluation is intentionally arithmetic-only (safe evaluator, no
  arbitrary expressions/code execution).
