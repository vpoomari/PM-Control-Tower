// PM CONTROL TOWER — Scheduling Engine: Critical Path Method (CPM)
// Supports FS / SS / FF / SF dependency types with lag days.
// Computes ES / EF / LS / LF / total float / free float / critical flag.
// Leaf tasks only participate in CPM; summary nodes are rolled up from children.

import { dayNum, fromDayNum } from "../constants";

export interface CpmTaskInput {
  id: string;
  name?: string;
  durationDays: number;
  startDate?: Date | string | null;
  isSummary?: boolean;
  parentId?: string | null;
}
export interface CpmDepInput {
  predecessorId: string;
  successorId: string;
  depType: string; // FS | SS | FF | SF
  lagDays: number;
}
export interface CpmResult {
  es: number; ef: number; ls: number; lf: number;
  totalFloat: number; freeFloat: number; critical: boolean;
}

export function computeCPM(tasks: CpmTaskInput[], deps: CpmDepInput[], projectStart?: Date | string | null): Map<string, CpmResult> {
  const leaves = tasks.filter((t) => !t.isSummary);
  const ids = new Set(leaves.map((t) => t.id));
  const validDeps = deps.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId));

  // Anchor: earliest explicit start or provided project start
  const explicit = leaves.map((t) => (t.startDate ? dayNum(t.startDate) : Number.POSITIVE_INFINITY));
  const anchor = projectStart
    ? dayNum(projectStart)
    : (explicit.length && isFinite(Math.min(...explicit)) ? Math.min(...explicit) : 0);

  const dur = new Map<string, number>();
  for (const t of leaves) dur.set(t.id, Math.max(0, t.durationDays || 0));

  const preds = new Map<string, CpmDepInput[]>();
  const succs = new Map<string, CpmDepInput[]>();
  for (const t of leaves) { preds.set(t.id, []); succs.set(t.id, []); }
  for (const d of validDeps) {
    preds.get(d.successorId)!.push(d);
    succs.get(d.predecessorId)!.push(d);
  }

  const result = new Map<string, CpmResult>();
  for (const t of leaves) result.set(t.id, { es: 0, ef: 0, ls: 0, lf: 0, totalFloat: 0, freeFloat: 0, critical: false });

  // ---- Forward pass (topological with cycle guard) ----
  const visiting = new Set<string>();
  const done = new Set<string>();
  function forward(id: string): void {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    const r = result.get(id)!;
    let es = anchor;
    for (const p of preds.get(id)!) {
      forward(p.predecessorId);
      const pr = result.get(p.predecessorId)!;
      const lag = p.lagDays || 0;
      if (p.depType === "FS") es = Math.max(es, pr.ef + lag);
      else if (p.depType === "SS") es = Math.max(es, pr.es + lag);
      else if (p.depType === "SF") es = Math.max(es, pr.es + lag - dur.get(id)!);
      else if (p.depType === "FF") es = Math.max(es, anchor);
    }
    r.es = es;
    r.ef = es + dur.get(id)!;
    // FF constraints: successor EF must satisfy predecessor EF + lag
    for (const p of preds.get(id)!) {
      if (p.depType === "FF") {
        forward(p.predecessorId);
        const pr = result.get(p.predecessorId)!;
        const need = pr.ef + (p.lagDays || 0);
        if (r.ef < need) { r.ef = need; r.es = r.ef - dur.get(id)!; }
      }
    }
    visiting.delete(id);
    done.add(id);
  }
  for (const t of leaves) forward(t.id);

  let projectFinish = 0;
  for (const r of result.values()) projectFinish = Math.max(projectFinish, r.ef);
  if (!projectFinish) projectFinish = anchor;

  // ---- Backward pass ----
  const doneB = new Set<string>();
  const visitingB = new Set<string>();
  function backward(id: string): void {
    if (doneB.has(id) || visitingB.has(id)) return;
    visitingB.add(id);
    const r = result.get(id)!;
    let lf = projectFinish;
    let lfSet = succs.get(id)!.length === 0;
    for (const s of succs.get(id)!) {
      backward(s.successorId);
      const sr = result.get(s.successorId)!;
      const lag = s.lagDays || 0;
      let cand: number;
      if (s.depType === "FS") cand = sr.ls - lag;
      else if (s.depType === "SS") cand = sr.ls - lag + dur.get(id)!;
      else if (s.depType === "FF") cand = sr.lf - lag;
      else cand = sr.lf - lag + dur.get(id)!; // SF
      lf = lfSet ? cand : Math.min(lf, cand);
      lfSet = true;
    }
    r.lf = lf;
    r.ls = lf - dur.get(id)!;
    r.totalFloat = Math.max(0, r.ls - r.es);
    let ff = succs.get(id)!.length ? Number.POSITIVE_INFINITY : projectFinish - r.ef;
    for (const s of succs.get(id)!) {
      if (s.depType === "FS") {
        const sr = result.get(s.successorId)!;
        ff = Math.min(ff, sr.es - r.ef - (s.lagDays || 0));
      }
    }
    r.freeFloat = Math.max(0, isFinite(ff) ? ff : 0);
    r.critical = r.totalFloat <= 0.001;
    visitingB.delete(id);
    doneB.add(id);
  }
  for (const t of leaves) backward(t.id);

  // ---- Summary rollup ----
  for (const s of tasks.filter((t) => t.isSummary)) {
    const kids = collectDescendants(s.id, tasks);
    const rs = kids.map((k) => result.get(k.id)).filter(Boolean) as CpmResult[];
    if (rs.length) {
      const es = Math.min(...rs.map((r) => r.es));
      const ef = Math.max(...rs.map((r) => r.ef));
      result.set(s.id, {
        es, ef, ls: es, lf: ef,
        totalFloat: Math.min(...rs.map((r) => r.totalFloat)),
        freeFloat: 0,
        critical: rs.some((r) => r.critical),
      });
    }
  }
  return result;
}

function collectDescendants(id: string, tasks: CpmTaskInput[]): CpmTaskInput[] {
  const out: CpmTaskInput[] = [];
  const walk = (pid: string) => {
    for (const t of tasks) if (t.parentId === pid) { out.push(t); walk(t.id); }
  };
  walk(id);
  return out;
}

/** Day-number → Date (UTC epoch-day). */
export function dayToDate(n: number): Date {
  return fromDayNum(n);
}
