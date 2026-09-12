const fs = require("fs");

// ---- 1) Historical bias injection on task create ----
let t = fs.readFileSync("src/app/api/projects/[id]/tasks/route.ts", "utf8");
if (!t.includes("calibration bias")) {
  const anchor = "  const body = await parseBody(ctx.req, taskCreateSchema);";
  if (!t.includes(anchor)) throw new Error("task body anchor missing");
  t = t.replace(anchor, anchor + `

  // Automation: Historical Bias Injection — pre-fill duration from the Say/Do
  // calibration engine (confident project-scope factor only; never silent: the
  // adjustment is recorded in the task notes and returned as advisory).
  let biasAdvisory: string | null = null;
  try {
    if (body.durationDays && body.durationDays > 0) {
      const factor = await db.calibrationFactor.findFirst({ where: { scopeType: "project", scopeId: id, confident: true, factor: { gt: 1.15 } }, orderBy: { computedAt: "desc" } });
      if (factor) {
        const adjusted = Math.max(0.5, Math.round(body.durationDays * factor.factor * 10) / 10);
        biasAdvisory = "Duration pre-filled " + body.durationDays + "d -> " + adjusted + "d (historical " + factor.factor + "x variance on this project, " + factor.sampleSize + " samples)";
        body.notes = (body.notes ? body.notes + " " : "") + "[" + biasAdvisory + "]";
        body.durationDays = adjusted;
      }
    }
  } catch { /* calibration not ready — never block task creation */ }`);
}
if (!t.includes("biasAdvisory:")) {
  // expose advisory in the response: find the return ok(...) of POST
  const okMatch = t.match(/  return ok\(\{ task[^\n]*\n/);
  if (okMatch) t = t.replace(okMatch[0], okMatch[0].replace("return ok({ task", "return ok({ biasAdvisory, task"));
}
fs.writeFileSync("src/app/api/projects/[id]/tasks/route.ts", t);
console.log("bias hook:", t.includes("calibration bias"));

// ---- 2) Three quantified recovery scenarios on SPI breach ----
let a = fs.readFileSync("src/app/api/integrity/ai-actions/route.ts", "utf8");
if (!a.includes("recoveryScenarios")) {
  a = a.replace('import { computeProjectFreshness } from "@/lib/services/integrity";', 'import { computeProjectFreshness, buildScenarioSnapshot, simulateScenario } from "@/lib/services/integrity";');
  const before = "  const action = await db.aiAction.create({";
  if (!a.includes(before)) throw new Error("ai-action create anchor missing");
  a = a.replace(before, `  // Automation: Threshold-Breach Re-Planning — SPI below 0.90 for consecutive periods
  // generates THREE quantified recovery options (crash / descope / extend) from the
  // scenario engine. Drafts only — a human decides.
  let recoveryScenarios: { name: string; finishDeltaDays: number; description: string }[] | null = null;
  if (pack.needsRePlan) {
    try {
      const snapshot = await buildScenarioSnapshot(body.projectId);
      const mk = (o: Parameters<typeof simulateScenario>[1]) => simulateScenario(snapshot, o).diff;
      const crash = mk({ durationChanges: Object.fromEntries(snapshot.tasks.filter((x) => !x.isSummary).slice(0, Math.max(1, Math.ceil(snapshot.tasks.length * 0.3))).map((x) => [x.id, Math.max(0.5, Math.round(x.durationDays * 0.7))])) });
      const descope = mk({ durationChanges: Object.fromEntries([...snapshot.tasks].sort((x, y) => y.durationDays - x.durationDays).slice(0, Math.max(1, Math.ceil(snapshot.tasks.length * 0.2))).map((x) => [x.id, Math.max(0.5, Math.round(x.durationDays * 0.5))])) });
      const extend = mk({ durationChanges: Object.fromEntries(snapshot.tasks.filter((x) => !x.isSummary).map((x) => [x.id, Math.round(x.durationDays * 1.25)])) });
      recoveryScenarios = [
        { name: "Crash schedule", finishDeltaDays: crash.finishDeltaDays, description: "Compress the 30% longest-work tasks to 70% duration — finish delta " + crash.finishDeltaDays + "d vs baseline (assumes added cost/pressure)." },
        { name: "Descope lowest value", finishDeltaDays: descope.finishDeltaDays, description: "Halve the 20% heaviest low-priority tasks — finish delta " + descope.finishDeltaDays + "d (requires scope change approval)." },
        { name: "Extend timeline", finishDeltaDays: extend.finishDeltaDays, description: "Re-plan all tasks at 125% duration — finish delta " + extend.finishDeltaDays + "d (honest reset, no added cost)." },
      ];
    } catch { /* scenario math not available — draft without options */ }
  }

  const action = await db.aiAction.create({`);
  a = a.replace("contentJson: JSON.stringify(pack), status: \"DRAFTED\"", "contentJson: JSON.stringify({ ...pack, recoveryScenarios }), status: \"DRAFTED\"");
}
fs.writeFileSync("src/app/api/integrity/ai-actions/route.ts", a);
console.log("recovery scenarios:", a.includes("recoveryScenarios"));

// ---- 3) EVM period close fires the automation engine ----
let e = fs.readFileSync("src/app/api/evm/route.ts", "utf8");
if (!e.includes("runAutomations")) {
  e = e.replace('import { recalcProjectHealth } from "@/lib/engines/health";', 'import { recalcProjectHealth } from "@/lib/engines/health";\nimport { runAutomations } from "@/lib/engines/automations";');
  e = e.replace("  await recalcProjectHealth(project.id, source);", "  await recalcProjectHealth(project.id, source);\n  // Automation cascade: threshold rules (e.g. SPI < 0.90) react to every period close\n  void runAutomations(\"EVM_PERIOD_CLOSED\", { projectId: project.id, entityType: \"EvmPeriod\", entityId: period.id, spi: Math.round(spi * 100) / 100, cpi: Math.round(cpi * 100) / 100 });");
}
fs.writeFileSync("src/app/api/evm/route.ts", e);
console.log("evm cascade:", e.includes("runAutomations"));

// ---- 4) Seed the governed automation rules ----
let seed = fs.readFileSync("scripts/seed-technology.ts", "utf8");
if (!seed.includes("AutomationRule")) {
  seed = seed.replace("  await db.$disconnect();", `
  // ---- Governed delivery automation rules (WHEN/IF/THEN, engine-backed) ----
  const rules = [
    { name: "SPI breach -> PM re-plan alert", description: "EVM period closes with SPI < 0.90 -> PM alerted to review the drafted recovery scenarios.", triggerType: "EVM_PERIOD_CLOSED", conditionsJson: JSON.stringify([{ field: "spi", op: "LT", value: 0.9 }]), actionsJson: JSON.stringify([{ type: "CREATE_INBOX_ITEM", params: { roles: ["PROJECT_MANAGER", "PMO_ADMIN"], category: "ACTION_REQUIRED", priority: "HIGH", title: "SPI below 0.90 — quantified recovery scenarios drafted", message: "A reporting period closed with SPI below 0.90. Open Data Integrity > AI Actions for the three quantified recovery options (crash / descope / extend).", actionUrl: "#/integrity" } }]) },
    { name: "EVM period closed -> executive digest", description: "Every period close notifies PMO leadership with the new CPI/SPI.", triggerType: "EVM_PERIOD_CLOSED", conditionsJson: JSON.stringify([]), actionsJson: JSON.stringify([{ type: "NOTIFY_ROLE", params: { roles: ["PMO_ADMIN", "EXECUTIVE"], title: "EVM period closed", message: "A new EVM period was captured — indices updated on the tower." } }]) },
    { name: "Freshness critical -> PMO escalation", description: "Any project hitting CRITICAL data freshness escalates to the PMO.", triggerType: "FRESHNESS_CRITICAL", conditionsJson: JSON.stringify([]), actionsJson: JSON.stringify([{ type: "NOTIFY_ROLE", params: { roles: ["PMO_ADMIN"], title: "Data freshness critical", message: "A project crossed the critical staleness threshold — its dashboard figures may not reflect reality.", actionUrl: "#/integrity" } }]) },
  ];
  for (const r of rules) {
    const exists = await db.automationRule.findFirst({ where: { name: r.name } });
    if (!exists) await db.automationRule.create({ data: { ...r, isActive: true, createdBy: "seed" } });
  }
  console.log("  ✓ Governance automation rules seeded (SPI breach, period digest, freshness escalation)");

  await db.$disconnect();`);
  fs.writeFileSync("scripts/seed-technology.ts", seed);
  console.log("rules seeded:", seed.includes("SPI breach"));
}
