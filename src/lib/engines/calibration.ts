// PM CONTROL TOWER — Say/Do Calibration Engine (pure)
// The organizational memory of estimation bias: factor = median(actual/planned)
// per scope, with MAD-based confidence. Advisory only — never auto-applied,
// never blame-framed (individual-planner scope exists but stays OFF by default).

export interface CalibrationRow { scopeType: "team" | "workType" | "project"; scopeId: string; label: string; planned: number; actual: number }
export interface CalibrationFactorOut { scopeType: string; scopeId: string; label: string; factor: number; sampleSize: number; mad: number; confident: boolean }

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeFactors(rows: CalibrationRow[], opts?: { minSamples?: number }): CalibrationFactorOut[] {
  const min = opts?.minSamples ?? 5;
  const groups = new Map<string, CalibrationRow[]>();
  for (const r of rows) {
    if (r.planned <= 0 || r.actual <= 0) continue; // only completed work with real data
    const key = `${r.scopeType}:${r.scopeId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const out: CalibrationFactorOut[] = [];
  for (const [key, g] of groups) {
    const ratios = g.map((r) => r.actual / r.planned);
    const med = median(ratios);
    const mad = median(ratios.map((x) => Math.abs(x - med)));
    const sampleSize = g.length;
    out.push({
      scopeType: g[0].scopeType, scopeId: g[0].scopeId, label: g[0].label,
      factor: Math.round(med * 100) / 100,
      sampleSize,
      mad: Math.round(mad * 100) / 100,
      confident: sampleSize >= min,
    });
  }
  return out.sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1));
}

/** Advisory suggestion for planning UIs: factor applies to a planned duration, never silently. */
export function suggestDuration(plannedDays: number, f: { factor: number; confident: boolean } | null): { suggested: number; note: string } | null {
  if (!f || !f.confident || f.factor <= 0) return null;
  return {
    suggested: Math.round(plannedDays * f.factor * 10) / 10,
    note: `Comparable work historically takes ${f.factor}× planned`,
  };
}
