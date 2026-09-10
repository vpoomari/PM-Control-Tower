// PM CONTROL TOWER — Realtime event publisher.
// Forwards business events to the Socket.IO mini service (port 3003) which fans out
// to subscribed UI clients. Fire-and-forget: API responses never block on realtime.

const REALTIME_URL = process.env.REALTIME_URL || "http://127.0.0.1:3003";
const SHARED_SECRET = process.env.REALTIME_SECRET || "pmct-rt-sandbox-secret";

export type RealtimeEvent =
  | "project:created" | "project:updated" | "project:health"
  | "wbs:changed" | "task:changed" | "schedule:changed" | "dependency:changed"
  | "baseline:changed" | "resource:assigned" | "timesheet:submitted" | "timesheet:approved"
  | "actuals:changed" | "evm:changed" | "raid:changed" | "change:changed"
  | "governance:changed" | "alert:created" | "inbox:changed" | "planner:changed"
  | "integration:changed" | "automation:executed" | "notification:created" | "audit:created"
  | "data:imported" | "report:generated";

export function emitRealtime(event: RealtimeEvent, payload: unknown, room?: string): void {
  const body = JSON.stringify({ event, payload, room });
  fetch(`${REALTIME_URL}/emit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pmct-secret": SHARED_SECRET },
    body,
    signal: AbortSignal.timeout(1500),
  }).catch(() => {
    /* realtime service unavailable — degrade silently, data layer remains authoritative */
  });
}

/** Room naming: project:<id>, role:<CODE>, user:<id>, global */
export function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}
