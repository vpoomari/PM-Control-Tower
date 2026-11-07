# PM CONTROL TOWER — AI AGENT CATALOGUE

**Version 1.0 · 2026-11-07 · Companion to `docs/AI-PMO-OPERATING-PROCEDURES.md`**

Fourteen configurable agents that do work *inside* PM Control Tower when activated: they read live platform data, report findings through an append-only ledger, draft actions for approval and — within hard limits — execute bounded writes. Everything is configured in **Administration → Settings → AI Agents** (`#/admin/settings?tab=agents`, admin.config) and observable from the **AI Hub** (`#/ai`).

---

## 1. Architecture — how a run works

```
Trigger (MANUAL via "Run now" · SCHEDULED via cron/scheduler sweep)
   │  gates: AGENT_RUNTIME kill switch → profile ACTIVE? → cadence due? → token budget?
   ▼
definition.run(ctx)  ── pure READS through src/lib/agents/data.ts ──► deterministic findings
   ▼
narrate()  ── askAISystem() when a key is configured, honest HEURISTIC line otherwise
   ▼
action? ──┬─ requiresApproval (Phase 2) ──► AgentRun = PENDING_APPROVAL ──► admin Approve/Reject
          └─ autonomous (Phase 3)       ──► applyAction() immediately  ──► AgentRun = APPLIED/FAILED
   ▼
monitors raise de-duplicated AlertEvents (source `AGENT:<key>`, status NEW, title)
   ▼
AgentRun ledger (append-only) + AuditEvent (EXECUTE) + realtime "agent:run"
```

**Design rule: deterministic data layer, AI only narrates.** Every number in a finding comes from `src/lib/agents/data.ts`. The model never invents metrics; the narration source of every run is recorded as `AI` or `HEURISTIC` on the ledger row.

### Enterprise guarantees

| Guardrail | Where |
|---|---|
| Global kill switch (`FeatureFlag` key `AGENT_RUNTIME`, missing row = enabled) | `runner.ts` — blocks runs **and** approvals |
| Per-agent activation (PAUSED by default) | `AgentProfile.status`; paused agents cannot run, even manually |
| RBAC | every API route behind `withApi(..., { permission: "admin.config" })`; cron behind `CRON_SECRET` (constant-time compare, fails closed) |
| Cadence control | `MANUAL / HOURLY / DAILY / WEEKLY` per agent (org override); scheduled sweeps only run what is **due** |
| Token budget | per-agent lifetime token cap (0 = unlimited), checked **before** the run |
| Approval gate | Phase 2 actions park on `PENDING_APPROVAL`; only an admin approval executes them |
| Zod-validated writes | every action re-validated + referentially checked in `apply.ts` (the only file where agents write) |
| Audit | every run and every decision → `AuditEvent` (`EXECUTE` / `APPROVE` / `REJECT`, context `agent:<key>`) |
| Ledger | `AgentRun` append-only: trigger, status, findings, action, narration source, tokens, approver |
| Honest fallback | no key/quota/network → `HEURISTIC` narration, run still succeeds; `AIResult` never throws |
| Rate limiting | `askAISystem` rate-limits per actor tag (`ai-system:agent:<key>`), 30/min |
| Realtime | `agent:run` event → settings view + AI Hub refetch live |
| Structural tests | `tests/engines/agents.test.ts` (13 tests) enforces read-only monitors, zod gating, guardrails, wiring |

---

## 2. The catalogue (14 agents)

### Phase 1 — Read-only monitors (6) · zero writes to business records

| # | Key | Name | Role | Cadence | Reads | Produces | Tunable thresholds |
|---|---|---|---|---|---|---|---|
| 1 | `deadline-sentinel` | Deadline Sentinel | PM | DAILY | open tasks past due + milestones in the look-ahead | WARNING/CRITICAL findings per slip; raises alerts | milestone look-ahead (d), critical-after (days overdue), max findings |
| 2 | `dependency-ripple` | Dependency Ripple | PM | DAILY | overdue predecessors feeding open successors | per-ripple impact notice (cross-project ripples = CRITICAL); raises alerts | critical-after (days overdue), max findings |
| 3 | `evm-watchdog` | EVM Watchdog | DM | WEEKLY | latest EVM period per project + budget roll-up | CPI/SPI drift + forecast-over-budget findings; raises alerts | cpi/spi warn + critical, budget overrun % |
| 4 | `capacity-sentinel` | Capacity Sentinel | RM | DAILY | live assignment load per resource | stretch findings (>90 %) with the assignments behind them; raises alerts | stretch %, critical % |
| 5 | `executive-briefing` | Executive Briefing | PMO | DAILY | portfolio counts, overdue, milestones, hot risks, EVM | one digest of the portfolio's true state | look-ahead (d), hot-risk score, overdue warning count |
| 6 | `data-quality-auditor` | Data Quality Auditor | PMO | DAILY | duplicate codes, missing dates, ownerless risks, unassigned overdue, thin gate packs | integrity findings; raises alerts | gate look-ahead (d) |

### Phase 2 — Approval-gated drafters (5) · draft → human approves → apply

| # | Key | Name | Role | Cadence | Drafts (approval required) |
|---|---|---|---|---|---|
| 7 | `cr-intake` | CR Intake | PM | MANUAL | natural-language client request → identifies the project → `CHANGE_REQUEST_CREATE` (DRAFT CR with impact fields) |
| 8 | `status-report` | Status Reporter | PM | WEEKLY | live schedule/risks/EVM → `NOTIFY` the PMO inbox with the drafted weekly summary |
| 9 | `risk-brainstormer` | Risk Brainstormer | PM | WEEKLY | hot risks without a plan → `RISK_MITIGATION_UPDATE` with a category-aware mitigation draft |
| 10 | `workload-balancer` | Workload Balancer | RM | DAILY | stretched person + under-loaded candidate → `ASSIGNMENT_REASSIGN` (move N % of one assignment) |
| 11 | `gate-readiness` | Gate Readiness | DM | DAILY | upcoming stage gates → evidence/criteria/approver gaps → `NOTIFY` (flags only — it can never pass a gate) |

### Phase 3 — Autonomous within hard limits (3) · no gate, catalogue-bounded

| # | Key | Name | Role | Cadence | Executes | Hard limits |
|---|---|---|---|---|---|---|
| 12 | `import-export-agent` | Import/Export Agent | PMO | MANUAL | `EXPORT_PLAN` → delivers a column/scope plan to the PMO inbox | never writes imported rows; imports are routed to the validated wizard (validate → dry-run → apply) |
| 13 | `governance-router` | Governance Router | DM | DAILY | wraps `evaluateGovernance()` → `NOTIFY` routing of every breach | acts only on admin-authored rules; the engine owns alert creation |
| 14 | `knowledge-curator` | Knowledge Curator | PMO | WEEKLY | `KNOWLEDGE_PUBLISH` → distils fresh decisions/closed risks into AI memory | **add-only** (never edits/deletes), ≤ 3 entries/run (tunable), deduplicated by content |

---

## 3. Action types (the only writes agents can make)

All six are declared in `src/lib/agents/apply.ts` with a zod schema, DB existence/range checks, size caps and an audit entry:

| Action | Handler validates | Effect |
|---|---|---|
| `CHANGE_REQUEST_CREATE` | project exists, title 3–160, category/priority enums | creates a `ChangeRequest` in **DRAFT** with auto `CR-###` code |
| `RISK_MITIGATION_UPDATE` | risk exists, mitigation 20–4000 chars | updates `Risk.mitigation` (+ strategy MITIGATE) |
| `ASSIGNMENT_REASSIGN` | assignment/target exist, move < current allocation | splits the allocation inside a `$transaction` |
| `NOTIFY` | title/message/severity, recipients resolved (roles → PMO_ADMIN fallback, ≤ 20) | creates `Notification` rows |
| `KNOWLEDGE_PUBLISH` | ≤ 5 entries, kind enum, content ≤ 500 | upserts `AiKnowledge` (weight++ on duplicate) |
| `EXPORT_PLAN` | request/entities/format | delivers an inbox item with the export plan |

Anything else is rejected: `applyAction()` returns `{ ok: false, detail }`, the run is marked `FAILED` and nothing is written.

---

## 4. Configuration — Administration → Settings → AI Agents

- **Status band** — 14 agents split 6/5/3, runtime chip (enabled/disabled), pending-approval badge.
- **Approval queue** — every `PENDING_APPROVAL` run with its proposed action and **Approve & run** / **Reject** decisions (reject writes nothing).
- **Agent cards** — activation switch, cadence select, lifetime token budget, per-threshold number inputs (clamped server-side to declared min/max), **Save** (audited) and **Run now** (free-text input for the two MANUAL natural-language agents).
- **Run history** — the last 25 ledger rows: agent, status badge, summary, narration source (`AI`/`HEURISTIC` chip), tokens, when; filterable by agent.

Deep link from the **AI Hub**: the *AI Agents* card navigates to `#/admin/settings?tab=agents`.

### Activation recipe

1. Toggle **Active** on the agents you want → **Save** (default is PAUSED for all 14 — nothing runs unless you say so).
2. Optional: set cadence/thresholds/budget per agent.
3. **Run now** to test, or let the schedule drive them.
4. Phase 2 runs arrive in the approval queue; approve when the draft looks right.

---

## 5. Scheduling

| Surface | Path | Gate |
|---|---|---|
| Vercel cron (production) | `GET /api/cron/agents` hourly at :15 (`vercel.json`) | `CRON_SECRET` bearer, fails closed when unset |
| Local/self-host scheduler | `mini-services/scheduler/index.ts` tick (default 10 min) | in-process; agent sweep isolated in its own try/catch |
| Manual | `POST /api/agents/<key>` | `admin.config` |

The sweep runs only `ACTIVE` agents whose cadence is **due** (`lastRunAt` + window), paced 250 ms apart, and honours the kill switch. `?dryRun=1` reports who *would* run.

---

## 6. Data model

```prisma
model AgentProfile {   // org activation + config (upserted lazily from the catalogue)
  key @unique · status PAUSED|ACTIVE · configJson · budgetTokens · runCount · lastRunAt
}
model AgentRun {       // append-only run ledger
  agentKey · trigger MANUAL|SCHEDULED · status SUCCESS|NO_FINDINGS|FAILED|PENDING_APPROVAL|
  APPLIED|REJECTED|SKIPPED · summary · findingsJson · actionType/actionJson ·
  narrationSource AI|HEURISTIC · tokens · durationMs · actor · approvedBy/approvedAt · rejectedReason
}
```

Supporting pieces: `AIExecution` rows for system AI calls carry `userId: null` and `dataScopeUsed = "AGENT:<key>"`; raised alerts use `AlertEvent.source = "AGENT:<key>"` (de-duplicated on source + status NEW + title).

## 7. API surface

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/api/agents` | GET | admin.config | roster (definitions + profiles), kill-switch state, pending count |
| `/api/agents` | PATCH | admin.config | activate/pause, thresholds, cadence, budget (audited) |
| `/api/agents/[key]` | POST | admin.config | manual run `{ input? }` → `RunOutcome` |
| `/api/agents/runs` | GET | admin.config | ledger with parsed findings/actions |
| `/api/agents/runs/[id]` | POST | admin.config | `{ decision: APPROVE \| REJECT }` |
| `/api/cron/agents` | GET | CRON_SECRET | scheduled sweep (`?dryRun=1`) |

## 8. Verification

- `tests/engines/agents.test.ts` — 13 structural tests: canonical 14 keys, phase/family/approval contract, threshold⇄default consistency, read-only monitors (no write verbs), definitions never touch Prisma, zod gating for all six actions, runner guardrails, schema fields, RBAC/cron-secret wiring, settings + AI Hub + realtime + schedulers.
- Gates: `tsc --noEmit` clean · `eslint --max-warnings=0` clean · suite **288/288**.
- Browser e2e: activate → run (30 findings, HEURISTIC narration, ledger row) → Phase 2 approval (`PENDING_APPROVAL` → Approve → `APPLIED`, 3 recipients notified) → AI Hub deep link → **zero console errors**.
- Cron e2e: correct secret → dry-run report (`scanned=2, due=[]`), wrong secret → 401.
