// PM CONTROL TOWER — Analytics Engine unit tests (pure, DB-free, deterministic)
// Covers the metric math in src/lib/analytics/formulas.ts that all 50 reports share.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costVariance, scheduleVariance, cpi, spi, eacCumulative, eacComposite,
  eacAtBudgetedRate, etc, vac, tcpi, variancePct, ratePct, utilizationPct,
  mape, daysBetween, agingBucket, onTimeStats, slipDays, riskExposure,
  heatBand, burndownSeries, normSkill, skillGap, coqShares, bucketize,
} from "../../src/lib/analytics/formulas";

// ---------- EVM family ----------
test("analytics: cost & schedule variance", () => {
  assert.equal(costVariance(400, 600), -200);
  assert.equal(scheduleVariance(400, 500), -100);
});

test("analytics: CPI/SPI with honest neutral fallbacks", () => {
  assert.equal(cpi(400, 600), 0.67);      // 0.666… → round2
  assert.equal(cpi(600, 400), 1.5);
  assert.equal(cpi(100, 0), 1);           // no spend → neutral 1, never NaN
  assert.equal(spi(400, 500), 0.8);
  assert.equal(spi(100, 0), 1);
});

test("analytics: EAC variants", () => {
  assert.equal(eacCumulative(1000, 0.8), 1250);        // BAC / CPI
  assert.equal(eacCumulative(1000, 0), 1000);          // guard
  assert.equal(eacComposite(1000, 0.8, 0.9), 1388.89); // BAC / (CPI × SPI)
  assert.equal(eacAtBudgetedRate(1000, 400, 600), 1200); // AC + (BAC − EV)
});

test("analytics: ETC / VAC / TCPI", () => {
  assert.equal(etc(1250, 600), 650);
  assert.equal(etc(500, 800), 0);          // never negative
  assert.equal(vac(1000, 1250), -250);
  assert.equal(tcpi(1000, 400, 600), 1.5); // (BAC−EV)/(BAC−AC)
  assert.equal(tcpi(1000, 1000, 1000), 0); // done → nothing left to earn
  assert.equal(tcpi(1000, 400, 1200), 1);  // over-spent past BAC → honest fallback
});

// ---------- Variance & rates ----------
test("analytics: variance & rate percentages", () => {
  assert.equal(variancePct(110, 100), 10);
  assert.equal(variancePct(90, 100), -10);
  assert.equal(variancePct(50, 0), 0);      // no baseline → 0, never NaN
  assert.equal(ratePct(3, 4), 75);
  assert.equal(ratePct(3, 0), 0);
  assert.equal(utilizationPct(30, 40), 75);
  assert.equal(utilizationPct(30, 0), 0);
});

test("analytics: MAPE forecast accuracy", () => {
  assert.equal(mape([{ forecast: 110, actual: 100 }, { forecast: 90, actual: 100 }]), 10);
  assert.equal(mape([{ forecast: 10, actual: 0 }, { forecast: 100, actual: 100 }]), 0); // zero actuals excluded
  assert.equal(mape([]), null);
  assert.equal(mape([{ forecast: 10, actual: 0 }]), null);
});

// ---------- Time ----------
test("analytics: daysBetween & slip", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-11"), 10);
  assert.equal(slipDays("2026-01-10", "2026-01-13"), 3);  // late = positive
  assert.equal(slipDays(null, "2026-01-13"), null);
  assert.equal(daysBetween("2026-01-11", null), null);
});

test("analytics: aging bucket boundaries", () => {
  assert.equal(agingBucket(0), "0-7");
  assert.equal(agingBucket(7), "0-7");
  assert.equal(agingBucket(8), "8-14");
  assert.equal(agingBucket(14), "8-14");
  assert.equal(agingBucket(15), "15-30");
  assert.equal(agingBucket(30), "15-30");
  assert.equal(agingBucket(31), "31-60");
  assert.equal(agingBucket(60), "31-60");
  assert.equal(agingBucket(61), "60+");
  assert.equal(agingBucket(365), "60+");
});

test("analytics: on-time delivery stats exclude open items", () => {
  const s = onTimeStats([
    { due: "2026-01-10", actual: "2026-01-09" }, // on time
    { due: "2026-01-10", actual: "2026-01-11" }, // late
    { due: "2026-02-01", actual: null },         // open → excluded from rate
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.due, 2);
  assert.equal(s.onTime, 1);
  assert.equal(s.late, 1);
  assert.equal(s.pct, 50);
  assert.equal(onTimeStats([]).pct, 0);
});

// ---------- Risk ----------
test("analytics: risk exposure sums open risks only", () => {
  const r = riskExposure([
    { probability: 4, impact: 3, score: 12, status: "OPEN", residualProbability: 2, residualImpact: 2 },
    { probability: 5, impact: 5, score: 25, status: "CLOSED", residualProbability: 5, residualImpact: 5 },
  ]);
  assert.equal(r.open, 1);
  assert.equal(r.gross, 12);
  assert.equal(r.residual, 4);
});

test("analytics: heat bands at boundaries", () => {
  assert.equal(heatBand(3), "LOW");
  assert.equal(heatBand(4), "MEDIUM");
  assert.equal(heatBand(7), "MEDIUM");
  assert.equal(heatBand(8), "HIGH");
  assert.equal(heatBand(14), "HIGH");
  assert.equal(heatBand(15), "SEVERE");
  assert.equal(heatBand(25), "SEVERE");
});

// ---------- Agile ----------
test("analytics: burndown series floors at zero", () => {
  assert.deepEqual(burndownSeries(40, [10, 10, 20]), [30, 20, 0]);
  assert.deepEqual(burndownSeries(0, [5, 5]), [0, 0]);
});

// ---------- Skills ----------
test("analytics: normSkill normalizes case/whitespace", () => {
  assert.equal(normSkill("  PMO "), "pmo");
});

test("analytics: skill gap covers loose role↔skill matches", () => {
  const covered = skillGap(
    [{ role: "PMO", headcount: 2 }],
    [{ name: "Transformation/PMO", headcount: 3 }],
  );
  assert.equal(covered[0].covered, 3);
  assert.equal(covered[0].gap, 0);

  const gap = skillGap(
    [{ role: "Data Engineer", headcount: 2 }],
    [{ name: "PMO", headcount: 1 }],
  );
  assert.equal(gap[0].covered, 0);
  assert.equal(gap[0].gap, 2);
});

// ---------- CoQ ----------
test("analytics: CoQ shares sum to 100 and handle zero totals", () => {
  const shares = coqShares([
    { kind: "PREVENTION", count: 1 },
    { kind: "APPRAISAL", count: 1 },
    { kind: "INTERNAL_FAILURE", count: 1 },
    { kind: "EXTERNAL_FAILURE", count: 1 },
  ]);
  assert.deepEqual(shares.map((s) => s.sharePct), [25, 25, 25, 25]);
  const empty = coqShares([{ kind: "PREVENTION", count: 0 }]);
  assert.equal(empty[0].sharePct, 0);
});

// ---------- Bucketing ----------
test("analytics: bucketize assigns values to labeled ranges", () => {
  const b = bucketize([0.85, 0.95, 1.2, 0.7], [
    { label: "<0.90", min: 0, max: 0.9 },
    { label: "0.90-1.00", min: 0.9, max: 1 },
    { label: ">=1.00", min: 1 },
  ]);
  assert.deepEqual(b, { "<0.90": 2, "0.90-1.00": 1, ">=1.00": 1 });
});
