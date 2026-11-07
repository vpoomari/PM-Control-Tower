// PM CONTROL TOWER — Microsoft Graph mail client (Client Credentials / daemon flow)
//
// Sends mail FROM a shared mailbox (or any mailbox the app registration may
// impersonate) using an app-only token — no user interaction, no delegated
// consent. Token acquisition uses @azure/msal-node; delivery uses
// @microsoft/microsoft-graph-client. The token is cached in-process until
// shortly before expiry, so a cron run performs a single AAD round-trip.
//
// Required environment (see .env.example / docs/EMAIL-REMINDERS-GUIDE.md):
//   AZURE_TENANT_ID      — AAD tenant (directory) id
//   AZURE_CLIENT_ID      — app registration (client) id
//   AZURE_CLIENT_SECRET  — client secret value (never a client id)
//   MAIL_SENDER_EMAIL    — shared mailbox / send-as address, e.g. pmct@contoso.com
// Optional:
//   EVM_SPI_THRESHOLD / EVM_CPI_THRESHOLD — consumed by notificationData, not here

import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = ["https://graph.microsoft.com/.default"];
/** Refresh the AAD token this many ms before its reported expiry. */
const TOKEN_SKEW_MS = 120_000;

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
}

export interface OutboundEmail {
  to: string | string[];
  subject: string;
  html: string;
  /** Short plain-text preview shown in message lists (Graph `bodyPreview`). */
  preview?: string;
}

export class GraphMailError extends Error {
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "GraphMailError";
    this.status = options?.status;
  }
}

/** Returns the Graph configuration, or null when any required var is missing. */
export function graphConfig(): GraphConfig | null {
  const tenantId = process.env.AZURE_TENANT_ID?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim();
  const senderEmail = process.env.MAIL_SENDER_EMAIL?.trim();
  if (!tenantId || !clientId || !clientSecret || !senderEmail) return null;
  return { tenantId, clientId, clientSecret, senderEmail };
}

/** True when every Graph variable is present (used by the cron route to fail fast). */
export function isGraphConfigured(): boolean {
  return graphConfig() !== null;
}

// ---------------------------------------------------------------------------
// In-process token cache (one entry — a single tenant/app pair per deployment)
// ---------------------------------------------------------------------------
let cca: ConfidentialClientApplication | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;
let inflightToken: Promise<string> | null = null;

function clientFor(cfg: GraphConfig): ConfidentialClientApplication {
  if (!cca) {
    cca = new ConfidentialClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
        clientSecret: cfg.clientSecret,
      },
    });
  }
  return cca;
}

/** Invalidate the cached AAD token (call after a 401 from Graph). */
export function invalidateGraphToken(): void {
  cachedToken = null;
}

/** Acquire (or reuse) an app-only Graph token. Never throws with a secret attached. */
export async function getGraphToken(): Promise<string> {
  const cfg = graphConfig();
  if (!cfg) {
    throw new GraphMailError(
      "Microsoft Graph is not configured — set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and MAIL_SENDER_EMAIL."
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (inflightToken) return inflightToken;

  inflightToken = (async () => {
    try {
      const result = await clientFor(cfg).acquireTokenByClientCredential({ scopes: GRAPH_SCOPE });
      const token = result?.accessToken;
      if (!token) throw new GraphMailError("Azure AD returned no access token for the client credentials flow.");
      const expiresAt =
        typeof result?.expiresOn === "number" ? result.expiresOn - TOKEN_SKEW_MS : Date.now() + 540_000;
      cachedToken = { value: token, expiresAt };
      return token;
    } catch (err) {
      // Surface only a sanitized message — MSAL errors can echo request details.
      const msg = err instanceof Error ? err.message : String(err);
      throw new GraphMailError(`Failed to acquire Microsoft Graph token: ${msg}`, { cause: err });
    } finally {
      inflightToken = null;
    }
  })();
  return inflightToken;
}

// ---------------------------------------------------------------------------
// sendMail
// ---------------------------------------------------------------------------
function normalizeRecipients(to: OutboundEmail["to"]): string[] {
  const list = Array.isArray(to) ? to : [to];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const addr = raw.trim().toLowerCase();
    if (!addr || !addr.includes("@") || seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
}

function graphClient(token: string): Client {
  return Client.init({
    authProvider: (done: (err: unknown, accessToken: string | null) => void) => done(null, token),
  });
}

/**
 * Send one HTML message from the configured mailbox.
 * Retries exactly once after refreshing the token when Graph answers 401.
 * Throws {@link GraphMailError} on failure; never throws with secrets attached.
 */
export async function sendEmail(mail: OutboundEmail): Promise<void> {
  const cfg = graphConfig();
  if (!cfg) {
    throw new GraphMailError(
      "Microsoft Graph is not configured — set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and MAIL_SENDER_EMAIL."
    );
  }
  const recipients = normalizeRecipients(mail.to);
  if (!recipients.length) throw new GraphMailError("No valid recipient addresses supplied.");

  const payload = {
    message: {
      subject: mail.subject,
      body: { contentType: "HTML" as const, content: mail.html },
      toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: true,
  };
  const url = `/users/${encodeURIComponent(cfg.senderEmail)}/sendMail`;

  const attempt = async (token: string): Promise<unknown> => {
    try {
      return await graphClient(token).api(url).post(payload);
    } catch (err) {
      const status =
        typeof err === "object" && err !== null && "statusCode" in err
          ? Number((err as { statusCode?: unknown }).statusCode)
          : undefined;
      const message =
        typeof err === "object" && err !== null && "message" in err && (err as { message?: unknown }).message
          ? String((err as { message: unknown }).message)
          : String(err);
      throw new GraphMailError(`Graph sendMail failed${status ? ` (${status})` : ""}: ${message}`, {
        status,
        cause: err,
      });
    }
  };

  try {
    await attempt(await getGraphToken());
  } catch (err) {
    if (err instanceof GraphMailError && err.status === 401) {
      invalidateGraphToken();
      await attempt(await getGraphToken());
      return;
    }
    throw err;
  }
}
