// PM CONTROL TOWER — Benefits Realization Engine (pure)
// Value promised vs delivered vs at risk, plus the strategic health overlay:
// a green delivery-health project delivering no benefits is strategically amber.

export interface ProfileLike { id: string; targetValue: number; baselineValue: number; active: boolean }
export type StrategicRag = "GREEN" | "AMBER" | "RED";

export interface BenefitRollup {
  promised: number;
  delivered: number;
  realizationPct: number;
  atRiskProfiles: string[];
  activeProfiles: number;
  totalProfiles: number;
}

/**
 * promised = sum of targets across ACTIVATED profiles.
 * delivered = sum of latest cumulative actual per profile (last actual value wins —
 * BenefitActual.period rows are cumulative-to-period postings).
 * at risk = activated profiles whose delivered/expected pace ratio < 0.5,
 * where expected pace = target × elapsedShare of the review window (approximated
 * by delivered against target directly when no time axis is supplied).
 */
export function rollupBenefits(
  profiles: ProfileLike[],
  cumulativeByProfile: Record<string, number>,
  opts?: { expectedPaceRatio?: number }
): BenefitRollup {
  const pace = opts?.expectedPaceRatio ?? 0.5;
  const active = profiles.filter((p) => p.active);
  const promised = active.reduce((s, p) => s + p.targetValue, 0);
  let delivered = 0;
  const atRiskProfiles: string[] = [];
  for (const p of active) {
    const cum = cumulativeByProfile[p.id] ?? 0;
    delivered += Math.min(cum, p.targetValue);
    if (cum < p.targetValue * pace) atRiskProfiles.push(p.id);
  }
  return {
    promised: round(promised),
    delivered: round(delivered),
    realizationPct: promised > 0 ? Math.round((delivered / promised) * 1000) / 10 : 0,
    atRiskProfiles,
    activeProfiles: active.length,
    totalProfiles: profiles.length,
  };
}

/**
 * Strategic overlay: delivery health stays untouched; the strategic column flags
 * green delivery projects that are not realizing value.
 */
export function strategicHealth(deliveryRag: string, realizationPct: number, activeProfiles: number): { rag: StrategicRag; note: string } {
  if (activeProfiles === 0) return { rag: deliveryRag === "GREEN" ? "GREEN" : "AMBER", note: "No benefits profiled — value case not yet tracked" };
  if (realizationPct < 50) return { rag: "AMBER", note: `Strategically amber — ${realizationPct}% of promised value realized` };
  if (realizationPct < 80 && deliveryRag === "GREEN") return { rag: "AMBER", note: `Value tracking below promise (${realizationPct}%)` };
  return { rag: "GREEN", note: `Value on track (${realizationPct}% realized)` };
}

function round(n: number): number { return Math.round(n * 100) / 100; }
