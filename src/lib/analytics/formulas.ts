// PM CONTROL TOWER — Analytics Engine: pure metric math (DB-free, deterministic).
// Shared by the report computes and covered by tests/engines/analytics.test.ts.
// Conventions: all division goes through safeDiv, all outputs round2 — same rules
// as the existing engines (evm.ts, governance.ts).

import { safeDiv, round2, dayNum } from "../constants";

// ---------- EVM family ----------
export function costVariance(ev: number, ac: number): number {
  return round2(ev - ac);
}
export function scheduleVariance(ev: number, pv: number): number {
  return round2(ev - pv);
}
/** CPI = EV / AC (1.0 when no spend recorded — honest neutral, never NaN). */
export function cpi(ev: number, ac: number): number {
  return ac > 0 ? round2(safeDiv(ev, ac, 1)) : 1;
}
/** SPI = EV / PV. */
export function spi(ev: number, pv: number): number {
  return pv > 0 ? round2(safeDiv(ev, pv, 1)) : 1;
}
/** EAC, cumulative method: BAC / CPI (primary). */
export function eacCumulative(bac: number, cpiVal: number): number {
  return round2(cpiVal > 0 ? bac / cpiVal : bac);
}
/** EAC, composite CPI×SPI method: BAC / (CPI × SPI) — used when schedule slip drives cost. */
export function eacComposite(bac: number, cpiVal: number, spiVal: number): number {
  const denom = cpiVal * spiVal;
  return round2(denom > 0 ? bac / denom : bac);
}
/** EAC, bottom-up style: AC + (BAC − EV) — remaining work at budgeted rate. */
export function eacAtBudgetedRate(bac: number, ev: number, ac: number): number {
  return round2(ac + Math.max(0, bac - ev));
}
export function etc(eacVal: number, ac: number): number {
  return round2(Math.max(0, eacVal - ac));
}
export function vac(bac: number, eacVal: number): number {
  return round2(bac - eacVal);
}
/** TCPI = (BAC − EV) / (BAC − AC) — efficiency needed to still hit BAC. */
export function tcpi(bac: number, ev: number, ac: number): number {
  const denom = bac - ac;
  if (denom <= 0) return ev >= bac ? 0 : 1;
  return round2(safeDiv(bac - ev, denom, 1));
}

// ---------- Variance & rates ----------
export function variancePct(current: number, baseline: number): number {
  return baseline > 0 ? round2(((current - baseline) / baseline) * 100) : 0;
}
/** part/whole as a 0..100 percentage (0 whole → 0, never NaN). */
export function ratePct(part: number, whole: number): number {
  return whole > 0 ? round2((part / whole) * 100) : 0;
}
/** Utilization = worked hours / capacity hours (0 capacity → 0). */
export function utilizationPct(workedHours: number, capacityHours: number): number {
  return ratePct(workedHours, capacityHours);
}
/** Mean Absolute Percentage Error across forecast/actual pairs — revenue forecast accuracy. */
export function mape(pairs: { forecast: number; actual: number }[]): number | null {
  const usable = pairs.filter((p) => p.actual !== 0);
  if (!usable.length) return null;
  const sum = usable.reduce((s, p) => s + Math.abs((p.forecast - p.actual) / p.actual), 0);
  return round2((sum / usable.length) * 100);
}

// ---------- Time ----------
export function daysBetween(from: Date | string | null | undefined, to: Date | string | null | undefined): number | null {
  if (!from || !to) return null;
  return dayNum(to) - dayNum(from);
}
/** Open-item aging bucket label (days open as of `now`). */
export function agingBucket(days: number): "0-7" | "8-14" | "15-30" | "31-60" | "60+" {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  return "60+";
}
export const AGING_BUCKETS = ["0-7", "8-14", "15-30", "31-60", "60+"] as const;

/** On-time delivery: due vs actual. Missing actual → on time iff not yet due. */
export function onTimeStats(items: { due: Date | string | null; actual: Date | string | null }[]): {
  total: number; onTime: number; late: number; due: number; pct: number;
} {
  let total = 0, onTime = 0, late = 0, due = 0;
  for (const it of items) {
    total += 1;
    if (it.actual) {
      due += 1;
      const d = it.due ? dayNum(it.actual) <= dayNum(it.due) : true;
      if (d) onTime += 1; else late += 1;
    }
  }
  return { total, onTime, late, due, pct: due > 0 ? round2((onTime / due) * 100) : 0 };
}
/** Schedule variance in days: baseline vs actual/forecast completion (positive = late). */
export function slipDays(baseline: Date | string | null | undefined, actual: Date | string | null | undefined): number | null {
  return daysBetween(baseline, actual);
}

// ---------- Risk ----------
export interface RiskLike { probability: number; impact: number; score: number; status: string; residualProbability: number; residualImpact: number }
/** Gross exposure = Σ score of open risks; residual = Σ residual score of same. */
export function riskExposure(risks: RiskLike[]): { gross: number; residual: number; open: number } {
  const open = risks.filter((r) => r.status !== "CLOSED" && r.status !== "OCCURRED" && r.status !== "CLOSED_OUT");
  const gross = open.reduce((s, r) => s + (r.score || r.probability * r.impact), 0);
  const residual = open.reduce((s, r) => s + (r.residualProbability * r.residualImpact), 0);
  return { gross, residual, open: open.length };
}
/** Risk heat cell label for a probability×impact score (5×5 style bands). */
export function heatBand(score: number): "LOW" | "MEDIUM" | "HIGH" | "SEVERE" {
  if (score >= 15) return "SEVERE";
  if (score >= 8) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

// ---------- Agile ----------
/** Burndown remaining points series: total minus cumulative completed per step. */
export function burndownSeries(totalPoints: number, completedByStep: number[]): number[] {
  let done = 0;
  return completedByStep.map((c) => {
    done += c;
    return round2(Math.max(0, totalPoints - done));
  });
}

// ---------- Skills ----------
/** Normalize a skills/role string for loose matching ("Transformation/PMO" ~ "PMO"). */
export function normSkill(s: string): string {
  return s.trim().toLowerCase();
}
/**
 * Skill gap: demand roles (from assignments) vs supply skills (from resources).
 * A demand role is covered when any resource's skill/primarySkill contains its key.
 */
export function skillGap(
  demand: { role: string; headcount: number }[],
  supply: { name: string; headcount: number }[],
): { role: string; demand: number; covered: number; gap: number }[] {
  return demand.map((d) => {
    const key = normSkill(d.role);
    const covered = supply
      .filter((s) => {
        const sk = normSkill(s.name);
        return sk.includes(key) || key.includes(sk) || key.split(/\s+/).some((w) => w.length > 3 && sk.includes(w));
      })
      .reduce((sum, s) => sum + s.headcount, 0);
    return { role: d.role, demand: d.headcount, covered, gap: Math.max(0, d.headcount - covered) };
  });
}

// ---------- Cost of quality (count-based proxy until costs are captured) ----------
export interface CoqRow { kind: "PREVENTION" | "APPRAISAL" | "INTERNAL_FAILURE" | "EXTERNAL_FAILURE"; count: number }
export function coqShares(rows: CoqRow[]): { kind: CoqRow["kind"]; count: number; sharePct: number }[] {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return rows.map((r) => ({ ...r, sharePct: ratePct(r.count, total) }));
}

// ---------- Forecast bucketing ----------
/** Bucket a numeric value into labeled ranges (e.g., CPI distribution). */
export function bucketize<T>(values: number[], edges: { label: string; min: number; max?: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of edges) out[e.label] = 0;
  for (const v of values) {
    const hit = edges.find((e) => v >= e.min && (e.max === undefined || v < e.max));
    if (hit) out[hit.label] += 1;
  }
  return out;
}
