// PM CONTROL TOWER — Integrity Layer engine unit tests (pure, DB-free, deterministic)
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFreshness, levelFor, freshnessPenalty } from "../../src/lib/engines/freshness";
import { buildChain, verifyChain, EvidenceDoc } from "../../src/lib/engines/evidence";
import { runSimulation, mulberry32, sampleDuration } from "../../src/lib/engines/montecarlo";
import { computeFactors, suggestDuration } from "../../src/lib/engines/calibration";
import { rollupBenefits, strategicHealth } from "../../src/lib/engines/benefits";
import { applyOverrides, computeScenarioDiff, ScenarioSnapshot } from "../../src/lib/engines/scenario";
import { composeSteeringPack, stalledSpi } from "../../src/lib/engines/steering";

const now = new Date("2026-09-12T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

// ---------- FRESHNESS ----------
test("freshness: current feed scores 100", () => {
  const r = computeFreshness([{ feed: "timesheets", lastUpdate: daysAgo(3), expectedCadenceDays: 7 }], now);
  assert.equal(r.level, "CURRENT");
  assert.equal(r.score, 100);
});
test("freshness: thresholds warn/degrade/critical", () => {
  assert.equal(levelFor(0.99), "CURRENT");
  assert.equal(levelFor(1.0), "WARN");
  assert.equal(levelFor(1.6), "DEGRADE");
  assert.equal(levelFor(2.5), "CRITICAL");
  assert.equal(freshnessPenalty("CRITICAL"), 12);
  assert.equal(freshnessPenalty("DEGRADE"), 6);
  assert.equal(freshnessPenalty("CURRENT"), 0);
});
test("freshness: worst feed dominates the composite", () => {
  const r = computeFreshness([
    { feed: "tasks", lastUpdate: daysAgo(1), expectedCadenceDays: 7 },
    { feed: "timesheets", lastUpdate: daysAgo(20), expectedCadenceDays: 7 },
  ], now);
  assert.equal(r.worstFeed, "timesheets");
  assert.equal(r.level, "CRITICAL"); // 20/7 = 2.86x
  assert.ok(r.score < 40);
});

// ---------- EVIDENCE ----------
const docs: EvidenceDoc[] = [
  { ref: "baseline-1", kind: "BASELINE", content: "baseline v1 payload" },
  { ref: "cr-1", kind: "CHANGE", content: "change request payload" },
  { ref: "ts-week-3", kind: "TIMESHEET", content: "timesheet payload" },
];
test("evidence: chain verifies when records untouched", () => {
  const manifest = buildChain(docs);
  assert.equal(verifyChain(docs, manifest).pass, true);
});
test("evidence: tampering breaks the chain at the altered doc", () => {
  const manifest = buildChain(docs);
  const tampered = docs.map((d) => (d.ref === "cr-1" ? { ...d, content: "ALTERED" } : d));
  const res = verifyChain(tampered, manifest);
  assert.equal(res.pass, false);
  assert.equal(res.firstBrokenRef, "cr-1");
});
test("evidence: manifest hash is deterministic", () => {
  assert.equal(buildChain(docs).manifestHash, buildChain([...docs]).manifestHash);
});

// ---------- MONTE CARLO ----------
const mcTasks = [
  { id: "A", durationDays: 5, estimate: { optimistic: 3, likely: 5, pessimistic: 9, distribution: "PERT" as const } },
  { id: "B", durationDays: 4, estimate: { optimistic: 2, likely: 4, pessimistic: 8, distribution: "TRIANGULAR" as const } },
  { id: "C", durationDays: 6, estimate: { optimistic: 4, likely: 6, pessimistic: 10, distribution: "PERT" as const } },
];
const mcDeps = [{ predecessorId: "A", successorId: "B", depType: "FS", lagDays: 0 }, { predecessorId: "B", successorId: "C", depType: "FS", lagDays: 0 }];
test("montecarlo: same seed → identical results", () => {
  const a = runSimulation({ tasks: mcTasks, deps: mcDeps, baseCost: 100000, dailyCost: 2000 }, { seed: 42, iterations: 500 });
  const b = runSimulation({ tasks: mcTasks, deps: mcDeps, baseCost: 100000, dailyCost: 2000 }, { seed: 42, iterations: 500 });
  assert.deepEqual(a.finish, b.finish);
  assert.deepEqual(a.cost, b.cost);
  assert.deepEqual(a.criticality, b.criticality);
});
test("montecarlo: P50 within optimistic/pessimistic bounds", () => {
  const r = runSimulation({ tasks: mcTasks, deps: mcDeps }, { seed: 7, iterations: 1000 });
  assert.ok(r.finish.p50 >= 3 + 2 + 4 && r.finish.p50 <= 9 + 8 + 10, `p50=${r.finish.p50}`);
  // finish is a sum of three sampled durations
  for (const t of mcTasks) {
    const e = t.estimate!;
    assert.ok(e.optimistic <= e.likely && e.likely <= e.pessimistic);
  }
});
test("montecarlo: deterministic finish lies inside P10–P90 band", () => {
  const r = runSimulation({ tasks: mcTasks, deps: mcDeps }, { seed: 7, iterations: 1000 });
  assert.ok(r.deterministicFinishDay >= r.finish.p10 && r.deterministicFinishDay <= r.finish.p90);
});
test("montecarlo: mulberry32 reproducible + sampler respects bounds", () => {
  const r1 = mulberry32(99), r2 = mulberry32(99);
  for (let i = 0; i < 50; i++) assert.equal(r1(), r2());
  const rand = mulberry32(1);
  for (let i = 0; i < 200; i++) {
    const d = sampleDuration(rand, { optimistic: 2, likely: 5, pessimistic: 10, distribution: "TRIANGULAR" });
    assert.ok(d >= 2 && d <= 10, `sampled ${d}`);
  }
});

// ---------- CALIBRATION ----------
test("calibration: median factor with MAD confidence", () => {
  const rows = [1, 2, 3, 4, 5, 6].map((i) => ({ scopeType: "team" as const, scopeId: "t1", label: "Team Alpha", planned: 5, actual: 5 * (i === 3 ? 2.2 : 1.8) }));
  const [f] = computeFactors(rows);
  assert.equal(f.factor, 1.8);
  assert.equal(f.sampleSize, 6);
  assert.equal(f.confident, true);
});
test("calibration: below min sample size not confident", () => {
  const rows = [1, 2, 3].map((i) => ({ scopeType: "workType" as const, scopeId: "UAT", label: "UAT", planned: 4, actual: 8 }));
  const [f] = computeFactors(rows);
  assert.equal(f.confident, false);
  assert.equal(suggestDuration(5, f), null);
});
test("calibration: advisory suggestion", () => {
  const s = suggestDuration(5, { factor: 1.8, confident: true });
  assert.equal(s!.suggested, 9);
  assert.match(s!.note, /1.8/);
});

// ---------- BENEFITS ----------
test("benefits: promised vs delivered vs at-risk rollup", () => {
  const profiles = [
    { id: "b1", targetValue: 1_000_000, baselineValue: 0, active: true },
    { id: "b2", targetValue: 500_000, baselineValue: 0, active: true },
    { id: "b3", targetValue: 250_000, baselineValue: 0, active: false },
  ];
  const cum = { b1: 900_000, b2: 100_000 }; // b2 badly behind pace
  const r = rollupBenefits(profiles, cum);
  assert.equal(r.promised, 1_500_000);
  assert.equal(r.delivered, 1_000_000); // min(cum, target): 900k + capped-at-target-progress 100k
  assert.deepEqual(r.atRiskProfiles, ["b2"]);
  assert.equal(r.activeProfiles, 2);
});
test("benefits: green delivery with poor realization is strategically amber", () => {
  const s = strategicHealth("GREEN", 30, 2);
  assert.equal(s.rag, "AMBER");
  assert.match(s.note, /amber/i);
  const ok = strategicHealth("GREEN", 90, 2);
  assert.equal(ok.rag, "GREEN");
});

// ---------- SCENARIO ----------
const snap: ScenarioSnapshot = {
  projectId: "p1", projectName: "Payments", projectStart: null, budget: 500000,
  tasks: [
    { id: "A", name: "Design", durationDays: 10, isSummary: false },
    { id: "B", name: "Build", durationDays: 20, isSummary: false },
    { id: "C", name: "UAT", durationDays: 10, isSummary: false },
  ],
  deps: [
    { predecessorId: "A", successorId: "B", depType: "FS", lagDays: 0 },
    { predecessorId: "B", successorId: "C", depType: "FS", lagDays: 0 },
  ],
  assignments: [{ id: "a1", resourceId: "r1", resourceName: "Senior Dev", allocationPercent: 100, taskId: "B" }],
};
test("scenario: overrides applied on a clone — original untouched", () => {
  const { simulated, applied } = applyOverrides(snap, { durationChanges: { B: 45 }, removeAssignments: ["a1"] });
  assert.equal(simulated.tasks.find((t) => t.id === "B")!.durationDays, 45);
  assert.equal(simulated.assignments.length, 0);
  assert.equal(snap.tasks.find((t) => t.id === "B")!.durationDays, 20); // original intact
  assert.ok(applied.length >= 2);
});
test("scenario: diff quantifies the trade-off", () => {
  const { simulated, applied } = applyOverrides(snap, { durationChanges: { B: 45 } });
  const d = computeScenarioDiff(snap, simulated, applied);
  assert.equal(d.baseFinishDay, 40);
  assert.equal(d.simulatedFinishDay, 65);
  assert.equal(d.finishDeltaDays, 25);
  assert.deepEqual(d.affectedTasks, ["Build"]);
});
test("scenario: snapshot is deep-cloned (no shared references)", () => {
  const { simulated } = applyOverrides(snap, { budgetDelta: -50000 });
  assert.equal(simulated.budget, 450000);
  assert.equal(snap.budget, 500000);
});

// ---------- STEERING ----------
test("steering: SPI < 0.9 for 3 consecutive periods triggers replan draft", () => {
  assert.equal(stalledSpi([1.02, 0.88, 0.85, 0.83]), true);
  assert.equal(stalledSpi([1.02, 0.88, 0.95, 0.83]), false);
  assert.equal(stalledSpi([0.8, 0.8]), false);
});
test("steering: pack composed from live inputs with honest labels", () => {
  const pack = composeSteeringPack({
    project: { code: "PRJ-T", name: "Test", rag: "AMBER", healthScore: 62 },
    kpis: { cpi: 0.9, spi: 0.8, eac: 1_200_000, bac: 1_000_000, percentComplete: 40, prevCpi: 0.95, prevSpi: 0.85 },
    freshness: { score: 45, level: "DEGRADE", worstFeed: "timesheets" },
    topRisks: [{ title: "Data quality", severity: "CRITICAL", score: 20 }],
    overdueMilestones: ["M1 UAT start"],
    pendingDecisions: ["Gate 2 decision"],
    spiTrend: [0.86, 0.84, 0.8],
    p80: { p50: 120, p80: 140 },
  });
  assert.equal(pack.needsRePlan, true);
  assert.match(pack.narrative, /0\.8/);
  assert.match(pack.narrative, /human decision/);
  assert.equal(pack.kpiTable.find((k) => k.label.startsWith("Data freshness"))!.value, "45/100 (DEGRADE)");
  assert.match(pack.generatedFrom, /human review/);
});
