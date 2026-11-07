// PM CONTROL TOWER — AI provider adapters (server-only)
// One thin adapter per vendor behind a single `complete()` entry point.
//   - gemini   : official Google Gen AI SDK (`@google/genai`), lazy-loaded
//   - openai   : OpenAI-compatible Chat Completions over fetch (no extra deps)
//   - groq     : Groq's OpenAI-compatible endpoint over fetch (no extra deps)
//   - openrouter : OpenRouter's OpenAI-compatible endpoint over fetch — one
//                  key for hundreds of models, including the always-free
//                  `openrouter/free` router and every ":free" model id.
//   - custom   : any OpenAI-compatible gateway (Ollama, vLLM…) via
//                the admin-supplied base URL — same fetch adapter as openai/groq.
// Swapping vendors is a registry entry + one adapter — callers never change.
//
// Every failure is normalised to AiProviderError with a machine kind, and
// `fallbackFor()` maps each kind to an honest, actionable message so callers
// can degrade gracefully instead of crashing.

import {
  AI_PROVIDERS,
  type AIStatus,
  type AiProviderId,
} from "./shared";

export type AiErrorKind = Exclude<AIStatus, "ok" | "unauthenticated" | "forbidden">;

export class AiProviderError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  readonly provider: AiProviderId;

  constructor(kind: AiErrorKind, message: string, provider: AiProviderId, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }
}

export interface CompletionArgs {
  apiKey: string;
  provider: AiProviderId;
  model: string;
  prompt: string;
  systemContext: string;
  /** Required for the "custom" provider — OpenAI-compatible base URL (…/v1). */
  baseUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface CompletionOutcome {
  text: string;
  tokens: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_MAX_TOKENS = 1024;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Map a bare HTTP status onto our error kind. */
export function classifyHttpStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504 || status === 522) return "timeout";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "server";
}

/** Classify a provider error message (Gemini reports bad keys as 400 text). */
export function classifyProviderMessage(message: string): AiErrorKind | null {
  const m = message.toLowerCase();
  if (/api key not valid|api_key_invalid|invalid api key|unauthorized|permission denied/.test(m)) return "auth";
  if (/rate.?limit|resource_exhausted|quota|too many requests|usage limit/.test(m)) return "rate_limit";
  if (/deadline exceeded|timed? ?out|timeout/.test(m)) return "timeout";
  if (/fetch failed|econnrefused|enotfound|network|socket hang up|dns/.test(m)) return "network";
  return null;
}

interface ErrorLike {
  status?: number;
  code?: number | string;
  message?: string;
  error?: { code?: number | string; message?: string; status?: string };
}

/** Normalise anything thrown by an adapter/SDK/fetch into AiProviderError. */
export function toProviderError(err: unknown, provider: AiProviderId): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const e = (err ?? {}) as ErrorLike & { name?: string };
  const message = e.message || String(err);
  if (e.name === "AbortError" || e.name === "TimeoutError") {
    return new AiProviderError("timeout", message, provider);
  }
  const rawStatus =
    typeof e.status === "number" ? e.status
    : typeof e.error?.code === "number" ? e.error.code
    : typeof e.code === "number" ? e.code
    : undefined;
  const fromMessage = classifyProviderMessage(message + " " + (e.error?.message ?? ""));
  if (fromMessage) return new AiProviderError(fromMessage, message, provider, rawStatus);
  if (rawStatus) return new AiProviderError(classifyHttpStatus(rawStatus), message, provider, rawStatus);
  if (/failed to fetch|fetch failed|network/i.test(message)) {
    return new AiProviderError("network", message, provider);
  }
  return new AiProviderError("server", message, provider);
}

/** Reject with `kind` after `ms`, guarding both SDK and fetch paths. */
function withTimeout<T>(promise: Promise<T>, ms: number, provider: AiProviderId, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AiProviderError("timeout", `${label} did not respond within ${Math.round(ms / 1000)}s`, provider)),
      ms
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

// ---------------------------------------------------------------------------
// Fallback copy — one honest, actionable string per failure mode
// ---------------------------------------------------------------------------

const KIND_FALLBACK: Record<AiErrorKind, string> = {
  no_key: "AI is not configured yet. Save your own provider API key in Administration → Settings → AI provider (Bring Your Own Key) to enable this feature.",
  auth: "{P} rejected the saved API key (invalid, revoked, or wrong provider). Replace it in Administration → Settings → AI provider.",
  rate_limit: "{P} rate limit reached. Wait about a minute and try again — or raise the quota on your key.",
  timeout: "{P} did not respond in time. Try again in a moment.",
  network: "Could not reach {P}. Check this server's outbound connectivity and try again.",
  bad_request: "{P} could not process this request. Try shorter or rephrased input.",
  server: "{P} returned an error. Try again shortly.",
  invalid_response: "{P} returned an empty response. Try again.",
};

export const AUTH_FALLBACK = {
  unauthenticated: "Sign in to use AI features.",
  forbidden: "Your role does not have AI access (permission ai.use) — ask a PMO administrator for the grant.",
} as const;

/** Map a failure kind to its graceful fallback string. */
export function fallbackFor(kind: AiErrorKind, providerLabel?: string): string {
  const template = KIND_FALLBACK[kind] ?? KIND_FALLBACK.server;
  return template.replace("{P}", providerLabel || "The AI provider");
}

/** Human label for a provider id (registry lookup, stable fallback). */
export function providerLabel(provider: AiProviderId): string {
  return AI_PROVIDERS[provider]?.label ?? provider;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

interface GeminiResponseLike {
  text?: string;
  usageMetadata?: { totalTokenCount?: number };
}

/** Google Gemini via the official `@google/genai` SDK (lazy-loaded, server-only). */
async function callGemini(args: CompletionArgs): Promise<CompletionOutcome> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: args.apiKey, httpOptions: { timeout: timeoutMs } });
    const response = (await withTimeout(
      client.models.generateContent({
        model: args.model,
        contents: args.prompt,
        config: {
          systemInstruction: args.systemContext,
          temperature: args.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: args.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        },
      }),
      timeoutMs,
      args.provider,
      providerLabel(args.provider)
    )) as GeminiResponseLike;
    const text = (response.text ?? "").trim();
    if (!text) throw new AiProviderError("invalid_response", "empty completion", args.provider);
    return { text, tokens: response.usageMetadata?.totalTokenCount ?? 0 };
  } catch (err) {
    throw toProviderError(err, args.provider);
  }
}

interface OpenAICompatibleResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

/** OpenAI-compatible Chat Completions (OpenAI, Groq, and any compatible gateways). */
async function callOpenAICompatible(
  args: CompletionArgs,
  baseUrl: string
): Promise<CompletionOutcome> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: "system", content: args.systemContext },
          { role: "user", content: args.prompt },
        ],
        temperature: args.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: args.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      const kind = classifyHttpStatus(res.status) === "bad_request"
        ? classifyProviderMessage(body) ?? "bad_request"
        : classifyHttpStatus(res.status);
      throw new AiProviderError(kind, `HTTP ${res.status}: ${body}`, args.provider, res.status);
    }
    const data = (await res.json()) as OpenAICompatibleResponse;
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new AiProviderError("invalid_response", "empty completion", args.provider);
    return { text, tokens: data.usage?.total_tokens ?? 0 };
  } catch (err) {
    throw toProviderError(err, args.provider);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single entry point: route to the adapter for the provider.
 * Always resolves with text or rejects with AiProviderError — never a raw throw.
 */
export async function complete(args: CompletionArgs): Promise<CompletionOutcome> {
  switch (args.provider) {
    case "gemini":
      return callGemini(args);
    case "openai":
      return callOpenAICompatible(args, "https://api.openai.com/v1");
    case "groq":
      return callOpenAICompatible(args, "https://api.groq.com/openai/v1");
    case "openrouter":
      return callOpenAICompatible(args, "https://openrouter.ai/api/v1");
    case "custom": {
      const baseUrl = (args.baseUrl ?? "").trim().replace(/\/+$/, "");
      if (!baseUrl) {
        throw new AiProviderError(
          "bad_request",
          "No base URL configured for the custom provider — set it in Administration → Settings → AI provider.",
          "custom"
        );
      }
      return callOpenAICompatible(args, baseUrl);
    }
    default: {
      const never: never = args.provider;
      throw new AiProviderError("bad_request", `Unsupported provider: ${String(never)}`, "gemini");
    }
  }
}
