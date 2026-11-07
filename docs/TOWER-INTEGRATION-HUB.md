# TowerIntegration Hub — Architecture & Reference

**Date:** 2026-11-01
**Status:** Delivered (schema pushed, 242/242 tests green, e2e verified)
**Scope:** Central API gateway + orchestration engine harmonizing **55 external PM/BI/ERP tools** into the Unified Work Model (UWM) — with **nothing de-linked** from the existing Integration/Webhook surface.

---

## 1. What it is

The TowerIntegration Hub is the single ingress/egress gateway for the external tool ecosystem. Every payload — webhook, poll cycle, BI refresh or CSV upload — runs one deterministic pipeline:

```
identify → authenticate → extract → facade template → UWM harmonize
   → anomalies → Dead Letter Queue (replayable)
   → harmonized items → 6 category queues → WBS / CPM engine handoff
```

Design principles:

- **Pure core, thin service.** Everything in `src/lib/hub/` (registry, uwm, breaker, facade, security, dlq, pipeline) is pure, DB-free and unit-tested. `hub-service.ts` adds persistence (Prisma), audit and realtime.
- **Extends, never replaces.** The existing `/integrations` screen, `Integration` model, connector sync (`connectors.ts`) and webhook subscriptions keep working untouched. Hub connections link *back* to seeded Integration rows via `HubConnection.integrationId` (Jira Software, Azure DevOps, ServiceNow SPM).
- **Nothing is dropped.** Every blocked/anomalous payload lands in the Dead Letter Queue with its raw payload, classified and replayable. Soft anomalies keep items valid; missing requireds block the handoff only for that record.

---

## 2. The 55-tool matrix (6 category queues)

| # | Queue (category) | Tools |
|---|---|---|
| 1 | **Agile & DevSecOps** (`queue.agile_devsecops`) | Jira\*, Assembla\*, VersionOne\*, Azure DevOps, GitHub, GitLab, Bitbucket, Rally, Linear, Shortcut (10) |
| 2 | **Enterprise Work OS / Portfolio** (`queue.work_os_portfolio`) | Broadcom Clarity\*, Asana\*, monday.com\*, Smartsheet\*, ClickUp\*, Zoho Projects\*, Wrike\*, Adobe Workfront\*, LiquidPlanner\*, Microsoft Project, ServiceNow SPM, Trello (12) |
| 3 | **BI & Analytics** (`queue.bi_analytics`) | Power BI\*, Qlik Sense\*, Tableau, Looker, Domo (5) |
| 4 | **Collaboration & Knowledge** (`queue.collab_knowledge`) | SharePoint\*, Notion\*, Confluence\*, Basecamp\*, Slack\*, Microsoft Teams\*, Google Drive, Dropbox, Box, Miro (10) |
| 5 | **Time, Finance & Resource** (`queue.time_finance_resource`) | Harvest\*, Everhour\*, TimeCamp\*, Resource Guru\*, Scoro\*, Paymo\*, Toggl Track, QuickBooks (8) |
| 6 | **Data, Spreadsheets & Specialized** (`queue.data_spreadsheet_specialized`) | Microsoft Excel\*, Google Sheets, CSV Upload, Procore\*, Aha!\*, Airtable\*, Filestage\*, DocuSign, Zendesk, PagerDuty (10) |

\* = one of the **31 tools named explicitly in the directive** (`namedInDirective: true`); the other **24 companions** round out the ecosystem to 55. All 55 have a facade, auth modes, ingress modes and route to exactly one queue — proven by `tests/engines/hub.test.ts`.

**Preserved links:** `HubConnection.integrationId` points at the seeded `Integration` rows for *Jira Software*, *Azure DevOps* and *ServiceNow SPM* — the existing Integration Hub tab, connectors and webhook subscriptions are untouched (nothing de-linked).

---

## 3. Unified Work Model (UWM) rules — `src/lib/hub/uwm.ts`

### 3.1 Identity resolution (external → corporate Email/SSO)
Search order, never throws, unresolved → `null` + `identity_unresolved:*` anomaly:
1. Direct corporate email (`EMAIL` strategy)
2. Provider external-id map — Slack `U…`, Jira account id, Entra object id/GUID (`EXTERNAL_ID`), including any-provider sweep
3. Entra UPN / GUID (`UPN`)
4. Exact display-name fallback (`NAME`)
5. Otherwise `UNRESOLVED` (soft anomaly — item stays valid)

Directory source: `db.user` rows (email + display name); `IdentityProvider` external-id maps plug in via `HubDirectoryEntry.externalIds`.

### 3.2 Status normalization → 5 core states
`TO_DO | IN_PROGRESS | BLOCKED | COMPLETED | CANCELLED`
- Global synonym table (~120 vendor words: Done/closed→COMPLETED, On Hold/Stuck/Impeded→BLOCKED, Backlog/Triage→TO_DO, …)
- **Per-tool overrides** (`HUB_STATUS_OVERRIDES`): ServiceNow codes (`"6"`→COMPLETED), Trello lists, Basecamp, Procore, Filestage, Jira extras (`"Awaiting Client"`→BLOCKED, `"In QA"`→IN_PROGRESS)
- Longest-phrase containment scan for compound values (`"In Progress (QA)"`)
- Unknown vocabulary → safe `TO_DO` default + `status_unmapped:*` anomaly → DLQ WARN

### 3.3 Dates → UTC ISO-8601
`toUtcIso()` accepts: `Date`, epoch seconds/ms, ISO-8601 with/without offset (`+05:30` → UTC), date-only (UTC midnight), Excel serials (1900 system). Unparseable → `null` + `date_unparseable:*` anomaly; absent dates are *not* anomalies.

### 3.4 Priority → 4 levels
`CRITICAL | HIGH | MEDIUM | LOW`
- Words: Urgent/Blocker/P1/Highest→CRITICAL · High/Major/P2→HIGH · Normal/Medium/P3→MEDIUM · Low/Trivial/P4→LOW
- Numeric bands 1→CRITICAL … 5→LOW; containment for `"P1 - Critical"` style
- Unknown → `MEDIUM` + `priority_unmapped:*` anomaly; absent priority → `MEDIUM` silently

Vendor extras that don't map to a core field are **preserved verbatim** in `item.extension` (story points, sprint, labels, project id, percent complete, …) as generic UWM extension fields.

---

## 4. Resiliency — `src/lib/hub/breaker.ts`

- **Circuit Breaker:** `CLOSED → OPEN → HALF_OPEN → CLOSED`. Trips after 5 consecutive failures; cooldown `30s × 2^(trips−1)` capped at 5 min; `HALF_OPEN` failure re-opens instantly with doubled cooldown; success closes and resets the streak. State is persisted per connection (`HubConnection.breakerState` + `breakerJson`) and round-trips losslessly.
- **Exponential backoff:** `base 500ms × 2^(n−1)`, cap 60 s, ±20 % jitter (deterministic under injected `rng` for tests). Only transient statuses retry (408/425/429/5xx); 4xx fails fast.
- Poll cycles (`pollTool`) run attempts through backoff, then record the breaker outcome; an open breaker rejects deliveries with a DLQ `breaker_open` entry and an honest retry-in-seconds reason.

---

## 5. Facades — `src/lib/hub/facade.ts`

Vendor payload shapes are parsed **only** behind one of 7 facades; everything downstream sees one `NormalizedEnvelope`:

| Facade | Covers | Recognizes |
|---|---|---|
| `jira` | Jira, Bitbucket, Confluence, Trello | `{webhookEvent, issue:{fields}}`, `{issues:[…]}` |
| `msGraph` | SharePoint, Teams, MS Project, Entra | change notifications `{value:[…]}`, list items, message bodies |
| `powerBi` | Power BI | refresh events (`refreshId/datasetId`), DAX/visual rows |
| `zoho` | Zoho Projects | `{tasks:[…]}` / `{issues:[…]}` / `{task}` |
| `slack` | Slack | Events API callbacks, `url_verification` handshake |
| `csv` | Excel, Google Sheets, CSV Upload | RFC-4180 parsing (quotes, embedded commas/newlines), header aliasing (`due_date`→dueDate, …), JSON-wrapped CSV |
| `generic` | Asana→Airtable and the rest | `{data}`, `{value}`, `{records}`, `{items}`, … batch wrappers + common field names |

Adding tool #56 = one registry entry + (optionally) one facade — zero pipeline changes.

---

## 6. Security — `src/lib/hub/security.ts`

- **HMAC webhook signatures:** `sha256=<hex>` (GitHub/Jira style), Slack `v0=` over `timestamp.body` with `v0:`-prefixed secret; constant-time compare; optional timestamp tolerance (replay window, default 300 s).
- **JWT:** structure check, **alg allow-list rejects `none`**, HS256 signature (constant-time), `exp`/`nbf` with 60 s skew, `aud`/`iss` claims.
- **OAuth 2.0:** expiry + required-scope enforcement (`insufficient_scope` lists what's missing).
- **mTLS:** client-cert CN allow-list with wildcard (`*.partner.example`) matching; empty policy fails closed.
- **Ingress dispatch** (`authenticateIngress`): the connection's configured `authKind` picks the validator. Ingress is `auth:false` at the framework level (it's a public vendor-facing endpoint) — **per-connection auth is enforced inside the pipeline**; failures return **401** to the caller *and* write a `auth_failed` DLQ security entry (not replayable — the connection must be fixed).
- Connection secrets are encrypted with the **same AES-256-GCM vault as AI BYOK** (`encryptSecret`/`decryptSecret`, `v1.<salt>.<iv>.<tag>.<ct>`); plaintext never stored.

---

## 7. Dead Letter Queue — `src/lib/hub/dlq.ts`

- Every anomaly set becomes a `HubDeadLetter` row: tool, queue, severity, reason, anomaly codes, truncated payload preview (4 KB), optional partial UWM item.
- **BLOCKING** = `missing_required:*`, `payload_*`, `unknown_tool`, `auth_failed` (no engine handoff for that record). **WARN** = unmapped vocabulary / unresolved identity / unparseable date (item stays valid, still visible for monitoring).
- **Replay** (`POST /api/hub/dlq/[id]/replay`) re-runs the stored payload through the pipeline; `auth_failed` and `unknown_tool` entries are refused until the cause is fixed. Successful replay marks the row `REPLAYED` and decrements the connection's DLQ counter.
- Soft anomalies + valid items coexist: outcome `PARTIAL` means some records reached the queue while others wait in the DLQ.

---

## 8. Pipeline outcomes & engine handoff — `src/lib/hub/pipeline.ts`

| Outcome | Meaning |
|---|---|
| `HARMONIZED` | all records valid → queue, zero DLQ |
| `PARTIAL` | some records handed off, some DLQ'd |
| `DLQ` | nothing valid (missing requireds / no records / unknown tool) |
| `REJECTED` | auth failed or breaker open — nothing processed |

**Handoff:** harmonized UWM items are mapped to `CpmTaskInput` and evaluated with the platform's own `computeCPM` (`src/lib/engines/cpm.ts`) — schedule impact (critical path, float, completion %) computed from external data. Read-only against the engine: the existing Integration sync path still owns task writes, so nothing double-writes or de-links.

---

## 9. API reference

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/hub/overview` | `integration.view` | Full Hub state (catalog, connections, breaker, events, DLQ); bootstraps 55 connection rows idempotently |
| POST | `/api/hub/ingress/[tool]` | **per-connection** (HMAC/JWT/OAuth/mTLS) | Public vendor ingress — full pipeline; 401 on auth failure |
| GET | `/api/hub/dlq` | `integration.view` | Pending DLQ entries (`?status=ALL`, `?limit=`) |
| DELETE | `/api/hub/dlq` | `integration.manage` | Dismiss entries `{ids:[…]}` (audited) |
| POST | `/api/hub/dlq/[id]/replay` | `integration.manage` | Replay one entry (audited `EXECUTE`) |
| PATCH | `/api/hub/connections/[toolId]` | `integration.manage` | Set auth kind + secret (vault-encrypted), ingress mode, base URL (audited `CONFIGURE`) |
| POST | `/api/hub/poll` | `integration.manage` | Run one poll cycle `{toolId}` through breaker + backoff (audited `EXECUTE`) |

Realtime: additive `hub:changed` event (existing subscribers ignore unknown events) — the Hub screen live-refetches on it.

**Signing an ingress call (example, Jira/HMAC):**
```js
const body = JSON.stringify(payload);
const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
await fetch("http://localhost:3000/api/hub/ingress/jira", {
  method: "POST",
  headers: { "content-type": "application/json", "x-hub-signature-256": sig },
  body,
});
```

---

## 10. Data model — `prisma/schema.prisma` (new, additive)

- **`HubConnection`** — one row per registry tool (`toolId` unique): status, authKind/authStatus, ingressMode, vault `secretEnc`, config, breaker state JSON, counters (`ingested/harmonized/dlq`), `integrationId` back-link.
- **`HubEvent`** — append-only ingest ledger per payload: mode, outcome, queue/lane, extracted/harmonized/dlq counts, duration, truncated payload preview.
- **`HubDeadLetter`** — DLQ rows: severity, reason, anomaly JSON, payload preview, partial item JSON, `PENDING|REPLAYED|DISMISSED`.

All three extend the existing `Integration`/`WebhookSubscription` linkage — no existing table was modified.

---

## 11. UI — `/hub` (Connect → TowerIntegration Hub)

`src/views/connect/hub.tsx`: KPI strip (tools/active/harmonized/DLQ/breakers/events), a 7-step pipeline strip, the 6 category queue cards with all 55 tool rows (breaker chip, harmonized/DLQ counters, status badge, Poll button, configure drawer), the DLQ panel with per-entry Replay, and the recent-ingest event feed. Configure drawer shows the exact ingress URL + auth header contract per tool.

Nav: `nav-items.tsx` Connect group, icon `Radar`, `perm: integration.view`; view registered lazily in `registry.tsx` (`case "hub"`). Tab Visibility derives its count from `NAV` automatically (now 51 tabs).

---

## 12. Verification (2026-11-01)

- `npx.cmd tsc --noEmit` → **0 errors**
- `npm.cmd run test` → **242/242 pass** (42 new Hub tests: registry completeness 55/6/31/24 + linkage, all four UWM rule families, breaker/backoff, 7 facades + CSV parser, queue/DLQ routing, HMAC/JWT/OAuth/mTLS security, end-to-end pipeline HARMONIZED/REJECTED/DLQ/PARTIAL/CSV, CPM handoff)
- `prisma db push` → schema in sync (3 new tables); `prisma generate` → client rebuilt
- Browser e2e (PMO Admin): `/hub` renders 55 tools / 6 queues / pipeline / DLQ / events; configure drawer shows per-tool ingress URL + auth contract; Jira HMAC secret saved via `PATCH /api/hub/connections/jira` (200, `authStatus: VALID`); signed webhook → **HARMONIZED** (`queue.agile_devsecops`, handoff `cpmTasks:1, criticalPath:1`); tampered signature → **401** `auth_failed:signature_mismatch` + REJECTED ledger row; missing-requireds payload → **DLQ** BLOCKING; replay re-runs it honestly (`replayCount:1`, stays pending) and the `auth_failed` entry is refused (`400 not_replayable`); audit trail shows `CONFIGURE HubConnection` + `EXECUTE HubDeadLetter`; existing `/#/integrations` tab intact.

## 13. File map

```
src/lib/hub/registry.ts     55 tools, 6 queues, status overrides
src/lib/hub/uwm.ts          identity / status / dates / priority harmonizer
src/lib/hub/breaker.ts      circuit breaker + exponential backoff (injected clock)
src/lib/hub/facade.ts       7 vendor facades + RFC-4180 CSV parser
src/lib/hub/security.ts     OAuth 2.0 / JWT / HMAC / mTLS validators
src/lib/hub/dlq.ts          queue routing + DLQ build/classify/replay
src/lib/hub/pipeline.ts     runPipeline (pure end-to-end orchestrator)
src/lib/hub/hub-service.ts  persistence, breaker state, ledger, CPM handoff, overview
src/app/api/hub/…           overview, ingress/[tool], dlq (+replay), connections, poll
src/views/connect/hub.tsx   Hub admin screen
prisma/schema.prisma        HubConnection / HubEvent / HubDeadLetter (added)
tests/engines/hub.test.ts   42 pure tests
```
