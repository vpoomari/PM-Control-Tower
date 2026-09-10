# Task 8-a — API-batch-A (PLAN domain) — Work Record

Agent: API-batch-A
Date: 2026-09-09

## Scope delivered
21 Next.js App Router route files (PLAN domain), all using the sanctioned `withApi` handler pattern, zod validation via `parseBody`, `writeAudit` on every mutation, `emitRealtime` on the sanctioned event union, `projectRoom(id)` for project-scoped fan-out.

### Files created (all under src/app/api/)
| # | File | Methods | Permission (GET/POST/PATCH/DELETE) |
|---|------|---------|-------------------------------------|
| 1 | portfolios/route.ts | GET, POST | portfolio.view / portfolio.manage |
| 2 | portfolios/[id]/route.ts | GET, PATCH, DELETE | portfolio.view / portfolio.manage |
| 3 | programs/route.ts | GET, POST | program.view / program.manage |
| 4 | programs/[id]/route.ts | GET, PATCH, DELETE | program.view / program.manage |
| 5 | projects/route.ts | GET, POST | project.view / project.manage |
| 6 | projects/[id]/route.ts | GET, PATCH, DELETE | project.view / project.manage |
| 7 | projects/[id]/wbs/route.ts | GET, POST | project.view / wbs.manage |
| 8 | projects/[id]/wbs/[nodeId]/route.ts | PATCH, DELETE | wbs.manage |
| 9 | projects/[id]/requirements/route.ts | GET, POST | project.view / project.manage |
| 10 | projects/[id]/requirements/[reqId]/route.ts | PATCH, DELETE | project.manage |
| 11 | projects/[id]/tasks/route.ts | GET, POST | project.view / wbs.manage |
| 12 | projects/[id]/tasks/[taskId]/route.ts | GET, PATCH, DELETE | project.view / wbs.manage |
| 13 | projects/[id]/dependencies/route.ts | GET, POST | project.view / schedule.manage |
| 14 | projects/[id]/dependencies/[depId]/route.ts | PATCH, DELETE | schedule.manage |
| 15 | projects/[id]/schedule/route.ts | GET, POST | project.view / schedule.manage |
| 16 | projects/[id]/milestones/route.ts | GET, POST | project.view / project.manage |
| 17 | projects/[id]/milestones/[msId]/route.ts | PATCH, DELETE | project.manage |
| 18 | projects/[id]/baselines/route.ts | GET, POST | project.view / baseline.manage |
| 19 | projects/[id]/baselines/[baselineId]/activate/route.ts | POST | baseline.manage |
| 20 | projects/[id]/audit/route.ts | GET | project.view |
| 21 | search/route.ts | GET | project.view (120/min) |

### Key implementation decisions
- Portfolio/Program have `ownerId String?` but **no owner relation** in the schema → owner hydrated via secondary `db.user.findMany/findUnique` queries (never modify schema).
- `portfolioId` filter on /api/projects matches direct assignment OR via program (seed data sets programId only).
- Project DELETE is 409-guarded when tasks/WBS/baselines exist; `?force=1` cascades (FK cascades handle the rest).
- WBS parent moves validate cycles by ancestor walk and renumber the whole subtree (code + level) in BFS order; sibling index = max numeric suffix + 1 (deletion-safe).
- Task codes: `T-<wbsCode>-<n>` when WBS-linked, `T-GEN-<n>` otherwise; tasks only attach to WORK_PACKAGE nodes.
- Schedule-affecting task diffs (progress/dates/duration/status) trigger `rescheduleProject` + `recalcProjectHealth("TASK_UPDATE")`; hour/cost diffs trigger `rollupWbsActuals`.
- Dependency creation: FS/SS/FF/SF, self 400, duplicate pair 409, cycle 400 via DFS from successor over existing edges.
- Baseline POST snapshots: baselineStart/Finish ← project dates, baselineHours ← Σ WBS leaf plannedHours, baselineCost ← currentBudget, snapshotJson via `toJson({tasks:[…]})`, version = max+1, DRAFT.
- Activate: `$transaction` (ACTIVE→SUPERSEDED, target→ACTIVE+activatedAt, project.baselineStart/Finish/Budget ← baseline) — verified reversible by re-activating v1.
- Project audit route matches plan-domain events by entityId=projectId, Task ids (cap 500), AND `context contains projectId` so deleted-entity history remains visible.

### Verification
- `eslint` on my four route trees: **0 errors, exit 0**.
- `tsc --noEmit`: **0 errors in src/app/api/** (remaining repo errors are pre-existing and outside my scope: src/lib/api.ts 3-arg ApiError TS2554, scripts/seed.ts inference errors, concurrent batch's reports/executive syntax error).
- dev.log: **zero `[api]` runtime errors** after fixes.
- Full CRUD round-trips exercised via curl with Bearer auth; all transient test artifacts deleted; baseline v1 re-activated to restore seeded state; CRM status restored to DRAFT.

### Incident note
During the session the directory `projects/[id]/milestones/[msId]` was renamed to `sId]` by an external tool glitch (bracket-glob rewrite in the shell layer). Repaired by re-writing the canonical file via the Write tool; route re-verified 200. Other agents should be careful: literal bracketed paths in shell commands may be glob-mangled — build such paths with `chr(91)/chr(93)` in python or avoid quoting-sensitive ops.
