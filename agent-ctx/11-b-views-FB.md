# Task 11-b — views-FB (Execute + Control frontend)

Agent: views-FB
Scope: 11 view files under src/views/execute + src/views/control (+ local shared pickers). No API/lib changes.

## Contracts read
- worklog.md (view contract), registry.tsx (paths wired), kit.tsx primitives, client.ts (useApi/useRealtimeRefetch/api), router.ts, constants.ts.
- API shapes verified via curl (PMO + liam TEAM_MEMBER sessions): resources(+[id]), timesheets(list/detail/POST/submit/approve/reject/lock), inbox(+PATCH), planner(+POST/PATCH), financials(+?projectId, budget-lines), evm(+history/POST snapshot), health(+?projectId/POST recalc), risks/issues/assumptions, changes(+workflow), gates(+PATCH decision), governance/rules(+PATCH isActive), governance/evaluate, alerts(+PATCH), portfolios, projects, projects/[id]/tasks (key `items`).

## Key API facts encoded in UI
- Timesheet POST body: {resourceId?, weekStart, comments?, entries:[{entryDate,projectId,taskId?,activity?,startTime?,endTime?,breakMinutes,hours,overtimeHours?,billable,comments?}]} — create-or-update DRAFT, replaces entries. PATCH /api/timesheets/[id] {comments, entries}; DELETE only DRAFT/REJECTED; submit/approve/reject/lock POSTs; reject requires {reason}.
- Inbox GET: status param accepts only OPEN|DONE|DISMISSED — "ANY" must OMIT the param (400 otherwise). PATCH /api/inbox/[id] {status}.
- Resources GET summary keys: {totalCapacityWeekly, totalAllocatedWeekly, overallocatedCount} (no totalResources/totalCapacity).
- Planner POST: {title, entryType, date, startTime, endTime, durationMins, priority, projectId, taskId, estimatedHours, notes} — refs validated server-side.
- changes PATCH {status|decision}, workflow DRAFT→SUBMITTED→ASSESSMENT→APPROVAL→APPROVED/REJECTED→IMPLEMENTED→CLOSED; detail exposes workflow.allowedNext.
- gates PATCH {decisionStatus, evidence, comments}; rules PATCH {isActive,...}; alerts PATCH {status ACKNOWLEDGED|RESOLVED}; governance evaluate POST {} → {evaluated, breaches}; evm POST {projectId}; health POST {projectId}.
- Permissions: /api/auth/me → user.permissions/roles; hasPerm() helper. Liam (TEAM_MEMBER) links resource EMP-001 (userId); PMO has no resource → editor hidden, approvals shown.

## Files (all default-export views, exact registry paths)
- src/views/execute/shared/pickers.tsx — useMe/hasPerm, useProjectOptions, ProjectSelect, TaskSelect (per-project lazy tasks), WeekNav (Mon-start), DAY_HEADERS
- src/views/execute/resources.tsx — cards/table toggle, dept filter, search, add-resource dialog, drawer (assignments + recent timesheets), UtilBar red >100%, refetch [resource:assigned, actuals:changed]
- src/views/execute/timesheets.tsx — CORE: week nav, role-aware My-timesheet editor (per-day Mon–Fri rows: project/task/activity/start/end/break/hours(overtime, auto-calc)/billable/comment), totals footer, Save draft (POST/PATCH), Submit, delete draft, REJECTED banner, approvals (Pending/Approved, ConfirmButton approve, reject reason dialog, lock), status-tab register, review drawer; refetch [timesheet:submitted, timesheet:approved, actuals:changed]
- src/views/execute/inbox.tsx — category sidebar w/ counts, priority-first sort, OPEN/DONE filter, Open (router.navigate on actionUrl), Mark done/Dismiss; refetch [inbox:changed, alert:created, timesheet:submitted]
- src/views/execute/planner.tsx — 7-day week strip, day totals, plan-focus dialog (project+task validated refs), Start/Complete transitions, delete; refetch [planner:changed, task:changed]
- src/views/control/shared/pickers.tsx — useControlProjectOptions, useControlProjectId (localStorage "pmct.control.project", render-derived fallback/heal), ProjectPicker
- src/views/control/financials.tsx — KPI cards, project table (variance red/green), drawer: budget lines by category + stacked BarChart + add-line dialog; refetch [actuals:changed, evm:changed]
- src/views/control/evm.tsx — 12 metric cards w/ tones, CPI/SPI line history, variance panel, snapshot table, Create snapshot; refetch [evm:changed, actuals:changed]
- src/views/control/health.tsx — health wall (big RAG-colored score, CPI/SPI, risks/issues, last snapshot), drawer: RadialBar gauge + snapshot table + Recalculate; refetch [project:health, alert:created]
- src/views/control/raid.tsx — project picker, Risks|Issues|Assumptions|Dependencies tabs, add/edit dialogs (score auto, severity preview), inline status Selects, resolve/resolution, validate assumption; refetch [raid:changed]
- src/views/control/changes.tsx — CR table, detail drawer with workflow buttons from workflow.allowedNext, reject reason dialog, 409 inline error panel, new-CR dialog; refetch [change:changed, governance:changed]
- src/views/control/gates.tsx — sequence stepper (PENDING slate/PASSED emerald/FAILED red/CONDITIONAL amber/DEFERRED dark), gate cards, decision dialog; gate.decide gated; refetch [governance:changed]
- src/views/control/governance.tsx — rules DataTable (Switch PATCH toggle, edit/delete), RuleDialog (metric/operator/threshold/severity/scope/actions), Evaluate now (toast breach count), alerts table ack/resolve; refetch [governance:changed, alert:created, automation:executed]

## Bugs found during verify (fixed in my files only)
1. Drawer/detail useApi calls passed the raw id as the fetch path in 4 views (resources, timesheets, changes, health) → 404 "Unexpected response" on every drawer open. Fixed to `/api/<domain>/[id]` / `/api/health?projectId=`.
2. inbox.tsx sent `status=ANY` → API 400 (only OPEN|DONE|DISMISSED accepted) → param now omitted for ANY.
3. resources.tsx read summary.totalCapacity (undefined; API returns totalCapacityWeekly) → "Weekly capacity" KPI showed 0h → fixed key.
4. Lint (react-hooks compiler rules): window.location.hash assignment flagged immutability → inbox now uses useRoute().navigate; setState-in-effect in control pickers → render-derived id.

## Verification results
- bunx tsc --noEmit: 0 errors in src/views/execute/** and src/views/control/** (remaining project errors pre-exist in plan/portfolio/project-tabs/connect views + skills/ — other batches).
- bun run lint: 0 problems in my files (remaining 4 errors/6 warnings are dashboard.tsx, shell.tsx, realtime.tsx, client.ts, seed-part2.ts — other batches).
- Browser smoke (own session `fb`, PMO + liam): login via chips; #/resources (cards+drawer w/ assignments+timesheets); #/timesheets as PMO (approvals Pending 2/Approved 5, status tabs w/ counts, register) and as liam (My timesheet editor: added entry PRJ-DATA-002 + T-1.1-1 + 6h Monday → Save draft "Draft saved" → Submit "Timesheet submitted for approval" → read-only SUBMITTED week); #/inbox (26 items, category counts, marked one done; liam "Inbox zero" empty state); #/planner (added focus block w/ ERP+task, Start → IN_PROGRESS); #/financials (KPIs, table, drawer w/ category groups + chart, add budget line — test line removed via API after); #/evm (12 cards, snapshot captured → MANUAL_SNAPSHOT row); #/health (wall, drawer gauge + history, Recalculate → manual snapshot); #/raid (risk RSK-011 added w/ auto score 12/HIGH then deleted); #/changes (CR-004 walked DRAFT→SUBMITTED→ASSESSMENT→APPROVAL→REJECTED w/ reason, terminal state shown); #/gates (decision recorded w/ evidence+comments on G3); #/governance (Evaluate now → "Evaluated 30 rules — 0 breaches detected", alert Acknowledge ✓). No Runtime TypeError overlays.
- Screenshot: .zscripts/fb-timesheets.png (liam's editor, day sections + totals footer).
- Note: sandbox dev server (port 3000) was restarted several times mid-session by the platform/concurrent agents → transient "Failed to fetch" on one Evaluate click; re-verified green after the server stabilized (route itself verified 200 via curl too: {evaluated:30, breaches:[]}).
