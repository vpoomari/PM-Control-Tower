// PM CONTROL TOWER — AI import/export model: import dependency order, the cross-entity
// linkage graph, required/business-key columns, plan types and the heuristic plan that
// serves as the instant (AI-free) baseline. Pure and DB-free on purpose — the same code
// runs in the browser (import hub preview), on the server (plan/import/export routes)
// and in unit tests (tests/engines/io-routing.test.ts).

import { matchColumn, normalizeHeader, type EntityMeta } from "./auto-map";

// ---- Import dependency order (parents first) -------------------------------
// Every entity a session may import (has a managePermission). Apply order = this
// order, so codes/emails a row references always exist before the row is written.

export const IMPORT_ORDER: string[] = [
  "users",
  "portfolios",
  "programs",
  "projects",
  "wbs-nodes",
  "resources",
  "requirements",
  "tasks",
  "milestones",
  "risks",
  "issues",
  "assumptions",
  "changes",
  "budget-lines",
];

// ---- Cross-entity linkage graph -------------------------------------------
// A row's value in `column` (canonical column KEY) must resolve to an existing
// row of `target` — in the database or in this same import batch. `required`
// refs unresolved at apply time BLOCK the whole batch (a broken link would be
// written otherwise); optional refs only fail their own row (the applyRow lookup
// throws, the row is reported as an error, nothing dangling is ever written).

export interface LinkRef {
  column: string;   // canonical column KEY of the referencing column
  target: string;   // entity key being referenced
  required: boolean;
}

export const LINKAGE_REFS: Record<string, LinkRef[]> = {
  portfolios: [{ column: "ownerEmail", target: "users", required: false }],
  programs: [
    { column: "portfolioCode", target: "portfolios", required: true },
    { column: "ownerEmail", target: "users", required: false },
  ],
  projects: [
    { column: "portfolioCode", target: "portfolios", required: false },
    { column: "programCode", target: "programs", required: false },
    { column: "ownerEmail", target: "users", required: false },
  ],
  "wbs-nodes": [{ column: "projectCode", target: "projects", required: true }],
  requirements: [{ column: "projectCode", target: "projects", required: true }],
  tasks: [
    { column: "projectCode", target: "projects", required: true },
    { column: "assigneeEmail", target: "users", required: false },
  ],
  milestones: [{ column: "projectCode", target: "projects", required: true }],
  risks: [{ column: "projectCode", target: "projects", required: true }],
  issues: [{ column: "projectCode", target: "projects", required: true }],
  assumptions: [{ column: "projectCode", target: "projects", required: true }],
  changes: [{ column: "projectCode", target: "projects", required: true }],
  "budget-lines": [{ column: "projectCode", target: "projects", required: true }],
  resources: [],
  users: [],
};

// ---- Required + business-key columns (canonical column KEYS) ---------------
// Mirrors the `required(row, …)` calls and parent lookups inside every applyRow:
// a row missing any of these would fail, so routing uses this set to decide which
// dataset a line can possibly belong to.

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: ["email", "name"],
  portfolios: ["code", "name"],
  programs: ["code", "name", "portfolioCode"],
  projects: ["code", "name"],
  "wbs-nodes": ["projectCode", "code", "name"],
  resources: ["employeeCode", "name", "email"],
  requirements: ["projectCode", "reqCode", "title"],
  tasks: ["projectCode", "code", "name"],
  milestones: ["projectCode", "code", "name"],
  risks: ["projectCode", "code", "title"],
  issues: ["projectCode", "code", "title"],
  assumptions: ["projectCode", "code", "description"],
  changes: ["projectCode", "code", "title"],
  "budget-lines": ["projectCode", "name"],
};

/** Business key per entity — dedupe + pending-linkage identity for a batch. */
export const KEY_COLUMN: Record<string, string> = {
  users: "email",
  portfolios: "code",
  programs: "code",
  projects: "code",
  "wbs-nodes": "code",
  resources: "employeeCode",
  requirements: "reqCode",
  tasks: "code",
  milestones: "code",
  risks: "code",
  issues: "code",
  assumptions: "code",
  changes: "code",
  "budget-lines": "name",
};

/**
 * Distinctive noun per entity (singular, lowercase). A CSV header that STARTS
 * with this word ("Project Code", "Task Name") is strong evidence that the line
 * also describes that dataset — it drives multi-dataset row spawning and keeps
 * generic headers ("Code", "Name") from leaking a row into a look-alike entity.
 */
export const ENTITY_WORD: Record<string, string> = {
  users: "user",
  portfolios: "portfolio",
  programs: "program",
  projects: "project",
  "wbs-nodes": "wbs",
  resources: "resource",
  requirements: "requirement",
  tasks: "task",
  milestones: "milestone",
  risks: "risk",
  issues: "issue",
  assumptions: "assumption",
  changes: "change",
  "budget-lines": "budget",
};

/** True when the header leads with the entity's distinctive word. */
export function headerHitsWord(header: string, entity: string): boolean {
  const word = ENTITY_WORD[entity];
  if (!word) return false;
  return normalizeHeader(header).startsWith(word);
}

// ---- Plan types (shared by the plan route, the import route and the UI) ----

export interface PlanTarget {
  entity: string;   // entity key
  column: string;   // canonical column KEY inside that entity
}

export interface PlanAssign {
  header: string;
  /** Ordered most-likely-first. Empty = the column is ignored. */
  targets: PlanTarget[];
  /** Who produced this mapping (UI chips render it). */
  via?: "heuristic" | "ai" | "manual";
}

export interface IoPlan {
  assignments: PlanAssign[];
  /** Dataset keys believed to be in the file, most likely first (tie-break). */
  targets: string[];
  source: "heuristic" | "ai" | "mixed";
  notes: string[];
}

export function emptyPlan(): IoPlan {
  return { assignments: [], targets: [], source: "heuristic", notes: [] };
}

/** Look up one header's ordered targets inside a plan. */
export function targetsFor(plan: IoPlan, header: string): PlanTarget[] {
  return plan.assignments.find((a) => a.header === header)?.targets ?? [];
}

// ---- Heuristic baseline plan ----------------------------------------------
// Instant and AI-free: every header is matched against every importable dataset's
// column set (exact → synonym → containment, via auto-map). Candidates are ordered
// strong-first, then by the dataset's overall score. This is what the UI shows in
// the first millisecond; the AI plan route refines it when the provider answers.

const WORD_BONUS = 6; // weight added when the header carries the dataset's word

export function buildHeuristicPlan(headers: string[], entities: EntityMeta[]): IoPlan {
  const scored = entities.map((e) => {
    let score = 0;
    for (const h of headers) {
      const m = matchColumn(h, e.columns);
      if (m) score += m.confidence === "strong" ? 3 : 1;
    }
    return { e, score };
  });
  const order = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.key.localeCompare(b.e.key));
  const orderIndex = new Map(order.map((x, i) => [x.e.key, i]));

  const assignments: PlanAssign[] = headers.map((h) => {
    const cands: { t: PlanTarget; strong: boolean; oi: number }[] = [];
    for (const { e, score } of scored) {
      if (score <= 0) continue;
      const m = matchColumn(h, e.columns);
      if (m) {
        cands.push({
          t: { entity: e.key, column: m.key },
          strong: m.confidence === "strong",
          oi: orderIndex.get(e.key) ?? 999,
        });
      }
    }
    cands.sort((a, b) => Number(b.strong) - Number(a.strong) || a.oi - b.oi);
    return { header: h, targets: cands.map((c) => c.t), via: "heuristic" };
  });

  return {
    assignments,
    targets: order.map((x) => x.e.key),
    source: "heuristic",
    notes: order.length
      ? [`Heuristic: ${order.length} dataset(s) match these columns; most likely ${order[0].e.label}.`]
      : ["Heuristic: no dataset matches these columns — map fields manually or let AI try."],
  };
}

/**
 * Canonical form of a business key for linkage identity — MUST mirror how the
 * applyRow lookups query: user e-mails are trimmed + lowercased (userByEmail),
 * codes are trimmed and case-sensitive (…ByCode / required()).
 */
export function pendingKeyOf(entity: string, raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return entity === "users" ? s.toLowerCase() : s;
}

/**
 * Score weight of one column inside an entity's row: business key > required >
 * cross-reference > ordinary field, plus a bonus when the header names the
 * dataset (or the referenced dataset) explicitly.
 */
export function columnWeight(entity: string, column: string, header: string): number {
  const link = (LINKAGE_REFS[entity] ?? []).find((r) => r.column === column);
  let w = 1;
  if (KEY_COLUMN[entity] === column) w = 4;
  else if ((REQUIRED_COLUMNS[entity] ?? []).includes(column)) w = 3;
  else if (link) w = 2;
  if (headerHitsWord(header, entity) || (link && headerHitsWord(header, link.target))) w += WORD_BONUS;
  return w;
}
