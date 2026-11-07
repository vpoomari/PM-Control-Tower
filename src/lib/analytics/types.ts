// PM CONTROL TOWER — Analytics Engine: shared contracts (client-safe, no DB imports).
// Declarative ReportPayload: every one of the 50 PMO analytics reports computes to
// this JSON shape, and one generic renderer (src/views/intelligence/insights-report.tsx)
// draws it. Charts map 1:1 onto the pure-SVG primitives in components/pmct/charts3d.

export type AnalyticsModuleId = "planning" | "resources" | "delivery" | "cost" | "quality";
export type ReportStatus = "live" | "roadmap";
/** Display formatter token applied by the renderer (see format.ts). */
export type ValueFormat = "number" | "money" | "pct" | "ratio" | "days" | "hours" | "count";
export type Tone = "default" | "good" | "warn" | "bad" | "info";

/** Brand palette (matches the Control Tower identity + ct3d theme vars). */
export const BRAND = {
  navy: "#0B1026",
  indigo: "#17153B",
  blue: "#2864FF",
  cyan: "#00D9FF",
  purple: "#843BFF",
  magenta: "#F52AA8",
  coral: "#FF5277",
  orange: "#FF8A24",
  yellow: "#FFD43B",
  emerald: "#29E68C",
  white: "#F7F9FF",
  slate: "#7C879D",
} as const;

/** Series color rotation used when a compute does not pin colors. */
export const SERIES_COLORS = [BRAND.blue, BRAND.cyan, BRAND.purple, BRAND.magenta, BRAND.orange, BRAND.yellow, BRAND.emerald];

export interface KpiSpec {
  label: string;
  value: number | string;
  format?: ValueFormat;
  tone?: Tone;
  sub?: string;
  delta?: { value: number; unit?: string; good?: boolean; label?: string };
  spark?: number[];
}

export interface ChartSpecBase {
  title: string;
  subtitle?: string;
  format?: ValueFormat;
}
export interface BarChartSpec extends ChartSpecBase {
  kind: "bar";
  series: { label: string; color: string }[];
  groups: { label: string; values: number[]; sublabel?: string }[];
  yMax?: number;
}
export interface AreaChartSpec extends ChartSpecBase {
  kind: "area";
  points: { label: string; value: number }[];
  color?: string;
}
export interface DonutChartSpec extends ChartSpecBase {
  kind: "donut";
  slices: { label: string; value: number; color: string }[];
  centerLabel?: string;
}
export interface GaugeChartSpec extends ChartSpecBase {
  kind: "gauge";
  value: number;
  max?: number;
  goodAt?: number;
  sublabel?: string;
}
export type ChartSpec = BarChartSpec | AreaChartSpec | DonutChartSpec | GaugeChartSpec;

export interface TableColumnSpec {
  key: string;
  header: string;
  format?: ValueFormat;
  align?: "left" | "right";
}
export interface TableSpec {
  title: string;
  subtitle?: string;
  columns: TableColumnSpec[];
  rows: Record<string, string | number | null>[];
  maxRows?: number;
}

export interface ReportPayload {
  reportId: string;
  title: string;
  module: AnalyticsModuleId;
  generatedAt: string; // ISO timestamp
  scope: { projects: number; label: string };
  kpis: KpiSpec[];
  charts: ChartSpec[];
  tables: TableSpec[];
  /** Methodology / interpretation notes shown under the report. */
  notes: string[];
  /** Capture hints shown when the report has no source rows yet. */
  emptyHints?: string[];
}

/** Compute output before the registry stamps identity + scope onto it. */
export type RawPayload = Omit<ReportPayload, "reportId" | "title" | "module" | "generatedAt" | "scope">;
export type RawCompute = (ctx: import("./context").AnalyticsContext) => RawPayload | Promise<RawPayload>;

export interface ReportSpec {
  id: string;
  module: AnalyticsModuleId;
  /** App motto pillar the module serves: PLAN | EXECUTE | MONITOR | GOVERN | DELIVER. */
  pillar: string;
  title: string;
  subtitle: string;
  /** One-line formula (rendered on the report page — transparency, no magic numbers). */
  formula: string;
  /** Source Prisma models. */
  sources: string[];
  status: ReportStatus;
  /** Why a roadmap report is not live yet + what capture it needs. */
  roadmapNote?: string;
}

export interface ReportDef extends ReportSpec {
  compute?: RawCompute;
}

export interface ModuleMeta {
  id: AnalyticsModuleId;
  label: string;
  pillar: string;
  accent: string;
  description: string;
  reportCount: number;
  liveCount: number;
}
