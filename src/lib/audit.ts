// PM CONTROL TOWER — Audit trail writer. Every material business action is persisted.

import { db } from "./db";
import { toJson } from "./constants";
import { emitRealtime } from "./realtime";

export interface AuditInput {
  userId?: string | null;
  userName?: string | null;
  role?: string | null;
  action: string;              // CREATE | UPDATE | DELETE | LOGIN | LOGOUT | SUBMIT | APPROVE | REJECT | ACTIVATE | EXECUTE | CONFIGURE | EXPORT
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  context?: string | null;
  severity?: string;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        role: input.role ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityName: input.entityName ?? null,
        beforeJson: input.before !== undefined ? toJson(input.before) : null,
        afterJson: input.after !== undefined ? toJson(input.after) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        context: input.context ?? null,
        severity: input.severity ?? "INFO",
      },
    });
    // Broadcast (global room): payload is non-sensitive (entity type + action) and
    // clients only subscribe to global/user/role rooms — a dedicated "admin" room
    // is never joined, so scoping here would silently drop the event for everyone.
    // Subscribing views (Audit, Users) are admin-gated by permission anyway.
    emitRealtime("audit:created", { entityType: input.entityType, action: input.action });
  } catch (e) {
    console.error("[audit] failed to persist audit event", e);
  }
}
