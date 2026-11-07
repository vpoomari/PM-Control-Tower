// PM CONTROL TOWER — Automated task e-mail engine (cron / background worker).
//
// Two passes, both idempotent per calendar day via the Task timestamps:
//   due-today — ONE consolidated e-mail per assignee when a task reaches its
//               exact due date (Task.dueTodayEmailedAt is null / from an
//               earlier day → exactly one send per reached due date).
//   overdue   — ONE e-mail per assignee per day for every past-due task,
//               every day, until status ∈ {COMPLETED, CANCELLED, ON_HOLD}
//               (Task.overdueEmailedAt refreshed on each successful send).
//
// Routing: assigned PM/PMO (task assignee) → project owner fallback → the row
// is reported as `skippedUnroutable` when neither side resolves. One
// consolidated e-mail per recipient per pass (same convention as the daily
// reminder digest — never a per-task mail storm).
//
// Delivery: the sender is injected (routes pass graphClient.sendEmail), which
// keeps this module free of Graph/MSAL imports and lets dry-run/tests swap it.
// A stamp is written only AFTER a successful send, so a transient failure is
// retried on the next run instead of silently swallowing the day's alert.
//
// Date predicates run in JS — see windows.ts for the storage rationale.

import { db } from "@/lib/db";
import { TASK_TERMINAL_STATUS } from "../constants";
import {
  groupByRecipient,
  resolveRecipient,
  selectDueTodayCandidates,
  selectOverdueCandidates,
} from "./windows";
import { buildDueTodayEmail, buildOverdueEmail, itemFrom } from "./templates";

export type AlertPass = "due-today" | "overdue";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface AlertRow {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  endDate: Date | null;
  dueTodayEmailedAt: Date | null;
  overdueEmailedAt: Date | null;
  assigneeEmail: string | null;
  assigneeName: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  projectCode: string | null;
  projectName: string | null;
}

const ALERT_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  priority: true,
  endDate: true,
  dueTodayEmailedAt: true,
  overdueEmailedAt: true,
  assignee: { select: { email: true, name: true, isActive: true } },
  project: {
    select: {
      code: true,
      name: true,
      owner: { select: { email: true, name: true, isActive: true } },
    },
  },
} as const;

type AlertRowDb = {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  endDate: Date | null;
  dueTodayEmailedAt: Date | null;
  overdueEmailedAt: Date | null;
  assignee: { email: string; name: string; isActive: boolean } | null;
  project: { code: string; name: string; owner: { email: string; name: string; isActive: boolean } | null } | null;
};

/** Inactive people never receive mail — the owner fallback then applies. */
function toAlertRow(r: AlertRowDb): AlertRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    priority: r.priority,
    endDate: r.endDate,
    dueTodayEmailedAt: r.dueTodayEmailedAt,
    overdueEmailedAt: r.overdueEmailedAt,
    assigneeEmail: r.assignee?.isActive ? r.assignee.email : null,
    assigneeName: r.assignee?.name ?? null,
    ownerEmail: r.project?.owner?.isActive ? r.project.owner.email : null,
    ownerName: r.project?.owner?.name ?? null,
    projectCode: r.project?.code ?? null,
    projectName: r.project?.name ?? null,
  };
}

async function loadAlertRows(): Promise<AlertRow[]> {
  // Terminal tasks are excluded in SQL (storage-agnostic); every date test
  // runs in JS afterwards (see windows.ts header).
  const rows = await db.task.findMany({
    where: { endDate: { not: null }, status: { notIn: [...TASK_TERMINAL_STATUS] } },
    select: ALERT_SELECT,
    orderBy: { endDate: "asc" },
    take: 10_000,
  });
  return (rows as AlertRowDb[]).map(toAlertRow);
}

// ---------------------------------------------------------------------------
// Pass execution
// ---------------------------------------------------------------------------

export interface MailPayload {
  to: string;
  subject: string;
  html: string;
  preview?: string;
}

export type Sender = (mail: MailPayload) => Promise<void>;

export interface PassSummary {
  pass: AlertPass;
  dryRun: boolean;
  /** Tasks eligible for this pass right now (after date + stamp + status tests). */
  candidates: number;
  /** Consolidated e-mails (one per recipient). */
  groups: number;
  sent: { to: string; tasks: number; subject: string }[];
  failed: { to: string; error: string }[];
  /** Rows with neither an active assignee nor an active project owner. */
  skippedUnroutable: number;
  /** Tasks whose stamp was written (== covered by a delivered e-mail). */
  stamped: number;
}

function recipientName(group: { recipient: string; tasks: AlertRow[] }): string | null {
  const first = group.tasks[0];
  if (!first) return null;
  const primary = resolveRecipient(first);
  if (primary && first.assigneeEmail && primary === first.assigneeEmail.trim().toLowerCase()) {
    return first.assigneeName;
  }
  return first.ownerName ?? first.assigneeName;
}

async function runPass(
  pass: AlertPass,
  rows: AlertRow[],
  now: Date,
  dryRun: boolean,
  send: Sender
): Promise<PassSummary> {
  const candidates =
    pass === "due-today" ? selectDueTodayCandidates(rows, now) : selectOverdueCandidates(rows, now);
  const { groups, skipped } = groupByRecipient(candidates);

  const summary: PassSummary = {
    pass,
    dryRun,
    candidates: candidates.length,
    groups: groups.length,
    sent: [],
    failed: [],
    skippedUnroutable: skipped.length,
    stamped: 0,
  };
  if (dryRun || groups.length === 0) return summary;

  for (const group of groups) {
    const items = group.tasks.map((t) => itemFrom(t, now));
    const email =
      pass === "due-today"
        ? buildDueTodayEmail(group.recipient, recipientName(group), items, now)
        : buildOverdueEmail(group.recipient, recipientName(group), items, now);
    try {
      await send({ to: group.recipient, subject: email.subject, html: email.html, preview: email.preview });
      // Stamp only after confirmed delivery — a failed send retries next run.
      const ids = group.tasks.map((t) => t.id);
      const data = pass === "due-today" ? { dueTodayEmailedAt: now } : { overdueEmailedAt: now };
      const updated = await db.task.updateMany({ where: { id: { in: ids } }, data });
      summary.stamped += updated.count;
      summary.sent.push({ to: group.recipient, tasks: group.tasks.length, subject: email.subject });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failed.push({ to: group.recipient, error: message });
      console.error(`[priorities:${pass}] failed for ${group.recipient}: ${message}`);
    }
  }
  return summary;
}

export async function runDueTodayPass(
  now: Date,
  opts: { dryRun?: boolean; send: Sender }
): Promise<PassSummary> {
  const rows = await loadAlertRows();
  return runPass("due-today", rows, now, opts.dryRun === true, opts.send);
}

export async function runOverduePass(
  now: Date,
  opts: { dryRun?: boolean; send: Sender }
): Promise<PassSummary> {
  const rows = await loadAlertRows();
  return runPass("overdue", rows, now, opts.dryRun === true, opts.send);
}

/** Both passes over a single read — what the daily cron and worker invoke. */
export async function runTaskAlerts(
  now: Date,
  opts: { dryRun?: boolean; pass?: "all" | AlertPass; send: Sender }
): Promise<{ dueToday: PassSummary | null; overdue: PassSummary | null }> {
  const wantDue = opts.pass === "all" || opts.pass === "due-today";
  const wantOverdue = opts.pass === "all" || opts.pass === "overdue";
  if (!wantDue && !wantOverdue) return { dueToday: null, overdue: null };
  const rows = await loadAlertRows();
  return {
    dueToday: wantDue ? await runPass("due-today", rows, now, opts.dryRun === true, opts.send) : null,
    overdue: wantOverdue ? await runPass("overdue", rows, now, opts.dryRun === true, opts.send) : null,
  };
}
