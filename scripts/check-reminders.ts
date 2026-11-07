// One-off validation: collect the daily reminder digest from the real SQLite
// database and render one sample e-mail — NO mail is sent, DB is read-only.
// Run: npx tsx scripts/check-reminders.ts
import { collectReminders } from "../src/lib/notificationData";
import { buildReminderEmail } from "../src/lib/emailTemplates";
import { writeFileSync } from "node:fs";

async function main() {
  const digest = await collectReminders();
  console.log("generatedAt:", digest.generatedAt);
  console.log("counts:", JSON.stringify(digest.counts));
  for (const o of digest.owners) {
    console.log(
      `  ${o.email.padEnd(36)} tasks=${o.tasks.length} raid=${o.raid.length} evm=${o.evm.length}`
    );
  }
  const sample = digest.owners[0];
  if (sample) {
    const mail = buildReminderEmail(sample, new Date(digest.generatedAt));
    writeFileSync("backups/reminder-sample.html", mail.html, "utf8");
    console.log("\nsubject:", mail.subject);
    console.log("preview:", mail.preview);
    console.log("sample written to backups/reminder-sample.html");
  } else {
    console.log("\n(no owners with items — digest would send nothing)");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("FAILED:", err);
    process.exit(1);
  }
);
