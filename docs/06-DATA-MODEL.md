# 06 — Data Model Reference

Source of truth: `prisma/schema.prisma` — **57 models**, SQLite profile
(enums as `String` constants, JSON payloads as `String` columns; portable to
PostgreSQL). All ids are `cuid()`; most business entities also carry a unique
human **code** (`PRJ-ERP-001`, `RSK-…`, `DEC-101`) used by import/export upserts.

## 1. Identity & access (5 models)

| Model | Key fields | Notes |
|---|---|---|
| `User` | email (unique), passwordHash, name, title, department, isActive, isSuperAdmin, lastLoginAt, failedLogins, lockedUntil | Lockout fields drive brute-force protection |
| `Role` | code (unique), name, level, isSystem | 8 system roles seeded |
| `Permission` | code (unique), category | 32-permission catalog (`src/lib/rbac.ts`) |
| `UserRole` | userId + roleId | composite PK, multi-role capable |
| `RolePermission` | roleId + permissionId | role→permission grants |

## 2. Portfolio hierarchy (3)

`Portfolio` (code, strategicObjective, budgetTarget/actualCost/forecastCost,
healthScore, ragStatus) → `Program` (portfolioId, budget/actual/forecast, health)
→ `Project` — the central entity: owner/sponsor/manager (User refs), status, phase,
methodology, riskLevel, billingType, baselineStart/Finish, baselineBudget,
currentBudget, actualCost, forecastCost, plannedHours/actualHours, progress,
healthScore, ragStatus, charter, objectives, successCriteria.

## 3. Planning (6)

- `WBSNode` — tree (parentId), nodeType, level, orderIndex, ownerName, planned/actual hours & cost, progress.
- `Requirement` — reqCode, reqType, priority, status, acceptanceCriteria, effortEstimate; links WBSNode.
- `Task` — projectId, wbsId, tree (parentId), status, priority, criticality, dates, durationDays, progress, planned/actual/remaining hours, planned/actual cost, assignee (User), CPM fields (isCritical, earliestStart/Finish, latestStart/Finish, totalFloat, freeFloat, constraintType).
- `Dependency` — predecessorId, successorId, depType (`FS/SF/SS/FF`), lagDays, isExternal, externalRef.
- `Milestone` — code, dueDate, baselineDate, status, isCritical, completedAt, gateId.
- `Baseline` — version, name, status, baselineStart/Finish/Hours/Cost, snapshotJson (full schedule snapshot), activatedAt.

## 4. Execution (5)

- `Resource` — employeeCode (unique), optional userId link, skills (CSV), seniority, primarySkill, capacityHoursPerWeek, costRate, billableRate, availabilityStatus, location.
- `Assignment` — projectId, resourceId, optional taskId, role, allocationPercent, planned/actual hours, billable.
- `Timesheet` — resourceId (+userId), weekStart/weekEnd (unique pair), status (`DRAFT→SUBMITTED→APPROVED/REJECTED→LOCKED`), hour buckets, approverId, rejectionReason, timestamps.
- `TimesheetEntry` — entryDate, project/task links, workstream, activity, start/end/break, hours buckets, entryType, billable.
- `Approval` — generic approval rows (entityType/entityId, requester, approver, decision, level).

## 5. Control — financial, EVM, health (5)

- `BudgetLine` — category (`LABOR/EQUIPMENT/MATERIAL/…`), name, baseline/current/actual/forecast amounts, period.
- `EvmPeriod` — per project & statusDate: BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI, costVariance, scheduleVariance, percentComplete, source.
- `ProjectHealthSnapshot` — capturedAt, healthScore, ragStatus, cpi/spi, variances, eac/bac, open risks/issues, overdueMilestones, resourceUtilization, triggeredBy.
- `ProjectForecast` — period, forecastCost/Hours, forecastFinishDate, confidence, basis.
- (financial roll-ups also exposed via `/api/financials` aggregation.)

## 6. Control — RAID, change, gates, governance (6)

- `Risk` — code, category, probability/impact (1–5), score, severity, status, ownerName, responseStrategy, mitigation, contingency, residual prob/impact, escalationLevel, dueDate, closedAt.
- `Issue` — code, category, priority/severity, status, ownerName, impact, resolution, escalationLevel, dueDate, resolvedAt.
- `Assumption` — code, description, rationale, impactIfFalse, status, validationDate.
- `ChangeRequest` — code, reason, category, requester, impactHours/impactCost/scheduleImpactDays/riskImpact, status, decision trail (decision, decidedBy, decisionDate).
- `StageGate` — sequence, criteria, plannedDate, decisionStatus, approver, evidence.
- `GovernanceRule` + `AlertEvent` — metric/operator/threshold/severity/scope rules; alert rows with metricValue vs threshold, acknowledge/resolve trail.

## 7. Delivery & collaboration (8)

`Deliverable` (type, status, ownerName, dueDate, deliveredAt, acceptanceCriteria, qualityStatus) ·
`QualityRecord` (recordType, result, score, reviewer, findings, actions) ·
`Meeting` (meetingType, scheduledAt, attendees, agenda, minutes) ·
`Decision` (code, title, decision/decidedBy/decisionDate + **leadership register extensions**: decisionOwner, raisedAt, requiredBy, businessImpact, projectImpact, recommendedDecision, priority, escalatedAt) ·
`Stakeholder` (influence/interest/engagement, strategy) ·
`Communication` (commType, audience, channel) ·
`Document` (docType, category, url, version, sizeKb) ·
`Vendor` (contractRef, contractValue, rating).

## 8. Engagement (3)

`Notification` (typed, severity, actionUrl, readAt) · `InboxItem` (category
ACTION_REQUIRED, priority, dueDate, actionUrl, sourceType, completedAt) ·
`PlannerEntry` (date/time, entryType FOCUS/MEETING/…, estimatedHours, task/meeting links).

## 9. Automation (2)

`AutomationRule` (triggerType, conditionsJson, actionsJson, priority, counters) →
`AutomationExecution` (status, triggeredBy, input/outputJson, durationMs, attempts).

## 10. Templates (2)

`Template` (category, methodology, industry, usageCount, rating, tags) →
`TemplateVersion` (structureJson — WBS/tasks/milestones/gates scaffolding).

## 11. Integration hub (5)

`Integration` (category, provider, status, authType/status, syncDirection/Frequency, healthScore, configJson) ·
`IntegrationCredential` (maskedValue, encryptedRef, expiry/rotation) ·
`IntegrationEvent` (direction, eventType, status, payload/response, attempts) ·
`WebhookSubscription` (url, events, authType HMAC_SHA256, retry policy, counters) ·
`WebhookDelivery` (payload, responseCode, status, attempts, durationMs).

## 12. AI gateway (2)

`AIConnector` (provider, model, purpose, dataScope, temperature, maxTokens, usageCount) ·
`AIExecution` (prompt, response, tokens, durationMs, status, dataScopeUsed, user).

## 13. Audit (1)

`AuditEvent` — action, entityType/Id/Name, beforeJson/afterJson, userName/role, ip,
userAgent, severity. Indexed by entity and time. Written by the API wrapper, seeds
and CLIs.

## 14. Leadership reporting (4)

- `ActionItem` — central action register: code (unique), owner name/email, priority, status, source, relatedType/Code, escalationLevel, raisedAt/dueDate/completedAt, raisedByName.
- `ProjectKpi` — KPI/benefit: code, category, unit, target/current/baseline values, expected/actual benefit, status, measurementDate.
- `ReportSnapshot` — versioned report: scope (`PORTFOLIO`/`PROJECT`), projectId, title, periodStart/End, version, generatedBy, headlineJson, payloadJson (full pack content).
- `ReportSchedule` — frequency (`DAILY/WEEKLY/MONTHLY/QUARTERLY`), scope, sections, recipients, deliveryChannel, isActive, lastRunAt/nextRunAt, lastRunSummary.

## ER overview (major relations)

```
Portfolio 1─* Program 1─* Project 1─* WBSNode 1─* Task *─* Task (dependencies)
                                   ├─* Requirement      ├─* TimesheetEntry
                                   ├─* Milestone        └─* Assignment *─1 Resource
                                   ├─* Baseline              │
                                   ├─* BudgetLine            └─1 Timesheet (weekly)
                                   ├─* EvmPeriod
                                   ├─* Risk / Issue / Assumption
                                   ├─* ChangeRequest / StageGate
                                   ├─* Deliverable / QualityRecord
                                   ├─* ProjectHealthSnapshot / ProjectForecast
                                   └─* Assignment
User *─* Role *─* Permission        User ─1 InboxItem / Notification / PlannerEntry
Project ─* Decision / ActionItem / ProjectKpi (leadership registers)
ReportSnapshot / ReportSchedule     AuditEvent (global)
```
