const fs = require("fs");
let s = fs.readFileSync("src/lib/services/integrity.ts", "utf8");

// ---- 1) SystemConfig-aware freshness ----
s = s.replace(
  "const DEFAULT_CADENCES",
  `export async function getFreshnessConfig() {
  let cfg = await db.systemConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) cfg = await db.systemConfig.create({ data: { id: "singleton" } });
  return cfg;
}

export async function updateFreshnessConfig(data: { freshnessWarn?: number; freshnessDegrade?: number; freshnessCritical?: number; freshnessGraceHours?: number }) {
  await getFreshnessConfig();
  return db.systemConfig.update({ where: { id: "singleton" }, data });
}

const DEFAULT_CADENCES`
);
s = s.replace(
  "  const feeds = Object.entries(updates).map(([feed, lastUpdate]) => ({ feed, lastUpdate, expectedCadenceDays: cadence(feed) }));\n  const result = computeFreshness(feeds);",
  "  const feeds = Object.entries(updates).map(([feed, lastUpdate]) => ({ feed, lastUpdate, expectedCadenceDays: cadence(feed) }));\n  const cfg = await getFreshnessConfig();\n  const result = computeFreshness(feeds, new Date(), { thresholds: { warn: cfg.freshnessWarn, degrade: cfg.freshnessDegrade, critical: cfg.freshnessCritical }, graceHours: cfg.freshnessGraceHours });"
);

// ---- 2) Split simulation: computeSimulationData + async queue support ----
s = s.replace(
  "export async function runAndStoreSimulation(projectId: string, opts: { seed?: number; iterations?: number }) {",
  "export async function computeSimulationData(projectId: string, opts: { seed?: number; iterations?: number }) {"
);
s = s.replace(
  `  await db.simulationRun.updateMany({ where: { projectId, stale: false }, data: { stale: true } });
  const run = await db.simulationRun.create({
    data: { projectId, seed: result.seed, iterations: result.iterations, resultsJson: JSON.stringify(result) },
  });
  emitRealtime("simulation:completed", { projectId, runId: run.id, finish: result.finish }, \`project:\${projectId}\`);
  return { run, result, projectName: project.name, projectCode: project.code };
}`,
  `  return { result, projectName: project.name, projectCode: project.code, projectStart: (project.statusDate ?? project.createdAt)?.toISOString() ?? new Date().toISOString(), budget };
}

export async function runAndStoreSimulation(projectId: string, opts: { seed?: number; iterations?: number }) {
  await db.simulationRun.updateMany({ where: { projectId, stale: false }, data: { stale: true } });
  const { result, projectName, projectCode, projectStart, budget } = await computeSimulationData(projectId, opts);
  const run = await db.simulationRun.create({
    data: { projectId, seed: result.seed, iterations: result.iterations, resultsJson: JSON.stringify({ ...result, projectStart, budget }), status: "COMPLETE" },
  });
  emitRealtime("simulation:completed", { projectId, runId: run.id, finish: result.finish }, \`project:\${projectId}\`);
  return { run, result: { ...result, projectStart, budget }, projectName, projectCode };
}`
);

fs.writeFileSync("src/lib/services/integrity.ts", s);
console.log(
  "config:", s.includes("getFreshnessConfig"),
  "| split:", s.includes("computeSimulationData")
);
