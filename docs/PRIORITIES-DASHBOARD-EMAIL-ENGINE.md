# Prioritized Task Dashboard & Automated E-mail Engine — Delivery Record

**Date:** 2026-11-02
**Status:** Delivered (schema pushed, `tsc` 0 errors, 263/263 tests green, engine + browser e2e verified)
**Scope:** Role-based post-login routing (PMO / PM → prioritized task dashboard), four-widget prioritized dashboard in a forced dark high-contrast theme, and the two-rule automated e-mail engine (**Due Today** single trigger + **Overdue daily escalation** cron).

---

## 1. What was delivered (spec → artefact)

| Spec deliverable | Where it lives |
|---|---|
| **Prisma schema updates** (due dates, statuses, last-emailed timestamps) | `prisma/schema.prisma` — `Task.dueTodayEmailedAt`, `Task.overdueEmailedAt`; `src/lib/constants.ts` — `ON_HOLD` added to `TASK_STATUS`, new `TASK_TERMINAL_STATUS`, new `TASK_DASHBOARD_ROLES` |
| **Exact backend filtering logic for the four conditions** | `src/lib/priorities/windows.ts` (pure predicates) + `src/lib/priorities/dashboard.ts` (DB collector) served by `GET /api/dashboard/priorities` |
| **Cron job setup** | `vercel.json` (`task-alerts`, `0 7 * * *`) → `src/app/api/cron/task-alerts/route.ts`; local worker `mini-services/scheduler/index.ts` on `:3004` (`npm run scheduler[:node]`) |
| Role-based post-login routing | `landingAfterLogin()` in `src/components/pmct/shell.tsx`, wired in `src/app/page.tsx` (`handleLogin` + one-shot fresh-entry decision) |
| Four-widget dashboard, forced dark theme | `src/views/priorities/priorities.tsx` (`#/priorities`, nav "Priority Dashboard" in Execute group) |
| E-mail rendering (both templates) | `src/lib/priorities/templates.ts` (pure, DB-free) |

---

## 2. Role-based routing (PMO / PM → dashboard)

`TASK_DASHBOARD_ROLES = [PMO_ADMIN, PROJECT_MANAGER]`. `landingAfterLogin(user)` returns `"/priorities"` for those roles and `null` for everyone else (they keep the default landing).

Three entry paths, all verified in the browser:

| Path | Behaviour | Evidence |
|---|---|---|
| **Sign-in** (`handleLogin`) | hash set to `#/priorities` for PMO and PM | `pmo@pmct.io` → `#/priorities`; `pm.david@pmct.io` → `#/priorities` |
| **Fresh entry with restored session, no hash** | the router normalises `""` → `#/dashboard` (`router.ts:13,32`) *before* React can observe it, so `page.tsx` captures the raw hash during the **first render** (`enteredUnspecified` ref) and consumes it as a **one-shot** landing decision → `#/priorities` | PMO, `location` with empty hash → `#/priorities` |
| **Explicit deep link** (any non-empty hash at load, `#/dashboard` included) | honoured as-is — the one-shot flag is `false` | PMO, `#/dashboard` → stays on "Executive Control Tower" |

If the user navigates elsewhere while the session is still resolving, their choice wins (the flag is consumed but the route is no longer the default). The pre-existing guard — `#/dashboard` requires `executive.view`, otherwise redirect to `homeFor(user)` — is unchanged and still fires on every route change.

**Scope rule:** PMO (`isSuperAdmin` / org `"*"` / `PMO_ADMIN`) = organisation-wide; PM = tasks where `assigneeId = user` **OR** `project.ownerId = user`. Inbox facets are always the session user's.

---

## 3. Prisma schema updates

```prisma
model Task {
  // … existing due-date / status fields …
  dueTodayEmailedAt  DateTime?   // last time the due-today e-mail was delivered for this due date
  overdueEmailedAt   DateTime?   // last time a daily overdue escalation was delivered
}
```

- `ON_HOLD` was added to `TASK_STATUS` so the spec's stop-status "On Hold" has a task representation (Kanban column + pill presentation added; `notificationData` now excludes via `TASK_TERMINAL_STATUS` instead of a hard-coded pair).
- `TASK_TERMINAL_STATUS = [COMPLETED, CANCELLED, ON_HOLD]` — status set at which the daily escalation stops **forever**.
- `npx prisma db push` → *"database is now in sync"*; `npx prisma generate` → client types verified to contain both new fields.

**Date storage rationale:** all window predicates run **in JS** (`calendarDaysBetween`, calendar-day semantics), never as SQL ranges — FLOW imports store ISO-TEXT dates while Prisma-native rows use epoch-INTEGER, so a SQL `gte/lte` would silently mis-compare (same convention as the existing `notificationData.bucketTask`).

---

## 4. The four widget conditions (exact filtering logic)

Measured against the **current system date**; all rows are non-terminal (`status ∉ {COMPLETED, CANCELLED, ON_HOLD}`) with a due date.

| Widget | Condition (calendar-day delta `d = daysBetween(due, today)`, positive = late) | Sort |
|---|---|---|
| **Overdue (last 7 days)** | `d ∈ [1 … 7]` — due date in the past 7 days, status still active | oldest first |
| **Due Today** | `d == 0` — due date equals the current system date (any hour) | code |
| **Upcoming (next 7 days)** | `d ∈ [-7 … -1]` — tomorrow through day+7 **inclusive** | soonest first |
| **Action Not Taken** | Four **disjoint** facets: ① **awaiting approval** — inbox items of category `APPROVALS` for the session user; ② **unassigned** — active tasks with `assigneeId = null`; ③ **blocked** — status `BLOCKED`; ④ **unread** — session user's unread inbox items | per facet |

Facets are disjoint (approval lives in the inbox, the other three in tasks/other inbox categories), so the widget's total is an honest sum of its four facet counts.

Pure decision functions: `classifyDue`, `splitIntoWindows`, `isActiveTask`, `isTerminalStatus` in `src/lib/priorities/windows.ts`; DB collection in `collectPriorities` (`dashboard.ts`); served by `GET /api/dashboard/priorities` (permission `project.view`, session-scoped).

---

## 5. E-mail engine rules

### Rule 1 — Due Today (single trigger)
A task reaching its **exact due date** triggers **one** automated e-mail to the assigned PMO/PM.
`dueTodayEligible` = due date is today (`d == 0`) AND `Task.dueTodayEmailedAt` is null or from an **earlier calendar day** → exactly one send per reached due date; the stamp re-arms automatically if the due date is moved to another day.

### Rule 2 — Overdue daily escalation
Every past-due task (`d >= 1`) escalates **once per day, every day**, until `status ∈ {COMPLETED, CANCELLED, ON_HOLD}`.
`overdueEligible` = past due AND status non-terminal AND (`overdueEmailedAt` null or from an **earlier calendar day**) → yesterday's stamp never blocks today, same-day re-runs are idempotent.

### Cross-cutting rules
- **Recipient:** active task assignee → active project owner → row reported as `skippedUnroutable` (no active party ⇒ no e-mail, no stamp).
- **Consolidation:** one e-mail per recipient per pass (never a per-task mail storm) — the repo's daily-digest convention.
- **Fail-closed stamping:** the stamp is written **only after a successful send**; a transient failure retries on the next run instead of silently swallowing the day's alert.
- **Send path:** the sender is injected (`Sender`), so the engine stays free of Graph/MSAL imports, dry-runs and tests swap it trivially. Templates (`templates.ts`) are pure and fully escaped.

---

## 6. Cron setup

### Production (Vercel)
`vercel.json`:

```json
"crons": [
  { "path": "/api/cron/task-alerts", "schedule": "0 7 * * *" },
  …
]
```

- Single route runs **both passes** daily at 07:00 UTC (keeps total cron count ≤ 2 for the Vercel Hobby plan).
- Auth: `Authorization: Bearer $CRON_SECRET` (`auth: false` on the route; missing/invalid → **401**).
- Query params: `pass=due-today|overdue|all` (default `all`; invalid → **400**), `dryRun=1` (report only, **200**).
- `POST` is an alias of `GET` (Vercel cron uses GET).

### Local / self-hosted worker
`mini-services/scheduler/index.ts` — mirrors `mini-services/realtime`:

| Item | Value |
|---|---|
| Start | `npm run scheduler` (bun) / `npm run scheduler:node` (tsx) |
| Port | `:3004` — `GET /health`, `GET|POST /run` (manual trigger, `?dryRun=1`) |
| Tick | every 10 minutes + one startup tick |
| Graph absent | automatic **dry-run** (report, nothing sent, nothing stamped) |

---

## 7. Verification record (2026-11-02)

### Static & unit
| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm run test` | **263/263 pass** (21 new tests in `tests/engines/priorities.test.ts`) |
| ESLint on every new/changed file | **clean** (repo-wide lint debt is pre-existing, untouched) |
| Prisma `db push` / `generate` | in sync; generated client contains `dueTodayEmailedAt` / `overdueEmailedAt` |

### Services
| Service | Status |
|---|---|
| dev `:3000` | ready |
| realtime `:3003` | `{"status":"ok"}` |
| scheduler `:3004` | `{"status":"ok","graphConfigured":false,…}` — startup tick: due-today **1 candidate / 1 recipient**, overdue **79 candidates / 5 recipients**, dry-run → 0 sent / 0 stamped |

### Cron contract (`/api/cron/task-alerts`)
| Case | Result |
|---|---|
| no secret | **401** |
| wrong secret | **401** `Unauthorized: missing or invalid cron secret.` |
| `?dryRun=1` | **200** — due-today `1 cand / 1 rec / 0 unroutable`; overdue `79 cand / 5 rec / 35 unroutable`; sent 0, stamped 0 |
| `?pass=nope` | **400** `Invalid pass. Use: due-today, overdue, or all.` |
| `POST ?dryRun=1&pass=overdue` | **200** — `dueToday: null`, overdue `79/5/35` |

### Live engine run (real DB, injected capture sender, then full restore)
| Scenario | Result |
|---|---|
| **1st run (both passes)** | due-today: **1 sent** (`peter@czarnikov.example`, A-331, subject dated `2026-11-02`), stamped 1. overdue: **5 consolidated e-mails** (craig/jo/mark/michael/peter…) covering **44 routable tasks** of 79 candidates (79 − 35 unroutable = 44), stamped **44** |
| **Re-run, same day** | 0 due-today candidates, 0 overdue groups — same-day idempotency holds |
| **Simulated Graph outage** | 6 send failures reported, **stamped 0** — fail-closed, next run retries |
| **Next-day clock (`now+24h`)** | overdue **80 candidates** (A-331 rolls in), **5 groups**, **45 stamped**, subject dated `2026-11-03` — daily re-fire proven |
| **Restore** | 45 rows rewound, **0 stamps remain**; temp harness deleted |

### Browser e2e
| Check | Result |
|---|---|
| PMO login (`pmo@pmct.io`) | → hash **`#/priorities`** |
| PM login (`pm.david@pmct.io`) | → hash **`#/priorities`**, scope `"PM"` |
| Fresh entry, empty hash (PMO session) | → **`#/priorities`** |
| Explicit `#/dashboard` deep link (PMO) | honoured — stays on Executive Control Tower |
| Widgets (PMO, real data) | **64** overdue-7d / **1** due-today / **12** upcoming / **41** action-not-taken, each with its condition hint |
| Theme | `.dark` wrapper present, background `rgb(7, 11, 20)` (high-contrast dark) |
| API payload | `scope: "PMO"`, `today: "2026-11-02"`, facets `0/0/41/0` (= 41); boundary samples: due-today A-331 `delta 0` (assignee peter), overdue `delta 7`, upcoming `delta -1` |
| Row click | → `#/tasks?focus=cmvqw0o9900klzn5kuu4shrff` |
| PM scope (david) | all counts 0 — correct: no assigned/owned work |

> Dashboard **Overdue = 64** vs engine **overdue candidates = 79** is expected: the widget shows only what became overdue **in the last 7 days**, while the escalation engine covers **any** past-due age.

### Sandbox limitation
`AZURE_*` / `MAIL_SENDER_EMAIL` are absent in this environment, so **real Microsoft Graph delivery could not be exercised** — every send above was verified through the injected capture sender, plus dry-run mode. With Graph vars present, the same code path calls `graphClient.sendEmail`; no other change is required.

---

## 8. File map

```
prisma/schema.prisma                     Task.dueTodayEmailedAt / overdueEmailedAt
src/lib/constants.ts                     ON_HOLD, TASK_TERMINAL_STATUS, TASK_DASHBOARD_ROLES
src/lib/priorities/windows.ts            pure: four windows + both e-mail rules + recipient/grouping
src/lib/priorities/templates.ts          pure: buildDueTodayEmail / buildOverdueEmail (escaped, dark)
src/lib/priorities/dashboard.ts          collectPriorities, scopeFor, payload/facet shapes
src/lib/priorities/emails.ts             runTaskAlerts / passes, stamps-after-send, Sender injection
src/app/api/dashboard/priorities/route.ts  GET widget API (perm project.view)
src/app/api/cron/task-alerts/route.ts    CRON_SECRET cron (both passes, dryRun/pass params)
src/views/priorities/priorities.tsx      4-widget forced-dark view (#/priorities)
src/views/registry.tsx                   route registration
src/components/pmct/nav-items.tsx        "Priority Dashboard" nav entry (Execute group)
src/components/pmct/shell.tsx            landingAfterLogin()
src/app/page.tsx                         routing wiring (handleLogin + one-shot fresh entry)
mini-services/scheduler/index.ts         local worker :3004 (/health, /run, 10-min tick)
vercel.json                              cron "0 7 * * *"
package.json                             scheduler / scheduler:node scripts
tests/engines/priorities.test.ts         21 unit tests (windows, rules, recipients, templates, roles)
src/views/execute/shared/KanbanBoard.tsx ON_HOLD column presentation
src/lib/notificationData.ts              terminal statuses via TASK_TERMINAL_STATUS
```

## 9. Operating notes

- **Vercel:** set `CRON_SECRET` (and `AZURE_*` + `MAIL_SENDER_EMAIL` for real delivery); the cron fires daily at 07:00 UTC — Vercel invokes `GET /api/cron/task-alerts` with `Authorization: Bearer $CRON_SECRET`.
- **Self-hosted:** run `npm run scheduler:node` alongside the app; it ticks every 10 minutes (equivalent daily coverage) and falls back to dry-run when Graph is not configured. `GET /run?dryRun=1` triggers an immediate report.
- **Retries are automatic:** any failed send leaves its stamps untouched, so the next tick/cron re-attempts the same e-mail — there is no lost-alert window shorter than one run interval.
