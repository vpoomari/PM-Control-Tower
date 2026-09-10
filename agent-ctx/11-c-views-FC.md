# Task 11-c — views-FC (Intelligence + Connect + Administration frontend)

Agent: views-FC
Scope: 14 view files under src/views/intelligence, src/views/connect, src/views/admin (+ local shared drawer). No API/lib/kit changes.

## Contracts read
- worklog.md (view contract: views at src/views/<area>/<name>.tsx, default export, kit primitives, hash routing, sonner, recharts)
- registry.tsx — 14 F-C routes already lazy-wired
- kit.tsx — PageHeader/StatCard/SectionCard/DataTable<T>/Column<T>/RagBadge/StatusChip/SeverityDot/ProgressBar/Toolbar/SearchInput/LoadingBlock/ErrorBlock/EmptyState/Metric/ConfirmButton/Button/Card/Badge/Input/cn
- client.ts — api.get/post/patch/del, useApi(path,deps), useRealtimeRefetch(refetch, events)
- router.ts — useRoute; navigate via window.location.hash
- constants.ts — money/num/fmtDate/fmtDateTime, toJson/fromJson, INTEGRATION_CATEGORIES, AUTOMATION_TRIGGERS/ACTIONS

## API shapes verified via curl (PMO session)
- /api/reports/executive: portfolios[] (sums.*), projectKpis{byStatus,byRag,avgHealthScore}, financials, evmAverages{meanCpi,meanSpi,perProject[]}, topRisks, openAlerts, overdueMilestones{count,list}, governanceQueue{pendingGates,changeRequests}
- /api/reports/analytics: healthTimeline[] (per project snapshots[]), evmHistory[] (per project periods[] {statusDate,cpi,spi}), timesheetWeeks[8], raidTrend[6], throughput[6]
- /api/automations: {rules[] (incl. executions[]), history[]}; POST create expects conditions: [{field,op,value}] + actions: [{type,params?}] (API serializes to *Json itself — no client-side JSON.stringify needed); run → {executions[]}
- /api/templates: {templates[]}; [id] detail versions[] w/ structureJson{phases[]}; apply POST body = {projectCode, projectName!, programId?, budget?} — NOTE: key is projectName (zod schema), not "name"
- /api/integrations: {categories[8] × integrations[]}; [id] detail flat w/ credentials(maskedValue) + events[]; test → INTERNAL {ok:true} / EXTERNAL {ok:false, reason}
- /api/webhooks: {subscriptions[]}; deliveries at /api/webhooks/[id]/deliveries; test does a REAL fetch (honestly FAILED in sandbox)
- /api/notifications: {notifications[], counts{total,unread,read}}; PATCH [id] {read:true}
- /api/audit: {events[], count} — count = events.length (page size), NOT a global total → pagination must use full-page heuristic
- /api/admin/users {users[],total,active}; PATCH [id] {isActive?, roleCode?}; audit activity via /api/audit?userId=
- /api/admin/roles {roles[], catalog[32]}; POST {name,code UPPER_SNAKE,permissionCodes[]}; PATCH [id] {permissionCodes[]}
- /api/admin/templates-config: counts(25), featureFlags, featureFlagsSource, environment(4 booleans), generatedAt
- /api/system/ready: status ready|degraded, checks.database.ok+counts, checks.realtime.ok+detail
- /api/assistant GET {executions[], scope}; POST {question} → AiExecution (prompt/response/tokens/durationMs/status)

## Files (14 views + shared drawer)
src/views/connect/shared/drawer.tsx (Drawer/DrawerSection/KV on ui/sheet) — reused by connect+admin views only
src/views/intelligence: reports.tsx, analytics.tsx, assistant.tsx
src/views/connect: integrations.tsx, automations.tsx, notifications.tsx, webhooks.tsx, ai-gateway.tsx, extensions.tsx
src/views/admin: users.tsx, roles.tsx, templates.tsx, audit.tsx, settings.tsx

## Verification
- bunx tsc --noEmit → 0 errors in my files (remaining project errors: plan/register, plan/shared, portfolio/projects, project/tabs — other batches; skills/* — not app code)
- bun run lint → 0 problems in my files (remaining: shell.tsx ×2, dashboard.tsx ×1 errors + warnings in realtime.tsx/client.ts/seed-part2.ts — Task 10 foundation files, untouched per batch boundary)
- Browser smoke (agent-browser session fc, PMO login): all 14 routes render with live data, zero page errors / no TypeError overlays
- Assistant e2e: chip "Which projects are red and why?" → answer cites PRJ-DATA-002 + real issues/risks, CPI 0.85/SPI 0.8; tokens+duration footnote; typing indicator; screenshot → .zscripts/fc-assistant.png
- Integrations: Test BI (EXTERNAL) → honest negative toast w/ credentials-not-configured reason; Enable without credential → 409 surfaced; AI (INTERNAL) CONNECTED; details drawer w/ masked credentials + events table
- Automations: Run now → SKIPPED×1 honest summary (conditions not met on manual run); rule drawer w/ executions; create via dialog (conditions rows + NOTIFY_USER checkbox) → persisted; delete w/ confirm
- Notifications: mark read (33→32 unread), severity ordering, All|Unread tabs
- Webhooks: Test → real delivery FAILED recorded (2/2, lastStatus FAILED) — honest; delivery history drawer
- Template apply e2e: Business Transformation v1.2 → PRJ-TPL-950 "Template Smoke Wave F-C" (budget 500k) → 12 WBS nodes, 16 tasks, 7 milestones, 4 gates, 4 budget lines, DRAFT; success dialog + "Open the new project" navigates to #/projects/[id]
- Audit: filters (search/entity/action/severity/dates), row expand shows pretty before/after JSON, pagination Next→page 2 (rows 26–50)
- Settings: env readiness ✓/! w/ "configure in environment" hints (no values), realtime/db probes, entity counts, deployment card

## Issues found & fixed
1. extensions.tsx — TemplatesConfig interface missing featureFlagsSource (TS2551) → added field
2. notifications.tsx — lowercase channelIcon used as JSX element (TS2339) → renamed ChannelIcon
3. audit.tsx — two inputs (free text + user name) both wrote the same `q` param, second silently overwriting first → merged into one search input (API `q` OR-matches userName/entityName/action/entityType/context)
4. audit.tsx — pagination used `count` as a global total but API returns count = page size → Next is now enabled on full pages (hasNext = events.length === TAKE), honest "page N · more available" labels, no fabricated totals
5. templates.tsx — ApplyTemplateDialog sent `name` but the apply schema requires `projectName` → 400 on apply; fixed key; re-verified e2e end-to-end (PRJ-TPL-950)
6. Housekeeping: deleted transient curl-test project X-TEST-NAME via DELETE ?force=1 after verifying apply contract

## Re-verification pass (2nd run of task 11-c)
- Re-read contracts; confirmed all 14 views + connect/shared/drawer.tsx present at exact registry paths, one default export each, no `any` usage, type-alias row types only.
- Re-curl-verified live API shapes: reports/executive, reports/analytics, automations, templates, integrations (8 categories × generic labels), webhooks, notifications, audit, admin/users, admin/roles, admin/templates-config, system/ready, assistant — all 200.
- tsc: 0 errors in app code (only pre-existing skills/* errors remain). lint: 0 problems in my files (residuals are Task-10 foundation files: dashboard/shell/realtime/client.ts + scripts/seed-part2.ts).
- Browser smoke (session fc, PMO login) re-run across ALL 14 routes: zero page errors, zero console errors.
- BUG FOUND & FIXED: webhooks.tsx deliveries column rendered `2[object Object]` — JSX interpolated inside a template literal in the deliveryCount render → rewrote render to return JSX (`2 · 2 failed` verified after reload). Swept all views for the same bug class — none other.
- E2E re-verified: assistant ask→answer cites PRJ-DATA-002 (health 10, CPI 0.85/SPI 0.8, real issues/risks) + tokens/duration footnote (512 tokens/1.0s) → screenshot .zscripts/fc-assistant.png; integrations BI test → honest negative toast; register-credential → masked "sk-t****45"; automations Run now → SKIPPED×1 honest; rule create dialog → conditionsJson/actionsJson persisted correctly → deleted via confirm; notifications mark read 33→32; Open → actionUrl #/governance; webhook test → honest FAILED recorded (3/3) + delivery-history drawer; template apply e2e → PRJ-TPL-951 "Template Re-Verify F-C" (no budget → 0 budget lines = correct engine behavior, budget>0 required) → 4 WBS/16 tasks/7 milestones/4 gates → success dialog + deep link to workspace (charter cites template v1.2) → test project deleted via DELETE ?force=1; audit row expand shows pretty before/after JSON; pagination page 2 (25 events, "more available"); settings probes live (READY, realtime connected, 12 users/7 projects/104 tasks).
- Users New-user dialog render-checked (email/name/password/title/role) — not created to keep demo dataset clean.
