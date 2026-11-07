// PM CONTROL TOWER — Vercel Cron: daily e-mail reminders (8:00 AM).
//
// GET /api/cron/send-reminders
//   Protected by the CRON_SECRET bearer token Vercel injects on scheduled
//   invocations (`Authorization: Bearer <CRON_SECRET>`). Session auth is
//   explicitly disabled (a cron has no session) — the secret check below is
//   the only gate, so a missing secret fails closed.
//
//   Query params:
//     dryRun=1  — collect + render, report what WOULD be sent, send nothing.
//
// Response: structured JSON summary (owners contacted, section counts, errors).

import { withApi, ok, ApiError } from "@/lib/api";
import { collectReminders } from "@/lib/notificationData";
import { buildReminderEmail } from "@/lib/emailTemplates";
import { isGraphConfigured, sendEmail, GraphMailError } from "@/lib/graphClient";

/** Simple constant-time-ish comparison for the cron secret. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const GET = withApi(
  async ({ req, searchParams }) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      throw new ApiError(
        503,
        "CRON_SECRET is not configured — set it in the environment before enabling the reminder cron."
      );
    }
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || !secretMatches(token, secret)) {
      throw new ApiError(401, "Unauthorized: missing or invalid cron secret.");
    }

    const dryRun = searchParams.get("dryRun") === "1";

    const digest = await collectReminders();

    if (dryRun) {
      return ok({
        dryRun: true,
        generatedAt: digest.generatedAt,
        counts: digest.counts,
        recipients: digest.owners.map((o) => ({
          email: o.email,
          tasks: o.tasks.length,
          raid: o.raid.length,
          evm: o.evm.length,
          subject: buildReminderEmail(o, new Date(digest.generatedAt)).subject,
        })),
      });
    }

    if (!isGraphConfigured()) {
      throw new ApiError(
        503,
        "Microsoft Graph is not configured — set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and MAIL_SENDER_EMAIL."
      );
    }

    const sent: { email: string; subject: string }[] = [];
    const failed: { email: string; error: string }[] = [];

    // Sequential sends: keeps Graph throughput predictable and makes each
    // failure attributable to a single owner.
    for (const owner of digest.owners) {
      try {
        const email = buildReminderEmail(owner, new Date(digest.generatedAt));
        await sendEmail({ to: owner.email, subject: email.subject, html: email.html, preview: email.preview });
        sent.push({ email: owner.email, subject: email.subject });
      } catch (err) {
        const message =
          err instanceof GraphMailError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        failed.push({ email: owner.email, error: message });
        console.error(`[cron:send-reminders] failed for ${owner.email}: ${message}`);
      }
    }

    return ok({
      dryRun: false,
      generatedAt: digest.generatedAt,
      counts: digest.counts,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    });
  },
  // Cron invocations carry no session — auth is handled above via CRON_SECRET.
  { auth: false, rateLimit: { limit: 12, windowMs: 60_000 } }
);

/** Vercel invokes GET; POST is accepted for manual/one-off triggering. */
export const POST = GET;
