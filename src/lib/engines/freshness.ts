// PM CONTROL TOWER — Data Freshness Integrity Engine (pure)
// A project is as fresh as its stalest critical feed (min-based composite).
// staleness = ageDays / expectedCadenceDays. Thresholds and the grace window are
// configurable (SystemConfig): a feed inside the grace window never degrades.

export interface FreshnessThresholds { warn: number; degrade: number; critical: number }
export const FRESHNESS_THRESHOLDS: FreshnessThresholds = { warn: 1.0, degrade: 1.5, critical: 2.5 };
export const FRESHNESS_GRACE_HOURS = 24;
export type FreshnessLevel = "CURRENT" | "WARN" | "DEGRADE" | "CRITICAL";

export interface FeedInput { feed: string; lastUpdate: Date | string; expectedCadenceDays: number }
export interface FeedFreshness { feed: string; ageDays: number; staleness: number; level: FreshnessLevel; graceApplied: boolean }
export interface FreshnessResult {
  score: number; level: FreshnessLevel; worstFeed: string;
  feeds: FeedFreshness[];
}

const DAY_MS = 86_400_000;

export function levelFor(staleness: number, t: FreshnessThresholds = FRESHNESS_THRESHOLDS): FreshnessLevel {
  if (staleness >= t.critical) return "CRITICAL";
  if (staleness >= t.degrade) return "DEGRADE";
  if (staleness >= t.warn) return "WARN";
  return "CURRENT";
}

/** Composite score: worst feed dominates. staleness 1.0 → 100; every +1.0x costs 40 pts; floor 0. */
export function computeFreshness(
  feeds: FeedInput[],
  now: Date = new Date(),
  opts?: { thresholds?: FreshnessThresholds; graceHours?: number }
): FreshnessResult {
  const t = opts?.thresholds ?? FRESHNESS_THRESHOLDS;
  const graceDays = (opts?.graceHours ?? FRESHNESS_GRACE_HOURS) / 24;
  if (feeds.length === 0) return { score: 100, level: "CURRENT", worstFeed: "none", feeds: [] };
  const feedResults: FeedFreshness[] = feeds.map((f) => {
    const last = new Date(f.lastUpdate);
    const ageDays = Math.max(0, (now.getTime() - last.getTime()) / DAY_MS);
    const graceApplied = ageDays <= graceDays;
    const rawStaleness = f.expectedCadenceDays > 0 ? ageDays / f.expectedCadenceDays : 0;
    const staleness = graceApplied ? 0 : rawStaleness;
    return {
      feed: f.feed, ageDays: Math.round(ageDays * 10) / 10,
      staleness: Math.round(staleness * 100) / 100,
      level: graceApplied ? "CURRENT" : levelFor(rawStaleness, t),
      graceApplied,
    };
  });
  const worst = feedResults.reduce((a, b) => (b.staleness > a.staleness ? b : a));
  const score = Math.round(Math.max(0, 100 - Math.max(0, worst.staleness - 1) * 40));
  return { score, level: levelFor(worst.staleness, t), worstFeed: worst.feed, feeds: feedResults };
}

/** Health deduction: stale data is unknown risk — critical costs 12 pts, degrade 6, warn 0. */
export function freshnessPenalty(level: FreshnessLevel): number {
  if (level === "CRITICAL") return 12;
  if (level === "DEGRADE") return 6;
  return 0;
}
