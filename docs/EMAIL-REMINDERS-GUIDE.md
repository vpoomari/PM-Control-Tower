# Daily E-mail Reminders — Microsoft Graph Setup Guide

PM Control Tower sends **one consolidated e-mail per owner** every day at
**8:00 AM** via a Vercel Cron, using the Microsoft Graph **client credentials**
(daemon) flow from a central mailbox.

The digest covers, per owner:

| Section  | Contents |
|----------|----------|
| **Tasks**   | Your tasks ending today, starting today, or overdue |
| **RAID**    | Open risks, pending action items, open issues, pending decisions that are **due or overdue** |
| **EVM**     | Projects whose latest SPI/CPI is below threshold (`EVM_SPI_THRESHOLD` / `EVM_CPI_THRESHOLD`, default `0.9`) and active projects with a stale weekly status update (7+ days) |

Items with no resolvable owner are never guessed — RAID entries fall back to
the project owner only when the register stores no usable person record.

---

## 1. Azure AD app registration

1. **Azure portal → Microsoft Entra ID → App registrations → New registration**
   - Name: `PM Control Tower Mail`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: leave blank (daemon flow, no redirect)
2. Note the **Application (client) ID** → `AZURE_CLIENT_ID`
3. Note the **Directory (tenant) ID** → `AZURE_TENANT_ID`

## 2. Client secret

**Certificates & secrets → Client secrets → New client secret**

- Copy the **Value** (not the secret ID) immediately → `AZURE_CLIENT_SECRET`
- Set an expiry that matches your rotation policy; rotating the secret only
  requires updating the environment variable — no code change.

## 3. API permissions (application)

**API permissions → Add a permission → Microsoft Graph → Application permissions**

| Permission | Why |
|------------|-----|
| `Mail.Send` | Send the daily digest from the mailbox (required) |
| `Mail.ReadWrite` *(optional)* | Lets the app mark sent messages in the mailbox — not needed for delivery |

Click **Grant admin consent** for your tenant. Without admin consent Graph
returns `403 Forbidden` on send.

> Application permission `Mail.Send` lets the app send **as** any mailbox in
> the tenant when it calls `/users/{mailbox}/sendMail` — no delegated
> permission or mailbox login is involved.

## 4. Central mailbox

Use a dedicated shared mailbox so reminders come from a stable address users
recognise and can reply to:

**Microsoft 365 admin center → Groups → Shared mailboxes → Add a shared mailbox**

- Example: `pm-controltower@yourcompany.com`
- No licence is required for a shared mailbox.
- Set it as `MAIL_SENDER_EMAIL` (the exact SMTP address).

Alternative: any licensed user mailbox (e.g. `pmo@yourcompany.com`).

## 5. Environment variables

```bash
AZURE_TENANT_ID=<directory (tenant) id>
AZURE_CLIENT_ID=<application (client) id>
AZURE_CLIENT_SECRET=<client secret VALUE>
MAIL_SENDER_EMAIL=pm-controltower@yourcompany.com
CRON_SECRET=<openssl rand -hex 32>
EVM_SPI_THRESHOLD=0.9   # optional
EVM_CPI_THRESHOLD=0.9   # optional
```

Set these in **Vercel → Project → Settings → Environment Variables**
(Production *and* Preview if you want test digests there). Locally they go in
`.env` (see `.env.example`).

> `CRON_SECRET` is the bearer token Vercel must send to the route. Generate a
> fresh random value — the route fails closed (503) if it is unset and returns
> 401 if the token does not match.

## 6. The cron

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/send-reminders", "schedule": "0 8 * * *" }
  ]
}
```

- **`0 8 * * *` is UTC.** Vercel cron expressions are always UTC.
  - 08:00 **UTC** (UK winter) → `"0 8 * * *"`
  - 08:00 **CET** (central Europe, UTC+1) → `"0 7 * * *"`
  - 08:00 **IST** (UTC+5:30) → `"0 2 * * *"` (cron has no 30-minute offset in
    Vercel's free-tier minute grid — schedule `0 2:30` is not supported, so
    pick `30 2 * * *` for 08:00 IST)
- Vercel Hobby allows **one cron per day**; Pro allows more.
- The invocation is a plain `GET` with
  `Authorization: Bearer $CRON_SECRET`.

## 7. Code map

| File | Role |
|------|------|
| `src/lib/graphClient.ts` | MSAL client-credentials token acquisition + cache, `sendEmail()` via Graph `/users/{mailbox}/sendMail`, single 401 retry, `GraphMailError` (never leaks secrets) |
| `src/lib/notificationData.ts` | Batched Prisma reads → `ReminderDigest` grouped by owner e-mail |
| `src/lib/emailTemplates.ts` | Dark, WCAG-contrast HTML table template (no `<style>` block — inline styles only) |
| `src/app/api/cron/send-reminders/route.ts` | `CRON_SECRET` bearer check, `dryRun=1`, per-owner try/catch, structured JSON summary |
| `vercel.json` | `crons` entry (`0 8 * * *`) |

## 8. Verifying

**Dry run (sends nothing — safe any time):**

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-domain>/api/cron/send-reminders?dryRun=1" | jq
```

Expected payload:

```json
{
  "success": true,
  "data": {
    "dryRun": true,
    "generatedAt": "2026-10-26T08:00:00.000Z",
    "counts": { "owners": 7, "tasks": 21, "raid": 12, "evm": 3, "total": 36 },
    "recipients": [ { "email": "…", "tasks": 3, "raid": 1, "evm": 0, "subject": "…" } ]
  }
}
```

**Live send:**

```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-domain>/api/cron/send-reminders"
```

**Auth failures (expected):**

| Call | Result |
|------|--------|
| No `Authorization` header | `401 Unauthorized: missing or invalid cron secret.` |
| Wrong token | `401 Unauthorized: missing or invalid cron secret.` |
| `CRON_SECRET` unset on the deployment | `503 CRON_SECRET is not configured …` |
| Graph vars unset (live mode) | `503 Microsoft Graph is not configured …` |

### Common Graph errors

| Symptom | Cause / fix |
|---------|-------------|
| `sendMail failed (401)` on first call, then success | Token refreshed — normal (the client retries once after a 401) |
| `sendMail failed (403)` / `ErrorAccessDenied` | Admin consent missing for `Mail.Send`, or wrong tenant |
| `MailboxNotEnabledForRESTAPI` | `MAIL_SENDER_EMAIL` is not a mailbox (typo, or a group instead of a mailbox) |
| `MailboxNotFound` | Address does not exist in this tenant |
| MSAL `invalid_client` | Wrong/expired `AZURE_CLIENT_SECRET` — rotate and update the env var |

## 9. Security notes

- The app secret and `CRON_SECRET` live **only** in environment variables —
  never in code, `localStorage`, or the repository.
- The cron route does **not** use session auth (a scheduler has no session);
  the bearer secret is its only gate and it fails closed when unset.
- Sends are sequential with a per-minute rate limit, and each owner's failure
  is isolated — one bad address cannot abort the run.
- Digest content is escaped with `escapeHtml()`; a task title can never inject
  markup into the message.
