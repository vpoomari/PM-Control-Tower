# PM Control Tower — Bring-Your-Own-Key AI Layer (BYOK)

**Date:** 2026-10-24 · **Updated:** 2026-11-01 (custom provider + token meter) · **Status:** delivered · **Stack:** Next.js (App Router) + TypeScript + Tailwind

The platform ships AI features without a subscription model: each deployment
operator supplies **their own provider API key** (Google Gemini by default;
OpenAI/Groq one dropdown away; **any OpenAI-compatible endpoint** via
*Custom*). One saved key activates AI globally — a single central Server
Action is the only path from any UI to any model.

---

## 1. Architecture at a glance

```
┌─────────────────────────────── Browser (untrusted) ───────────────────────────────┐
│ Settings card (admin/ai-settings)   Kanban (execute/ai-breakdown)   Dashboard     │
│  · masked "••••1234" only            · Example A: task → 3 sub-tasks  (Example B) │
│  · write-only key input              · loading / honest-fallback states           │
└───────────────┬──────────────────────────────┬────────────────────────────────────┘
                │  Server Actions (POST, Next-authenticated)                        │
┌───────────────▼──────────────────────────────▼────────────────────────────────────┐
│ src/lib/ai/ai-service.ts   ("use server" — THE BRAIN)                             │
│  saveAiKey · removeAiKey · testAiKey · getAiSettings · askAI · askAIResult        │
│   1. session from auth cookie (getSessionUserFromCookie)                          │
│   2. RBAC: admin.config (config) / ai.use (asks) + in-memory rate limit           │
│   3. key: AES-256-GCM decrypt from AIConnector.configJson (never leaves server)   │
│   4. complete() → provider adapter · every failure → AIResult(status, fallback)   │
│   5. ledger: AIExecution row (SUCCESS/FAILED, tokens, ms) + connector usage       │
└───────────────┬───────────────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────────────────┐
│ src/lib/ai/providers.ts — one adapter per vendor behind complete()                 │
│   gemini → official @google/genai SDK (lazy dynamic import)                       │
│   openai → https://api.openai.com/v1/chat/completions      (fetch, zero deps)     │
│   groq   → https://api.groq.com/openai/v1/chat/completions  (fetch, zero deps)    │
│   custom → <admin-supplied base URL>/chat/completions      (fetch, zero deps)     │
│            OpenRouter · Together · Ollama · LM Studio · vLLM · internal gateway   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

| Layer | File | Role |
|---|---|---|
| Shared contracts | `src/lib/ai/shared.ts` | Client-safe types, provider registry, `extractJsonArray` — no Node APIs, importable anywhere |
| Key vault | `src/lib/ai/key-vault.ts` | AES-256-GCM encrypt/decrypt + masking (`node:crypto` only) |
| Providers | `src/lib/ai/providers.ts` | Adapters, error classification, fallback copy |
| Brain | `src/lib/ai/ai-service.ts` | `"use server"` actions: session, RBAC, rate limits, DB, audit, orchestration |
| Settings UI | `src/views/admin/ai-settings.tsx` | Key entry card in Administration → Settings |
| Example A | `src/views/execute/ai-breakdown.tsx` | Kanban task slide-over → 3 sub-tasks |
| Example B | `src/views/dashboard/ai-overdue-brief.tsx` | Dashboard overdue list → executive brief |
| Tests | `tests/engines/ai-byok.test.ts` | Vault, classification, fallbacks, parsing, registry, quota meter (DB-free) |

## 2. Storage & security model — why encrypted database, not localStorage

| Option | Verdict |
|---|---|
| `localStorage` | **Rejected** — readable by any XSS payload, browser-local, syncs nothing |
| HttpOnly cookie | Works stateless, but per-browser, cleared by users, 4 KB ceiling, unavailable to server-rendered/background calls |
| **Encrypted DB row** ✅ | Global activation from any session/device, survives cookie churn, usable server-side, auditable |

**The chosen design** reuses the existing `AIConnector` Prisma model
(`purpose = "BYOK"`). Since 2026-11-01 the row carries **two extra columns
for the token meter** — `tokenBudget Int @default(0)` (allowance "at start")
and `usagePeriodStart DateTime?` (metering window, set on key save / manual
reset); consumed tokens are *not* stored, they are summed live from the
`AIExecution` ledger:

- `configJson` holds `{ "keyEnc": "v1.<salt>.<iv>.<tag>.<cipher>" }` —
  AES-256-GCM with a per-record random salt + IV, key derived via `scrypt` from
  `AI_KEY_VAULT_SECRET` (falls back to `JWT_SECRET`, then the sandbox dev secret
  — the same policy `auth.ts` uses for session signing). For the `custom`
  provider it also holds `{ "baseUrl": "https://…/v1" }`, decrypted alongside
  the key and passed to every completion call.
- The plaintext key **never** reaches the browser after saving; the settings UI
  only renders a masked `••••1234` (last four) plus provider/model.
- Config changes (`save/remove/test`) are RBAC-gated (`admin.config`), rate
  limited (10/min/user) and written to the append-only `AuditEvent` ledger with
  the masked key only.
- Every AI call is logged to `AIExecution` (`BYOK:global` scope, tokens,
  duration, SUCCESS/FAILED) — the assistant route's existing ledger, reused.

> **Ops note:** setting `AI_KEY_VAULT_SECRET` (or a production `JWT_SECRET`)
> *before* saving keys is required for production. Rotating that secret
> afterwards invalidates saved keys — `askAI` then answers with an explicit
> “key could not be read — re-save it” message rather than failing silently.

## 3. The central Server Action — `askAI(prompt, systemContext)`

```ts
import { askAI, askAIResult } from "@/lib/ai/ai-service";

// Simple string API (never throws — fallback string on any failure):
const answer = await askAI(prompt, systemContext);

// Rich API (status-aware UIs):
const res = await askAIResult(prompt, systemContext);
// res.status: "ok" | "unauthenticated" | "forbidden" | "no_key" | "auth"
//             | "rate_limit" | "timeout" | "network" | "bad_request"
//             | "server" | "invalid_response"
// res.text:   model answer, or the graceful fallback message
```

Execution order inside `askAIResult`:

1. **Session** — token read from the `pmct_token` auth cookie (`next/headers`,
   no `Request` needed) → `unauthenticated` fallback when absent.
2. **RBAC** — `ai.use` permission (already granted to Executive → Project
   Manager roles) → `forbidden` fallback.
3. **Rate limit** — 10 asks/minute per user (same discipline as the assistant
   route) → `rate_limit` fallback.
4. **Key** — `AIConnector` BYOK row decrypted; missing/unreadable → `no_key`
   fallback with the path to Administration → Settings → AI provider.
5. **Provider call** — `complete()` with 30 s timeout; adapters normalise every
   throw to `AiProviderError(kind)`.
6. **Ledger** — `AIExecution` row (best-effort, never breaks the answer) and
   connector `usageCount/lastUsedAt` on success.
7. **Return** — `askAI` unwraps `result.text`; nothing above can throw (an
   absolute backstop catches even bookkeeping bugs → `server` fallback).

### Fallback strings (one per failure, honest & actionable)

| Condition | `status` | Message gist |
|---|---|---|
| Not signed in | `unauthenticated` | “Sign in to use AI features.” |
| Role lacks `ai.use` | `forbidden` | names the permission + how to get it |
| No key saved | `no_key` | points to Administration → Settings → AI provider |
| Key rejected (401/403 or Gemini's 400 text) | `auth` | replace the key in Settings |
| 429 / quota | `rate_limit` | wait a minute / raise the quota |
| Timeout (30 s) or 408/504 | `timeout` | try again in a moment |
| DNS/connect failure | `network` | check server egress |
| 4xx (other) | `bad_request` | shorten/rephrase input |
| 5xx / unknown | `server` | try again shortly |
| Empty completion | `invalid_response` | run it again |

## 4. Integration examples (plug & play)

**Example A — Kanban** (`execute/ai-breakdown.tsx`, mounted in the task
slide-over after *Description*): button → `askAIResult` with a strict
“reply with ONLY a JSON array of 3 strings” contract → `extractJsonArray`
validates (code-fence tolerant) → numbered list; skeleton rows + `aria-live`
while fetching; amber fallback box when the key is missing/invalid/limited;
“AI suggestion — review before creating” honesty note.

**Example B — Dashboard** (`dashboard/ai-overdue-brief.tsx`, mounted in
*Capacity & Milestones* under the overdue list): takes the same
`overdueMilestones.list` the dashboard already renders (`{id, name, dueDate,
projectCode?}[]`) and writes a ≤120-word executive brief grounded only in that
data. Button-triggered (never spends BYOK quota silently); renders `null` when
nothing is overdue. Footer shows provider + latency for trust.

Both consume only `askAIResult` + `@/lib/ai/shared` types — copy either file as
a starting point for any new AI feature.

## 5. Adding / swapping providers

1. Add an entry to `AI_PROVIDERS` in `shared.ts` (label, default model, key URL).
2. Add one adapter function + a `case` in `complete()` (`providers.ts`) —
   OpenAI-compatible vendors need nothing but a base URL.
3. Add the id to `saveSchema`'s `z.enum` in `ai-service.ts`.

No client component, settings card or call site changes — they are registry-driven.
For an id that needs an endpoint, also return `true` from
`providerNeedsBaseUrl()` in `shared.ts` (the settings card gates the Base URL
field on it, and the save schema then enforces it).

**The registry today:** `gemini` · `openai` · `groq` · `custom`.

## 6. Custom (OpenAI-compatible) provider — any key, any endpoint

Provider id `custom` ("Custom (OpenAI-compatible)") accepts **any API key**
whose endpoint speaks the OpenAI Chat Completions shape:

- **Form** (Administration → Settings → AI provider → *Add/Replace key*):
  Provider = *Custom* reveals a required **Base URL** field; **Model** is
  required too (exact id the endpoint exposes, e.g. `gpt-4o-mini`,
  `llama3.1`, `openrouter/auto`).
- **Validation** (server-side, `saveSchema.superRefine`): non-empty model,
  absolute `http(s)` base URL; trailing slashes are stripped. Missing values
  return a specific validation message, never a crash.
- **Storage:** base URL lives in `configJson.baseUrl` next to the encrypted
  key — it is not secret, but keeping it together means one row = one
  provider configuration.
- **Call path:** `complete({ provider: "custom", baseUrl, … })` reuses the
  OpenAI fetch adapter → `${baseUrl}/chat/completions` with
  `Authorization: Bearer <key>`. No base URL ⇒ typed `bad_request`
  ("No base URL configured for the custom provider — set it in Administration
  → Settings → AI provider"), covered by a unit test.
- **Consumers:** `askAI`/`askAIResult`, `testAiKey` and the assistant route
  (`POST /api/assistant`) all pass `baseUrl` through — one saved custom key
  powers every AI feature, exactly like the fixed providers.

## 7. Token meter — available vs at start

The AI provider card shows a live meter so administrators can see spend
against the allowance they declare:

| Field | Source |
|---|---|
| **At start** | `AIConnector.tokenBudget` — allowance for the current period (0 = not set) |
| **Used** | `SUM(AIExecution.tokens)` where `status = SUCCESS` **and** `createdAt ≥ usagePeriodStart` |
| **Available** | `max(0, atStart − used)` — `quotaView()` in `shared.ts` (pure, unit-tested) |
| **Period starts** | `usagePeriodStart` — set on every key save; changed by *Reset period* |

- **Set / update allowance** → `setAiQuota({ budget })` (audited,
  `AIConnector.tokenBudget`, whole tokens 0…10,000,000; 0 clears the meter).
- **Reset period** → `resetAiUsage()` (audited) — moves `usagePeriodStart`
  to now, so *Used* returns to 0 while the allowance stays.
- Saving a new key opens a fresh window automatically (its own
  `usagePeriodStart`), so a key swap never inherits the old key's spend.
- The meter renders only while a key is configured; failed calls
  (`AIExecution.status = FAILED`, `tokens = 0`) never consume allowance.

## 8. Verification

**2026-10-24** — `tsc --noEmit` clean · `npx eslint` on all changed files clean ·
`npm test` (vault round-trip, tamper detection, mask leak check, HTTP/message
error classification, every-kind fallback coverage, registry + JSON parsing
contracts) · `npx tsx scripts/final-verify.ts` exit 0 (plan data untouched) ·
settings card loads/edits over Server Actions; `askAI` degrades to capture
hints with no key; no console errors.

**2026-11-01 (custom provider + token meter)** — `npx tsc --noEmit` exit 0 ·
`npm test` **200/200** (two new tests: registry includes `custom` with an
https key URL and `!isAiProviderId("anthropic")`; `complete()` rejects a
custom call without a base URL as `bad_request`; plus `quotaView` meter math) ·
browser e2e against a local OpenAI-compatible mock: save Custom key →
*Test* reaches the mock (call #1) → allowance 5,000 → AI PM Assistant answers
through the saved key (call #2) → meter reads *Available 4,840 / At start
5,000 / Used 160* → *Reset period* returns Used to 0 → *Update allowance*
moves the start to 1,000 → key removed (panel back to "Not configured",
meter hidden) → test `AIExecution`/`AIConnector` rows purged (both 0).

## 9. Deliberate non-goals / extension points

- The assistant route (`POST /api/assistant`) **is** rewired through the BYOK
  path (since 2026-10-31): it decrypts the connector key and calls
  `complete()` — the `z-ai-web-dev-sdk` fallback remains only for connectors
  with no readable key material (legacy/internal deployments).
- Streaming responses: `ai.models.generateContentStream` drops into the Gemini
  adapter when progressive rendering is wanted.
- Per-user keys: store the same encrypted payload on a per-user record and key
  the lookup by `session.id` — the vault and adapters need no changes.
- Pulling real quota/usage from the provider APIs (OpenAI `/usage`,
  OpenRouter credits) would replace the *declared* allowance with a *fetched*
  one — `setAiQuota`/`resetAiUsage` are the seam for that.
