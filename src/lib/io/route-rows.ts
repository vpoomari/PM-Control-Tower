// PM CONTROL TOWER — Multi-dataset CSV routing. One dropped file can describe several
// datasets at once ("Portfolio Code, Portfolio Name, Program Code, … Task Name"): every
// line is scored against the importable datasets, its PRIMARY dataset is chosen, and any
// other dataset the line describes in full (every required column named by that dataset's
// own word — e.g. "Project Code" + "Project Name") is spawned as an additional row. Rows
// are translated to the label-keyed shape every applyRow reads, and each row remembers the
// original CSV line so results map straight back to the file. Pure and DB-free: unit
// tested in tests/engines/io-routing.test.ts, run in the browser (live preview) and on
// the server (POST /api/import/auto — the server re-routes, it never trusts the client).

import {
  IMPORT_ORDER, KEY_COLUMN, LINKAGE_REFS, REQUIRED_COLUMNS,
  columnWeight, headerHitsWord, pendingKeyOf, targetsFor,
  type IoPlan, type PlanTarget,
} from "./model";

export interface RouteEntityMeta {
  key: string;
  label: string;
  columns: { key: string; label: string }[];
}

export interface RoutedDataset {
  entity: string;
  label: string;
  rows: Record<string, string>[];  // label-keyed, exactly what applyRow expects
  lines: number[];                 // original 1-based CSV line per row (header = 1)
  spawnedCount: number;            // rows whose line's primary dataset is elsewhere
  keys: string[];                  // business key per row (normalized, see pendingKeyOf)
}

export interface RouteOutcome {
  /** In IMPORT_ORDER — parents first — so callers can apply without re-sorting. */
  datasets: RoutedDataset[];
  skipped: { line: number; reason: string }[];
  routed: number;                  // lines with a primary dataset
}

/** Best header per column of one entity for one row. */
interface CellPick {
  hi: number;                      // header index in the file
  word: boolean;                   // header names this dataset (or its reference target)
}

function labelOf(meta: RouteEntityMeta, column: string): string | null {
  return meta.columns.find((c) => c.key === column)?.label ?? null;
}

export function routeRows(
  headers: string[],
  rows: Record<string, string>[],
  plan: IoPlan,
  entities: RouteEntityMeta[],
): RouteOutcome {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const orderIdx = new Map(IMPORT_ORDER.map((k, i) => [k, i]));
  const planIdx = new Map(plan.targets.map((k, i) => [k, i]));
  const perHeader = new Map<string, PlanTarget[]>();
  for (const a of plan.assignments) if (!perHeader.has(a.header)) perHeader.set(a.header, a.targets);

  const datasets = new Map<string, RoutedDataset & { keySet: Set<string> }>();
  const skipped: { line: number; reason: string }[] = [];
  let routed = 0;

  const datasetOf = (entity: string) => {
    let ds = datasets.get(entity);
    if (!ds) {
      const meta = byKey.get(entity);
      if (!meta) return null;
      ds = { entity, label: meta.label, rows: [], lines: [], spawnedCount: 0, keys: [], keySet: new Set() };
      datasets.set(entity, ds);
    }
    return ds;
  };

  for (let i = 0; i < rows.length; i += 1) {
    const line = i + 2; // header is line 1
    const row = rows[i];
    if (headers.every((h) => (row[h] ?? "").trim() === "")) {
      skipped.push({ line, reason: "Empty row (no values)." });
      continue;
    }

    // -- Per entity: the best filled header per column it maps to ------------
    const perEntity = new Map<string, { picks: Map<string, CellPick>; score: number }>();
    for (const meta of entities) {
      const picks = new Map<string, CellPick>();
      let score = 0;
      for (let hi = 0; hi < headers.length; hi += 1) {
        const header = headers[hi];
        if ((row[header] ?? "").trim() === "") continue;
        for (const t of targetsFor(plan, header)) {
          if (t.entity !== meta.key) continue;
          const link = (LINKAGE_REFS[meta.key] ?? []).find((r) => r.column === t.column);
          const word = headerHitsWord(header, meta.key)
            || Boolean(link && headerHitsWord(header, link.target));
          const existing = picks.get(t.column);
          if (!existing || (word && !existing.word)) picks.set(t.column, { hi, word });
        }
      }
      for (const [column, pick] of picks) score += columnWeight(meta.key, column, headers[pick.hi]);
      perEntity.set(meta.key, { picks, score });
    }

    // -- Primary dataset: every required column filled, highest score ---------
    const required = (key: string) => REQUIRED_COLUMNS[key] ?? [];
    let primary: { key: string; score: number } | null = null;
    let bestPartial: { key: string; covered: number; score: number } | null = null;
    for (const [key, { picks, score }] of perEntity) {
      const coveredCount = required(key).filter((c) => picks.has(c)).length;
      const eligible = coveredCount === required(key).length && required(key).length > 0;
      if (eligible) {
        if (
          !primary
          || score > primary.score
          || (score === primary.score && (planIdx.get(key) ?? 999) < (planIdx.get(primary.key) ?? 999))
          || (score === primary.score
            && (planIdx.get(key) ?? 999) === (planIdx.get(primary.key) ?? 999)
            && (orderIdx.get(key) ?? 999) < (orderIdx.get(primary.key) ?? 999))
        ) {
          primary = { key, score };
        }
      }
      if (
        !bestPartial
        || coveredCount > bestPartial.covered
        || (coveredCount === bestPartial.covered && score > bestPartial.score)
      ) {
        bestPartial = { key, covered: coveredCount, score };
      }
    }

    if (!primary) {
      if (bestPartial) {
        const meta = byKey.get(bestPartial.key);
        const missing = required(bestPartial.key)
          .filter((c) => !perEntity.get(bestPartial.key)!.picks.has(c))
          .map((c) => (meta ? (labelOf(meta, c) ?? c) : c));
        skipped.push({
          line,
          reason: `No dataset can take this row — closest match “${meta?.label ?? bestPartial.key}” is missing: ${missing.join(", ")}.`,
        });
      } else {
        skipped.push({ line, reason: "No mapped column matches any importable dataset." });
      }
      continue;
    }
    routed += 1;

    // -- Spawn: datasets this line describes in full, named by their own word -
    const spawnKeys = new Set<string>([primary.key]);
    for (const [key, { picks }] of perEntity) {
      if (spawnKeys.has(key)) continue;
      const req = required(key);
      if (req.length === 0) continue;
      // Full word-coverage: every required column comes from a header that names
      // this dataset (or the dataset it references) — generic headers like a bare
      // "Name" never leak a row into a look-alike dataset.
      if (req.every((c) => picks.get(c)?.word)) spawnKeys.add(key);
    }

    // -- Translate every chosen dataset into label-keyed rows -----------------
    for (const key of spawnKeys) {
      const meta = byKey.get(key)!;
      const picks = perEntity.get(key)!.picks;
      const out: Record<string, string> = {};
      for (const [column, pick] of picks) {
        const label = labelOf(meta, column);
        if (label) out[label] = row[headers[pick.hi]] ?? "";
      }
      const ds = datasetOf(key)!;
      const keyLabel = labelOf(meta, KEY_COLUMN[key]);
      const bizKey = pendingKeyOf(key, keyLabel ? (out[keyLabel] ?? "") : "");
      if (!bizKey) continue; // unreachable: key ∈ required for every entity
      const spawned = key !== primary.key;
      if (spawned && ds.keySet.has(bizKey)) continue; // parent block repeats per row
      ds.rows.push(out);
      ds.lines.push(line);
      ds.keys.push(bizKey);
      ds.keySet.add(bizKey);
      if (spawned) ds.spawnedCount += 1;
    }
  }

  const ordered: RoutedDataset[] = [];
  for (const key of IMPORT_ORDER) {
    const ds = datasets.get(key);
    if (ds) {
      const { keySet: _drop, ...rest } = ds;
      ordered.push(rest);
    }
  }
  return { datasets: ordered, skipped, routed };
}

// ---- Pending-linkage index -------------------------------------------------
// Every business key THIS import will create, per dataset. checkLinkage (the
// apply pre-flight) resolves every routed reference against these keys AND the
// database: a reference into this batch passes, one into nowhere blocks apply.
// Pure bookkeeping — no query path ever reads a stub or writes a synthetic id;
// dry-runs insert real rows inside the transaction runImportBatch rolls back.

export interface PendingStub {
  id: string;
  code?: string;
  name?: string;
  email?: string;
}

export interface PendingIndex {
  keys: Map<string, Map<string, PendingStub>>;
}

export function buildPendingIndex(
  datasets: RoutedDataset[],
  entities: RouteEntityMeta[],
): PendingIndex {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const keys = new Map<string, Map<string, PendingStub>>();
  for (const ds of datasets) {
    const meta = byKey.get(ds.entity);
    if (!meta) continue;
    let m = keys.get(ds.entity);
    if (!m) { m = new Map(); keys.set(ds.entity, m); }
    const nameLabel = labelOf(meta, "name");
    for (let i = 0; i < ds.rows.length; i += 1) {
      const key = ds.keys[i];
      if (!key || m.has(key)) continue;
      const stub: PendingStub = { id: `__pmct_pending__:${ds.entity}:${key}` };
      if (ds.entity === "users") stub.email = key;
      else stub.code = key;
      if (nameLabel) stub.name = ds.rows[i][nameLabel] || key;
      m.set(key, stub);
    }
  }
  return { keys };
}
