"use server";
// PM CONTROL TOWER — AI service (central Server Actions, Bring Your Own Key)
// The single brain every AI feature calls. One saved key activates AI globally:
//
//   client component ──► askAI(prompt, systemContext)  ──► provider adapter ──► text
//                              │                                │
//                   session (auth cookie)                 Gemini (official SDK)
//                   RBAC (ai.use) + rate limit            OpenAI / Groq (fetch)
//                   encrypted key (AIConnector.configJson)
//
// Security model:
//   - The API key is entered once in Administration → Settings → AI provider,
//     encrypted at rest (AES-256-GCM, key-vault.ts) and NEVER sent back to the
//     browser — clients only ever see a masked "••••1234" view.
//   - askAI never throws: missing/invalid keys, auth failures and rate limits
//     resolve to an honest fallback string (AIResult carries the kind).
//   - Every call is logged to AIExecution (dedicated ledger) with duration,
//     token count and SUCCESS/FAILED status; config changes hit the audit log.
//
// Swapping vendors: add an entry to AI_PROVIDERS + an adapter in providers.ts.

import { z } from "zod";
import { db } from "../db";
import { getSessionUserFromCookie, type SessionUser } from "../auth";
import { hasPermission } from "../rbac";
import { rateLimit } from "../api";
import { writeAudit } from "../audit";
import { decryptSecret, encryptSecret, looksEncrypted, maskSecret, vaultSecret } from "./key-vault";
import {
  AUTH_FALLBACK,
  complete,
  fallbackFor,
  providerLabel,
  toProviderError,
} from "./providers";
import {
  AI_PROVIDERS,
  isAiProviderId,
  quotaView,
  type AiProviderId,
  type AIResult,
  type AiSettingsStatus,
} from "./shared";

/** Purpose tag identifying the single BYOK connector row. */
const BYOK_PURPOSE = "BYOK";
/** Rate cap per user (matches the assistant route's 10/min discipline). */
const ASK_LIMIT = { limit: 10, windowMs: 60_000 };
const ADMIN_LIMIT = { limit: 10, windowMs: 60_000 };
const PROMPT_MAX = 8_000;
const CONTEXT_MAX = 4_000;
const LOG_CLIP = 4_000;

type ActionErr = { ok: false; error: string };
const fail = (error: string): ActionErr => ({ ok: false, error });

const clip = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

// ---------------------------------------------------------------------------
// Connector helpers (BYOK row = AIConnector with purpose "BYOK")
// ---------------------------------------------------------------------------

interface ByokRow {
  id: string;
  provider: string;
  model: string | null;
  temperature: number;
  maxTokens: number;
  configJson: string | null;
  status: string;
  usageCount: number;
  lastUsedAt: Date | null;
  tokenBudget: number;
  usagePeriodStart: Date | null;
}

async function findByokRow(): Promise<ByokRow | null> {
  return db.aIConnector.findFirst({
    where: { purpose: BYOK_PURPOSE },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, provider: true, model: true, temperature: true, maxTokens: true,
      configJson: true, status: true, usageCount: true, lastUsedAt: true,
      tokenBudget: true, usagePeriodStart: true,
    },
  });
}

interface KeyMaterial {
  provider: AiProviderId;
  apiKey: string;
  /** Custom (OpenAI-compatible) endpoints only. */
  baseUrl: string | null;
}

/** Decrypt the stored key. Returns null when absent or unreadable (vault drift). */
function readKeyMaterial(row: ByokRow): KeyMaterial | null {
  if (!row.configJson) return null;
  try {
    const cfg = JSON.parse(row.configJson) as { keyEnc?: string; provider?: string; baseUrl?: string };
    if (!cfg.keyEnc || !looksEncrypted(cfg.keyEnc)) return null;
    const raw = isAiProviderId(cfg.provider ?? "") ? cfg.provider! : row.provider;
    if (!isAiProviderId(raw)) return null;
    const baseUrl = typeof cfg.baseUrl === "string" && cfg.baseUrl.trim() ? cfg.baseUrl.trim() : null;
    return { provider: raw, apiKey: decryptSecret(cfg.keyEnc), baseUrl };
  } catch {
    return null;
  }
}

/** Tokens consumed in the current metering window (SUCCESS executions only). */
async function usedTokensSince(row: ByokRow): Promise<number> {
  const since = row.usagePeriodStart ?? new Date(0);
  const agg = await db.aIExecution.aggregate({
    where: { connectorId: row.id, status: "SUCCESS", createdAt: { gte: since } },
    _sum: { tokens: true },
  }).catch(() => null);
  return agg?._sum.tokens ?? 0;
}

async function buildStatus(): Promise<AiSettingsStatus> {
  const row = await findByokRow();
  const material = row ? readKeyMaterial(row) : null;
  const used = row ? await usedTokensSince(row) : 0;
  return {
    configured: Boolean(material),
    provider: material?.provider ?? (row && isAiProviderId(row.provider) ? row.provider : null),
    model: row?.model ?? null,
    baseUrl: material?.baseUrl ?? null,
    maskedKey: material ? maskSecret(material.apiKey) : null,
    lastUsedAt: row?.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    usageCount: row?.usageCount ?? 0,
    vaultReady: Boolean(process.env.AI_KEY_VAULT_SECRET || process.env.JWT_SECRET),
    quota: quotaView(row?.tokenBudget ?? 0, used, row?.usagePeriodStart?.toISOString() ?? null),
  };
}

async function clientIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

/** Shared guard for configuration actions: session + admin.config + rate cap. */
async function requireAdmin(): Promise<{ session: SessionUser; ip: string | null } | ActionErr> {
  const session = await getSessionUserFromCookie();
  if (!session) return fail("Authentication required.");
  if (!hasPermission(session, "admin.config")) return fail("Permission denied: admin.config.");
  try {
    rateLimit(`ai-config:${session.id}`, ADMIN_LIMIT.limit, ADMIN_LIMIT.windowMs);
  } catch {
    return fail("Rate limit exceeded. Retry in a minute.");
  }
  return { session, ip: await clientIp() };
}

// ---------------------------------------------------------------------------
// 1) Settings status — masked view only, never raw key material
// ---------------------------------------------------------------------------

export async function getAiSettings(): Promise<{ ok: true; status: AiSettingsStatus } | ActionErr> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return { ok: true, status: await buildStatus() };
}

// ---------------------------------------------------------------------------
// 2) Save the key — validate, encrypt at rest, activate AI globally
// ---------------------------------------------------------------------------

const saveSchema = z
  .object({
    provider: z.enum(["gemini", "openai", "groq", "openrouter", "custom"]),
    model: z.string().trim().min(1).max(80).optional(),
    apiKey: z.string().trim().min(8).max(512),
    baseUrl: z.string().trim().max(300).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.provider !== "custom") return;
    if (!v.model) {
      ctx.addIssue({ code: "custom", path: ["model"], message: "A model name is required for the custom provider." });
    }
    if (!v.baseUrl) {
      ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "A base URL is required for the custom provider." });
      return;
    }
    let parsed: URL | null = null;
    try {
      parsed = new URL(v.baseUrl);
    } catch {
      // fall through to the issue below
    }
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
      ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "The base URL must be an absolute http(s) URL." });
    }
  });

export async function saveAiKey(input: {
  provider: string;
  model?: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<{ ok: true; status: AiSettingsStatus } | ActionErr> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ? `Validation failed: ${first.message}` : "Validation failed: provider/model/apiKey are invalid.");
  }
  const { provider, model, apiKey, baseUrl } = parsed.data;
  const finalModel = model || AI_PROVIDERS[provider].defaultModel;
  const finalBaseUrl = provider === "custom" ? (baseUrl as string).replace(/\/+$/, "") : null;
  const keyEnc = encryptSecret(apiKey, vaultSecret());

  try {
    const existing = await findByokRow();
    const config: Record<string, unknown> = {
      keyEnc, savedAt: new Date().toISOString(), savedBy: guard.session.id,
    };
    if (finalBaseUrl) config.baseUrl = finalBaseUrl;
    const data = {
      name: `${AI_PROVIDERS[provider].label} BYOK key`,
      provider,
      model: finalModel,
      purpose: BYOK_PURPOSE,
      status: "ACTIVE",
      temperature: 0.4,
      maxTokens: 1024,
      configJson: JSON.stringify(config),
      // A new key opens a fresh metering window (tokens "at start" reset too).
      usagePeriodStart: new Date(),
    };
    if (existing) {
      await db.aIConnector.update({ where: { id: existing.id }, data });
    } else {
      await db.aIConnector.create({ data });
    }
    await writeAudit({
      userId: guard.session.id, userName: guard.session.name, role: guard.session.roles[0],
      action: "CONFIGURE", entityType: "AIConnector", entityId: existing?.id ?? null,
      entityName: `${AI_PROVIDERS[provider].label} BYOK key`,
      after: { provider, model: finalModel, baseUrl: finalBaseUrl, maskedKey: maskSecret(apiKey), vault: "aes-256-gcm" },
      ipAddress: guard.ip,
    });
    return { ok: true, status: await buildStatus() };
  } catch (err) {
    console.error("[ai] saveAiKey failed", err);
    return fail("Could not persist the key. Check server logs / database availability.");
  }
}

// ---------------------------------------------------------------------------
// 3) Remove the key — AI features return their capture hint again
// ---------------------------------------------------------------------------

export async function removeAiKey(): Promise<{ ok: true; status: AiSettingsStatus } | ActionErr> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  try {
    const existing = await findByokRow();
    if (existing) {
      await db.aIConnector.update({
        where: { id: existing.id },
        data: { status: "INACTIVE", configJson: null },
      });
    }
    await writeAudit({
      userId: guard.session.id, userName: guard.session.name, role: guard.session.roles[0],
      action: "CONFIGURE", entityType: "AIConnector", entityId: existing?.id ?? null,
      entityName: "BYOK key removal", after: { status: "INACTIVE", keyEnc: null },
      ipAddress: guard.ip, severity: "WARNING",
    });
    return { ok: true, status: await buildStatus() };
  } catch (err) {
    console.error("[ai] removeAiKey failed", err);
    return fail("Could not remove the key.");
  }
}

// ---------------------------------------------------------------------------
// 3b) Token meter — allowance ("at start") + period reset
// ---------------------------------------------------------------------------

const quotaSchema = z.object({ budget: z.number().int().min(0).max(10_000_000) });

/** Set/change the token allowance for the current period (0 = clear the meter). */
export async function setAiQuota(input: { budget: number }): Promise<
  { ok: true; status: AiSettingsStatus } | ActionErr
> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const parsed = quotaSchema.safeParse(input);
  if (!parsed.success) return fail("Validation failed: budget must be a whole number ≥ 0.");
  try {
    const existing = await findByokRow();
    if (!existing) return fail("No AI connector yet — save a key first.");
    await db.aIConnector.update({
      where: { id: existing.id },
      data: { tokenBudget: parsed.data.budget },
    });
    await writeAudit({
      userId: guard.session.id, userName: guard.session.name, role: guard.session.roles[0],
      action: "CONFIGURE", entityType: "AIConnector", entityId: existing.id,
      entityName: "AI token allowance",
      after: { tokenBudget: parsed.data.budget },
      ipAddress: guard.ip,
    });
    return { ok: true, status: await buildStatus() };
  } catch (err) {
    console.error("[ai] setAiQuota failed", err);
    return fail("Could not save the token allowance.");
  }
}

/** Restart the metering window: used tokens drop to 0, the allowance stays. */
export async function resetAiUsage(): Promise<{ ok: true; status: AiSettingsStatus } | ActionErr> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  try {
    const existing = await findByokRow();
    if (!existing) return fail("No AI connector yet — save a key first.");
    await db.aIConnector.update({
      where: { id: existing.id },
      data: { usagePeriodStart: new Date() },
    });
    await writeAudit({
      userId: guard.session.id, userName: guard.session.name, role: guard.session.roles[0],
      action: "CONFIGURE", entityType: "AIConnector", entityId: existing.id,
      entityName: "AI token period reset",
      after: { usagePeriodStart: new Date().toISOString() },
      ipAddress: guard.ip,
    });
    return { ok: true, status: await buildStatus() };
  } catch (err) {
    console.error("[ai] resetAiUsage failed", err);
    return fail("Could not reset the token period.");
  }
}

// ---------------------------------------------------------------------------
// 4) Test the connection — tiny completion so invalid keys surface immediately
// ---------------------------------------------------------------------------

export async function testAiKey(): Promise<
  { ok: true; latencyMs: number; provider: string; model: string } | ActionErr
> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const row = await findByokRow();
  if (!row || row.status !== "ACTIVE") return fail("No active key. Save a key first.");
  const material = readKeyMaterial(row);
  if (!material) return fail("The stored key could not be decrypted — re-save it.");

  const model = row.model || AI_PROVIDERS[material.provider].defaultModel;
  const label = providerLabel(material.provider);
  const started = Date.now();
  try {
    await complete({
      apiKey: material.apiKey,
      provider: material.provider,
      model,
      prompt: "Reply with exactly: OK",
      systemContext: "You are a connectivity probe. Reply with exactly one token.",
      temperature: 0,
      maxOutputTokens: 16,
      timeoutMs: 15_000,
      baseUrl: material.baseUrl ?? undefined,
    });
    return { ok: true, latencyMs: Date.now() - started, provider: label, model };
  } catch (err) {
    const pe = toProviderError(err, material.provider);
    return fail(fallbackFor(pe.kind, label));
  }
}

// ---------------------------------------------------------------------------
// 5) THE BRAIN — askAI / askAIResult
// ---------------------------------------------------------------------------

async function recordExecution(args: {
  connectorId: string;
  session: SessionUser;
  prompt: string;
  response: string;
  tokens: number;
  durationMs: number;
  status: "SUCCESS" | "FAILED";
}): Promise<void> {
  // Best-effort ledger: never let bookkeeping break the answer.
  await db.aIExecution
    .create({
      data: {
        connectorId: args.connectorId,
        userId: args.session.id,
        prompt: clip(args.prompt, LOG_CLIP),
        response: clip(args.response, LOG_CLIP),
        tokens: args.tokens,
        durationMs: args.durationMs,
        status: args.status,
        dataScopeUsed: "BYOK:global",
      },
    })
    .catch(() => undefined);
  if (args.status === "SUCCESS") {
    await db.aIConnector
      .update({
        where: { id: args.connectorId },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      .catch(() => undefined);
  }
}

/**
 * Rich AI call: outcome + graceful fallback in one envelope.
 * NEVER throws — every failure mode becomes a typed status + honest message.
 */
export async function askAIResult(prompt: string, systemContext: string): Promise<AIResult> {
  const started = Date.now();
  const bail = (status: AIResult["status"], text: string): AIResult => ({
    status, text, fallback: status !== "ok", durationMs: Date.now() - started,
  });

  try {
    if (!prompt?.trim()) return bail("bad_request", fallbackFor("bad_request"));

    const session = await getSessionUserFromCookie();
    if (!session) return bail("unauthenticated", AUTH_FALLBACK.unauthenticated);
    if (!hasPermission(session, "ai.use")) return bail("forbidden", AUTH_FALLBACK.forbidden);
    try {
      rateLimit(`ai-ask:${session.id}`, ASK_LIMIT.limit, ASK_LIMIT.windowMs);
    } catch {
      return bail("rate_limit", fallbackFor("rate_limit"));
    }

    const row = await findByokRow();
    if (!row || row.status !== "ACTIVE" || !row.configJson) return bail("no_key", fallbackFor("no_key"));
    const material = readKeyMaterial(row);
    if (!material) {
      return bail("no_key", "The saved AI key could not be read (vault secret changed?). Re-save it in Administration → Settings → AI provider.");
    }

    const model = row.model || AI_PROVIDERS[material.provider].defaultModel;
    const label = providerLabel(material.provider);
    const trimmedPrompt = prompt.slice(0, PROMPT_MAX);
    const trimmedContext = systemContext.slice(0, CONTEXT_MAX);

    try {
      const out = await complete({
        apiKey: material.apiKey,
        provider: material.provider,
        model,
        prompt: trimmedPrompt,
        systemContext: trimmedContext,
        temperature: row.temperature,
        maxOutputTokens: row.maxTokens,
        baseUrl: material.baseUrl ?? undefined,
      });
      await recordExecution({
        connectorId: row.id, session, prompt: trimmedPrompt, response: out.text,
        tokens: out.tokens, durationMs: Date.now() - started, status: "SUCCESS",
      });
      return {
        status: "ok", text: out.text, fallback: false,
        provider: label, model, durationMs: Date.now() - started,
      };
    } catch (err) {
      const pe = toProviderError(err, material.provider);
      await recordExecution({
        connectorId: row.id, session, prompt: trimmedPrompt,
        response: `[${pe.kind}] ${pe.message}`, tokens: 0,
        durationMs: Date.now() - started, status: "FAILED",
      });
      return bail(pe.kind, fallbackFor(pe.kind, label));
    }
  } catch (err) {
    // Absolute backstop — askAI must never crash a caller.
    console.error("[ai] askAI unexpected failure", err);
    return bail("server", fallbackFor("server"));
  }
}

/**
 * The simple string API every feature calls:
 *   const answer = await askAI(prompt, systemContext);
 * Returns the model's answer, or a graceful fallback message on any failure.
 */
export async function askAI(prompt: string, systemContext: string): Promise<string> {
  const result = await askAIResult(prompt, systemContext);
  return result.text;
}

// ---------------------------------------------------------------------------
// 6) SYSTEM AI — session-less calls for background workers (agent runtime)
// ---------------------------------------------------------------------------

const SYSTEM_LIMIT = { limit: 30, windowMs: 60_000 };

/**
 * Background/worker AI call used by the agent runtime (scheduled runs have no
 * session cookie). `actor` is a stable tag (e.g. "agent:deadline-sentinel"):
 *   - rate-limited per actor, never per (missing) user,
 *   - recorded on AIExecution with userId: null + dataScopeUsed "AGENT:<actor>",
 *   - NEVER throws — identical honest-fallback contract as askAIResult.
 * RBAC is enforced upstream: only the runner (which itself sits behind
 * admin.config / CRON_SECRET gates) may reach this function.
 */
export async function askAISystem(
  prompt: string,
  systemContext: string,
  actor: string
): Promise<AIResult> {
  const started = Date.now();
  const bail = (status: AIResult["status"], text: string): AIResult => ({
    status, text, fallback: status !== "ok", durationMs: Date.now() - started,
  });

  try {
    if (!prompt?.trim()) return bail("bad_request", fallbackFor("bad_request"));
    const tag = (actor || "system").slice(0, 80);
    try {
      rateLimit(`ai-system:${tag}`, SYSTEM_LIMIT.limit, SYSTEM_LIMIT.windowMs);
    } catch {
      return bail("rate_limit", fallbackFor("rate_limit"));
    }

    const row = await findByokRow();
    if (!row || row.status !== "ACTIVE" || !row.configJson) return bail("no_key", fallbackFor("no_key"));
    const material = readKeyMaterial(row);
    if (!material) {
      return bail("no_key", "The saved AI key could not be read (vault secret changed?). Re-save it in Administration → Settings → AI provider.");
    }

    const model = row.model || AI_PROVIDERS[material.provider].defaultModel;
    const label = providerLabel(material.provider);
    const trimmedPrompt = prompt.slice(0, PROMPT_MAX);
    const trimmedContext = systemContext.slice(0, CONTEXT_MAX);

    try {
      const out = await complete({
        apiKey: material.apiKey,
        provider: material.provider,
        model,
        prompt: trimmedPrompt,
        systemContext: trimmedContext,
        temperature: row.temperature,
        maxOutputTokens: row.maxTokens,
        baseUrl: material.baseUrl ?? undefined,
      });
      await db.aIExecution
        .create({
          data: {
            connectorId: row.id,
            userId: null,
            prompt: clip(trimmedPrompt, LOG_CLIP),
            response: clip(out.text, LOG_CLIP),
            tokens: out.tokens,
            durationMs: Date.now() - started,
            status: "SUCCESS",
            dataScopeUsed: `AGENT:${tag}`,
          },
        })
        .catch(() => undefined);
      await db.aIConnector
        .update({
          where: { id: row.id },
          data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        })
        .catch(() => undefined);
      return {
        status: "ok", text: out.text, fallback: false,
        provider: label, model, durationMs: Date.now() - started, tokens: out.tokens,
      };
    } catch (err) {
      const pe = toProviderError(err, material.provider);
      await db.aIExecution
        .create({
          data: {
            connectorId: row.id,
            userId: null,
            prompt: clip(trimmedPrompt, LOG_CLIP),
            response: `[${pe.kind}] ${pe.message}`,
            tokens: 0,
            durationMs: Date.now() - started,
            status: "FAILED",
            dataScopeUsed: `AGENT:${tag}`,
          },
        })
        .catch(() => undefined);
      return bail(pe.kind, fallbackFor(pe.kind, label));
    }
  } catch (err) {
    console.error("[ai] askAISystem unexpected failure", err);
    return bail("server", fallbackFor("server"));
  }
}
