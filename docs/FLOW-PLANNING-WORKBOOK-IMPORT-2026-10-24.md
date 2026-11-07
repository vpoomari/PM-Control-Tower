# FLOW planning workbook import — 2026-10-24

## Source and target

- **Source workbook (read-only):** `F:\PM Control Imported Data\202601020 - Project Flow - Planning Q4 2026 - MA.xlsx`
- **Source tabs loaded:** `Plan`, `RAID`, `Critical path`. `Pivot MA` is a pivot summary, not an operational record set, and was not imported.
- **Target project:** `PRJ-CZR-FLOW` — FLOW - Enterprise Transformation
- **Portfolio / program linkage:** `PTF-CZR-FLOW` → `PRG-CZR-FLOW` → `PRJ-CZR-FLOW`
- **Database safety snapshot:** `backups\custom-before-flow-workbook-20261024-150531.db` (before first apply; later correction snapshots also retained alongside it)
- **Import implementation:** `scripts\import-flow-workbook.py` (dry-run by default; `--apply` for writes). The source workbook is never modified.
- **Repeatable source-to-database verifier:** `python scripts\verify-flow-workbook-import.py`

## Loaded records and links

| Record set | Imported | Linkage / mapping |
|---|---:|---|
| Portfolio / program / project | 1 / 1 / 1 | Project links to program and portfolio; no project-wide owner is claimed because the workbook does not specify one |
| WBS | 35 nodes | 5 workstream summary nodes + 30 substream work packages |
| Plan activities | 329 | Every activity has its supplied FLW code, dates where supplied, priority/status, WBS link, and owner linked to an existing `User` account |
| Internal task dependencies | 76 | Valid predecessor/successor task links, Finish-to-Start, zero lag |
| External task dependency references | 3 | `HSO`, `Avalara`, `Kyriba processes` retained in FLW-120 notes; no fictional task records created |
| Risks | 15 | `R-001` etc.; likelihood and impact labels mapped to the platform's 1–5 numeric scale; mitigation and source context retained |
| Issues + RAID dependencies | 7 | 3 source issues + 4 source dependency records; dependencies tagged with category `DEPENDENCY` and their source record type retained in description |
| Assumptions | 4 | `A-017` etc.; `To Validate` mapped to `TO_VALIDATE`; source workstream and description retained |
| Critical-path stages | 10 | Imported as critical milestones `FLOW-CP-01`…`FLOW-CP-10`, with source outcome and lead in the description |

The schedule date range is **2026-04-01 through 2028-03-31**. Task duration is
derived inclusively from provided start/end dates; rows without dates use the
model default of one day. Source comments become task descriptions; phase and
date-basis metadata are retained in task notes. The 52 rows with blank
status/priority use `NOT_STARTED` / `MEDIUM`; supplied values are preserved.

## Execution / Planning Lab verification

Read-only GET requests returned HTTP 200 for:

- `/api/projects/{id}` — project record and dates
- `/api/projects/{id}/tasks` — 329 tasks
- `/api/projects/{id}/schedule` — 329 tasks, 76 dependencies; all 329 tasks have WBS and assignee links; all dependency predecessor/successor relations resolve
- `/api/projects/{id}/tools/diagnostics` — 329 leaf tasks, live schedule diagnostics, project dates
- `/api/projects/{id}/tools/leveling` — response loads successfully
- `/api/projects/{id}/calendar` — (calendar is not configured; the API correctly supplies its documented default preview)

The Planning Lab project picker showed `PRJ-CZR-FLOW`; Schedule Doctor showed
329 schedulable tasks and populated findings. Schedule critical-path flags are
left unset (0) until a schedule recalculation is explicitly run. **No scheduler
recalculation was run or persisted for this import.** The workbook's explicit
critical-path stage sheet is represented by the 10 critical milestones above.

Resource Leveling reports zero active resource assignments. The workbook has
task owners, but it supplies no resource capacity, effort, allocation
percentages, or planned hours; owners were linked to user accounts without
inventing staffing loads. Add validated effort/capacity data before using
resource leveling prescriptions.

## Database verification

Post-commit checks confirmed:

- portfolio/program/project join is valid;
- 329/329 tasks link to a valid WBS node and existing owner account;
- all 76/76 task dependencies resolve to tasks in this project;
- 15 risks, 7 issues (including the 4 RAID dependencies), 4 assumptions, 10 milestones;
- one append-only `FLOW_WORKBOOK` audit event per apply attempt (the import was re-applied idempotently while correcting the distinction between task priority and computed critical-path flags, and leaving project-wide ownership unspecified).

The dedicated verifier passes: 329 source IDs/statuses/priorities/dates/owners,
35 WBS nodes, 76 dependency edges, RAID counts, and 10 critical-path milestones
all match the live database. The older `scripts\final-verify.ts` targets a
previous project ID and therefore is not a valid validator for this new import.

The loader is transaction-wrapped and idempotent by business code. It writes
through SQLite directly for this bulk load and does not call the API's reschedule
mutation. It takes a database snapshot before each `--apply`.


## Date storage note (discovered 2026-10-26)

The loader writes dates through SQLite directly as **ISO-8601 text**
(`2026-10-26T00:00:00Z`), while Prisma reads and writes DateTime columns as
**epoch-millisecond integers**. Both formats deserialize correctly into a
JavaScript `Date`, so every read path works � but SQLite cannot compare a TEXT
value with an INTEGER parameter: `endDate <= <int>` is always false for text
rows (and `>=` always true). Any Prisma `lt/lte/gt/gte` predicate on a date
column therefore silently returns the wrong set for imported rows.

Affected and corrected (date windowing moved to JS, `not: null` in SQL):

- `src/lib/notificationData.ts` � daily reminder collection
- `src/app/api/automations/scan/route.ts` � overdue tasks / missed milestones
- `src/app/api/reports/executive/route.ts` � overdue milestone list + count
- `src/app/api/assistant/route.ts` � milestones due in the next 30 days

**Rule for new code:** when a query filters on a date column that may contain
imported rows, keep only storage-agnostic SQL predicates (`not: null`, status,
ownership) and apply the date window in JavaScript. Do not "fix" this by
reformatting the stored dates � `scripts/verify-flow-workbook-import.py`
validates the imported values as written.
