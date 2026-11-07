// PM CONTROL TOWER — BYOK AI layer unit tests (pure, DB-free, deterministic)
// Covers the key vault (AES-256-GCM), provider error classification, the
// graceful-fallback copy, and the shared registry/JSON parsing contracts that
// the central ai-service and both example components rely on.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSecret, decryptSecret, maskSecret, looksEncrypted,
} from "../../src/lib/ai/key-vault";
import {
  AiProviderError, classifyHttpStatus, classifyProviderMessage,
  complete, fallbackFor, providerLabel, toProviderError,
} from "../../src/lib/ai/providers";
import {
  AI_PROVIDERS, AI_PROVIDER_IDS, extractJsonArray, isAiProviderId,
  providerNeedsBaseUrl, quotaView,
} from "../../src/lib/ai/shared";

const SECRET = "unit-test-vault-secret";

// ---------- Key vault ----------
test("ai vault: encrypt → decrypt round trip", () => {
  const key = "AIzaSyExampleKeyForTest1234";
  const payload = encryptSecret(key, SECRET);
  assert.ok(looksEncrypted(payload), "payload matches the storage format");
  assert.equal(decryptSecret(payload, SECRET), key);
});

test("ai vault: random salt + IV produce distinct ciphertexts", () => {
  const a = encryptSecret("same-key-same-plaintext", SECRET);
  const b = encryptSecret("same-key-same-plaintext", SECRET);
  assert.notEqual(a, b, "identical plaintexts must not collide");
  assert.equal(decryptSecret(a, SECRET), decryptSecret(b, SECRET));
});

test("ai vault: wrong secret or tampering fails loudly", () => {
  const payload = encryptSecret("super-secret-key", SECRET);
  assert.throws(() => decryptSecret(payload, "another-secret"));
  const parts = payload.split(".");
  const tampered = [...parts];
  tampered[4] = `${parts[4]}A`; // flip ciphertext bytes → GCM auth tag breaks
  assert.throws(() => decryptSecret(tampered.join("."), SECRET));
  assert.throws(() => decryptSecret("v2.a.b.c.d", SECRET), "unknown format version rejected");
  assert.throws(() => encryptSecret("", SECRET), "empty plaintext rejected at write time");
});

test("ai vault: mask exposes only the last 4 characters", () => {
  assert.equal(maskSecret("AIzaSyVeryLongSecretKey1234"), "••••••••1234");
  assert.equal(maskSecret(""), "");
  assert.ok(!maskSecret("AIzaSyVeryLongSecretKey1234").includes("AIza"), "prefix never leaks");
});

test("ai vault: looksEncrypted rejects foreign shapes", () => {
  assert.ok(!looksEncrypted("plaintext-key"));
  assert.ok(!looksEncrypted("v1.only.three"));
  assert.ok(!looksEncrypted("v1.!!bad!!iv.tag.data"));
});

// ---------- Provider error classification ----------
test("ai providers: HTTP status → kind mapping", () => {
  assert.equal(classifyHttpStatus(401), "auth");
  assert.equal(classifyHttpStatus(403), "auth");
  assert.equal(classifyHttpStatus(429), "rate_limit");
  assert.equal(classifyHttpStatus(400), "bad_request");
  assert.equal(classifyHttpStatus(404), "bad_request");
  assert.equal(classifyHttpStatus(408), "timeout");
  assert.equal(classifyHttpStatus(504), "timeout");
  assert.equal(classifyHttpStatus(500), "server");
  assert.equal(classifyHttpStatus(503), "server");
});

test("ai providers: provider messages override status (Gemini bad keys arrive as 400)", () => {
  assert.equal(classifyProviderMessage("API key not valid. Please pass a valid API key."), "auth");
  assert.equal(classifyProviderMessage("RESOURCE_EXHAUSTED: Quota exceeded for quota metric"), "rate_limit");
  assert.equal(classifyProviderMessage("429 Too Many Requests"), "rate_limit");
  assert.equal(classifyProviderMessage("Operation timed out after 30000ms"), "timeout");
  assert.equal(classifyProviderMessage("TypeError: fetch failed"), "network");
  assert.equal(classifyProviderMessage("unrelated problem"), null);
});

test("ai providers: toProviderError normalises anything thrown", () => {
  assert.equal(toProviderError(new AiProviderError("rate_limit", "rl", "gemini"), "gemini").kind, "rate_limit");
  assert.equal(toProviderError({ status: 403, message: "nope" }, "groq").kind, "auth");
  assert.equal(toProviderError({ status: 500, message: "oops" }, "openai").kind, "server");
  assert.equal(toProviderError({ status: 429, message: "slow down" }, "gemini").kind, "rate_limit");
  const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.equal(toProviderError(aborted, "gemini").kind, "timeout");
  assert.equal(toProviderError(new Error("plain failure"), "gemini").kind, "server");
  const err = toProviderError({ status: 401, message: "unauthorized" }, "gemini");
  assert.equal(err.status, 401, "status preserved for diagnostics");
  assert.ok(err instanceof AiProviderError && err instanceof Error);
});

// ---------- Graceful fallback copy ----------
test("ai providers: every failure kind has an actionable non-empty fallback", () => {
  const kinds = ["no_key", "auth", "rate_limit", "timeout", "network", "bad_request", "server", "invalid_response"] as const;
  for (const kind of kinds) {
    const text = fallbackFor(kind, "Google Gemini");
    assert.ok(text.length > 20, `${kind} must be a real sentence`);
    assert.ok(!text.includes("{P}"), `${kind} placeholder must be substituted`);
    assert.ok(!/undefined|null|NaN/.test(text), `${kind} must not leak internals: ${text}`);
  }
  assert.ok(fallbackFor("no_key").includes("Settings"), "capture hint points at the settings path");
  assert.ok(fallbackFor("auth", "Groq").includes("Groq"), "auth fallback names the provider");
  assert.equal(providerLabel("gemini"), "Google Gemini");
  assert.equal(providerLabel("groq"), "Groq");
});

// ---------- Shared registry & parsing ----------
test("ai shared: provider registry is complete and swap-ready", () => {
  assert.deepEqual([...AI_PROVIDER_IDS].sort(), ["custom", "gemini", "groq", "openai", "openrouter"]);
  for (const id of AI_PROVIDER_IDS) {
    const spec = AI_PROVIDERS[id];
    assert.ok(spec.label && spec.defaultModel && spec.keyUrl, `${id} fully described`);
    assert.ok(spec.keyUrl.startsWith("https://"), `${id} key URL is https`);
  }
  assert.ok(isAiProviderId("gemini"));
  assert.ok(isAiProviderId("custom"), "any OpenAI-compatible provider is first-class");
  assert.ok(!isAiProviderId("anthropic"), "unknown providers are rejected until registered");
  assert.ok(providerNeedsBaseUrl("custom"), "custom endpoints must declare a base URL");
  assert.ok(
    !providerNeedsBaseUrl("gemini") && !providerNeedsBaseUrl("openai") &&
      !providerNeedsBaseUrl("groq") && !providerNeedsBaseUrl("openrouter"),
    "fixed providers never need a base URL"
  );
});

test("ai shared: quotaView computes the token meter honestly", () => {
  assert.deepEqual(quotaView(0, 0, null), { budget: 0, used: 0, available: 0, periodStartAt: null });
  assert.deepEqual(quotaView(1000, 250, "2026-01-01T00:00:00.000Z"),
    { budget: 1000, used: 250, available: 750, periodStartAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(quotaView(1000, 1500, null).available, 0, "available never goes negative");
  assert.equal(quotaView(-5, -5, null).budget, 0, "negative inputs are clamped");
});

test("ai custom provider: complete() refuses to call without a base URL", async () => {
  await assert.rejects(
    () => complete({
      apiKey: "sk-test", provider: "custom", model: "any-model",
      prompt: "hi", systemContext: "sys",
    }),
    (err: unknown) => err instanceof AiProviderError && err.kind === "bad_request",
    "missing baseUrl is a bad_request, not a crash"
  );
  await assert.rejects(
    () => complete({
      apiKey: "sk-test", provider: "custom", model: "any-model",
      prompt: "hi", systemContext: "sys", baseUrl: "   ",
    }),
    (err: unknown) => err instanceof AiProviderError && err.kind === "bad_request",
    "blank baseUrl is rejected too"
  );
});

test("ai shared: extractJsonArray parses clean, fenced and object arrays", () => {
  assert.deepEqual(extractJsonArray('["Draft WBS", "Estimate durations", "Set baseline"]'),
    ["Draft WBS", "Estimate durations", "Set baseline"]);
  assert.deepEqual(
    extractJsonArray('Sure! Here you go:\n```json\n["One", "Two", "Three"]\n```\nAnything else?'),
    ["One", "Two", "Three"]
  );
  assert.deepEqual(extractJsonArray('[{"title": "Alpha"}, {"title": "Beta"}]'), ["Alpha", "Beta"]);
  assert.deepEqual(extractJsonArray('[{"text": "First"}, {"text": "Second"}]'), ["First", "Second"]);
});

test("ai shared: extractJsonArray refuses prose, junk and empty arrays", () => {
  assert.equal(extractJsonArray("I could not break that down, sorry."), null);
  assert.equal(extractJsonArray("[]"), null);
  assert.equal(extractJsonArray('["", "x"]'), null);
  assert.equal(extractJsonArray('["ok", 42]'), null);
  assert.equal(extractJsonArray(""), null);
});
