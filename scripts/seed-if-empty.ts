// PM CONTROL TOWER — Boot helper: seed the database only when it is empty.
// Used by the Docker entrypoint / setup scripts so a fresh deployment always
// boots with the reference enterprise dataset, while existing data is never touched.
//
// Run: bun scripts/seed-if-empty.ts   (or: tsx scripts/seed-if-empty.ts)

async function main() {
  const { db } = await import("../src/lib/db");
  const users = await db.user.count();
  if (users > 0) {
    console.log(`[seed-if-empty] Database already initialized (${users} users) — skipping seed.`);
    await db.$disconnect();
    return;
  }
  console.log("[seed-if-empty] Empty database detected — loading reference enterprise dataset…");
  await db.$disconnect();
  await import("./seed");            // runs base seed + seed-part2 (engine cascade)
  await import("./seed-leadership"); // leadership register data (idempotent)
  console.log("[seed-if-empty] Reference dataset loaded.");
}

main().catch((e) => {
  console.error("[seed-if-empty] Failed:", e);
  process.exit(1);
});

export {}; // module scope (avoids global-script name collisions under tsc)
