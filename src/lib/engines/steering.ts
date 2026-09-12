// PM CONTROL TOWER — Agentic Steering Composer (pure, deterministic)
// AI drafts; humans approve; audit captures both. The composer deterministically
// builds the steering work product from live engine outputs — no number is
// invented, no action auto-executes. Replan trigger: SPI < 0.9 for 3
// consecutive periods.

export interface SteeringInput {
  project: { code: string; name: string; rag: string; healthScore: number };
  kpis: { cpi: number; spi: number; eac: number; bac: number; percentComplete: number; prevCpi?: number | null; prevSpi?: number | null };
  freshness: { score: number; level: string; worstFeed: string };
  topRisks: { title: string; severity: string; score: number }[];
  overdueMilestones: string[];
  pendingDecisions: string[];
  spiTrend: number[]; // oldest → newest
  p80?: { p50: number; p80: number } | null; // day offsets
}

export interface SteeringPack {
  title: string;
  narrative: string;
  kpiTable: { label: string; value: string; delta: string }[];
  risks: { title: string; severity: string; score: number }[];
  decisionsNeeded: string[];
  needsRePlan: boolean;
  generatedFrom: string;
}

function fmtDelta(v: number | null | undefined, prev: number | null | undefined, invert = false): string {
  if (prev == null || v == null) return "—";
  const d = Math.round((v - prev) * 100) / 100;
  if (d === 0) return "flat";
  const good = invert ? d > 0 : d > 0;
  return `${d > 0 ? "+" : ""}${d} ${good ? "(improving)" : "(worsening)"}`;
}

export function stalledSpi(trend: number[], threshold = 0.9, weeks = 3): boolean {
  if (trend.length < weeks) return false;
  return trend.slice(-weeks).every((v) => v < threshold);
}

export function composeSteeringPack(input: SteeringInput): SteeringPack {
  const { project, kpis, freshness } = input;
  const needsRePlan = stalledSpi(input.spiTrend);
  const kpiTable = [
    { label: "CPI (cost efficiency)", value: String(kpis.cpi), delta: fmtDelta(kpis.cpi, kpis.prevCpi) },
    { label: "SPI (schedule efficiency)", value: String(kpis.spi), delta: fmtDelta(kpis.spi, kpis.prevSpi) },
    { label: "EAC (forecast at completion)", value: `$${Math.round(kpis.eac).toLocaleString()}`, delta: kpis.bac > 0 ? `$${Math.round(kpis.eac - kpis.bac).toLocaleString()} vs budget` : "—" },
    { label: "Complete", value: `${Math.round(kpis.percentComplete)}%`, delta: "—" },
    { label: "Data freshness", value: `${freshness.score}/100 (${freshness.level})`, delta: `worst feed: ${freshness.worstFeed}` },
    { label: "Finish outlook", value: input.p80 ? `P50 day ${input.p80.p50} — P80 day ${input.p80.p80}` : "deterministic only", delta: input.p80 ? "P80 assumes things go wrong" : "run a simulation for ranges" },
  ];
  const narrative = [
    `${project.name} (${project.code}) is ${project.rag} at health ${project.healthScore}/100.`,
    `Cost efficiency CPI ${kpis.cpi}, schedule efficiency SPI ${kpis.spi}; forecast at completion $${Math.round(kpis.eac).toLocaleString()} against $${Math.round(kpis.bac).toLocaleString()} budget.`,
    input.topRisks.length > 0 ? `Highest exposure: ${input.topRisks[0].title} (score ${input.topRisks[0].score}).` : "No significant open risks on record.",
    input.overdueMilestones.length > 0 ? `${input.overdueMilestones.length} milestone(s) overdue — nearest: ${input.overdueMilestones[0]}.` : "No overdue milestones.",
    needsRePlan
      ? "SPI has held below 0.90 for three consecutive periods — a re-plan proposal is drafted as a Change Request and awaits human decision. Nothing executes without approval."
      : "Schedule trend does not currently trigger an automatic re-plan proposal.",
    `Data freshness ${freshness.level} (${freshness.score}/100, worst feed: ${freshness.worstFeed}) — figures above reflect the staleness of their source feeds.`,
  ].join(" ");
  return {
    title: `Weekly steering pack — ${project.code} ${project.name}`,
    narrative,
    kpiTable,
    risks: input.topRisks.slice(0, 5),
    decisionsNeeded: input.pendingDecisions,
    needsRePlan,
    generatedFrom: "live operational data (deterministic composer) — human review required before release",
  };
}
