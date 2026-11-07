// PM CONTROL TOWER — Analytics Engine: per-project EVM resolution.
// Prefers the latest stored EvmPeriod row; falls back to the live computeEVM()
// engine (tasks + actual cost + budget) so EVM reports work before periodic
// EVM capture exists — same principle as the EVM detail API.

import { computeEVM, EvmResult } from "../engines/evm";
import { AnalyticsContext } from "./context";

export interface ProjectEvm extends EvmResult {
  projectId: string;
  code: string;
  name: string;
  source: "STORED" | "CALCULATED";
}

/** Latest EVM state per project (stored period when captured, else calculated). */
export function projectEvm(ctx: AnalyticsContext): ProjectEvm[] {
  const latest = new Map<string, ctxEvmPeriod>();
  for (const p of ctx.evmPeriods) latest.set(p.projectId, p); // ascending order → last wins
  return ctx.projects.map((pr) => {
    const s = latest.get(pr.id);
    if (s) {
      return {
        projectId: pr.id, code: pr.code, name: pr.name, source: "STORED",
        bac: s.bac, pv: s.pv, ev: s.ev, ac: s.ac, cpi: s.cpi, spi: s.spi,
        eac: s.eac, etc: s.etc, vac: s.vac, tcpi: s.tcpi,
        costVariance: s.costVariance, scheduleVariance: s.scheduleVariance,
        percentComplete: s.percentComplete,
      };
    }
    const tasks = ctx.tasks.filter((t) => t.projectId === pr.id);
    const r = computeEVM(tasks, pr.actualCost, pr.currentBudget || null, ctx.now);
    return { projectId: pr.id, code: pr.code, name: pr.name, source: "CALCULATED", ...r };
  });
}

type ctxEvmPeriod = AnalyticsContext["evmPeriods"][number];

/** Sum EVM fields across projects (portfolio roll-up). */
export function evmTotals(rows: ProjectEvm[]): ProjectEvm {
  const sum = (f: keyof EvmResult) => rows.reduce((s, r) => s + (r[f] as number), 0);
  return {
    projectId: "PORTFOLIO", code: "PORTFOLIO", name: "Portfolio", source: "CALCULATED",
    bac: sum("bac"), pv: sum("pv"), ev: sum("ev"), ac: sum("ac"),
    cpi: 0, spi: 0, eac: sum("eac"), etc: sum("etc"), vac: sum("vac"), tcpi: 0,
    costVariance: sum("costVariance"), scheduleVariance: sum("scheduleVariance"),
    percentComplete: 0,
  };
}
