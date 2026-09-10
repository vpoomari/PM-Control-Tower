// PM CONTROL TOWER — Earned Value Management Engine
// BAC / PV / EV / AC / CPI / SPI / EAC / ETC / VAC / TCPI / CV / SV
// Uses operational data: task planned cost & physical progress, timesheet-driven actuals.

import { dayNum, safeDiv, round2 } from "../constants";

export interface EvmTaskInput {
  plannedCost: number;
  plannedHours: number;
  progress: number; // 0..100
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}
export interface EvmResult {
  bac: number; pv: number; ev: number; ac: number;
  cpi: number; spi: number; eac: number; etc: number; vac: number; tcpi: number;
  costVariance: number; scheduleVariance: number; percentComplete: number;
}

export function computeEVM(
  tasks: EvmTaskInput[],
  actualCost: number,
  bacOverride: number | null | undefined,
  statusDate: Date | string = new Date()
): EvmResult {
  const sd = dayNum(statusDate);
  const sumPlanned = tasks.reduce((s, t) => s + (t.plannedCost || 0), 0);
  const bac = bacOverride && bacOverride > 0 ? bacOverride : sumPlanned;
  const totalPlanned = sumPlanned || 1;

  // Planned Value: linear time-phased spread up to status date
  let pv = 0;
  for (const t of tasks) {
    const c = t.plannedCost || 0;
    if (!t.startDate || !t.endDate) { pv += c * 0.5; continue; }
    const s = dayNum(t.startDate), e = dayNum(t.endDate);
    if (e <= s) { pv += sd >= s ? c : 0; continue; }
    const frac = Math.max(0, Math.min(1, (sd - s) / (e - s)));
    pv += c * frac;
  }

  // Earned Value: weighted by planned cost × physical progress
  let ev = 0;
  for (const t of tasks) {
    ev += (t.plannedCost || 0) * (Math.max(0, Math.min(100, t.progress || 0)) / 100);
  }

  const ac = actualCost || 0;
  const cpi = safeDiv(ev, ac, ac === 0 ? 1 : 0.01);
  const eac = cpi > 0 ? bac / cpi : bac;
  const tcpiDen = bac - ac;
  const tcpi = tcpiDen > 0 ? safeDiv(bac - ev, tcpiDen, 1) : (ev >= bac ? 0 : 1);

  return {
    bac: round2(bac), pv: round2(pv), ev: round2(ev), ac: round2(ac),
    cpi: round2(safeDiv(ev, ac, 1)), spi: round2(safeDiv(ev, pv, 1)),
    eac: round2(eac), etc: round2(Math.max(0, eac - ac)), vac: round2(bac - eac), tcpi: round2(tcpi),
    costVariance: round2(ev - ac), scheduleVariance: round2(ev - pv),
    percentComplete: round2(safeDiv(ev, totalPlanned, 0) * 100),
  };
}
