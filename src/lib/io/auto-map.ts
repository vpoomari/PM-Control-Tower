// PM CONTROL TOWER — CSV auto-mapping. Given the headers of an arbitrary CSV and the
// column sets of the importable entities (src/lib/io/entities), detect which entity the
// file most likely targets and map every header to that entity's canonical column key.
// Pure functions, DB-free: unit-tested in tests/engines/auto-map.test.ts and used by
// the "Data Importing and Exporting" hub (src/views/io).

export interface ColumnMeta {
  key: string;
  label: string;
}

export interface EntityMeta {
  key: string;
  label: string;
  columns: ColumnMeta[];
}

export type MatchConfidence = "strong" | "weak";

export interface HeaderMatch {
  header: string;                 // original CSV header text
  columnKey: string | null;       // canonical column key in the chosen entity (null = unmapped)
  confidence: MatchConfidence | null;
}

export interface Detection {
  entity: string;                // best entity key (non-null — see return null below)
  entityLabel: string;
  score: number;                 // strong=3, weak=1 summed over headers
  runnerUp: { key: string; score: number } | null;
  matches: HeaderMatch[];
  mappedCount: number;
  strongCount: number;
}

/** Lowercase and strip everything that is not a letter or digit. */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Generic synonyms: normalized CSV header → normalized column key. Deliberately
// small and unambiguous — anything riskier is left to the containment pass or to
// the user overriding the mapping in the UI.
const SYNONYMS: Record<string, string> = {
  id: "code",
  identifier: "code",
  ref: "code",
  reference: "code",
  title: "name",
};

interface ScoredColumn {
  key: string;
  confidence: MatchConfidence;
}

/** Best column for one header inside one entity's columns, or null. */
export function matchColumn(header: string, columns: ColumnMeta[]): ScoredColumn | null {
  const h = header.trim();
  const hn = normalizeHeader(h);
  if (!hn) return null;
  const hl = h.toLowerCase();

  // 1. exact key or label (case-insensitive)
  for (const c of columns) {
    if (c.key.toLowerCase() === hl) return { key: c.key, confidence: "strong" };
  }
  for (const c of columns) {
    if (c.label.toLowerCase() === hl) return { key: c.key, confidence: "strong" };
  }
  // 2. normalized equality, incl. the synonym table
  const synonymTarget = SYNONYMS[hn];
  for (const c of columns) {
    if (normalizeHeader(c.key) === hn || normalizeHeader(c.label) === hn) {
      return { key: c.key, confidence: "strong" };
    }
    if (synonymTarget && (normalizeHeader(c.key) === synonymTarget || normalizeHeader(c.label) === synonymTarget)) {
      return { key: c.key, confidence: "strong" };
    }
  }
  // 3. containment either way (both sides ≥ 4 chars) — e.g. "Project Code" → projectCode
  for (const c of columns) {
    const kn = normalizeHeader(c.key);
    if (kn.length >= 4 && hn.length >= 4 && (kn.includes(hn) || hn.includes(kn))) {
      return { key: c.key, confidence: "weak" };
    }
  }
  for (const c of columns) {
    const ln = normalizeHeader(c.label);
    if (ln.length >= 4 && hn.length >= 4 && (ln.includes(hn) || hn.includes(ln))) {
      return { key: c.key, confidence: "weak" };
    }
  }
  return null;
}

function scoreEntity(headers: string[], entity: EntityMeta): { score: number; strong: number; matches: HeaderMatch[] } {
  let score = 0;
  let strong = 0;
  const matches: HeaderMatch[] = [];
  for (const header of headers) {
    const m = matchColumn(header, entity.columns);
    if (!m) {
      matches.push({ header, columnKey: null, confidence: null });
      continue;
    }
    if (m.confidence === "strong") { score += 3; strong += 1; }
    else score += 1;
    matches.push({ header, columnKey: m.key, confidence: m.confidence });
  }
  return { score, strong, matches };
}

/**
 * Detect the target entity for a CSV and map every header to its columns.
 * `entities` should already be limited to the ones the session may import.
 * Ties are broken by entity key for determinism.
 */
export function detectEntityAndMap(headers: string[], entities: EntityMeta[]): Detection | null {
  let best: { entity: EntityMeta; score: number; strong: number; matches: HeaderMatch[] } | null = null;
  let runnerUp: { key: string; score: number } | null = null;

  for (const entity of [...entities].sort((a, b) => a.key.localeCompare(b.key))) {
    const { score, strong, matches } = scoreEntity(headers, entity);
    if (!best || score > best.score) {
      if (best) runnerUp = { key: best.entity.key, score: best.score };
      best = { entity, score, strong, matches };
    } else if (!runnerUp || score > runnerUp.score) {
      runnerUp = { key: entity.key, score };
    }
  }
  if (!best || best.score <= 0) return null;

  // best is non-null here and its score is positive, so entity/label are set.
  return {
    entity: best.entity.key,
    entityLabel: best.entity.label,
    score: best.score,
    runnerUp,
    matches: best.matches,
    mappedCount: best.matches.filter((m) => m.columnKey).length,
    strongCount: best.strong,
  };
}

/**
 * Re-map headers against a (possibly overridden) mapping while keeping the
 * detection's match metadata. Overridden headers become "strong" — the user
 * chose them. The sentinel "__ignore__" forces a column out of the import.
 * First header wins when two headers map to the same column, so the produced
 * rows never silently overwrite a value with a later column.
 */
export const IGNORE_SENTINEL = "__ignore__";

export function applyMapping(
  headers: string[],
  columns: ColumnMeta[],
  overrides: Record<string, string>
): { matches: HeaderMatch[]; duplicates: string[] } {
  const validKeys = new Set(columns.map((c) => c.key));
  const taken = new Set<string>();
  const matches: HeaderMatch[] = [];
  const duplicates: string[] = [];
  for (const header of headers) {
    const override = overrides[header];
    if (override === IGNORE_SENTINEL) {
      matches.push({ header, columnKey: null, confidence: null });
      continue;
    }
    if (override && validKeys.has(override)) {
      if (taken.has(override)) {
        duplicates.push(header);
        matches.push({ header, columnKey: null, confidence: null });
      } else {
        taken.add(override);
        matches.push({ header, columnKey: override, confidence: "strong" });
      }
      continue;
    }
    const m = matchColumn(header, columns);
    if (m && !taken.has(m.key)) {
      taken.add(m.key);
      matches.push({ header, columnKey: m.key, confidence: m.confidence });
    } else {
      matches.push({ header, columnKey: null, confidence: null });
    }
  }
  return { matches, duplicates };
}

/** Convert parsed CSV rows to canonical-keyed rows using the final mapping. */
export function mapRows(
  rows: Record<string, string>[],
  matches: HeaderMatch[]
): Record<string, string>[] {
  const mapping: Record<string, string> = {};
  for (const m of matches) {
    if (m.columnKey) mapping[m.header] = m.columnKey;
  }
  return rows
    .map((row) => {
      const out: Record<string, string> = {};
      for (const [header, value] of Object.entries(row)) {
        const key = mapping[header];
        if (key) out[key] = value;
      }
      return out;
    })
    .filter((r) => Object.values(r).some((v) => v !== ""));
}
