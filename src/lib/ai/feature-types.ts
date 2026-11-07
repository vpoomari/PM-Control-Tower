// Client-safe contracts for AI-assisted PM features (no DB / Node imports).

export interface WbsTaskSuggestion {
  name: string;
  description: string;
  durationDays: number;
}

export interface WbsWorkPackageSuggestion {
  name: string;
  description: string;
  tasks: WbsTaskSuggestion[];
}

export interface WbsPhaseSuggestion {
  name: string;
  description: string;
  workPackages: WbsWorkPackageSuggestion[];
}

export interface WbsSuggestion {
  title: string;
  rationale: string;
  phases: WbsPhaseSuggestion[];
}

export interface BurnRatePoint {
  period: string;
  amount: number;
}

export type BurnRateSource = "EVM_PERIODS" | "APPROVED_EXPENSES";
export type BurnRateConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface BurnRateForecast {
  projectCode: string;
  projectName: string;
  currency: string;
  source: BurnRateSource;
  asOf: string;
  history: BurnRatePoint[];
  actualToDate: number;
  currentBudget: number | null;
  averageMonthlyBurn: number;
  monthlyTrend: number;
  monthsRemaining: number;
  projectedEac: number;
  projectedVariance: number | null;
  projectedVariancePct: number | null;
  storedForecast: number | null;
  confidence: BurnRateConfidence;
  sourceRecordCount: number;
  excludedCurrencyExpenses: number;
  methodology: string;
}

export interface BurnRateNarrative {
  summary: string;
  drivers: { signal: string; evidence: string }[];
  actions: { priority: "HIGH" | "MEDIUM" | "LOW"; action: string }[];
}
