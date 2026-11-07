// PM CONTROL TOWER — Reminder data collection for the daily Graph digest.
//
// Gathers everything an owner must act on and groups it by e-mail address:
//   1. Tasks    — ending today, starting today, overdue (by assignee)
//   2. RAID     — open risks, pending action items, open issues, pending
//                 decisions that are due or overdue (by owner, with a project
//                 owner fallback when the register only stores a person's name)
//   3. EVM      — projects whose latest SPI/CPI sits below threshold, plus
//                 active projects whose status date is stale (weekly update due)
//
// Conventions: batched reads + in-memory bucketing (never raw SQL — the
// engines run on SQLite locally and PostgreSQL in production), everything
// idempotent and read-only. A single e-mail per owner is assembled from the
// result so the cron sends one consolidated message per person.

import { db } from "@/lib/db";
import { TASK_TERMINAL_STATUS } from "./constants";

// ---------------------------------------------------------------------------
// Public shapes (consumed by emailTemplates.ts and the cron route)
// ---------------------------------------------------------------------------
export type TaskFlag = "OVERDUE" | "ENDING_TODAY" | "STARTING_TODAY";

export interface TaskReminder {
  flag: TaskFlag;
  code: string;
  name: string;
  project: string;
  due: string | null;
  status: string;
  priority: string;
}

export type RaidKind = "RISK" | "ISSUE" | "ACTION" | "DECISION";

export interface RaidReminder {
  kind: RaidKind;
  code: string;
  title: string;
  project: string | null;
  due: string | null;
  overdue: boolean;
  status: string;
  severity: string;
}

export type EvmKind = "EVM_BEHIND" | "STATUS_UPDATE";

export interface EvmReminder {
  kind: EvmKind;
  project: string;
  detail: string;
  spi: number | null;
  cpi: number | null;
}

export interface OwnerReminders {
  email: string;
  name: string;
  tasks: TaskReminder[];
  raid: RaidReminder[];
  evm: EvmReminder[];
}

export interface ReminderDigest {
  generatedAt: string;
  owners: OwnerReminders[];
  counts: {
    owners: number;
    tasks: number;
    raid: number;
    evm: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/engines/email-reminders.test.ts)
// ---------------------------------------------------------------------------
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Bucket a task row against today's window; null when it is not a reminder. */
export function bucketTask(
  startDate: Date | null,
  endDate: Date | null,
  now: Date
): TaskFlag | null {
  const start = startOfDay(now);
  const end = endOfDay(now);
  if (endDate && endDate < start) return "OVERDUE";
  if (endDate && endDate <= end) return "ENDING_TODAY";
  if (startDate && startDate >= start && startDate <= end) return "STARTING_TODAY";
  return null;
}

/** Due dates at/before today's end count as due-or-overdue. */
export function isDueOrOverdue(due: Date | null, now: Date): boolean {
  return due !== null && due <= endOfDay(now);
}

/** Overdue strictly means the due day already passed. */
export function isOverdue(due: Date | null, now: Date): boolean {
  return due !== null && due < startOfDay(now);
}

/** Person-name lookup key: trimmed + case-insensitive. */
export function personKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** Minimal e-mail sanity check (avoids bouncing an empty/garbled address). */
export function isEmailLike(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  return v.length >= 5 && v.includes("@") && v.includes(".") && !/\s/.test(v);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------
interface Bucket {
  name: string;
  tasks: TaskReminder[];
  raid: RaidReminder[];
  evm: EvmReminder[];
}

export async function collectReminders(now: Date = new Date()): Promise<ReminderDigest> {
  const spiThreshold = envNumber("EVM_SPI_THRESHOLD", 0.9);
  const cpiThreshold = envNumber("EVM_CPI_THRESHOLD", 0.9);
  const staleMs = 7 * 24 * 60 * 60 * 1000; // weekly progress-update cadence

  // ---- batched reads (one round-trip per aggregate) ----
  const [users, tasks, risks, issues, actions, decisions, projects] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
    }),
    db.task.findMany({
      // Date predicates are deliberately left to JS: the FLOW workbook import
      // stored dates as ISO-8601 TEXT while Prisma writes epoch-ms INTEGER —
      // SQLite can't compare those two storages, so SQL `lte/lt` would silently
      // drop every imported row. `not: null` is storage-agnostic; bucketTask()
      // does the real windowing.
      where: {
        assigneeId: { not: null },
        status: { notIn: [...TASK_TERMINAL_STATUS] },
        OR: [{ endDate: { not: null } }, { startDate: { not: null } }],
      },
      select: {
        code: true,
        name: true,
        status: true,
        priority: true,
        startDate: true,
        endDate: true,
        assignee: { select: { email: true, name: true } },
        project: { select: { code: true, name: true } },
      },
      orderBy: { endDate: "asc" },
      take: 5000,
    }),
    db.risk.findMany({
      // Spec: only open risks that are due or overdue (never a blanket critical
      // dump). The due/overdue test runs in JS — see the note on Task above.
      where: {
        status: { notIn: ["CLOSED"] },
        dueDate: { not: null },
      },
      select: {
        code: true,
        title: true,
        severity: true,
        status: true,
        dueDate: true,
        ownerName: true,
        project: { select: { id: true, code: true, name: true, ownerId: true } },
      },
      take: 2000,
    }),
    db.issue.findMany({
      // Spec: only open issues that are due or overdue (JS-side date test).
      where: {
        status: { notIn: ["RESOLVED", "CLOSED"] },
        dueDate: { not: null },
      },
      select: {
        code: true,
        title: true,
        severity: true,
        status: true,
        dueDate: true,
        ownerName: true,
        project: { select: { id: true, code: true, name: true, ownerId: true } },
      },
      take: 2000,
    }),
    db.actionItem.findMany({
      where: {
        status: { notIn: ["DONE", "COMPLETED", "CANCELLED", "CLOSED"] },
        dueDate: { not: null },
      },
      select: {
        code: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        ownerName: true,
        ownerEmail: true,
        relatedCode: true,
        projectId: true,
      },
      orderBy: { dueDate: "asc" },
      take: 2000,
    }),
    db.decision.findMany({
      where: {
        decision: null,
        status: { notIn: ["CANCELLED", "CLOSED"] },
        requiredBy: { not: null },
      },
      select: {
        code: true,
        title: true,
        status: true,
        priority: true,
        requiredBy: true,
        decisionOwner: true,
        projectId: true,
      },
      orderBy: { requiredBy: "asc" },
      take: 2000,
    }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        statusDate: true,
        ownerId: true,
        managerId: true,
        owner: { select: { id: true, name: true, email: true } },
      },
      take: 1000,
    }),
  ]);

  const latestPeriods =
    projects.length > 0
      ? await db.evmPeriod.findMany({
          where: { projectId: { in: projects.map((p) => p.id) } },
          select: { projectId: true, statusDate: true, spi: true, cpi: true },
          take: 5000,
        })
      : [];

  // ---- lookup indexes ----
  const byId = new Map(users.map((u) => [u.id, u]));
  const byName = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    const key = personKey(u.name);
    if (key && !byName.has(key)) byName.set(key, u);
  }
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const buckets = new Map<string, Bucket>();
  const bucketFor = (email: string, name: string): Bucket => {
    const key = email.trim().toLowerCase();
    let b = buckets.get(key);
    if (!b) {
      b = { name: name || email, tasks: [], raid: [], evm: [] };
      buckets.set(key, b);
    }
    return b;
  };

  /** Resolve a free-text person (ownerName / decisionOwner) to an active user. */
  const resolvePerson = (name: string | null): (typeof users)[number] | undefined =>
    name ? byName.get(personKey(name)) : undefined;

  // ---- 1. Tasks (by assignee) ----
  for (const t of tasks) {
    const flag = bucketTask(t.startDate, t.endDate, now);
    if (!flag || !t.assignee) continue;
    const b = bucketFor(t.assignee.email, t.assignee.name);
    b.tasks.push({
      flag,
      code: t.code,
      name: t.name,
      project: t.project ? `${t.project.code} — ${t.project.name}` : "",
      due: t.endDate ? t.endDate.toISOString() : null,
      status: t.status,
      priority: t.priority,
    });
  }

  // ---- 2. RAID (by owner, project-owner fallback) ----
  const pushRaid = (
    item: Omit<RaidReminder, "overdue">,
    ownerName: string | null,
    projectId: string | null,
    explicitEmail?: string | null,
    explicitName?: string | null
  ) => {
    let email: string | null = null;
    let name = "";
    if (isEmailLike(explicitEmail)) {
      email = explicitEmail!.trim().toLowerCase();
      name = explicitName || email;
    } else {
      const person = resolvePerson(ownerName);
      if (person) {
        email = person.email;
        name = person.name;
      } else {
        const owner = projectId ? projectById.get(projectId)?.owner : undefined;
        if (owner) {
          email = owner.email;
          name = owner.name;
        }
      }
    }
    if (!isEmailLike(email)) return;
    const b = bucketFor(email, name);
    b.raid.push({ ...item, overdue: isOverdue(item.due ? new Date(item.due) : null, now) });
  };

  for (const r of risks) {
    if (!isDueOrOverdue(r.dueDate, now)) continue; // JS-side date test (mixed storage)
    const due = r.dueDate ? r.dueDate.toISOString() : null;
    pushRaid(
      {
        kind: "RISK",
        code: r.code,
        title: r.title,
        project: r.project ? `${r.project.code} — ${r.project.name}` : null,
        due,
        status: r.status,
        severity: r.severity,
      },
      r.ownerName,
      r.project ? r.project.id : null
    );
  }

  for (const i of issues) {
    if (!isDueOrOverdue(i.dueDate, now)) continue; // JS-side date test (mixed storage)
    const due = i.dueDate ? i.dueDate.toISOString() : null;
    pushRaid(
      {
        kind: "ISSUE",
        code: i.code,
        title: i.title,
        project: i.project ? `${i.project.code} — ${i.project.name}` : null,
        due,
        status: i.status,
        severity: i.severity,
      },
      i.ownerName,
      i.project ? i.project.id : null
    );
  }

  for (const a of actions) {
    if (!isDueOrOverdue(a.dueDate, now)) continue; // JS-side date test (mixed storage)
    const due = a.dueDate ? a.dueDate.toISOString() : null;
    pushRaid(
      {
        kind: "ACTION",
        code: a.code,
        title: a.title,
        project: a.projectId
          ? projectById.get(a.projectId)
            ? `${projectById.get(a.projectId)!.code} — ${projectById.get(a.projectId)!.name}`
            : null
          : a.relatedCode ?? null,
        due,
        status: a.status,
        severity: a.priority,
      },
      a.ownerName,
      a.projectId,
      a.ownerEmail
    );
  }

  for (const d of decisions) {
    if (!isDueOrOverdue(d.requiredBy, now)) continue; // JS-side date test (mixed storage)
    const due = d.requiredBy ? d.requiredBy.toISOString() : null;
    pushRaid(
      {
        kind: "DECISION",
        code: d.code,
        title: d.title,
        project: d.projectId
          ? projectById.get(d.projectId)
            ? `${projectById.get(d.projectId)!.code} — ${projectById.get(d.projectId)!.name}`
            : null
          : null,
        due,
        status: d.status,
        severity: d.priority,
      },
      d.decisionOwner,
      d.projectId
    );
  }

  // ---- 3. EVM + weekly status (project owner and/or manager) ----
  // Latest period per project — chosen in JS, not by SQL ORDER BY, because
  // mixed TEXT/INTEGER date storage would sort unpredictably at the DB layer.
  const latestByProject = new Map<string, { spi: number; cpi: number; statusDate: Date | null }>();
  for (const p of latestPeriods) {
    const prev = latestByProject.get(p.projectId);
    if (!prev) {
      latestByProject.set(p.projectId, { spi: p.spi, cpi: p.cpi, statusDate: p.statusDate });
      continue;
    }
    const prevAt = prev.statusDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const nextAt = p.statusDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (nextAt > prevAt) {
      latestByProject.set(p.projectId, { spi: p.spi, cpi: p.cpi, statusDate: p.statusDate });
    }
  }

  for (const project of projects) {
    const recipients: (typeof users)[number][] = [];
    const pushRecipient = (u: (typeof users)[number] | undefined) => {
      if (u && !recipients.some((r) => r.id === u.id)) recipients.push(u);
    };
    if (project.owner) pushRecipient(project.owner);
    if (project.managerId) pushRecipient(byId.get(project.managerId));

    const latest = latestByProject.get(project.id);
    const behind =
      latest && (latest.spi < spiThreshold || latest.cpi < cpiThreshold)
        ? {
            kind: "EVM_BEHIND" as const,
            project: `${project.code} — ${project.name}`,
            detail: `Latest status period is below threshold (SPI ${spiThreshold.toFixed(2)} / CPI ${cpiThreshold.toFixed(2)}).`,
            spi: latest.spi,
            cpi: latest.cpi,
          }
        : null;

    const stale = !project.statusDate || project.statusDate.getTime() < now.getTime() - staleMs;
    const statusUpdate: EvmReminder | null =
      project.status === "ACTIVE" && stale
        ? {
            kind: "STATUS_UPDATE",
            project: `${project.code} — ${project.name}`,
            detail: project.statusDate
              ? `No status update since ${project.statusDate.toISOString().slice(0, 10)} — weekly progress update due.`
              : "No status date recorded — capture this week's progress update.",
            spi: null,
            cpi: null,
          }
        : null;

    if (!behind && !statusUpdate) continue;
    for (const r of recipients) {
      const b = bucketFor(r.email, r.name);
      if (behind && !b.evm.some((e) => e.kind === "EVM_BEHIND" && e.project === behind.project)) {
        b.evm.push(behind);
      }
      if (statusUpdate && !b.evm.some((e) => e.kind === "STATUS_UPDATE" && e.project === statusUpdate.project)) {
        b.evm.push(statusUpdate);
      }
    }
  }

  // ---- assemble: one consolidated digest per owner (skip empty owners) ----
  const owners: OwnerReminders[] = [];
  for (const [email, b] of buckets) {
    if (!b.tasks.length && !b.raid.length && !b.evm.length) continue;
    owners.push({
      email,
      name: b.name,
      tasks: b.tasks.sort((a, c) => a.code.localeCompare(c.code)),
      raid: b.raid.sort((a, c) => a.code.localeCompare(c.code)),
      evm: b.evm.sort((a, c) => a.project.localeCompare(c.project)),
    });
  }
  owners.sort((a, b) => a.email.localeCompare(b.email));

  const counts = {
    owners: owners.length,
    tasks: owners.reduce((s, o) => s + o.tasks.length, 0),
    raid: owners.reduce((s, o) => s + o.raid.length, 0),
    evm: owners.reduce((s, o) => s + o.evm.length, 0),
    total: 0,
  };
  counts.total = counts.tasks + counts.raid + counts.evm;

  return { generatedAt: now.toISOString(), owners, counts };
}
