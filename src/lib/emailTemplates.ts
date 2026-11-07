// PM CONTROL TOWER — Daily reminder e-mail template (single consolidated
// message per owner).
//
// Renders a dark, high-contrast HTML e-mail (slate-900/950 surfaces, slate-700
// borders, slate-100 text, group-accent chips) from a `ReminderDigest` owner
// slice. Table-based markup with inline styles only — Gmail/Outlook strip
// <style> blocks and never apply Tailwind. Every interpolated value goes
// through `escapeHtml` so a task title can never inject markup.
//
// Structure: header + counts → Tasks → RAID → EVM/status → footer. Sections
// with zero items are omitted entirely (honest empty state: an owner only ever
// sees sections that actually contain work).

import type {
  EvmReminder,
  OwnerReminders,
  RaidReminder,
  TaskReminder,
} from "@/lib/notificationData";

const COLORS = {
  page: "#020617",       // slate-950
  surface: "#0f172a",    // slate-900
  raised: "#1e293b",     // slate-800
  border: "#334155",     // slate-700
  text: "#f1f5f9",       // slate-100
  muted: "#94a3b8",      // slate-400
  accent: "#2864FF",
  danger: "#f87171",     // red-400
  warning: "#fbbf24",    // amber-400
  info: "#38bdf8",       // sky-400
  success: "#4ade80",    // green-400
} as const;

/** Escape a value for safe interpolation into HTML text/attributes. */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `2026-10-26` (or `—`), never a raw ISO timestamp in the list columns. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

function dueLabel(iso: string | null, overdue: boolean): string {
  const label = shortDate(iso);
  if (!overdue || label === "—") return label;
  const days = Math.floor((Date.now() - new Date(iso!).getTime()) / 86_400_000) + 1;
  return `${label} (${days}d late)`;
}

const TASK_FLAG_META: Record<TaskReminder["flag"], { label: string; color: string }> = {
  OVERDUE: { label: "OVERDUE", color: COLORS.danger },
  ENDING_TODAY: { label: "ENDS TODAY", color: COLORS.warning },
  STARTING_TODAY: { label: "STARTS TODAY", color: COLORS.info },
};

const RAID_META: Record<RaidReminder["kind"], { label: string; color: string }> = {
  RISK: { label: "RISK", color: COLORS.warning },
  ISSUE: { label: "ISSUE", color: COLORS.danger },
  ACTION: { label: "ACTION", color: COLORS.info },
  DECISION: { label: "DECISION", color: COLORS.success },
};

function chip(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:${color}22;color:${color};border:1px solid ${color}55;font:700 10px/1.4 Arial,sans-serif;letter-spacing:0.06em;">${escapeHtml(text)}</span>`;
}

/** Count badge shown in the section heading. */
function countBadge(n: number): string {
  return `<span style="display:inline-block;min-width:20px;padding:1px 7px;border-radius:999px;background:${COLORS.raised};color:${COLORS.text};border:1px solid ${COLORS.border};font:700 11px/1.6 Arial,sans-serif;text-align:center;">${n}</span>`;
}

function section(title: string, count: number, bodyRows: string, hint: string): string {
  return `
      <tr><td style="padding:22px 20px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="font:700 13px/1.4 Arial,sans-serif;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.text};">${escapeHtml(title)}</td>
            <td align="right" style="font:400 11px/1.4 Arial,sans-serif;color:${COLORS.muted};">${countBadge(count)}</td>
          </tr>
        </table>
        <p style="margin:6px 0 12px;font:400 12px/1.5 Arial,sans-serif;color:${COLORS.muted};">${escapeHtml(hint)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;">
${bodyRows}
        </table>
      </td></tr>`;
}

function taskRow(t: TaskReminder): string {
  const meta = TASK_FLAG_META[t.flag];
  return `          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;width:1%;">${chip(meta.label, meta.color)}</td>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;">
              <span style="font:700 13px/1.5 Arial,sans-serif;color:${COLORS.text};">${escapeHtml(t.code)}</span>
              <span style="font:400 13px/1.5 Arial,sans-serif;color:${COLORS.text};"> — ${escapeHtml(t.name)}</span>
              <br><span style="font:400 11px/1.5 Arial,sans-serif;color:${COLORS.muted};">${escapeHtml(t.project)} · ${escapeHtml(t.status)} · ${escapeHtml(t.priority)}</span>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;text-align:right;white-space:nowrap;font:400 12px/1.5 Arial,sans-serif;color:${COLORS.muted};">${escapeHtml(shortDate(t.due))}</td>
          </tr>`;
}

function raidRow(r: RaidReminder): string {
  const meta = RAID_META[r.kind];
  return `          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;width:1%;">${chip(meta.label, meta.color)}</td>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;">
              <span style="font:700 13px/1.5 Arial,sans-serif;color:${COLORS.text};">${escapeHtml(r.code)}</span>
              <span style="font:400 13px/1.5 Arial,sans-serif;color:${COLORS.text};"> — ${escapeHtml(r.title)}</span>
              <br><span style="font:400 11px/1.5 Arial,sans-serif;color:${COLORS.muted};">${escapeHtml(r.project ?? "—")} · ${escapeHtml(r.status)} · ${escapeHtml(r.severity)}</span>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;text-align:right;white-space:nowrap;font:400 12px/1.5 Arial,sans-serif;color:${r.overdue ? COLORS.danger : COLORS.muted};">${escapeHtml(dueLabel(r.due, r.overdue))}</td>
          </tr>`;
}

function evmRow(e: EvmReminder): string {
  const isBehind = e.kind === "EVM_BEHIND";
  const color = isBehind ? COLORS.danger : COLORS.info;
  const metrics =
    isBehind && (e.spi !== null || e.cpi !== null)
      ? ` · SPI ${e.spi === null ? "—" : e.spi.toFixed(2)} · CPI ${e.cpi === null ? "—" : e.cpi.toFixed(2)}`
      : "";
  return `          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;width:1%;">${chip(isBehind ? "EVM BEHIND" : "STATUS DUE", color)}</td>
            <td style="padding:10px 14px;border-bottom:1px solid ${COLORS.border};vertical-align:top;">
              <span style="font:700 13px/1.5 Arial,sans-serif;color:${COLORS.text};">${escapeHtml(e.project)}</span>
              <br><span style="font:400 12px/1.5 Arial,sans-serif;color:${COLORS.muted};">${escapeHtml(e.detail)}${escapeHtml(metrics)}</span>
            </td>
          </tr>`;
}

function firstLine(owner: OwnerReminders): string {
  const parts: string[] = [];
  if (owner.tasks.length) parts.push(`${owner.tasks.length} task${owner.tasks.length === 1 ? "" : "s"}`);
  if (owner.raid.length) parts.push(`${owner.raid.length} RAID item${owner.raid.length === 1 ? "" : "s"}`);
  if (owner.evm.length) parts.push(`${owner.evm.length} project alert${owner.evm.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export interface ReminderEmail {
  subject: string;
  html: string;
  /** Plain-text preview shown in message lists (Graph `bodyPreview`). */
  preview: string;
}

/**
 * Build the consolidated reminder e-mail for one owner.
 * Omitted sections are genuinely empty — nothing is faked or padded.
 */
export function buildReminderEmail(
  owner: OwnerReminders,
  generatedAt: Date = new Date()
): ReminderEmail {
  const total = owner.tasks.length + owner.raid.length + owner.evm.length;
  const dateLabel = generatedAt.toISOString().slice(0, 10);
  const subject = `Control Tower daily reminder — ${total} item${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} your attention (${dateLabel})`;
  const preview = firstLine(owner);

  const tasksSection = owner.tasks.length
    ? section(
        "Tasks",
        owner.tasks.length,
        owner.tasks.map(taskRow).join("\n"),
        "Ending today, starting today, or overdue on your assignments."
      )
    : "";

  const raidSection = owner.raid.length
    ? section(
        "RAID",
        owner.raid.length,
        owner.raid.map(raidRow).join("\n"),
        "Open risks, pending actions, open issues and pending decisions that are due or overdue."
      )
    : "";

  const evmSection = owner.evm.length
    ? section(
        "EVM & status",
        owner.evm.length,
        owner.evm.map(evmRow).join("\n"),
        "Projects below SPI/CPI threshold and weekly progress updates due."
      )
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;border-collapse:separate;">

        <tr><td style="padding:22px 20px 16px;border-bottom:1px solid ${COLORS.border};">
          <p style="margin:0;font:700 11px/1.4 Arial,sans-serif;letter-spacing:0.16em;text-transform:uppercase;color:${COLORS.accent};">Control Tower</p>
          <h1 style="margin:6px 0 4px;font:700 20px/1.3 Arial,sans-serif;color:${COLORS.text};">Daily reminder for ${escapeHtml(owner.name)}</h1>
          <p style="margin:0;font:400 13px/1.5 Arial,sans-serif;color:${COLORS.muted};">${escapeHtml(preview || "No open items")} — generated ${escapeHtml(dateLabel)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate;">
            <tr>
              <td style="padding:6px 12px;background:${COLORS.raised};border:1px solid ${COLORS.border};border-radius:8px;font:700 12px/1.4 Arial,sans-serif;color:${COLORS.text};text-align:center;">${owner.tasks.length}<br><span style="font-weight:400;color:${COLORS.muted};font-size:10px;">TASKS</span></td>
              <td style="width:8px;"></td>
              <td style="padding:6px 12px;background:${COLORS.raised};border:1px solid ${COLORS.border};border-radius:8px;font:700 12px/1.4 Arial,sans-serif;color:${COLORS.text};text-align:center;">${owner.raid.length}<br><span style="font-weight:400;color:${COLORS.muted};font-size:10px;">RAID</span></td>
              <td style="width:8px;"></td>
              <td style="padding:6px 12px;background:${COLORS.raised};border:1px solid ${COLORS.border};border-radius:8px;font:700 12px/1.4 Arial,sans-serif;color:${COLORS.text};text-align:center;">${owner.evm.length}<br><span style="font-weight:400;color:${COLORS.muted};font-size:10px;">ALERTS</span></td>
              <td style="width:8px;"></td>
              <td style="padding:6px 12px;background:${COLORS.accent}22;border:1px solid ${COLORS.accent}66;border-radius:8px;font:700 12px/1.4 Arial,sans-serif;color:${COLORS.info};text-align:center;">${total}<br><span style="font-weight:400;color:${COLORS.muted};font-size:10px;">TOTAL</span></td>
            </tr>
          </table>
        </td></tr>

        ${tasksSection}
        ${raidSection}
        ${evmSection}

        <tr><td style="padding:16px 20px 22px;border-top:1px solid ${COLORS.border};">
          <p style="margin:0;font:400 11px/1.6 Arial,sans-serif;color:${COLORS.muted};">Sent once daily by PM Control Tower. Items disappear automatically once they are completed, closed or resolved — this digest is a point-in-time view.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, preview: preview || "No open items" };
}
