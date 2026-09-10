// Inspect RBAC state: roles, permissions per role, users and role assignments
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const roles = await db.role.findMany({
  include: { permissions: { include: { permission: true } } },
  orderBy: { level: "desc" },
});
console.log("=== ROLES ===");
for (const r of roles) {
  console.log(`${r.code} (level ${r.level}) perms=${r.permissions.map((p) => p.permission.code).join(",") || "(NONE)"}`);
}

const users = await db.user.findMany({
  include: { userRoles: { include: { role: true } } },
});
console.log("\n=== USERS ===");
for (const u of users) {
  console.log(`${u.email} active=${u.isActive} superAdmin=${u.isSuperAdmin} roles=[${u.userRoles.map((ur) => ur.role.code).join(",") || "(NONE)"}]`);
}

console.log("\n=== PERMISSION COUNT ===");
console.log("total permissions in DB:", await db.permission.count());
console.log("total rolePermissions in DB:", await db.rolePermission.count());

await db.$disconnect();
