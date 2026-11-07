// PM CONTROL TOWER — irreversible workspace reset
// POST /api/admin/reset-workspace { confirmation: "DELETE ALL DATA" }
// Clears business/workspace records but deliberately preserves identities, access control,
// and platform configuration so the administrator can continue using a blank workspace.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const confirmationSchema = z.object({
  confirmation: z.literal("DELETE ALL DATA"),
});

const SYSTEM_TABLES = new Set([
  "User", "Role", "Permission", "UserRole", "RolePermission",
  "AdminSettings", "SystemConfig", "EntityDefinition", "CustomFieldType",
  "FieldDefinition", "NamingConvention", "Terminology", "FeatureFlag",
  "_prisma_migrations",
]);

type SqliteTable = { name: string };

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session?.isSuperAdmin) {
    throw new ApiError(403, "Only a super administrator can reset the workspace");
  }
  await parseBody(ctx.req, confirmationSchema);

  const tables = await db.$queryRaw<SqliteTable[]>`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `;
  const workspaceTables = tables
    .map(({ name }) => name)
    .filter((name) => !name.startsWith("sqlite_") && !SYSTEM_TABLES.has(name));

  let deletedRecords = 0;
  await db.$transaction(async (tx) => {
    // SQLite defers FK checks until commit, allowing every workspace table to be emptied
    // in one atomic transaction regardless of relation order.
    await tx.$executeRawUnsafe("PRAGMA defer_foreign_keys = ON");
    for (const table of workspaceTables) {
      deletedRecords += await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdentifier(table)}`);
    }
  });

  // Keep one immutable record of the reset after the old activity log has been cleared.
  await writeAudit({
    userId: session.id,
    userName: session.name,
    role: session.roles[0],
    action: "WORKSPACE_RESET",
    entityType: "System",
    entityId: "workspace",
    entityName: "Workspace reset",
    after: { deletedRecords, clearedTables: workspaceTables.length, preserved: "identities, access control, and configuration" },
    ipAddress: ctx.ip,
    severity: "CRITICAL",
  });

  return ok({ deletedRecords, clearedTables: workspaceTables.length });
}, { permission: "admin.config", rateLimit: { limit: 2, windowMs: 60 * 60_000 } });
