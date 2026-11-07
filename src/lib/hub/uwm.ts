// PM CONTROL TOWER — TowerIntegration Hub: Unified Work Model (UWM) harmonizer.
// Pure functions only: identity resolution, status normalization (5 core
// states), date standardization (UTC ISO-8601) and priority alignment
// (CRITICAL/HIGH/MEDIUM/LOW). Every rule is deterministic and DB-free so the
// 55-tool matrix can be proven by unit tests.

import { HUB_STATUS_OVERRIDES } from "./registry";

// ---------------------------------------------------------------------------
// Identity resolution — external actor ids → corporate email/SSO identity.
// ---------------------------------------------------------------------------

export interface HubDirectoryEntry {
  email: string;
  name?: string;
  /** provider → external ids (e.g. slack: ["U01ABCD"], jira: ["5b10a..."]) */
  externalIds?: Record<string, string[]>;
}

export interface ResolvedIdentity {
  email: string | null;
  name: string | null;
  strategy: "EMAIL" | "EXTERNAL_ID" | "UPN" | "NAME" | "UNRESOLVED";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLACK_USER_RE = /^U[A-Z0-9]{8,}$/i;

/**
 * Resolve any external actor reference to the central corporate email/SSO id.
 * Order: direct email → provider external-id map → Entra UPN/GUID → display name.
 * Never throws; unresolved identities return null (the caller routes an anomaly).
 */
export function resolveIdentity(
  raw: unknown,
  directory: HubDirectoryEntry[],
  provider?: string,
): ResolvedIdentity {
  const miss: ResolvedIdentity = { email: null, name: null, strategy: "UNRESOLVED" };
  if (raw === null || raw === undefined) return miss;

  // Jira/Slack payloads wrap the actor: {accountId|id|upn|emailAddress|displayName}
  let candidate: string | null = null;
  let displayName: string | null = null;
  if (typeof raw === "string") candidate = raw.trim();
  else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : null);
    candidate =
      pick("emailAddress") ?? pick("email") ?? pick("upn") ?? pick("userPrincipalName") ??
      pick("accountId") ?? pick("account_id") ?? pick("id") ?? pick("userId") ?? pick("user_id") ?? pick("value");
    displayName = pick("displayName") ?? pick("name") ?? pick("real_name") ?? pick("fullName");
  }
  if (!candidate && !displayName) return miss;

  // 1) The candidate itself is a corporate email.
  if (candidate && EMAIL_RE.test(candidate)) {
    const hit = directory.find((d) => d.email.toLowerCase() === candidate!.toLowerCase());
    return hit
      ? { email: hit.email, name: hit.name ?? displayName, strategy: "EMAIL" }
      : // Unknown-but-valid corporate email: still a resolvable SSO identity.
        { email: candidate, name: displayName, strategy: "EMAIL" };
  }

  // 2) Provider external-id map (Slack id, Jira account id, Entra object id…).
  if (candidate) {
    const key = provider ?? guessProvider(candidate);
    if (key) {
      const hit = directory.find((d) =>
        (d.externalIds?.[key] ?? []).some((id) => id.toLowerCase() === candidate!.toLowerCase()),
      );
      if (hit) return { email: hit.email, name: hit.name ?? displayName, strategy: "EXTERNAL_ID" };
    }
    // Any-provider sweep: an id that appears under ANY provider key.
    const sweep = directory.find((d) =>
      Object.values(d.externalIds ?? {}).some((ids) =>
        ids.some((id) => id.toLowerCase() === candidate!.toLowerCase()),
      ),
    );
    if (sweep) return { email: sweep.email, name: sweep.name ?? displayName, strategy: "EXTERNAL_ID" };
  }

  // 3) Entra: GUID object id or UPN (alice@corp.onmicrosoft.com / alice@corp.com).
  if (candidate && (GUID_RE.test(candidate) || candidate.includes("@"))) {
    const hit = directory.find((d) => {
      const ids = Object.entries(d.externalIds ?? {});
      return ids.some(([prov, list]) =>
        (prov === "entra" || prov === "azure" || prov === "msgraph") &&
        list.some((id) => id.toLowerCase() === candidate!.toLowerCase()),
      ) || d.email.toLowerCase() === candidate!.toLowerCase();
    });
    if (hit) return { email: hit.email, name: hit.name ?? displayName, strategy: "UPN" };
    if (GUID_RE.test(candidate)) return miss; // a bare GUID with no directory hit is unresolved
    if (EMAIL_RE.test(candidate)) return { email: candidate, name: displayName, strategy: "UPN" };
  }

  // 4) Display-name fallback (exact, case-insensitive).
  const nameProbe = displayName ?? candidate;
  if (nameProbe) {
    const hit = directory.find((d) => d.name?.toLowerCase() === nameProbe.toLowerCase());
    if (hit) return { email: hit.email, name: hit.name ?? null, strategy: "NAME" };
  }
  return miss;
}

/** Best-effort provider guess for a raw id so the external-id map is searched sensibly. */
function guessProvider(id: string): string | null {
  if (SLACK_USER_RE.test(id)) return "slack";
  if (GUID_RE.test(id)) return "entra";
  if (/^\d+$/.test(id)) return "numeric";
  if (/^[0-9a-f]{20,}$/i.test(id)) return "jira";
  return null;
}

// ---------------------------------------------------------------------------
// Status normalization — every vendor vocabulary → 5 core states.
// ---------------------------------------------------------------------------

export type UwmStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";

export const UWM_STATUSES: UwmStatus[] = ["TO_DO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];

/** Global synonym table (lowercased, punctuation-stripped keys). */
const STATUS_SYNONYMS: Record<string, UwmStatus> = {
  // TO_DO
  "to do": "TO_DO", "todo": "TO_DO", "to-do": "TO_DO", "open": "TO_DO", "new": "TO_DO",
  "backlog": "TO_DO", "not started": "TO_DO", "not_started": "TO_DO", "planned": "TO_DO",
  "ready": "TO_DO", "reopened": "TO_DO", "triage": "TO_DO", "proposed": "TO_DO",
  "icebox": "TO_DO", "unstarted": "TO_DO", "pending": "TO_DO", "draft": "TO_DO",
  "created": "TO_DO", "requested": "TO_DO", "queued": "TO_DO", "scheduled": "TO_DO",
  // IN_PROGRESS
  "in progress": "IN_PROGRESS", "in_progress": "IN_PROGRESS", "inprogress": "IN_PROGRESS",
  "doing": "IN_PROGRESS", "active": "IN_PROGRESS", "wip": "IN_PROGRESS", "work in progress": "IN_PROGRESS",
  "in review": "IN_PROGRESS", "in dev": "IN_PROGRESS", "development": "IN_PROGRESS",
  "coding": "IN_PROGRESS", "implementation": "IN_PROGRESS", "started": "IN_PROGRESS",
  "in progress (qa)": "IN_PROGRESS", "qa": "IN_PROGRESS", "in qa": "IN_PROGRESS",
  "testing": "IN_PROGRESS", "in test": "IN_PROGRESS", "in progress test": "IN_PROGRESS",
  "uat": "IN_PROGRESS", "in uat": "IN_PROGRESS", "review": "IN_PROGRESS",
  "code review": "IN_PROGRESS", "in design": "IN_PROGRESS", "design": "IN_PROGRESS",
  "analysis": "IN_PROGRESS", "in analysis": "IN_PROGRESS", "refinement": "IN_PROGRESS",
  "estimation": "IN_PROGRESS", "grooming": "IN_PROGRESS", "in refinement": "IN_PROGRESS",
  "awaiting review": "IN_PROGRESS", "awaiting uat": "IN_PROGRESS",
  "in progress (blocked)": "IN_PROGRESS", "postponed": "IN_PROGRESS", "in progress qa": "IN_PROGRESS",
  "being processed": "IN_PROGRESS", "being worked": "IN_PROGRESS", "assigned": "IN_PROGRESS",
  "in progress (do not use)": "IN_PROGRESS", "reopened (in progress)": "IN_PROGRESS",
  // BLOCKED
  "blocked": "BLOCKED", "stuck": "BLOCKED", "on hold": "BLOCKED", "on-hold": "BLOCKED",
  "onhold": "BLOCKED", "hold": "BLOCKED", "impeded": "BLOCKED", "waiting": "BLOCKED",
  "awaiting approval": "BLOCKED", "awaiting customer": "BLOCKED", "awaiting stakeholder": "BLOCKED",
  "awaiting client": "BLOCKED",
  "dependency": "BLOCKED", "blocked by": "BLOCKED", "needs attention": "BLOCKED",
  "at risk": "BLOCKED", "overdue": "BLOCKED", "suspended": "BLOCKED", "paused": "BLOCKED",
  "handoff": "BLOCKED", "awaiting input": "BLOCKED", "awaiting dependency": "BLOCKED",
  // COMPLETED
  "done": "COMPLETED", "closed": "COMPLETED", "complete": "COMPLETED", "completed": "COMPLETED",
  "resolved": "COMPLETED", "finished": "COMPLETED", "delivered": "COMPLETED", "shipped": "COMPLETED",
  "merged": "COMPLETED", "released": "COMPLETED", "verified": "COMPLETED", "accepted": "COMPLETED",
  "approved": "COMPLETED", "fixed": "COMPLETED", "passed": "COMPLETED", "closed out": "COMPLETED",
  "closed (done)": "COMPLETED", "archived": "COMPLETED", "done (dev)": "COMPLETED",
  "done (code complete)": "COMPLETED", "signed off": "COMPLETED", "cancelled (completed)": "COMPLETED",
  // CANCELLED
  "cancelled": "CANCELLED", "canceled": "CANCELLED", "rejected": "CANCELLED",
  "wontfix": "CANCELLED", "won't fix": "CANCELLED", "wont fix": "CANCELLED", "duplicate": "CANCELLED",
  "obsolete": "CANCELLED", "removed": "CANCELLED", "declined": "CANCELLED", "withdrawn": "CANCELLED",
  "superseded": "CANCELLED", "invalid": "CANCELLED", "not an issue": "CANCELLED",
  "won't do": "CANCELLED", "wontdo": "CANCELLED", "dropped": "CANCELLED",
};

/** Strip punctuation/underscores and collapse whitespace for matching. */
function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
}

export interface StatusResult {
  status: UwmStatus;
  /** false when the raw value was unmapped → default TO_DO + anomaly recorded. */
  mapped: boolean;
  anomaly?: string;
}

/**
 * Map any vendor status (service-now codes, monday columns, Jira workflow
 * names, Trello lists…) onto one of the 5 UWM core states.
 */
export function normalizeStatus(raw: unknown, toolId?: string): StatusResult {
  if (raw === null || raw === undefined || raw === "") {
    return { status: "TO_DO", mapped: false, anomaly: "status_missing" };
  }
  const rawStr = String(raw).trim();
  const key = normalizeKey(rawStr);

  // 1) Per-tool overrides (vendor codes like ServiceNow "6").
  const overrides = toolId ? HUB_STATUS_OVERRIDES[toolId] : undefined;
  const ov = overrides?.[rawStr] ?? overrides?.[key];
  if (ov) return { status: ov as UwmStatus, mapped: true };

  // 2) Direct synonym hit.
  const direct = STATUS_SYNONYMS[key];
  if (direct) return { status: direct, mapped: true };

  // 3) Containment scan (longest phrase wins) — "In Progress (QA)", "Ready for UAT".
  const phrases = Object.keys(STATUS_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (phrase.length >= 3 && key.includes(phrase)) {
      return { status: STATUS_SYNONYMS[phrase], mapped: true };
    }
  }

  // 4) Unknown vocabulary → TO_DO (safe default) with an anomaly for the DLQ monitor.
  return { status: "TO_DO", mapped: false, anomaly: `status_unmapped:${rawStr}` };
}

// ---------------------------------------------------------------------------
// Priority alignment — 1-5 / P1-P4 / Urgent-Normal → 4 core levels.
// ---------------------------------------------------------------------------

export type UwmPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const UWM_PRIORITIES: UwmPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const PRIORITY_WORDS: Record<string, UwmPriority> = {
  critical: "CRITICAL", blocker: "CRITICAL", urgent: "CRITICAL", p0: "CRITICAL", "0": "CRITICAL", "1": "CRITICAL",
  highest: "CRITICAL", p1: "CRITICAL", p1p2: "CRITICAL", "critical (1)": "CRITICAL", asap: "CRITICAL",
  high: "HIGH", major: "HIGH", important: "HIGH", p2: "HIGH", "2": "HIGH", "high (2)": "HIGH",
  medium: "MEDIUM", normal: "MEDIUM", default: "MEDIUM", moderate: "MEDIUM", p3: "MEDIUM", "3": "MEDIUM",
  "medium (3)": "MEDIUM", routine: "MEDIUM",
  low: "LOW", minor: "LOW", trivial: "LOW", lowest: "LOW", p4: "LOW", "4": "LOW", "5": "LOW",
  "low (4)": "LOW", "nice to have": "LOW", cosmetic: "LOW", p5: "LOW",
};

export interface PriorityResult {
  priority: UwmPriority;
  mapped: boolean;
  anomaly?: string;
}

/**
 * Align external priorities: numeric 1 (worst) … 5 (best), P1-P4, and the
 * word scales (Urgent/Normal, Blocker/Trivial) → CRITICAL/HIGH/MEDIUM/LOW.
 * Unknown values default to MEDIUM with an anomaly (never throws).
 */
export function normalizePriority(raw: unknown): PriorityResult {
  if (raw === null || raw === undefined || raw === "") {
    return { priority: "MEDIUM", mapped: true }; // absence of priority is normal, not an anomaly
  }
  const key = normalizeKey(String(raw));
  const direct = PRIORITY_WORDS[key];
  if (direct) return { priority: direct, mapped: true };

  // Numeric banding: 1 → CRITICAL … 5 → LOW (common 1-5 scales).
  if (/^\d+(\.\d+)?$/.test(key)) {
    const n = Number(key);
    if (n <= 1) return { priority: "CRITICAL", mapped: true };
    if (n <= 2) return { priority: "HIGH", mapped: true };
    if (n <= 3) return { priority: "MEDIUM", mapped: true };
    return { priority: "LOW", mapped: true };
  }

  // Word-in-string containment ("P1 - Critical", "Priority: Urgent").
  const contains = (words: string[]) => words.some((w) => key.includes(w));
  if (contains(["critical", "blocker", "urgent"])) return { priority: "CRITICAL", mapped: true };
  if (contains(["high", "major", "important"])) return { priority: "HIGH", mapped: true };
  if (contains(["low", "minor", "trivial", "cosmetic"])) return { priority: "LOW", mapped: true };
  if (contains(["medium", "normal", "moderate"])) return { priority: "MEDIUM", mapped: true };

  return { priority: "MEDIUM", mapped: false, anomaly: `priority_unmapped:${String(raw)}` };
}

// ---------------------------------------------------------------------------
// Date standardization — anything → UTC ISO-8601.
// ---------------------------------------------------------------------------

/**
 * Convert any timestamp/deadline representation to UTC ISO-8601.
 * Accepts: Date, epoch seconds/millis, ISO-8601 (with or without offset),
 * "YYYY-MM-DD" (treated as UTC midnight), Excel serials (1900 system).
 * Returns null for unparseable input (caller records a date anomaly).
 */
export function toUtcIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (days since 1899-12-30): plausible range 1900-01-01..2100.
    if (value > 0 && value < 200_000) {
      const ms = Math.round((value - 25569) * 86_400_000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    // Epoch: seconds (< 1e11) or milliseconds.
    const ms = Math.abs(value) < 1e11 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    // Pure digits → epoch (same rule as numbers).
    if (/^\d{9,14}$/.test(s)) return toUtcIso(Number(s));
    // Date-only → UTC midnight (explicit, not local time).
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** Convenience: flag whether a value could be standardized (for anomaly routing). */
export function dateAnomaly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null; // absent dates are fine
  return toUtcIso(value) === null ? `date_unparseable:${String(value)}` : null;
}

// ---------------------------------------------------------------------------
// UWM work item — the harmonized shape handed to the PM Control Tower engine.
// ---------------------------------------------------------------------------

export interface UwmWorkItem {
  source: string;              // tool id (e.g. "jira")
  sourceId: string;            // vendor record id (required)
  title: string;               // vendor summary (required)
  status: UwmStatus;
  priority: UwmPriority;
  assigneeEmail: string | null;
  assigneeName: string | null;
  startDateUtc: string | null;
  dueDateUtc: string | null;
  updatedAtUtc: string | null;
  url: string | null;
  /** Vendor extras → generic UWM extension fields (nothing is dropped). */
  extension: Record<string, unknown>;
}

export interface HarmonizeInput {
  source: string;
  sourceId: unknown;
  title: unknown;
  status?: unknown;
  priority?: unknown;
  assignee?: unknown;
  startDate?: unknown;
  dueDate?: unknown;
  updatedAt?: unknown;
  url?: unknown;
  /** Everything else — preserved verbatim in extension. */
  extras?: Record<string, unknown>;
  directory?: HubDirectoryEntry[];
}

export interface HarmonizeResult {
  item: UwmWorkItem;
  /** Anomalies routed to the Dead Letter Queue (missing requireds, unmapped vocab…). */
  anomalies: string[];
  /** true when the item may be handed to the engine (has sourceId + title). */
  valid: boolean;
}

/**
 * Apply every UWM rule to one raw vendor record. Never throws; every problem
 * becomes an anomaly string so the pipeline can route it to the DLQ.
 */
export function harmonize(input: HarmonizeInput): HarmonizeResult {
  const anomalies: string[] = [];

  const sourceId = typeof input.sourceId === "string" || typeof input.sourceId === "number"
    ? String(input.sourceId).trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : input.title == null ? "" : String(input.title).trim();

  if (!sourceId) anomalies.push("missing_required:sourceId");
  if (!title) anomalies.push("missing_required:title");

  const statusRes = normalizeStatus(input.status, input.source);
  if (!statusRes.mapped && statusRes.anomaly) anomalies.push(statusRes.anomaly);

  const priorityRes = normalizePriority(input.priority);
  if (!priorityRes.mapped && priorityRes.anomaly) anomalies.push(priorityRes.anomaly);

  const identity = resolveIdentity(input.assignee, input.directory ?? []);
  if (input.assignee !== null && input.assignee !== undefined && input.assignee !== "" && !identity.email) {
    anomalies.push(`identity_unresolved:${typeof input.assignee === "string" ? input.assignee : JSON.stringify(input.assignee)}`);
  }

  const startIso = toUtcIso(input.startDate);
  const dueIso = toUtcIso(input.dueDate);
  const updatedIso = toUtcIso(input.updatedAt);
  const startAnom = dateAnomaly(input.startDate);
  const dueAnom = dateAnomaly(input.dueDate);
  const updAnom = dateAnomaly(input.updatedAt);
  if (startAnom) anomalies.push(startAnom);
  if (dueAnom) anomalies.push(dueAnom);
  if (updAnom) anomalies.push(updAnom);

  const item: UwmWorkItem = {
    source: input.source,
    sourceId,
    title,
    status: statusRes.status,
    priority: priorityRes.priority,
    assigneeEmail: identity.email,
    assigneeName: identity.name,
    startDateUtc: startIso,
    dueDateUtc: dueIso,
    updatedAtUtc: updatedIso,
    url: typeof input.url === "string" && input.url ? input.url : null,
    extension: input.extras ?? {},
  };

  return { item, anomalies, valid: sourceId !== "" && title !== "" };
}
