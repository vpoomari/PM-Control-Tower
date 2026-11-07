// PM CONTROL TOWER — BYOK key vault (AES-256-GCM)
// Encrypts user-supplied AI provider API keys at rest so plaintext keys never
// touch the database, server logs, or the browser. Pure node:crypto — no
// dependencies, safe to unit test.
//
// Storage format (single string, stored in AIConnector.configJson.keyEnc):
//   v1.<salt>.<iv>.<tag>.<ciphertext>       (all segments base64url)
//   - salt (16B, random per record) → scrypt key derivation
//   - iv   (12B, random per record) → GCM nonce
//   - tag  (16B)                    → GCM auth tag (tamper detection)
//
// The master secret follows the same policy as session signing (auth.ts):
// AI_KEY_VAULT_SECRET when provided, else JWT_SECRET, else the sandbox dev
// fallback — production deployments must set a real secret.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const FORMAT_VERSION = "v1";
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard nonce length
const SALT_LEN = 16;
const TAG_LEN = 16;

/** Master secret used to derive the per-record AES key. */
export function vaultSecret(): string {
  return (
    process.env.AI_KEY_VAULT_SECRET ||
    process.env.JWT_SECRET ||
    "pmct-sandbox-dev-secret-change-in-production-0f4a9b"
  );
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LEN);
}

/** Encrypt a plaintext secret. Fresh random salt + IV per call. */
export function encryptSecret(plaintext: string, secret: string = vaultSecret()): string {
  if (!plaintext) throw new Error("encryptSecret: empty plaintext");
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    FORMAT_VERSION,
    salt.toString("base64url"),
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Decrypt a payload produced by encryptSecret. Throws on tamper/format drift. */
export function decryptSecret(payload: string, secret: string = vaultSecret()): string {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) {
    throw new Error("decryptSecret: unsupported payload format");
  }
  const [, saltB64, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret, Buffer.from(saltB64, "base64url")),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** True when the payload structurally matches our format (no decryption attempted). */
export function looksEncrypted(payload: string): boolean {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) return false;
  return parts.every((p, i) => p.length > 0 && (i === 0 || /^[A-Za-z0-9_-]+$/.test(p)));
}

/**
 * Display-safe mask of a key — last 4 characters only, never the prefix.
 * "AIzaSy…verysecret1234" → "••••1234".
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return "";
  const tail = plaintext.slice(-4);
  return `${"•".repeat(8)}${tail}`;
}
