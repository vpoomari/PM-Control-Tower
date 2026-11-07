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
  /** Calendar-space compact index (legacy path: absolute epoch day). Explicit start anchor for disconnected tasks. */
  seedDay?: number | null;
  /** Same space. Explicit finish anchor for disconnected tasks (honors manually planned finishes). */
  endSeedDay?: number | null;
  /** Working-index units (computed by caller through WorkingIndex) */  constraintType?: string | null; // ASAP | ALAP | MSO | SNET | SNLT | FNET | FNLT
  constraintDay?: number | null;
  deadlineDay?: number | null;
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
  /** Unresolvable constraint conflict in days (lf < es + duration). 0 = none. */
  violationDays?: number;
  /** Set when a task has a deadline and its early finish lands after it. */
  deadlineBreach?: boolean;
}

const CONSTRAINT_FORWARD = new Set(["SNET", "MSO", "FNET"]);

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
  const netEs = new Map<string, number>(); // early start demanded by the network alone
  function forward(id: string): void {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    const r = result.get(id)!;
    const me = leaves.find((t) => t.id === id)!;
    const cd = me.constraintDay ?? null;
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
    netEs.set(id, es);
    // Manually seeded starts are honored for disconnected tasks (no predecessors):
    // keeps imported/source plans anchored to their explicit dates instead of
    // collapsing every orphan onto the project anchor. Constraint clamps below may
    // still pull the task later (netEs above stays network-pure for MSO conflicts).
    const seed = me.seedDay ?? (me.startDate ? dayNum(me.startDate) : null);
    if (preds.get(id)!.length === 0 && seed !== null && Number.isFinite(seed)) es = Math.max(es, seed);
    r.es = es;
    r.ef = es + dur.get(id)!;
    if (cd !== null && CONSTRAINT_FORWARD.has(me.constraintType ?? "")) {
      if (me.constraintType === "FNET") es = Math.max(es, cd - dur.get(id)!);
      else if (me.constraintType === "MSO") es = cd; // must-start-on is absolute
      else es = Math.max(es, cd); // SNET
    }
    r.es = es;
    r.ef = es + dur.get(id)!;
    // Manually planned finishes are honored for disconnected tasks (wins over duration
    // math, loses to explicit constraints which were applied just above).
    const efSeed = me.endSeedDay ?? null;
    if (preds.get(id)!.length === 0 && efSeed !== null && Number.isFinite(efSeed) && efSeed > r.ef) r.ef = efSeed;
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
    const me = leaves.find((t) => t.id === id)!;
    const cd = me.constraintDay ?? null;
    const ctype = me.constraintType ?? "";
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

    // Finish/late-start driven constraints tighten the backward pass
    if (cd !== null) {
      if (ctype === "FNLT" || ctype === "SNLT") lf = Math.min(lf, ctype === "FNLT" ? cd : cd + dur.get(id)!);
      if (ctype === "MSO") lf = cd + dur.get(id)!; // must-start-on locks the finish
      if (ctype === "ALAP") lf = Math.min(lf, projectFinish);
    } else if (ctype === "ALAP") lf = Math.min(lf, projectFinish);

    r.lf = lf;
    r.ls = lf - dur.get(id)!;
    r.totalFloat = Math.max(0, r.ls - r.es);
    // Constraint conflict detector — only meaningful for genuinely constrained tasks
    // (SS/FF networks legitimately allow lf < ef on an unconstrained task).
    // Late-side conflict: the clamp cannot contain the duration (lf < es+dur).
    // Early-side conflict (MSO): the network demands a start later than the lock.
    let viol = 0;
    if (cd !== null && ctype !== "ALAP") {
      viol = (r.es + dur.get(id)!) - r.lf;
      if (ctype === "MSO") viol = Math.max(viol, (netEs.get(id) ?? 0) - cd);
    }
    r.violationDays = viol > 0 ? Math.ceil(viol) : 0;
    r.deadlineBreach = (me.deadlineDay ?? null) !== null ? r.ef > (me.deadlineDay as number) + 0.001 : false;
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
        violationDays: Math.max(0, ...rs.map((r) => r.violationDays ?? 0)),
        deadlineBreach: rs.some((r) => r.deadlineBreach),
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
