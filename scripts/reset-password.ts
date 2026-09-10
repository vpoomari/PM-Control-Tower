// PM CONTROL TOWER — Administrative password reset CLI
// Usage:
//   bun scripts/reset-password.ts <email> <new-password>
//   (or: npx tsx scripts/reset-password.ts <email> <new-password>)
//
// Resets the password, clears the lockout counter and deactivates any
// existing lock. Intended for administrators who lost access to an
// account. The action is written to the audit trail.

import bcrypt from "bcryptjs";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: bun scripts/reset-password.ts <email> <new-password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("✗ Password must be at least 8 characters.");
    process.exit(1);
  }
  const { db } = await import("../src/lib/db");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`✗ No user found with email ${email}`);
    await db.$disconnect();
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({
    where: { email },
    data: {
      passwordHash,
      failedLogins: 0,
      lockedUntil: null,
      isActive: true,
    },
  });
  await db.auditEvent.create({
    data: {
      userId: user.id,
      userName: user.name,
      role: "CLI",
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: user.id,
      entityName: user.email,
      context: "Reset via scripts/reset-password.ts",
      severity: "WARNING",
    },
  });
  console.log(`✓ Password reset for ${email} — lockout cleared, audit entry written.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
