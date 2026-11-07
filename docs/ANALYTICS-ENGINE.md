# PMO Analytics Engine — Architecture & Design

**The Command Center (PM Control Tower) · 50 reports · 5 functional modules**
Status: implemented (47 live / 3 roadmap) · Stack: Next.js · React · Tailwind · Node · Prisma (SQLite sandbox → PostgreSQL in production)

---

## 1. Purpose & alignment

The analytics engine powers a **PMO Analytics** section (`#/insights`) that computes **50 comprehensive reports** across five functional modules. Every report is **computed from real data** — there are no hardcoded dashboard metrics. Where a report's source data has not been captured yet, the report renders an honest **empty state with capture hints** rather than fabricated numbers.

Structural hierarchy follows the branding pillars, mapped onto the app motto `PLAN | EXECUTE | MONITOR | GOVERN | DELIVER`:

| Module | id | Pillar | Reports |
|---|---|---|---|
| Planning & Initiation | `planning` | PLAN | 8 |
| Resource & Capacity | `resources` | EXECUTE | 8 |
| Execution & Delivery | `delivery` | MONITOR | 12 |
| Budgeting & Cost | `cost` | DELIVER | 12 |
| Quality, Risk & Closure | `quality` | GOVERN | 10 |

**Design constraint honored:** all existing functionality, routes, data, APIs, auth, permissions and business logic are untouched; the engine is purely additive (`#/insights` route, `/api/analytics/*` routes, `src/lib/analytics/**`).

---

## 2. System architecture

Registry-driven: reports are declared as **data**, computes are plain functions, one generic renderer draws everything.

```
┌────────────────────────────────────────────────────────────────────────┐
│  SOURCE MODELS (Prisma, existing tables — no migration required)       │
│  Project · Task · WBSNode · Baseline · Milestone · StageGate · Risk ·  │
│  Issue · Dependency · ChangeRequest · Resource · Assignment ·          │
│  Timesheet(+Entry) · Sprint · Epic · BudgetLine · EvmPeriod ·          │
│  Invoice · Expense · QualityRecord · UatCycle/Case · Benefit* ·        │
│  BusinessCase · Stakeholder · Vendor · Deliverable · FeedbackPost ·    │
│  ProjectHealthSnapshot · ProjectForecast · StrategicObjective · …      │
└───────────────┬────────────────────────────────────────────────────────┘
                │ ① loadAnalyticsContext()  — one batched Promise.all fan-out
                ▼    (src/lib/analytics/context.ts, ~39 model reads, no N+1)
┌────────────────────────────────────────────────────────────────────────┐
│  FACT CONTEXT (typed, project-scopeable)                               │
│  ctx.projects / ctx.tasks / ctx.budgetLines / ctx.timesheets / …       │
└───────────────┬────────────────────────────────────────────────────────┘
                │ ② compute(ctx) — pure-ish functions per report
                ▼    (src/lib/analytics/modules/*.ts + formulas.ts + evm.ts)
┌────────────────────────────────────────────────────────────────────────┐
│  METRIC MATH (tested, DB-free)                                         │
│  EVM family (CPI/SPI/EAC/ETC/VAC/TCPI) · rates · aging buckets ·       │
│  MAPE · on-time stats · risk exposure & heat bands · burndown ·        │
│  skill gap · CoQ shares · bucketize   →  tests/engines/analytics.test  │
└───────────────┬────────────────────────────────────────────────────────┘
                │ ③ registry bind() stamps reportId/title/module/generatedAt/scope
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│  REPORT PAYLOAD (JSON, serializable) — one shape for all 50:           │
│  { kpis[], charts[], tables[], notes[], emptyHints? }                  │
└───────────────┬────────────────────────────────────────────────────────┘
                │ ④ GET /api/analytics/report/[id]  (withApi, reports.view)
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│  ONE GENERIC RENDERER  src/views/intelligence/insights-report.tsx      │
│  KPIs → StatCard · charts → Panel+Bar3D/Donut3D/Area3D/Gauge3D ·      │
│  tables → DataTable · roadmap → spec card                              │
└────────────────────────────────────────────────────────────────────────┘
```

### Why registry-driven

- **50 reports stay tractable**: adding a report = one spec entry + one compute function; no bespoke page, route or API per report.
- **Consistency**: identical KPI/chart/table rendering, formatting (`ValueFormat` tokens) and provenance strip on every report.
- **Honesty by construction**: the payload carries `notes` (methodology) and `emptyHints` (capture path); roadmap reports return `payload: null` + `roadmapNote` — the UI can never display invented numbers.
- **Transparency**: the one-line `formula` from the spec is rendered on every report page.

---

## 3. Data architecture

### 3.1 Engine layout (all files new)

```
src/lib/analytics/
├── types.ts        # ReportPayload / ReportSpec / ChartSpec / ModuleMeta / BRAND (client-safe)
├── formulas.ts     # pure metric math (unit-tested)
├── context.ts      # loadAnalyticsContext(projectId?) — batched Prisma reads
├── evm.ts          # projectEvm()/evmTotals() — stored EvmPeriod or live computeEVM()
├── format.ts       # ValueFormat → display strings + chart formatter callbacks (client-safe)
├── registry.ts     # 50 ReportSpecs + compute bindings + catalog()
└── modules/
    ├── planning.ts # 8 computes    ├── resources.ts # 8 computes
    ├── delivery.ts # 11 computes   ├── cost.ts      # 12 computes
    └── quality.ts  # 8 computes    (3 reports are roadmap: no compute)
src/app/api/analytics/
├── catalog/route.ts          # GET — module + report metadata
└── report/[id]/route.ts      # GET — live payload (?projectId= optional scope)
src/views/intelligence/
├── insights.tsx              # hub: 50 cards grouped by module, search + filters
└── insights-report.tsx       # generic renderer
src/components/pmct/report-badge.tsx  # LIVE / ROADMAP badge
```

Server-only modules (`context`, `registry`, `modules`) use **relative imports** (`../constants`) matching the engines convention; views/API import via `@/` aliases. `types.ts` and `format.ts` are client-safe (no DB imports).

### 3.2 Source-of-truth map (per report family)

| Concern | Source models | Engine reused |
|---|---|---|
| EVM family (EVM/SPI/CPI/EAC/ETC) | `EvmPeriod` (stored) → fallback `Task` + `Project` | `engines/evm.ts computeEVM()` |
| Schedule (OTD, milestone variance, critical path) | `Milestone`, `Deliverable`, `Task.totalFloat` | CPM engine outputs |
| Agile (velocity, burndown, epics) | `Sprint`, `Epic`, `Task.sprintId/epicId/storyPoints` | — |
| Financials (budget, margin, cash flow, aging) | `BudgetLine`, `Invoice`, `Expense`, `ProjectForecast` | `engines/finance.ts` (case metrics) |
| Resource (utilization, allocation, burn) | `Timesheet(+Entry)`, `Assignment`, `Resource` | — |
| RAID (risk exposure, blockers, mitigation) | `Risk`, `Issue`, `ProjectHealthSnapshot` | — |
| Quality (CoQ, defects, UAT, PIR) | `QualityRecord`, `UatCycle`, `UatCase` | — |
| Benefits/closure (realization, TTV, PIR) | `BenefitProfile/Actual/Review`, `StageGate` | `engines/benefits.ts` patterns |
| Strategy (alignment, feasibility) | `StrategicObjective`, `Portfolio`, `BusinessCase` | `engines/finance.ts` |

### 3.3 Data readiness census (actual sandbox DB, 2026-10-24)

The engine was designed against a census of the live database:

| Captured | Rows | Not yet captured (0 rows) |
|---|---|---|
| 1 project (PRJ-CZR-FLOW), 364 tasks, 76 dependencies, 19 risks, 10 milestones, 12 health snapshots, 3 issues, 1 baseline, 10 resources/assignments, 1 portfolio, 1 program | plan + RAID + resources | budgetLine, evmPeriod, timesheets, sprints, epics, invoices, expenses, quality/UAT, benefits, businessCases, stakeholders, vendors, deliverables, feedback, objectives, stageGates, changeRequests, forecasts |

Consequences built into the design:

1. **EVM reports compute live from tasks** via `computeEVM()` when no `EvmPeriod` rows exist (reports show `Source: CALCULATED` in the EVM table).
2. **Every report degrades gracefully**: KPIs stay numeric (0/neutral), charts/tables collapse, `emptyHints` tells the user exactly where to capture the data (e.g. *"No Budget Lines captured yet — define the budget breakdown in Financials"*).
3. **No DB migration is required for 47 of 50 reports.**

### 3.4 Optional schema extensions (3 roadmap reports only)

The repository has **no `prisma/migrations`** (the DB is `db push`-managed; production targets PostgreSQL with the same models). The three roadmap reports need additive models — designed here, **not applied** (application is a deliberate, separate step: add models → `prisma db push` in SQLite sandbox → equivalent migration in Render PostgreSQL):

```prisma
// Task status transitions → true cycle time (report: task-completion-cycle-time)
model TaskStatusHistory {
  id         String   @id @default(cuid())
  taskId     String
  fromStatus String
  toStatus   String
  changedAt  DateTime @default(now())
  changedById String?
  @@index([taskId, changedAt])
}

// Satisfaction capture → CSAT (report: csat-dashboard)
model CsatResponse {
  id        String   @id @default(cuid())
  projectId String?
  clientId  String?
  rating    Int      // 1..5
  comment   String?
  touchpoint String?
  createdAt DateTime @default(now())
  @@index([projectId, createdAt])
}

// Structured lessons → lessons summary (report: lessons-learned-summary)
model LessonLearned {
  id        String   @id @default(cuid())
  projectId String?
  category  String   // SCOPE | SCHEDULE | COST | QUALITY | RESOURCE | COMMS | RISK
  theme     String
  lesson    String
  action    String?
  ownerId   String?
  status    String   @default("OPEN") // OPEN | IN_PROGRESS | DONE
  createdAt DateTime @default(now())
  @@index([projectId, category])
}
```

Each roadmap report's `roadmapNote` (shown in the UI) references this section. Once the table exists, the compute function is added and the spec flips to `status: "live"` — no other code changes.

---

## 4. Backend calculation logic

### 4.1 Conventions

- All division through `safeDiv`; all outputs through `round2` — same rules as existing engines.
- `CPI = EV/AC` and `SPI = EV/PV` return honest neutral `1` when denominator is 0 (never `NaN`), and the report's `notes`/`emptyHints` explain missing capture.
- Time math via `dayNum()`; aging buckets `0-7 / 8-14 / 15-30 / 31-60 / 60+`.
- Batched reads + JS bucketing only (no raw SQL), matching API conventions.
- `loadAnalyticsContext(projectId?)` supports portfolio scope (default) or single-project scope (`?projectId=` on the report API).

### 4.2 Metric catalog — all 50 reports

**Legend** — Status: ✅ live · 📅 roadmap. Sources abbreviated to Prisma models.

#### Module 1 · Planning & Initiation (PLAN) — 8/8 live

| # | Report | id | Formula | Sources |
|---|---|---|---|---|
| 1 | Strategic Portfolio Alignment | `strategic-alignment` | aligned projects ÷ total; budget per objective | Project, StrategicObjective, Portfolio |
| 2 | Feasibility & ROI | `feasibility-roi` | NPV/IRR/payback from finance engine over case cash flows | BusinessCase |
| 3 | Resource Capacity Demand | `capacity-demand` | Σ plannedHours×(1−progress) ÷ (Σ capacityHoursPerWeek) | Task, Resource |
| 4 | Project Baseline Definition | `baseline-definition` | drift = current finish − baseline finish; cost drift % | Baseline, Project |
| 5 | Stakeholder Mapping | `stakeholder-mapping` | 3×3 Mendelow matrix over influence/interest bands | Stakeholder |
| 6 | Vendor Procurement Readiness | `vendor-procurement-readiness` | vendor status mix; budget lines with resolvable vendorId | Vendor, BudgetLine |
| 7 | Initial Risk Assessment | `initial-risk-assessment` | exposure = Σ p×i; bands LOW<4≤MEDIUM<8≤HIGH<15≤SEVERE | Risk |
| 8 | Phase-Gate Timeline | `phase-gate-timeline` | overdue = PENDING decision with plannedDate < today | StageGate, Milestone |

#### Module 2 · Resource & Capacity (EXECUTE) — 8/8 live

| # | Report | id | Formula | Sources |
|---|---|---|---|---|
| 9 | Billable Utilization | `billable-utilization` | billableHours ÷ (capacityHoursPerWeek × weeks) | Timesheet, Resource |
| 10 | Resource Allocation | `resource-allocation` | Σ assignment.allocationPercent; OVER > 100% | Assignment, Resource |
| 11 | Non-Billable Time | `non-billable-time` | nonBillable ÷ (billable + nonBillable + leave + holiday) | Timesheet |
| 12 | Skills Gap Matrix | `skills-gap-matrix` | role demand headcount − skill-covered headcount | Assignment, Resource |
| 13 | Cross-Functional Team Velocity | `cross-functional-velocity` | Σ storyPoints of COMPLETED tasks per sprint | Sprint, Task |
| 14 | Timesheet Variance | `timesheet-variance` | (logged − planned) ÷ planned; lag = approvedAt − submittedAt | Timesheet, Assignment |
| 15 | Contractor vs FTE Burn Rate | `contractor-ft-burn` | Σ hours × costRate grouped by resourceType | Timesheet, Resource |
| 16 | Leave & Absence Impact | `leave-impact` | at risk = leave > 0 ∧ allocation ≥ 80% | Timesheet, Assignment |

#### Module 3 · Execution & Delivery (MONITOR) — 11 live + 1 roadmap

| # | Report | id | Formula | Sources | Status |
|---|---|---|---|---|---|
| 17 | EVM Summary | `evm-summary` | EV = Σ plannedCost×progress; CPI = EV÷AC; SPI = EV÷PV | Task, EvmPeriod, Project | ✅ |
| 18 | SPI Dashboard | `spi-dashboard` | SPI = EV ÷ PV (+ trend from periods/snapshots) | EvmPeriod, ProjectHealthSnapshot | ✅ |
| 19 | OTD Tracking | `otd-tracking` | on time = actual ≤ due; open items excluded | Milestone, Deliverable | ✅ |
| 20 | Sprint Burndown/Burnup | `sprint-burndown` | remaining(d) = Σ points of tasks with endDate > d; ideal = linear burn | Sprint, Task | ✅ |
| 21 | Critical Path Delay | `critical-path-delay` | isCritical ∧ (totalFloat < 0 ∨ endDate < today) | Task | ✅ |
| 22 | Scope Creep & Change Requests | `scope-creep-change-requests` | creep index = approved CR hours ÷ baseline hours | ChangeRequest, Baseline | ✅ |
| 23 | Cross-Project Dependency | `cross-project-dependency` | blocked = successor BLOCKED; cross = projectIds differ | Dependency, Task | ✅ |
| 24 | Agile Epic/Feature Delivery | `agile-epic-delivery` | epic % = completed tasks ÷ linked tasks | Epic, Task | ✅ |
| 25 | Task Completion Cycle Time | `task-completion-cycle-time` | completedAt − firstInProgressAt, percentile by WBS level | TaskStatusHistory (planned) | 📅 |
| 26 | Blocker Aging | `blocker-aging` | age = days(now − raisedAt) into 5 buckets | Issue | ✅ |
| 27 | Milestone Variance | `milestone-variance` | completedAt − (baselineDate ∥ dueDate) | Milestone | ✅ |
| 28 | SLA Compliance | `sla-compliance` | issue: resolvedAt ≤ dueDate; RFI: C 1d / H 3d / M 5d / L 10d | Issue, Rfi | ✅ |

#### Module 4 · Budgeting & Cost (DELIVER) — 12/12 live

| # | Report | id | Formula | Sources |
|---|---|---|---|---|
| 29 | CPI Dashboard | `cpi-dashboard` | CPI = EV ÷ AC; CV = EV − AC | EvmPeriod, Task |
| 30 | Budget Variance | `budget-variance` | (current − baseline) ÷ baseline; burn = actual ÷ current | BudgetLine |
| 31 | Project Gross Margin | `project-gross-margin` | invoiced subtotal − project actual cost; ÷ revenue | Invoice, Project, Expense |
| 32 | EAC Forecast | `eac-forecast` | EAC = BAC÷CPI; VAC = BAC−EAC; TCPI = (BAC−EV)÷(BAC−AC) | EvmPeriod, Task |
| 33 | ETC Report | `etc-report` | ETC = EAC − AC | EvmPeriod, Task |
| 34 | CapEx vs OpEx | `capex-opex` | Σ case CapEx vs OpEx items; expense keyword fallback | BusinessCase, Expense |
| 35 | Cash Flow Forecast | `cash-flow-forecast` | monthly = Σ budgetLine.forecast(period) + forecast.cost(period) | BudgetLine, ProjectForecast |
| 36 | Contingency Reserve Depletion | `contingency-reserve-depletion` | contingency actual ÷ contingency current | BudgetLine |
| 37 | Vendor Spend Analytics | `vendor-spend-analytics` | Σ expenses.vendorName + vendor-linked budget lines | Expense, BudgetLine, Vendor |
| 38 | WBS Cost Analytics | `wbs-cost-analytics` | (actual − planned) ÷ planned on level-1 WBS nodes | WBSNode |
| 39 | AP/AR Aging | `ap-ar-aging` | AR buckets by days past due; AP = unpaid expenses | Invoice, Expense |
| 40 | Revenue Forecast Accuracy | `revenue-forecast-accuracy` | MAPE = mean(\|forecast − actual\| ÷ actual) × 100 | ProjectForecast, Invoice |

#### Module 5 · Quality, Risk & Closure (GOVERN) — 8 live + 2 roadmap

| # | Report | id | Formula | Sources | Status |
|---|---|---|---|---|---|
| 41 | Risk Exposure Trend | `risk-exposure-trend` | exposure = Σ p×i (open); trend from health snapshots | Risk, ProjectHealthSnapshot | ✅ |
| 42 | CoQ Analytics | `cost-of-quality` | failure share = (internal + external) ÷ quality events | QualityRecord, UatCase | ✅ |
| 43 | Defect Density | `defect-density` | defects ÷ storyPoints × 100 (fallback: per deliverable) | QualityRecord, UatCase, Task | ✅ |
| 44 | Test Coverage / UAT | `test-coverage-uat` | executed ÷ total; pass rate = PASS ÷ executed | UatCycle, UatCase | ✅ |
| 45 | Mitigation Cost-Benefit | `mitigation-cost-benefit` | (p×i) − (residual p × residual i) per mitigated risk | Risk | ✅ |
| 46 | CSAT Dashboard | `csat-dashboard` | mean(rating) ÷ 5 × 100 over CsatResponse | CsatResponse (planned) | 📅 |
| 47 | TTV Realization | `ttv-realization` | months = (first BenefitActual − activatedAt) ÷ 30.44 | BenefitProfile, BenefitActual | ✅ |
| 48 | PIR Scorecard | `pir-scorecard` | avg PIR score + gates passed + benefit reviews | QualityRecord, StageGate, BenefitReview | ✅ |
| 49 | Benefits Realization | `benefits-realization` | Σ BenefitActual ÷ (target − baseline) | BenefitProfile/Actual/Review | ✅ |
| 50 | Lessons Learned Summary | `lessons-learned-summary` | group by theme/project; action completion rate | LessonLearned (planned) | 📅 |

**Roadmap notes (rendered in the UI for #25/#46/#50):** true cycle time needs `TaskStatusHistory`; CSAT needs a `CsatResponse` register (FeedbackPost votes track engagement, not satisfaction — no proxy is faked); lessons need a `LessonLearned` register (DocPage/Decision hold free-form knowledge with no tagged lessons to aggregate). See §3.4.

---

## 5. API contract

### `GET /api/analytics/catalog`
Permission `reports.view`. Metadata only (no computes, no DB reads).

```json
{ "success": true, "data": {
  "modules": [{ "id": "planning", "label": "Planning & Initiation", "pillar": "PLAN",
                "accent": "#2864FF", "description": "…", "reportCount": 8, "liveCount": 8 }, …],
  "reports": [{ "id": "evm-summary", "module": "delivery", "pillar": "MONITOR",
                "title": "EVM Summary", "subtitle": "…", "formula": "EV = Σ plannedCost×progress …",
                "sources": ["Task","EvmPeriod","Project"], "status": "live" }, …],
  "generatedAt": "2026-10-24T…Z"
} }
```

### `GET /api/analytics/report/[id]`
Permission `reports.view`. Optional `?projectId=<id>` narrows every source read (404 for unknown project, 404 for unknown report id).

```json
{ "success": true, "data": {
  "report":   { "id": "…", "formula": "…", "sources": ["…"], "status": "live", "roadmapNote": null },
  "moduleMeta": { "id": "cost", "accent": "#FFD43B", "pillar": "DELIVER", … },
  "payload":  {
    "reportId": "budget-variance", "title": "Budget Variance", "module": "cost",
    "generatedAt": "2026-10-24T…Z", "scope": { "projects": 1, "label": "Portfolio" },
    "kpis":  [{ "label": "Baseline budget", "value": 0, "format": "money", "tone": "default", "sub": "…" }],
    "charts": [{ "kind": "bar", "title": "…", "series": [{"label":"Baseline","color":"#7C879D"}],
                 "groups": [{"label":"LABOR","values":[120000]}], "format": "money" }],
    "tables": [{ "title": "…", "columns": [{"key":"category","header":"Category","align":"right"}], "rows": […], "maxRows": 30 }],
    "notes": ["Variance = (current − baseline) ÷ baseline."],
    "emptyHints": ["No Budget Lines captured yet — …"]
  }
} }
```

- **Chart kinds** map 1:1 to charts3d primitives: `bar → Bar3D`, `area → Area3D`, `donut → Donut3D`, `gauge → Gauge3D`; `tables → DataTable`.
- **ValueFormat tokens** (`number | money | pct | ratio | days | hours | count`) are rendered by `src/lib/analytics/format.ts`.
- **Roadmap reports** return `"payload": null` + `report.roadmapNote` — the UI shows the specification card.
- Payloads are plain JSON so they can later be persisted into the existing `ReportSnapshot` model without shape changes.

---

## 6. Frontend design

### Routes & navigation

- Hub: **`#/insights`** — nav item **“PMO Analytics”** in the shell *Intelligence* group (icon `PieChart`, permission `reports.view`), wired via `views/registry.tsx` (`case "insights"`).
- Report: **`#/insights/report?id=<report-id>`** (same case, `b === "report"`).
- Existing routes, views and nav entries are untouched.

### Hub (`insights.tsx`)

- `PageHeader` with module/pillar/motto subtitle + live/roadmap counts.
- Toolbar: search (title/subtitle/id/sources) + module filter pills (`aria-pressed`), each showing `live/total`.
- One `SectionCard` per module (accent pillar chip) containing a responsive card grid.
- Card: title + icon (module accent), subtitle, monospace formula preview (`line-clamp-2`), source chips, `LIVE/ROADMAP` badge; whole card is an accessible `<button>` (focus ring, Enter/Space).

### Report page (`insights-report.tsx`)

1. `PageHeader` breadcrumb `PMO Analytics → module → report` + “All reports” back action.
2. **Provenance strip**: formula (code style) + source models + pillar chip + status badge — every number on the page is traceable to its formula.
3. KPI row → `StatCard` (format-aware value, tone, sub, delta, spark).
4. Charts → `Panel` (module accent) wrapping the matching charts3d primitive.
5. Tables → `SectionCard` + `DataTable` (format-aware cell rendering, right-aligned numerics, scroll cap).
6. `emptyHints` → amber capture-guidance note (only present when data is missing).
7. `notes` → Methodology section.
8. Footer: scope + computed-at + report id.
9. Realtime: `useRealtimeRefetch(refetch, ["evm:changed", "project:health", "data:imported"])`.
10. Roadmap reports render the spec card (note + required sources) — never an empty chart grid.

### Theming & accessibility

- Uses shared kit (`StatCard`, `SectionCard`, `DataTable`, `Toolbar`, `SearchInput`) and charts3d primitives — identical ct3d markers and classic-theme fallback as the rest of the app; the **current/base/simple theme remains selectable** alongside default `ct3d`.
- Colors come from the `BRAND` palette in `types.ts` (no ad-hoc hexes).
- WCAG 2.2 AA: buttons/interactive elements are real `<button>`/`<a>` with visible focus rings, `aria-pressed`/`aria-hidden` on decoration, text contrast on light surfaces, charts are pure SVG with text labels (values also exposed via KPI/table fallbacks).
- Motion: charts3d animations already respect `prefers-reduced-motion`; no new animation added.

---

## 7. RBAC & governance

- Both APIs require **`reports.view`** via `withApi(..., { permission: "reports.view" })`; the nav item uses the same permission so read-only reporting roles see it.
- Response envelope (`ok/fail`), auth guard, rate limiting, audit hooks — all inherited from the existing API framework; no new auth paths.
- The engine reads data only (GET); no writes, no plan mutation, no scheduler interaction.
- Existing “15 governance controls” and final-verify invariants are unaffected (additive-only change).

---

## 8. Testing & delivery gates

| Gate | Command | Coverage |
|---|---|---|
| Types | `npx tsc --noEmit` | engine, API, views, tests |
| Lint | `npx eslint <changed files>` | all new/changed files |
| Unit tests | `npm test` | `tests/engines/analytics.test.ts` — EVM family, rates, MAPE, aging buckets, on-time stats, exposure/heat bands, burndown, skill gap, CoQ shares, bucketize (pure, DB-free) |
| Plan integrity | `npx tsx scripts/final-verify.ts` | exit 0, plan pristine (364 tasks / 44 critical / dates / FLW-001 / ASAP) |

Runtime verification: hub + report pages checked in the browser at DOM level (cards, KPIs, charts, provenance strip, empty-hint states, zero console errors).

### Phasing

- **P0 (this delivery)** — engine core, registry with all 50 specs, 47 computes, both APIs, hub + renderer, nav/route wiring, tests, this document.
- **P1 (data capture)** — as financial/timesheet/quality data is captured in Financials, Time Tracking and Quality, the already-live reports light up automatically (empty hints disappear; no code changes).
- **P2 (schema extensions)** — apply the three additive models from §3.4 (`db push` + Postgres equivalent), add three compute functions, flip their specs to `live`.

---

## 9. Operational notes

- Dev server on `:3000`; `prisma generate` only after stopping the dev server (SQLite file lock).
- Context loader cost: ~39 batched reads per report request on SQLite — trivial at current scale; if report volume grows, memoize the context per request across sequential computes or add a short TTL cache at the API layer.
- `loadAnalyticsContext` filters `status ≠ CANCELLED` projects; timesheets/invoices are narrowed by project scope when `?projectId=` is provided.
