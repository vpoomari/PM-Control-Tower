// PM CONTROL TOWER — POST /api/reports/leadership/run-due
// Executes all due report schedules (lazy scheduler): generates packs for
// schedules whose nextRunAt has passed and distributes in-app notifications.

import { withApi, ok } from "@/lib/api";
import { runDueSchedules } from "@/lib/engines/leadership";

export const POST = withApi(async () => {
  const result = await runDueSchedules();
  return ok(result);
}, { permission: "reports.view", rateLimit: { limit: 20, windowMs: 60_000 } });
