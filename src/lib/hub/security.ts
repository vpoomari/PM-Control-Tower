// PM CONTROL TOWER — TowerIntegration Hub: connection security.
// Enterprise auth validation for incoming and outgoing connections:
//   · OAuth 2.0 access-token checks (expiry, scope, audience)
//   · JWT validation (HS256 signature, exp/nbf, alg allow-list, aud/iss)
//   · HMAC webhook signatures (constant-time compare, timestamp tolerance)
//   · mTLS client-certificate policy (CN/SAN allow-lists)
// Pure functions with injected secrets/clocks — no network, unit-testable.

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// OAuth 2.0
// ---------------------------------------------------------------------------

export interface OAuthTokenState {
  valid: boolean;
  reason?: string;
  expiresAtMs?: number;
  secondsToExpiry?: number;
  missingScopes?: string[];
}

/** Validate an OAuth 2.0 bearer token's expiry + required scopes. */
export function checkOAuthToken(input: {
  accessToken?: string | null;
  expiresAtMs?: number | null;
  scope?: string | null;
  requiredScopes?: string[];
  nowMs?: number;
}): OAuthTokenState {
  const now = input.nowMs ?? Date.now();
  if (!input.accessToken) return { valid: false, reason: "missing_access_token" };
  if (input.expiresAtMs != null) {
    const secondsToExpiry = Math.floor((input.expiresAtMs - now) / 1000);
    if (secondsToExpiry <= 0) return { valid: false, reason: "token_expired", expiresAtMs: input.expiresAtMs, secondsToExpiry };
    const state: OAuthTokenState = { valid: true, expiresAtMs: input.expiresAtMs, secondsToExpiry };
    if (input.requiredScopes?.length) {
      const granted = new Set((input.scope ?? "").split(/[\s,]+/).filter(Boolean));
      const missingScopes = input.requiredScopes.filter((s) => !granted.has(s));
      if (missingScopes.length) return { valid: false, reason: "insufficient_scope", expiresAtMs: input.expiresAtMs, secondsToExpiry, missingScopes };
      state.missingScopes = [];
    }
    return state;
  }
  // No expiry supplied: usable, but scope still enforced.
  if (input.requiredScopes?.length) {
    const granted = new Set((input.scope ?? "").split(/[\s,]+/).filter(Boolean));
    const missingScopes = input.requiredScopes.filter((s) => !granted.has(s));
    if (missingScopes.length) return { valid: false, reason: "insufficient_scope", missingScopes };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

export interface JwtValidation {
  valid: boolean;
  reason?: string;
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface JwtOptions {
  secret: string;
  nowMs?: number;
  audience?: string;
  issuer?: string;
  /** Algs accepted — "none" is never accepted regardless of this list. */
  allowedAlgs?: string[];
  clockSkewSec?: number;
}

function b64urlDecode(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

/**
 * Validate a JWT: structure, alg allow-list (rejects `none`), HS256 signature
 * (or the injected shared secret), exp/nbf with skew, aud/iss claims.
 * RS256/ES256 are rejected here by design — those verify against a JWKS set
 * at the connection-registration step, not per-request with a shared secret.
 */
export function validateJwt(token: string | null | undefined, opts: JwtOptions): JwtValidation {
  const now = opts.nowMs ?? Date.now();
  const skew = (opts.clockSkewSec ?? 60) * 1000;
  if (!token) return { valid: false, reason: "missing_token" };

  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed_token" };

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return { valid: false, reason: "malformed_token" };
  }

  const alg = String(header.alg ?? "");
  const allowed = opts.allowedAlgs ?? ["HS256"];
  if (!alg || alg.toLowerCase() === "none" || !allowed.includes(alg)) {
    return { valid: false, reason: `alg_not_allowed:${alg || "missing"}`, header, payload };
  }

  if (alg === "HS256") {
    const expected = createHmac("sha256", opts.secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], "base64");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return { valid: false, reason: "signature_invalid", header, payload };
    }
  }

  const exp = typeof payload.exp === "number" ? payload.exp * 1000 : null;
  if (exp !== null && now > exp + skew) return { valid: false, reason: "token_expired", header, payload };
  const nbf = typeof payload.nbf === "number" ? payload.nbf * 1000 : null;
  if (nbf !== null && now < nbf - skew) return { valid: false, reason: "token_not_yet_valid", header, payload };

  if (opts.audience) {
    const aud = payload.aud;
    const ok = Array.isArray(aud) ? aud.includes(opts.audience) : aud === opts.audience;
    if (!ok) return { valid: false, reason: "audience_mismatch", header, payload };
  }
  if (opts.issuer && payload.iss !== opts.issuer) {
    return { valid: false, reason: "issuer_mismatch", header, payload };
  }
  return { valid: true, header, payload };
}

// ---------------------------------------------------------------------------
// HMAC webhook signatures
// ---------------------------------------------------------------------------

export interface HmacCheck {
  valid: boolean;
  reason?: string;
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Verify an HMAC-SHA256 webhook signature over the raw body.
 * Accepts `sha256=<hex>`, `<hex>`, or Slack's `v0=<hex>` (secret = `v0:` + secret
 * for Slack). Optional timestamp tolerance guards replay (Slack/Jira style).
 */
export function verifyHmacSignature(input: {
  rawBody: string;
  secret: string;
  signature: string | null | undefined;
  timestamp?: string | number | null;
  nowMs?: number;
  toleranceSec?: number;
  /** prefix convention: "sha256=" (GitHub/Jira), "v0=" (Slack), "" (bare hex) */
  prefix?: "sha256" | "v0" | "none";
}): HmacCheck {
  const now = input.nowMs ?? Date.now();
  if (!input.signature) return { valid: false, reason: "missing_signature" };
  if (!input.secret) return { valid: false, reason: "no_secret_configured" };

  // Timestamp tolerance (replay window) — enforced when the vendor sends one.
  if (input.timestamp != null && input.timestamp !== "") {
    const tsMs = typeof input.timestamp === "number" ? input.timestamp * 1000 : Number(input.timestamp) * 1000;
    if (!Number.isFinite(tsMs)) return { valid: false, reason: "bad_timestamp" };
    const tolerance = (input.toleranceSec ?? 300) * 1000;
    if (Math.abs(now - tsMs) > tolerance) return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  const prefix = input.prefix ?? "sha256";
  const given = prefix === "none" ? input.signature : input.signature.startsWith(`${prefix}=`)
    ? input.signature.slice(prefix.length + 1)
    : input.signature;

  // Slack signs over `timestamp.body` with secret prefixed by "v0:".
  const mac = prefix === "v0"
    ? createHmac("sha256", `v0:${input.secret}`).update(`${input.timestamp}.${input.rawBody}`).digest("hex")
    : createHmac("sha256", input.secret).update(input.rawBody).digest("hex");

  if (!safeEqualHex(mac, given)) return { valid: false, reason: "signature_mismatch" };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// mTLS
// ---------------------------------------------------------------------------

export interface MtlsPolicy {
  /** Required client certificate CNs (exact or wildcard suffix, e.g. "*.corp.example"). */
  allowedCns: string[];
  /** Require the connection to present a client certificate at all. */
  requireClientCert: boolean;
}

function cnMatches(cn: string, pattern: string): boolean {
  const p = pattern.toLowerCase().trim();
  const c = cn.toLowerCase().trim();
  if (p.startsWith("*.")) {
    const suffix = p.slice(1); // ".corp.example"
    return c.endsWith(suffix) && c.length > suffix.length;
  }
  return c === p;
}

/** Validate a peer certificate CN against the connection's mTLS policy. */
export function checkMtls(input: {
  clientCertCn?: string | null;
  clientCertPresent: boolean;
  policy: MtlsPolicy;
}): HmacCheck {
  if (input.policy.requireClientCert && !input.clientCertPresent) {
    return { valid: false, reason: "client_certificate_required" };
  }
  if (!input.clientCertPresent) return { valid: true }; // mTLS not required
  if (!input.clientCertCn) return { valid: false, reason: "client_cert_cn_missing" };
  if (input.policy.allowedCns.length === 0) return { valid: false, reason: "mtls_policy_empty" };
  const ok = input.policy.allowedCns.some((pattern) => cnMatches(input.clientCertCn!, pattern));
  return ok ? { valid: true } : { valid: false, reason: `cn_not_allowed:${input.clientCertCn}` };
}

// ---------------------------------------------------------------------------
// One-shot ingress authentication used by the pipeline.
// ---------------------------------------------------------------------------

export type IngressAuthKind = "HMAC" | "JWT" | "OAUTH2" | "MTLS" | "NONE";

export interface IngressAuthInput {
  kind: IngressAuthKind;
  rawBody: string;
  headers: Record<string, string>;
  /** Connection-configured material (secret / JWT secret / token). */
  secret?: string | null;
  nowMs?: number;
  /** mTLS context forwarded by the reverse proxy, if any. */
  clientCertCn?: string | null;
  clientCertPresent?: boolean;
  mtlsPolicy?: MtlsPolicy;
}

export interface IngressAuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Authenticate one incoming payload per the connection's auth kind.
 * NONE only applies to connections explicitly opened without auth (internal
 * CSV uploads signed with the per-connection JWT at the route layer).
 */
export function authenticateIngress(input: IngressAuthInput): IngressAuthResult {
  const now = input.nowMs ?? Date.now();
  switch (input.kind) {
    case "HMAC": {
      const sig = input.headers["x-hub-signature-256"] ?? input.headers["x-hub-signature"] ??
        input.headers["x-slack-signature"] ?? input.headers["x-signature"];
      const ts = input.headers["x-slack-request-timestamp"] ?? input.headers["x-timestamp"] ?? null;
      const prefix: "sha256" | "v0" | "none" =
        input.headers["x-slack-signature"] ? "v0" : (sig ?? "").startsWith("sha256=") ? "sha256" : "sha256";
      const res = verifyHmacSignature({
        rawBody: input.rawBody, secret: input.secret ?? "", signature: sig,
        timestamp: ts, nowMs: now, prefix,
      });
      return res.valid ? { ok: true } : { ok: false, reason: res.reason };
    }
    case "JWT": {
      const auth = input.headers["authorization"] ?? "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
      if (!token) return { ok: false, reason: "missing_bearer_token" };
      const res = validateJwt(token, { secret: input.secret ?? "", nowMs: now });
      return res.valid ? { ok: true } : { ok: false, reason: res.reason };
    }
    case "OAUTH2": {
      const auth = input.headers["authorization"] ?? "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
      if (!token) return { ok: false, reason: "missing_bearer_token" };
      const res = checkOAuthToken({ accessToken: token, nowMs: now });
      return res.valid ? { ok: true } : { ok: false, reason: res.reason };
    }
    case "MTLS": {
      const res = checkMtls({
        clientCertCn: input.clientCertCn ?? null,
        clientCertPresent: input.clientCertPresent ?? false,
        policy: input.mtlsPolicy ?? { allowedCns: [], requireClientCert: true },
      });
      return res.valid ? { ok: true } : { ok: false, reason: res.reason };
    }
    case "NONE":
      return { ok: true };
    default:
      return { ok: false, reason: `unknown_auth_kind:${String(input.kind)}` };
  }
}
