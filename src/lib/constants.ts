// PM CONTROL TOWER — Domain constants & helpers
// SQLite profile: enums modeled as string constants (single source of validation truth).

export const APP_NAME = "PM Control Tower";
export const APP_TAGLINE = "Enterprise Project, Program & Portfolio Management Platform";
export const APP_MOTTO = "PLAN | EXECUTE | MONITOR | GOVERN | DELIVER";

// ---- Lifecycle constants ----
export const PROJECT_STATUS = ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export const PRIORITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const RAG = ["GREEN", "AMBER", "RED"] as const;
export const TASK_STATUS = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "CANCELLED"] as const;
export const DEP_TYPES = ["FS", "SS", "FF", "SF"] as const;
export const TS_STATUS = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "LOCKED"] as const;
export const CR_STATUS = ["DRAFT", "SUBMITTED", "ASSESSMENT", "APPROVAL", "APPROVED", "REJECTED", "IMPLEMENTED", "CLOSED"] as const;
export const GATE_DECISION = ["PENDING", "PASSED", "FAILED", "CONDITIONAL", "DEFERRED"] as const;
export const RULE_METRICS = ["CPI", "SPI", "EAC", "BUDGET_UTILIZATION", "HEALTH_SCORE", "COST_VARIANCE", "SCHEDULE_VARIANCE_DAYS", "OPEN_RISKS", "OPEN_ISSUES"] as const;
export const RULE_OPERATORS = ["LT", "LTE", "GT", "GTE", "EQ"] as const;
export const SEVERITY = ["INFO", "WARNING", "CRITICAL"] as const;
export const BUDGET_CATEGORIES = ["LABOR", "MATERIALS", "EQUIPMENT", "SOFTWARE", "SERVICES", "TRAVEL", "CONTINGENCY", "OTHER"] as const;
export const INBOX_CATEGORIES = ["ALL", "ACTION_REQUIRED", "MENTIONS", "APPROVALS", "ALERTS", "GOVERNANCE", "ESCALATIONS"] as const;
export const INTEGRATION_CATEGORIES = ["EMAIL", "CALENDAR", "SSO", "STORAGE", "NOTIFICATIONS", "BI", "WEBHOOKS", "AI"] as const;
export const AUTOMATION_TRIGGERS = ["TASK_OVERDUE", "TIMESHEET_APPROVED", "TIMESHEET_SUBMITTED", "HEALTH_CHANGED", "EVM_BREACH", "RAID_CREATED", "CHANGE_REQUESTED", "MILESTONE_MISSED", "SCHEDULE_CHANGED", "STATUS_CHANGED", "MANUAL"] as const;
export const AUTOMATION_ACTIONS = ["CREATE_INBOX_ITEM", "NOTIFY_USER", "NOTIFY_PM", "NOTIFY_ROLE", "RECALC_HEALTH", "EVALUATE_GOVERNANCE", "RECALC_CPM", "CREATE_ALERT", "CREATE_NOTIFICATION"] as const;
export const ROLES = ["EXECUTIVE", "PMO_ADMIN", "PORTFOLIO_MANAGER", "PROGRAM_MANAGER", "PROJECT_MANAGER", "TEAM_MEMBER", "FINANCE", "AUDITOR"] as const;

export const RAG_COLORS: Record<string, string> = {
  GREEN: "#16a34a", AMBER: "#d97706", RED: "#dc2626",
};

// ---- JSON helpers (SQLite: JSON persisted as string) ----
export function toJson(value: unknown): string {
  try { return JSON.stringify(value ?? null); } catch { return "null"; }
}
export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ---- Date helpers ----
export const DAY_MS = 86_400_000;
export function dayNum(d: Date | string): number {
  return Math.floor(new Date(d).getTime() / DAY_MS);
}
export function fromDayNum(n: number): Date {
  return new Date(n * DAY_MS);
}
export function startOfWeek(d: Date | string): Date {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setUTCHours(0, 0, 0, 0);
  return new Date(dt.getTime() - day * DAY_MS);
}
export function addDays(d: Date | string, n: number): Date {
  return new Date(new Date(d).getTime() + n * DAY_MS);
}
export function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}
export function fmtDateTime(d?: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}
export function safeDiv(a: number, b: number, fallback = 0): number {
  if (!b || !isFinite(b) || isNaN(b)) return fallback;
  const r = a / b;
  return isFinite(r) ? r : fallback;
}
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function pct(n: number): string {
  return `${round2(n)}%`;
}
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
export function money(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0);
}
export function num(n: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n || 0);
}
