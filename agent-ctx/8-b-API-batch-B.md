# Task 8-b — API batch B (EXECUTE + CONTROL domains)

Agent: API-batch-B
Date: 2026-09-09
Scope: 36 Next.js App Router route files under `src/app/api/` (see list below). No changes to `src/lib/*`, `prisma/schema.prisma`, or other agents' routes. No `db:push`.

## Files created

EXECUTE:
- resources/route.ts (GET register + weekly-equivalent utilization, filters q/dept/type; POST create, unique employeeCode)
- resources/[id]/route.ts (GET detail: assignments + last 8 timesheets + weekly capacity profile; PATCH+audit; DELETE guarded 409 when assignments/timesheets exist)
- capacity/route.ts (GET ?weeks=1..26 heatmap: allocated = Σ overlapping ACTIVE assignments × allocationPercent/100 × 40; summary block)
- assignments/route.ts (GET ?projectId|resourceId; POST with project/resource/task validation + audit + emitRealtime resource:assigned → projectRoom)
- assignments/[id]/route.ts (GET/PATCH/DELETE + audit + realtime)
- timesheets/route.ts (GET scope=mine|team|all, role-aware: team/all require timesheet.approve; filters status/weekStart/resourceId; POST create-or-update DRAFT w/ entry replacement, taskId↔projectId and wbsId↔projectId consistency checks, recomputeTimesheetTotals persisted)
- timesheets/[id]/route.ts (GET detail + entries with project/task/wbs context; PATCH replace entries DRAFT/REJECTED only; DELETE DRAFT/REJECTED only)
- timesheets/[id]/submit | approve | reject | lock (engines: submitTimesheet/approveTimesheet/rejectTimesheet/lockTimesheet; submit: own or timesheet.approve; approve/reject/lock: timesheet.approve)

ENGAGE:
- inbox/route.ts (GET ?category per INBOX_CATEGORIES, ?status; JS ordering CRITICAL→LOW then createdAt desc, take 100; groupBy unread counts incl ALL)
- inbox/[id]/route.ts (PATCH status OPEN|DONE|DISMISSED or action:"complete"; own-only → 403; realtime inbox:changed user room)
- planner/route.ts (GET ?from&to default current week, include task/project/meeting; POST with hard reference validation — never creates isolated records)
- planner/[id]/route.ts (PATCH status/date/notes; DELETE — own only; realtime planner:changed)

CONTROL:
- financials/route.ts (GET ?projectId: budget lines grouped by BUDGET_CATEGORIES, totals, labor cost from APPROVED/LOCKED timesheet entries × resource costRate, actual/forecast/margin-vs-budget variance; else portfolio per-project rows w/ categoryBreakdown)
- financials/budget-lines/route.ts + [id]/route.ts (CRUD, amounts round2, audit + actuals:changed realtime)
- evm/route.ts (GET ?projectId required: computeEVM + EvmPeriod history asc + latest snapshot; POST persist MANUAL_SNAPSHOT + audit + evm:changed)
- health/route.ts (GET ?projectId snapshots latest-24-asc + project health row (or portfolio view); POST recalcProjectHealth(projectId,"MANUAL") + audit + project:health)
- risks/route.ts + [id] (auto code RSK-### global count+1 w/ existence loop; score=p×i; severity ≥16 CRITICAL/≥10 HIGH/≥5 MEDIUM; PATCH status OPEN|MITIGATING|CLOSED|ACCEPTED|ESCALATED, closedAt stamp, residual scoring returned; runAutomations("RAID_CREATED"))
- issues/route.ts + [id] (ISS-###; CRITICAL severity ⇒ CRITICAL priority; resolvedAt on RESOLVED/CLOSED; runAutomations)
- assumptions/route.ts + [id] (ASM-###; VALID|AT_RISK|INVALID|CLOSED; validationDate stamped on status change)
- changes/route.ts + [id] (CR-###; requester from session; PATCH workflow DRAFT→SUBMITTED→ASSESSMENT→APPROVAL→(APPROVED|REJECTED)→IMPLEMENTED→CLOSED w/ transition table + 409; decisions need role PROJECT_MANAGER|PROGRAM_MANAGER|PORTFOLIO_MANAGER|EXECUTIVE|PMO_ADMIN else 403; decisionDate/decidedBy stamped; APPROVED ⇒ PM inbox item + notification, impact recorded only — budget NOT mutated)
- gates/route.ts + [id] (POST sequence=max+1, code `${project.code}-G<n>`; PATCH evidence/comments via project.manage, decisionStatus changes additionally require gate.decide (403 otherwise) and stamp decisionDate+approver + owner notification + governance:changed; DELETE guarded 409 once decided)
- governance/rules/route.ts + [id] (metric∈RULE_METRICS, operator∈RULE_OPERATORS, severity∈SEVERITY, scopeType GLOBAL|PROJECT w/ scopeId validation; PATCH incl isActive; audit both)
- governance/evaluate/route.ts (POST evaluateGovernance(projectId?) → {evaluated, breaches}; GET recent 50 AlertEvents)
- alerts/route.ts + [id] (GET filters status/severity/projectId take 100; PATCH ACKNOWLEDGED|RESOLVED|DISMISSED w/ ack fields from session + governance:changed)
- deliverables/route.ts (GET/POST, code auto `${project.code}-DLV-n`, wbsId must belong to project)
- meetings/route.ts (GET ?projectId&from&to — Meeting has no project relation so project context resolved via secondary query; POST organizer=session)
- stakeholders/route.ts (GET/POST; requires projectId or portfolioId; same no-relation workaround)

## Conventions applied
- Every mutation: writeAudit({userId, userName, role: session.roles[0], action, entityType, entityId, entityName, before, after, ipAddress: ctx.ip})
- zod v4 parseBody for all bodies; z.coerce.date() for dates; enums validated against constants (TS_STATUS, CR_STATUS, GATE_DECISION, RULE_METRICS, RULE_OPERATORS, SEVERITY, BUDGET_CATEGORIES, INBOX_CATEGORIES)
- 404/409/403/400 via ApiError; money via round2; rate limits 300/min reads, 120/min writes, 60/min destructive
- Realtime events restricted to the RealtimeEvent union; rooms projectRoom(projectId) / user:<id>

## Verification results
- bun run lint: 0 errors (1 pre-existing warning in scripts/seed-part2.ts — not mine)
- bunx tsc --noEmit: my route files clean (fixed 2 type errors: Meeting/Stakeholder have no Prisma project relation → secondary project lookups)
- Smoke tests (PMO token): all GETs 200 — resources, capacity, timesheets?scope=all, inbox, planner, financials (portfolio + ?projectId), evm, alerts, governance/rules, governance/evaluate, deliverables, meetings, stakeholders, changes, gates
- RBAC negative tests: liam (TEAM_MEMBER) scope=all→403, financials→403, POST risks→403, risks GET→200; sarah (PM) gate decision→403 gate.decide, evidence update→200, evm POST→201
- Guards: duplicate employeeCode→409; DELETE resource w/ assignments→409; DELETE decided gate→409; approve DRAFT→409; invalid CR transition APPROVAL→CLOSED→409; planner bad taskId→404

## CRITICAL E2E — timesheet approval cascade (liam's DRAFT, PRJ-ERP-001)
1. GET /api/timesheets?scope=all&status=DRAFT → liam ts `cmtui5glu...` (10 entries, week 2026-09-07)
2. POST /submit → SUBMITTED (39h, 2 OT); approval inbox items + Approval row created by engine
3. POST /approve (PMO) → APPROVED; cascade ran: task actuals +, WBS roll-up, project actuals, labor budget line, EvmPeriod, health, governance
4. GET /api/evm?projectId=ERP: **AC 560,089.04 → 564,379.04** (+4,290 = 39h × $110), **history 5 → 6 periods**, latest source TIMESHEET_APPROVAL; project actualHours 117; health re-scored 60→6 (RED — honest outcome of CPI 0.76 after posting actuals; governance alerts + escalations generated automatically)

## Issues / decisions
- Meeting & Stakeholder models carry projectId without FK relations → project name/code resolved with a secondary findMany and merged into responses
- "mine with no linked resource" falls through to unfiltered listing (matches "or all if none" contract; approvers have no resource record)
- decide-on-APPROVED/REJECTED requires current status ASSESSMENT/APPROVAL (409 otherwise); REJECTED allowed from both, matching spec
- Test artifacts left intentionally (audit-trailed): gate PRJ-ERP-001-G5 PASSED, CR-005 CLOSED, deliverable PRJ-ERP-001-DLV-05, meeting "E2E standup", stakeholder "E2E Stakeholder", 2 MANUAL_SNAPSHOT EvmPeriods; all transient RAID/timesheet/budget-line/rule/resource test records were deleted via the APIs
