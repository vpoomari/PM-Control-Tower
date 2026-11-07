// PM CONTROL TOWER — Task alert e-mail templates (pure rendering).
//
// No Prisma, no network — both builders are unit-tested in
// tests/engines/priorities.test.ts. Dark, high-contrast layout to match the
// Priority Dashboard, table-based with inline styles only (no external CSS),
// and every interpolated field goes through escapeHtml.

import { escapeHtml } from "@/lib/emailTemplates";
import { calendarDaysBetween } from "./windows";

export interface AlertTaskItem {
  code: string;
  name: string;
  projectName: string | null;
  endDateLabel: string;
  daysLate: number;
}

export interface RenderedAlertEmail {
  subject: string;
  html: string;
  preview: string;
}

const MAX_ROWS = 50;

/** Map a task row (dates as Date) to the render shape. */
export function itemFrom(
  row: { code: string; name: string; projectName: string | null; endDate: Date | null },
  now: Date
): AlertTaskItem {
  return {
    code: row.code,
    name: row.name,
    projectName: row.projectName,
    endDateLabel: row.endDate ? row.endDate.toISOString().slice(0, 10) : "—",
    daysLate: row.endDate ? Math.max(0, calendarDaysBetween(row.endDate, now)) : 0,
  };
}

function greeting(name: string | null, email: string): string {
  const first = (name ?? email).split("@")[0].split(/[._-]/)[0];
  const pretty = first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
  return `Hi ${pretty},`;
}

function shell(inner: string): string {
  return [
    `<div style="margin:0;padding:24px;background:#0b1220;font-family:'Segoe UI',Arial,sans-serif">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#111827;border:1px solid #28324a;border-radius:12px;border-collapse:collapse">`,
    `<tr><td style="padding:22px 26px 6px 26px">`,
    `<div style="font-size:11px;letter-spacing:.22em;color:#7dd3fc;font-weight:700">PM CONTROL TOWER</div>`,
    inner,
    `</td></tr>`,
    `<tr><td style="padding:14px 26px 20px 26px;border-top:1px solid #28324a">`,
    `<div style="font-size:11px;color:#8896b0">Automated task alert — no reply needed. Manage notifications in Control Tower → Connect → Notifications.</div>`,
    `</td></tr></table></div>`,
  ].join("");
}

function taskTable(items: AlertTaskItem[], late: boolean): string {
  const shown = items.slice(0, MAX_ROWS);
  const rows = shown
    .map((t) => {
      const badge = late
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#4c1d2e;color:#fda4af;font-size:11px;font-weight:700">${t.daysLate}d late</span>`
        : `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#3b2f0a;color:#fde68a;font-size:11px;font-weight:700">due today</span>`;
      return [
        `<tr>`,
        `<td style="padding:10px 0;border-bottom:1px solid #1f2941;vertical-align:top">`,
        `<div style="font-size:13px;color:#f1f5f9;font-weight:600">${escapeHtml(t.name)}`,
        ` <span style="color:#7dd3fc;font-family:ui-monospace,Menlo,monospace;font-size:12px">${escapeHtml(t.code)}</span></div>`,
        `<div style="font-size:12px;color:#94a3b8;margin-top:2px">${escapeHtml(t.projectName ?? "No project")} · due ${escapeHtml(t.endDateLabel)}</div>`,
        `</td>`,
        `<td style="padding:10px 0 10px 12px;border-bottom:1px solid #1f2941;text-align:right;white-space:nowrap">${badge}</td>`,
        `</tr>`,
      ].join("");
    })
    .join("");
  const more =
    items.length > MAX_ROWS
      ? `<div style="font-size:12px;color:#94a3b8;padding-top:10px">…and ${items.length - MAX_ROWS} more — open the Priority Dashboard.</div>`
      : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px">${rows}</table>${more}`;
}

function emailBody(
  heading: string,
  note: string,
  recipient: string,
  name: string | null,
  items: AlertTaskItem[],
  late: boolean
): string {
  return [
    `<div style="padding:14px 0 4px 0"><div style="font-size:18px;color:#f8fafc;font-weight:700">${escapeHtml(heading)}</div>`,
    `<div style="font-size:13px;color:#a9b6cf;margin-top:4px">${escapeHtml(note)}</div></div>`,
    `<div style="font-size:13px;color:#cbd5e1;padding-top:8px">${escapeHtml(greeting(name, recipient))}</div>`,
    taskTable(items, late),
  ].join("");
}

/** Single consolidated "due today" e-mail for one assignee. */
export function buildDueTodayEmail(
  recipient: string,
  name: string | null,
  items: AlertTaskItem[],
  now: Date
): RenderedAlertEmail {
  const dateLabel = now.toISOString().slice(0, 10);
  const subject = `Due today: ${items.length} task${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} your attention (${dateLabel})`;
  const preview = items.map((i) => `${i.code} ${i.name}`).join("; ");
  const html = shell(
    emailBody(
      "Tasks due today",
      `${items.length} of your tasks reach their due date today (${dateLabel}).`,
      recipient,
      name,
      items,
      false
    )
  );
  return { subject, html, preview };
}

/** Daily "overdue" escalation — worst lateness first. */
export function buildOverdueEmail(
  recipient: string,
  name: string | null,
  items: AlertTaskItem[],
  now: Date
): RenderedAlertEmail {
  const sorted = [...items].sort((a, b) => b.daysLate - a.daysLate);
  const dateLabel = now.toISOString().slice(0, 10);
  const worst = sorted.reduce((max, i) => Math.max(max, i.daysLate), 0);
  const subject = `OVERDUE: ${sorted.length} task${sorted.length === 1 ? "" : "s"} past due — daily escalation (${dateLabel})`;
  const preview = sorted.map((i) => `${i.code} ${i.daysLate}d late`).join("; ");
  const html = shell(
    emailBody(
      "Overdue tasks — daily escalation",
      `This alert repeats every day until each task is Completed, Cancelled or On Hold. Worst lateness: ${worst} day${worst === 1 ? "" : "s"}.`,
      recipient,
      name,
      sorted,
      true
    )
  );
  return { subject, html, preview };
}
