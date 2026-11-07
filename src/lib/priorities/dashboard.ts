// PM CONTROL TOWER — Prioritized Task Dashboard: data collection.
//
// Assembles the four widgets for the signed-in user:
//   Overdue (Last 7 Days) / Due Today / Upcoming (Next 7 Days)
//     — task rows windowed by classifyDue (pure logic in windows.ts)
//   Action Not Taken
//     — unassigned live tasks, BLOCKED live tasks, and the user's open inbox
//        items (awaiting approval = APPROVALS category, unread = the rest)
//
// Scoping: PMO Administrators (and super admins / "*" holders) see the whole
// organisation; a Project Manager sees tasks assigned to them or belonging to
// projects they own, plus their own inbox (inbox items are always per-user).
//
// Date windowing deliberately happens in JS — see the header of windows.ts.

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { TASK_TERMINAL_STATUS } from "../constants";
import { dayDelta, isActiveTask, splitIntoWindows } from "./windows";

// ---------------------------------------------------------------------------
// Public shapes (consumed by the API route and the React view)
// ---------------------------------------------------------------------------

export interface PriorityTask {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  endDate: string | null;
  /** Positive = days late, negative = days until due, 0 = due today, null = no due date. */
  dayDelta: number | null;
  project: { id: string; code: string; name: string } | null;
  assignee: { id: string; name: string; email: string } | null;
}

export interface PriorityInboxItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  dueDate: string | null;
  actionUrl: string | null;
  entityType: string | null;
  createdAt: string;
}

export interface ActionNotTaken {
  awaitingApproval: PriorityInboxItem[];
  unread: PriorityInboxItem[];
  unassigned: PriorityTask[];
  blocked: PriorityTask[];
}

export interface PrioritiesPayload {
  generatedAt: string;
  /** Current system date (local), YYYY-MM-DD — what "Due Today" is measured against. */
  today: string;
  scope: "PMO" | "PM";
  counts: {
    overdue: number;
    dueToday: number;
    upcoming: number;
    actionNotTaken: number;
  };
  overdue: PriorityTask[];
  dueToday: PriorityTask[];
  upcoming: PriorityTask[];
  actionNotTaken: ActionNotTaken;
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

export type PriorityScope = { kind: "PMO" } | { kind: "PM"; userId: string };

export function scopeFor(session: SessionUser): PriorityScope {
  const pmoLike =
    session.isSuperAdmin ||
    session.permissions.includes("*") ||
    session.roles.includes("PMO_ADMIN");
  return pmoLike ? { kind: "PMO" } : { kind: "PM", userId: session.id };
}

// ---------------------------------------------------------------------------
// Row → view shape
// ---------------------------------------------------------------------------

type TaskRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  endDate: Date | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string } | null;
  project: { id: string; code: string; name: string } | null;
};

function toTask(row: TaskRow, now: Date): PriorityTask {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    priority: row.priority,
    progress: row.progress,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    dayDelta: row.endDate ? dayDelta(row.endDate, now) : null,
    project: row.project,
    assignee: row.assignee,
  };
}

type InboxRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  dueDate: Date | null;
  actionUrl: string | null;
  entityType: string | null;
  createdAt: Date;
};

function toInboxItem(row: InboxRow): PriorityInboxItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    actionUrl: row.actionUrl,
    entityType: row.entityType,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

const TASK_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  priority: true,
  progress: true,
  endDate: true,
  assigneeId: true,
  assignee: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, code: true, name: true } },
} as const;

const byDueDate = (a: { endDate: Date | null }, b: { endDate: Date | null }): number =>
  (a.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.endDate?.getTime() ?? Number.MAX_SAFE_INTEGER);

export async function collectPriorities(now: Date, session: SessionUser): Promise<PrioritiesPayload> {
  const scope = scopeFor(session);
  const wantInbox = hasPermission(session, "inbox.use");

  const [tasks, inbox] = await Promise.all([
    db.task.findMany({
      where: {
        // Range predicates run in JS (TEXT vs INTEGER date storage) — only the
        // storage-agnostic `not: null` and status narrowing happen in SQL.
        endDate: { not: null },
        status: { notIn: [...TASK_TERMINAL_STATUS] },
        ...(scope.kind === "PM"
          ? { OR: [{ assigneeId: scope.userId }, { project: { ownerId: scope.userId } }] }
          : {}),
      },
      select: TASK_SELECT,
      orderBy: { endDate: "asc" },
      take: 5000,
    }),
    wantInbox
      ? db.inboxItem.findMany({
          where: { userId: session.id, status: "OPEN" },
          select: {
            id: true,
            title: true,
            category: true,
            priority: true,
            dueDate: true,
            actionUrl: true,
            entityType: true,
            createdAt: true,
          },
          take: 200,
        })
      : Promise.resolve([] as InboxRow[]),
  ]);

  const windows = splitIntoWindows(tasks as TaskRow[], now);

  // Action Not Taken — stalled work requiring intervention.
  // Facets are disjoint so the four counts sum to the headline total:
  //   unassigned + blocked come from tasks; awaitingApproval + unread split
  //   the user's OPEN inbox items by category (APPROVALS vs the rest).
  const unassigned = (tasks as TaskRow[])
    .filter((t) => !t.assigneeId && isActiveTask(t.status))
    .sort(byDueDate)
    .map((t) => toTask(t, now));
  const blocked = (tasks as TaskRow[])
    .filter((t) => t.status === "BLOCKED")
    .sort(byDueDate)
    .map((t) => toTask(t, now));
  const inboxItems = (inbox as InboxRow[]).map(toInboxItem);
  const awaitingApproval = inboxItems.filter((i) => i.category === "APPROVALS");
  const unread = inboxItems.filter((i) => i.category !== "APPROVALS");

  const actionNotTaken: ActionNotTaken = { awaitingApproval, unread, unassigned, blocked };

  return {
    generatedAt: now.toISOString(),
    today: now.toISOString().slice(0, 10),
    scope: scope.kind,
    counts: {
      overdue: windows.overdue.length,
      dueToday: windows.dueToday.length,
      upcoming: windows.upcoming.length,
      actionNotTaken:
        unassigned.length + blocked.length + awaitingApproval.length + unread.length,
    },
    overdue: windows.overdue.map((t) => toTask(t, now)),
    dueToday: windows.dueToday.map((t) => toTask(t, now)),
    upcoming: windows.upcoming.map((t) => toTask(t, now)),
    actionNotTaken,
  };
}
