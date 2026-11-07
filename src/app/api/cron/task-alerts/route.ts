// PM CONTROL TOWER — Vercel Cron: automated task alert e-mails (7:00 AM daily).
//
// GET /api/cron/task-alerts
//   Protected by the CRON_SECRET bearer token Vercel injects on scheduled
//   invocations (`Authorization: Bearer <CRON_SECRET>`). Session auth is
//   explicitly disabled (a cron has no session) — the secret check below is
//   the only gate, so a missing secret fails closed.
//
//   Runs BOTH passes of the automated e-mail engine:
//     due-today — one e-mail per assignee for tasks whose due date is today
//                 (idempotent: Task.dueTodayEmailedAt already today → skipped)
//     overdue   — daily escalation for EVERY past-due task, every day, until
//                 status is COMPLETED / CANCELLED / ON_HOLD
//                 (idempotent per day: Task.overdueEmailedAt already today → skipped)
//
//   Query params:
//     dryRun=1              — collect + render, report what WOULD be sent, send nothing.
//     pass=due-today|overdue|all   — run a single pass (default: all).
//
// Response: structured JSON summary per pass (candidates, recipients, sent, failures).

import { withApi, ok, ApiError } from "@/lib/api";
import { isGraphConfigured, sendEmail } from "@/lib/graphClient";
import { runTaskAlerts, type AlertPass } from "@/lib/priorities/emails";

/** Simple constant-time-ish comparison for the cron secret. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const PASSES = new Set(["all", "due-today", "overdue"]);

export const GET = withApi(
  async ({ req, searchParams }) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      throw new ApiError(
        503,
        "CRON_SECRET is not configured — set it in the environment before enabling the task-alert cron."
      );
    }
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || !secretMatches(token, secret)) {
      throw new ApiError(401, "Unauthorized: missing or invalid cron secret.");
    }

    const dryRun = searchParams.get("dryRun") === "1";
    const passParam = searchParams.get("pass") ?? "all";
    if (!PASSES.has(passParam)) {
      throw new ApiError(400, "Invalid pass. Use: due-today, overdue, or all.");
    }
    const pass = passParam as "all" | AlertPass;

    if (!dryRun && !isGraphConfigured()) {
      throw new ApiError(
        503,
        "Microsoft Graph is not configured — set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and MAIL_SENDER_EMAIL."
      );
    }

    const now = new Date();
    const result = await runTaskAlerts(now, { dryRun, pass, send: sendEmail });

    const shape = (s: NonNullable<typeof result.dueToday>) => ({
      pass: s.pass,
      candidates: s.candidates,
      recipients: s.groups,
      skippedUnroutable: s.skippedUnroutable,
      sentCount: s.sent.length,
      failedCount: s.failed.length,
      stamped: s.stamped,
      sent: s.sent,
      failed: s.failed,
    });

    return ok({
      dryRun,
      generatedAt: now.toISOString(),
      dueToday: result.dueToday ? shape(result.dueToday) : null,
      overdue: result.overdue ? shape(result.overdue) : null,
    });
  },
  // Cron invocations carry no session — auth is handled above via CRON_SECRET.
  { auth: false, rateLimit: { limit: 12, windowMs: 60_000 } }
);

/** Vercel invokes GET; POST is accepted for manual/one-off triggering. */
export const POST = GET;
