// PM CONTROL TOWER — Probabilistic Forecasting Engine (pure, seeded, reproducible)
// Monte Carlo over the EXISTING CPM engine: sample task durations from their
// estimate distributions, run computeCPM unchanged per iteration, aggregate
// P10/P50/P80/P90 for project finish, milestone finishes and cost, plus a
// criticality index per task. PRNG: mulberry32 (documented, seeded → tests
// are deterministic: same seed → identical percentiles).

import { computeCPM, CpmDepInput, CpmTaskInput } from "./cpm";

export type McDistribution = "PERT" | "TRIANGULAR";
export interface McEstimate { optimistic: number; likely: number; pessimistic: number; distribution: McDistribution }
export interface McTask extends CpmTaskInput { estimate?: McEstimate }
export interface McMilestone { id: string; name: string; taskId?: string | null }

export interface McInput {
  tasks: McTask[];
  deps: CpmDepInput[];
  projectStartDay?: number;      // day offset anchor (default 0)
  milestones?: McMilestone[];
  baseCost?: number;             // fixed cost base
  dailyCost?: number;            // burn per working day (approx)
}

export interface McResult {
  seed: number;
  iterations: number;
  prng: string;
  deterministicFinishDay: number;
  finish: Percentiles;
  cost: Percentiles;
  milestones: Record<string, { name: string; p10: number; p50: number; p80: number; p90: number }>;
  criticality: Record<string, number>; // taskId → % of iterations on critical path
}

export interface Percentiles { p10: number; p50: number; p80: number; p90: number }

/** mulberry32 — small, fast, seedable PRNG. Documented per constitution rule 6. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleTriangular(u: number, o: number, m: number, p: number): number {
  const span = p - o, mode = (m - o) / (span || 1);
  if (u < mode) return o + Math.sqrt(u * mode) * span;
  return p - Math.sqrt((1 - u) * (1 - mode)) * span;
}

/** PERT approximated by beta via Irwin–Hall (sum of 4 uniforms) mapped onto [o,p]. */
function samplePert(rand: () => number, o: number, m: number, p: number): number {
  const u = (rand() + rand() + rand() + rand()) / 4;
  return o + u * (p - o);
}

export function sampleDuration(rand: () => number, est: McEstimate): number {
  const { optimistic: o, likely: m, pessimistic: p } = est;
  return est.distribution === "TRIANGULAR" ? sampleTriangular(rand(), o, m, p) : samplePert(rand, o, m, p);
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return Math.round(sorted[idx] * 10) / 10;
}

export function runSimulation(input: McInput, opts?: { seed?: number; iterations?: number }): McResult {
  const seed = opts?.seed ?? 20260912;
  const iterations = Math.min(10_000, Math.max(200, opts?.iterations ?? 1000));
  const rand = mulberry32(seed);

  const leafTasks = input.tasks.filter((t) => !t.isSummary);
  const estimates = new Map<string, McEstimate>();
  for (const t of leafTasks) {
    estimates.set(t.id, t.estimate ?? { optimistic: Math.max(0.5, (t.durationDays || 1) * 0.6), likely: t.durationDays || 1, pessimistic: (t.durationDays || 1) * 1.8, distribution: "PERT" });
  }

  // Deterministic baseline (for comparison + honest labelling)
  const det = computeCPM(input.tasks, input.deps, null);
  const deterministicFinishDay = Math.max(0, ...[...det.values()].map((r) => r.ef));

  const finishes: number[] = [];
  const costs: number[] = [];
  const critCount = new Map<string, number>();
  const milestoneFinishes = new Map<string, number[]>();
  for (const ms of input.milestones ?? []) milestoneFinishes.set(ms.id, []);

  const base: CpmTaskInput[] = input.tasks;

  for (let i = 0; i < iterations; i++) {
    const sampled = new Map<string, number>();
    for (const t of leafTasks) sampled.set(t.id, Math.round(sampleDuration(rand, estimates.get(t.id)!)));
    const simTasks: CpmTaskInput[] = base.map((t) => (sampled.has(t.id) ? { ...t, durationDays: sampled.get(t.id)! } : t));
    const res = computeCPM(simTasks, input.deps, null);
    const finishDay = Math.max(0, ...[...res.values()].map((r) => r.ef));
    finishes.push(finishDay);
    costs.push((input.baseCost ?? 0) + finishDay * (input.dailyCost ?? 0));
    for (const [tid, r] of res) if (r.critical) critCount.set(tid, (critCount.get(tid) ?? 0) + 1);
    for (const ms of input.milestones ?? []) {
      if (ms.taskId && res.has(ms.taskId)) milestoneFinishes.get(ms.id)!.push(res.get(ms.taskId)!.ef);
    }
  }

  finishes.sort((a, b) => a - b);
  costs.sort((a, b) => a - b);

  const milestones: McResult["milestones"] = {};
  for (const ms of input.milestones ?? []) {
    const arr = (milestoneFinishes.get(ms.id) ?? []).sort((a, b) => a - b);
    milestones[ms.id] = { name: ms.name, p10: percentile(arr, 0.1), p50: percentile(arr, 0.5), p80: percentile(arr, 0.8), p90: percentile(arr, 0.9) };
  }

  const criticality: Record<string, number> = {};
  for (const t of leafTasks) criticality[t.id] = Math.round(((critCount.get(t.id) ?? 0) / iterations) * 1000) / 10;

  return {
    seed, iterations, prng: "mulberry32",
    deterministicFinishDay,
    finish: { p10: percentile(finishes, 0.1), p50: percentile(finishes, 0.5), p80: percentile(finishes, 0.8), p90: percentile(finishes, 0.9) },
    cost: { p10: percentile(costs, 0.1), p50: percentile(costs, 0.5), p80: percentile(costs, 0.8), p90: percentile(costs, 0.9) },
    milestones, criticality,
  };
}
