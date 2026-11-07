// PM CONTROL TOWER — Investment & Business Case Financial Engine (pure, deterministic)
// Cash-flow model, ROI, NPV, IRR (bisection, honest null), simple + discounted
// payback, recommendation indicator, best/base/worst scenarios, NPV sensitivity.

export interface CapexItem { category: string; description?: string; amount: number; year?: number }
export interface OpexItem { category: string; description?: string; annualAmount: number; startYear?: number; endYear?: number; escalationPct?: number }
export interface BenefitItem { name: string; type?: string; annualValue: number; startYear?: number; growthPct?: number; confidencePct?: number; owner?: string }

export interface BusinessCaseInput {
  analysisYears: number;       // e.g. 5
  discountRatePct: number;     // e.g. 8
  capex: CapexItem[];
  opex: OpexItem[];
  benefits: BenefitItem[];
  hurdleRatePct?: number;      // IRR comparison, default = discountRatePct
}

export interface YearRow { year: number; capex: number; opex: number; benefits: number; net: number; cumulative: number }
export interface Metrics {
  years: YearRow[];
  totalCapex: number; totalOpex: number; totalBenefits: number; totalInvestment: number;
  netBenefit: number; roiPct: number;
  npv: number | null; irr: number | null;
  paybackYears: number | null; discountedPaybackYears: number | null;
  hurdleRatePct: number;
  irrVerdict: string; npvVerdict: string;
  recommendation: "STRONG_INVEST" | "INVEST" | "REVIEW" | "CONDITIONAL" | "DO_NOT_INVEST";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeBusinessCase(input: BusinessCaseInput): Metrics {
  const Y = Math.max(1, Math.min(15, input.analysisYears));
  const dr = input.discountRatePct / 100;
  const hurdle = (input.hurdleRatePct ?? input.discountRatePct) / 100;

  const years: YearRow[] = [];
  let cum = 0;
  let discCum = 0;
  let payback: number | null = null;
  let discPayback: number | null = null;
  const flows: number[] = [];

  for (let y = 0; y < Y; y++) {
    const capex = r2(input.capex.reduce((s, c) => s + (c.year === undefined || c.year === y ? c.amount : 0), 0));
    const opex = r2(input.opex.reduce((s, o) => {
      const sy = o.startYear ?? 1, ey = o.endYear ?? Y - 1;
      if (y < sy || y > ey) return s;
      const esc = 1 + (o.escalationPct ?? 0) / 100;
      return s + o.annualAmount * Math.pow(esc, y - sy);
    }, 0));
    const benefits = r2(input.benefits.reduce((s, b) => {
      const sy = b.startYear ?? 1;
      if (y < sy) return s;
      const g = 1 + (b.growthPct ?? 0) / 100;
      const conf = (b.confidencePct ?? 100) / 100;
      return s + b.annualValue * Math.pow(g, y - sy) * conf;
    }, 0));
    const net = r2(benefits - capex - opex);
    cum = r2(cum + net);
    const discNet = y === 0 ? net : net / Math.pow(1 + dr, y);
    discCum = r2(discCum + discNet);
    flows.push(net);
    if (payback === null && cum >= 0 && y > 0) payback = y;
    if (discPayback === null && discCum >= 0 && y > 0) discPayback = y;
    years.push({ year: y, capex, opex, benefits, net, cumulative: cum });
  }

  const totalCapex = r2(years.reduce((s, y) => s + y.capex, 0));
  const totalOpex = r2(years.reduce((s, y) => s + y.opex, 0));
  const totalBenefits = r2(years.reduce((s, y) => s + y.benefits, 0));
  const totalInvestment = r2(totalCapex + totalOpex);
  const netBenefit = r2(totalBenefits - totalInvestment);
  const roiPct = totalInvestment > 0 ? r2((netBenefit / totalInvestment) * 100) : null as unknown as number;

  // NPV: flows discounted at dr (year 0 undiscounted)
  const npv = r2(flows.reduce((s, f, y) => s + (y === 0 ? f : f / Math.pow(1 + dr, y)), 0));

  // IRR via bisection on rate in [-0.9, 10]; honest null when sign never changes
  const npvAt = (rate: number) => flows.reduce((s, f, y) => s + (y === 0 ? f : f / Math.pow(1 + rate, y)), 0);
  let irr: number | null = null;
  let lo = -0.9, hi = 10;
  const fLo = npvAt(lo), fHi = npvAt(hi);
  if (fLo * fHi < 0) {
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm = npvAt(mid);
      if (Math.abs(fm) < 1e-6) { lo = mid; break; }
      if (fLo * fm < 0) hi = mid; else { lo = mid; }
    }
    irr = r2(lo * 100);
  }

  const npvVerdict = npv > 0 ? "Positive NPV - financially attractive on these assumptions" : npv === 0 ? "Breaks even against the required return" : "Negative NPV - financially unattractive on these assumptions";
  const irrVerdict = irr == null ? "IRR not computable from these cash flows" : irr > hurdle * 100 ? "IRR exceeds the hurdle rate" : "IRR below the required return";

  // Recommendation: configurable-weight-style scoring on ROI/NPV/IRR/payback
  let score = 0;
  if (roiPct >= 50) score += 2; else if (roiPct >= 25) score += 1;
  if (npv > 0) score += 2;
  if (irr != null && irr > hurdle * 100) score += 2; else if (irr != null && irr > hurdle * 50) score += 1;
  if (payback != null && payback <= 2) score += 2; else if (payback != null && payback <= 4) score += 1;
  const recommendation: Metrics["recommendation"] = score >= 7 ? "STRONG_INVEST" : score >= 5 ? "INVEST" : score >= 3 ? "REVIEW" : score >= 1 ? "CONDITIONAL" : "DO_NOT_INVEST";

  return { years, totalCapex, totalOpex, totalBenefits, totalInvestment, netBenefit, roiPct, npv, irr, paybackYears: payback, discountedPaybackYears: discPayback, hurdleRatePct: hurdle * 100, irrVerdict, npvVerdict, recommendation };
}

// ---- Scenarios (best / base / worst / custom multipliers) ----
export interface ScenarioMultipliers { benefitMult?: number; capexMult?: number; opexMult?: number; delayYears?: number; discountRatePct?: number }

export function withScenario(input: BusinessCaseInput, m: ScenarioMultipliers): Metrics {
  const shifted: BusinessCaseInput = {
    ...input,
    discountRatePct: m.discountRatePct ?? input.discountRatePct,
    capex: input.capex.map((c) => ({ ...c, amount: c.amount * (m.capexMult ?? 1), year: c.year !== undefined ? c.year + (m.delayYears ?? 0) : undefined })),
    opex: input.opex.map((o) => ({ ...o, annualAmount: o.annualAmount * (m.opexMult ?? 1), startYear: (o.startYear ?? 1) + (m.delayYears ?? 0) })),
    benefits: input.benefits.map((b) => ({ ...b, annualValue: b.annualValue * (m.benefitMult ?? 1), startYear: (b.startYear ?? 1) + (m.delayYears ?? 0) })),
  };
  return computeBusinessCase(shifted);
}

export function scenarioSuite(input: BusinessCaseInput): { name: string; metrics: Metrics }[] {
  return [
    { name: "Best Case", metrics: withScenario(input, { benefitMult: 1.2, capexMult: 0.9, opexMult: 0.95 }) },
    { name: "Base Case", metrics: withScenario(input, {}) },
    { name: "Worst Case", metrics: withScenario(input, { benefitMult: 0.8, capexMult: 1.15, opexMult: 1.1, delayYears: 1 }) },
  ];
}

// ---- NPV sensitivity to benefits ±30% ----
// computeBusinessCase always yields a finite numeric NPV (flows discount to a real sum),
// so the `?? 0` fallback is unreachable for sane inputs — kept for type-honesty.
export function npvSensitivity(input: BusinessCaseInput, steps = [-30, -20, -10, 0, 10, 20, 30]): { changePct: number; npv: number }[] {
  return steps.map((p) => ({ changePct: p, npv: withScenario(input, { benefitMult: 1 + p / 100 }).npv ?? 0 }));
}
