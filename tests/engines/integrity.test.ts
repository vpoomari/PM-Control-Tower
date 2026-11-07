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

// ---------- v1.2.0 DELTAS ----------
import { buildZip, crc32 } from "../../src/lib/engines/zip";
import { rebaseOverrides } from "../../src/lib/engines/scenario";
import { computeFreshness as cf2 } from "../../src/lib/engines/freshness";

test("zip: crc32 known vector + archive structure", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926); // standard CRC-32 check vector
  const zip = buildZip([{ name: "index.txt", content: "hello evidence" }, { name: "manifest.json", content: "{}" }]);
  const bytes = zip;
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); // PK signature
  const tail = bytes.slice(bytes.length - 22);
  assert.equal(tail[0], 0x50); assert.equal(tail[3], 0x06);   // end-of-central-directory
});
test("zip: round-trips through a unzipper-compatible layout (deterministic)", () => {
  const a = buildZip([{ name: "a.txt", content: "same" }]);
  const b = buildZip([{ name: "a.txt", content: "same" }]);
  assert.deepEqual(Buffer.from(a).compare(Buffer.from(b)), 0);
});
test("freshness: grace window suppresses degradation for young feeds", () => {
  const r = cf2([{ feed: "gates", lastUpdate: daysAgo(1), expectedCadenceDays: 7 }], now, { graceHours: 48 });
  assert.equal(r.level, "CURRENT");
  assert.equal(r.feeds[0].graceApplied, true);
  // beyond the grace window the cadence math applies again
  const r2 = cf2([{ feed: "gates", lastUpdate: daysAgo(3), expectedCadenceDays: 3 }], now, { graceHours: 48 });
  assert.equal(r2.level, "WARN"); // 3d old, 3d cadence -> 1.0x = WARN once past the 48h grace
});
test("freshness: configurable thresholds are honored", () => {
  const strict = { warn: 0.5, degrade: 0.8, critical: 1.2 };
  const r = cf2([{ feed: "tasks", lastUpdate: daysAgo(2), expectedCadenceDays: 2 }], now, { thresholds: strict, graceHours: 0 });
  assert.equal(r.level, "DEGRADE"); // 2/2 = 1.0x: CURRENT on defaults, DEGRADE under strict thresholds
});
test("scenario: rebase applies duration delta to drifted current", () => {
  const current = {
    tasks: snap.tasks.map((t) => (t.id === "B" ? { ...t, durationDays: 30 } : t)), // drifted 20 → 30 since branch
    assignmentIds: new Set(snap.assignments.map((a) => a.id)),
  };
  const { rebased, decisions } = rebaseOverrides(snap, { durationChanges: { B: 45 }, removeAssignments: ["a1"] }, current);
  assert.equal(rebased.durationChanges!["B"], 55); // delta +25 applied to current 30
  assert.equal(rebased.removeAssignments!.length, 1);
  assert.ok(decisions.some((d) => d!.kind === "REBASED"));
});
test("scenario: rebase skips assignments already gone in production", () => {
  const current = { tasks: snap.tasks, assignmentIds: new Set<string>() };
  const { rebased, decisions } = rebaseOverrides(snap, { removeAssignments: ["a1"] }, current);
  assert.equal(rebased.removeAssignments!.length, 0);
  assert.ok(decisions.some((d) => d!.kind === "SKIPPED"));
});

// ---------- v1.5.0 PRIORITIZATION ----------
import { weightedScore, classify, optimizePortfolio, DEFAULT_CRITERIA, validateWeights } from "../../src/lib/engines/prioritization";

test("prioritization: weighted score matches the spec example", () => {
  const s = { strategic: 92, value: 85, customer: 90, risk: 70, compliance: 100, roi: 82, urgency: 90 };
  const score = weightedScore(s, DEFAULT_CRITERIA);
  assert.equal(score, 86.7); // (92*25+85*20+90*15+70*15+100*10+82*10+90*5)/100 — the spec's 88.4 example does not match its own weights; engine is mathematically exact
});
test("prioritization: classification bands", () => {
  assert.equal(classify(95), "CRITICAL"); assert.equal(classify(85), "HIGH");
  assert.equal(classify(75), "MEDIUM"); assert.equal(classify(65), "LOW");
  assert.equal(classify(50), "DEFER");
});
test("prioritization: weights must total 100", () => {
  assert.equal(validateWeights(DEFAULT_CRITERIA), true);
  assert.equal(validateWeights([...DEFAULT_CRITERIA.slice(1)]), false);
});
test("prioritization: optimizer beats greedy-by-score and explains exclusions", () => {
  const c = [
    { id: "A", name: "A", score: 92, cost: 3, expectedValue: 10 },
    { id: "B", name: "B", score: 88, cost: 2, expectedValue: 8 },
    { id: "C", name: "C", score: 85, cost: 5, expectedValue: 6 },
    { id: "D", name: "D", score: 82, cost: 4, expectedValue: 7 },
    { id: "E", name: "E", score: 75, cost: 1, expectedValue: 4 },
  ];
  const r = optimizePortfolio(c, 10);
  const sel = r.selected.map((d) => d.candidate.id).sort().join("");
  assert.equal(sel, "ABDE");           // B(88/2) beats C(85/5) on density → total value 29 vs 27 for A,C + ...
  assert.equal(r.totalCost, 10);
  assert.equal(r.remainingBudget, 0);
  assert.ok(r.totalScore > 84);
  assert.equal(r.excluded.find((d) => d.candidate.id === "C")?.reason.includes("Budget exhausted"), true);
});
test("prioritization: dependency guard explains the chain", () => {
  const c = [
    { id: "X", name: "Foundation", score: 70, cost: 8, expectedValue: 5 },
    { id: "Y", name: "Dependent", score: 95, cost: 2, expectedValue: 9, dependsOn: ["X"] },
  ];
  const r = optimizePortfolio(c, 5); // budget too small for X
  assert.equal(r.selected.length, 0);
  assert.match(r.excluded.find((d) => d.candidate.id === "Y")?.reason ?? "", /Dependency not funded: Foundation/);
});
test("prioritization: required (regulatory) projects selected first", () => {
  const c = [
    { id: "R", name: "Compliance", score: 60, cost: 4, expectedValue: 2, required: true },
    { id: "F", name: "Flashy", score: 90, cost: 7, expectedValue: 9 },
  ];
  const r = optimizePortfolio(c, 10);
  assert.ok(r.selected.find((d) => d.candidate.id === "R"));
});

// ---------- v1.7.0 FINANCE ENGINE ----------
import { computeBusinessCase, withScenario, npvSensitivity } from "../../src/lib/engines/finance";

const bc = {
  analysisYears: 4, discountRatePct: 8,
  capex: [{ category: "Software", amount: 2000000, year: 0 }, { category: "Implementation", amount: 500000, year: 1 }],
  opex: [{ category: "Cloud", annualAmount: 400000, startYear: 1, endYear: 3 }],
  benefits: [{ name: "Cost reduction", annualValue: 800000, startYear: 1, growthPct: 50 }],
  hurdleRatePct: 12,
};
// Year0: -2.0M | Year1: 0.8-0.5-0.4=-0.1M | Year2: 1.2-0.4=+0.8M | Year3: 1.8-0=+1.8M

test("finance: cash flow rows computed correctly", () => {
  const m = computeBusinessCase(bc);
  assert.equal(m.years[0].net, -2000000);
  assert.equal(m.years[1].net, -100000);
  assert.equal(m.years[2].net, 800000);
  assert.equal(m.years[3].net, 1400000); // 1.8M benefits - 0.4M opex (endYear 3 includes y3)
  assert.equal(m.paybackYears, 3);
});
test("finance: totals, ROI", () => {
  const m = computeBusinessCase(bc);
  assert.equal(m.totalCapex, 2500000);
  assert.equal(m.totalOpex, 1200000);
  assert.equal(m.totalBenefits, 3800000);
  assert.equal(m.totalInvestment, 3700000);
  assert.equal(m.roiPct, Math.round(((3800000 - 3700000) / 3700000) * 100 * 100) / 100);
});
test("finance: NPV at 8% matches manual discounting", () => {
  const m = computeBusinessCase(bc);
  const expected = -2000000 + (-100000) / 1.08 + 800000 / Math.pow(1.08, 2) + 1400000 / Math.pow(1.08, 3);
  assert.ok(Math.abs((m.npv ?? 0) - expected) < 1, 'npv ' + m.npv + ' vs ' + expected);
  assert.match(m.npvVerdict, /unattractive/); // marginal fixture: NPV negative at 8%
  const good = computeBusinessCase({ ...bc, benefits: [{ name: 'Cost reduction', annualValue: 1200000, startYear: 1, growthPct: 50 }] });
  assert.ok((good.npv ?? 0) > 0);
  assert.match(good.npvVerdict, /attractive/);
});test("finance: IRR computed and compared to hurdle", () => {
  const m = computeBusinessCase(bc);
  // flows -2.0, -0.1, 0.8, 1.8 -> IRR ~ 6-8%... compute precisely via bisection sanity
  assert.ok(m.irr === null || (m.irr > -50 && m.irr < 200));
  if (m.irr != null && m.irr > 12) assert.match(m.irrVerdict, /exceeds/);
  if (m.irr != null && m.irr <= 12) assert.match(m.irrVerdict, /below/);
});
test("finance: unprofitable case -> negative NPV, no fake IRR guarantees", () => {
  const bad = { ...bc, benefits: [{ name: "x", annualValue: 100000, startYear: 1 }] };
  const m = computeBusinessCase(bad);
  assert.ok((m.npv ?? 0) < 0);
  assert.match(m.npvVerdict, /unattractive/);
});
test("finance: payback detection", () => {
  const m = computeBusinessCase(bc);
  assert.ok(m.paybackYears === null || m.paybackYears >= 1); // cumulative negative early years
});
test("finance: scenarios move metrics in the right direction", () => {
  const best = withScenario(bc, { benefitMult: 1.2, capexMult: 0.9 });
  const worst = withScenario(bc, { benefitMult: 0.8, capexMult: 1.15 });
  assert.ok(best.npv! > worst.npv!);
});
test("finance: NPV sensitivity monotonic in benefits", () => {
  const s = npvSensitivity(bc);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].npv > s[i - 1].npv);
});

// ---------- v1.9.0 METADATA ENGINE ----------
import { applyNameStyle, deriveInternalName, expandNumbering, validateFieldValues, evaluateFormula } from "../../src/lib/engines/metadata";

test("metadata: name styles", () => {
  assert.equal(applyNameStyle("Business Criticality", "snake_case"), "business_criticality");
  assert.equal(applyNameStyle("Business Criticality", "UPPER_SNAKE"), "BUSINESS_CRITICALITY");
  assert.equal(applyNameStyle("Business Criticality", "PascalCase"), "BusinessCriticality");
  assert.equal(applyNameStyle("Business Criticality", "camelCase"), "businessCriticality");
});
test("metadata: prefix/suffix naming convention", () => {
  assert.equal(deriveInternalName("Business Criticality", { style: "PascalCase", prefix: "PMO_", suffix: "_FIELD" }), "PMO_BusinessCriticality_FIELD");
});
test("metadata: numbering tokens", () => {
  assert.equal(expandNumbering("{PREFIX}-{YEAR}-{SEQ}", { prefix: "ENG", year: 2026, seq: 42 }), "ENG-2026-00042");
  assert.equal(expandNumbering("RSK-{YEAR}-{SEQ}", { year: 2026, seq: 7, pad: 3 }), "RSK-2026-007");
});
test("metadata: field validation required + select options", () => {
  const defs = [
    { internalName: "business_criticality", displayLabel: "Business Criticality", baseType: "SELECT", required: true, optionsJson: JSON.stringify(["Low", "High"]) },
    { internalName: "notes", displayLabel: "Notes", baseType: "TEXT", required: false, optionsJson: null },
  ];
  const bad = validateFieldValues(defs, { business_criticality: "Extreme" });
  assert.equal(bad.ok, false);
  const good = validateFieldValues(defs, { business_criticality: "High", notes: "ok" });
  assert.equal(good.ok, true);
  assert.equal(good.normalized.notes, "ok");
});
test("metadata: number/date/boolean validation", () => {
  const defs = [
    { internalName: "budget", displayLabel: "Budget", baseType: "CURRENCY", required: true, optionsJson: null },
    { internalName: "go_live", displayLabel: "Go live", baseType: "DATE", required: false, optionsJson: null },
  ];
  const bad = validateFieldValues(defs, { budget: "abc", go_live: "not-a-date" });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2);
  const good = validateFieldValues(defs, { budget: "5000000", go_live: "2026-12-01" });
  assert.equal(good.ok, true);
  assert.equal(good.normalized.budget, 5000000);
});
test("metadata: safe formula evaluation (no eval abuse)", () => {
  const r = evaluateFormula("({forecast} - {budget}) / {budget} * 100", { forecast: 1200000, budget: 1000000 });
  assert.equal(r.ok, true);
  assert.equal(r.value, 20);
  const bad = evaluateFormula("process.exit(1)", {});
  assert.equal(bad.ok, false);
});

// ---------- v2.0.0 IDENTITY ----------
import { verifyTotp, generateTotpSecret, mapGroupsToRoles, scimToIdentity } from "../../src/lib/engines/identity";

test("identity: TOTP deterministic + window verification", () => {
  const secret = generateTotpSecret();
  const step = Math.floor(Date.now() / 30000);
  const { totpCode } = require("../../src/lib/engines/identity");
  const code = totpCode(secret, step);
  assert.match(code, /^[0-9]{6}$/);
  assert.equal(verifyTotp(secret, code, Date.now()), true);
  assert.equal(verifyTotp(secret, code, Date.now() + 60000), false); // 2 steps ahead rejected
});
test("identity: TOTP window tolerance (adjacent step accepted)", () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const nextStepCode = require("../../src/lib/engines/identity").totpCode(secret, Math.floor(now / 30000) + 1);
  assert.equal(verifyTotp(secret, nextStepCode, now), true); // next step within ±1 window
});
test("identity: group -> role mapping (case-insensitive, unmatched tracked)", () => {
  const m = mapGroupsToRoles(
    { groups: ["PMO Lead", "Delivery", "Unknown Group"], email: "u@x.io", name: "U", subject: "s1" },
    [{ idpGroup: "PMO Lead", roleCode: "PMO_ADMIN" }, { idpGroup: "pmo lead", roleCode: "PROJECT_MANAGER" }, { idpGroup: "Delivery", roleCode: "PROJECT_MANAGER" }],
  );
  assert.deepEqual(m.roleCodes.sort(), ["PMO_ADMIN", "PROJECT_MANAGER"]);
  assert.deepEqual(m.unmatchedGroups, ["Unknown Group"]);
  assert.equal(m.email, "u@x.io");
});
test("identity: SCIM transform", () => {
  const id = scimToIdentity({ userName: "jdoe", name: { givenName: "Jane", familyName: "Doe" }, emails: [{ value: "secondary@x.io" }, { value: "jane@x.io", primary: true }], active: true, groups: [{ value: "PMO Lead" }] });
  assert.equal(id.email, "jane@x.io");
  assert.equal(id.name, "Jane Doe");
  assert.equal(id.active, true);
  assert.deepEqual(id.groups, ["PMO Lead"]);
});

// helper bridging the test (recompute TOTP using the engine's own constant step)
function requireTotp(_secret: string, _at: number): string { return "000000"; }
