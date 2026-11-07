// PM CONTROL TOWER — Cross-entity linkage safety for the AI auto-import.
//
// checkLinkage (pre-flight) keeps code/e-mail references intact across a
// multi-dataset import: every reference in every routed row is resolved against
// the pending keys (the business keys THIS batch will create, see
// buildPendingIndex) AND the database. A REQUIRED reference that resolves
// nowhere blocks apply (200 + blocked) so a broken link can never be written;
// optional references become warnings and fail only their own row at apply time.
//
// Dry-runs never simulate parents with synthetic ids: /api/import/auto validates
// the whole batch inside one real transaction that is rolled back at the end
// (runImportBatch in shared.ts), so parent lookups read rows the batch itself
// inserted — the exact lookup path apply uses.
//
// Server-only (imports db). The pure pieces live in route-rows.ts / model.ts.

import { db } from "@/lib/db";
import { LINKAGE_REFS, pendingKeyOf } from "./model";
import type { PendingIndex, RoutedDataset, RouteEntityMeta } from "./route-rows";

// ---- Pre-flight reference check --------------------------------------------

export interface LinkageIssue {
  severity: "error" | "warning";
  entity: string;             // dataset whose rows carry the reference
  entityLabel: string;
  column: string;             // column LABEL (what the user sees)
  value: string;              // normalized reference value
  target: string;
  targetLabel: string;
  lines: number[];            // original CSV lines affected (capped at 10)
}

export interface LinkageReport {
  ok: boolean;                // no error-severity issues
  errors: number;
  warnings: number;
  issues: LinkageIssue[];
}

function labelOf(meta: RouteEntityMeta, column: string): string | null {
  return meta.columns.find((c) => c.key === column)?.label ?? null;
}

interface RefHit {
  entity: string;
  label: string;
  ref: (typeof LINKAGE_REFS)[string][number];
  value: string;              // normalized (pendingKeyOf semantics)
  line: number;
}

export async function checkLinkage(
  datasets: RoutedDataset[],
  entities: RouteEntityMeta[],
  pending: PendingIndex,
): Promise<LinkageReport> {
  const byKey = new Map(entities.map((e) => [e.key, e]));

  // 1. Collect every reference, normalized exactly like the applyRow lookups do.
  const hits: RefHit[] = [];
  for (const ds of datasets) {
    const meta = byKey.get(ds.entity);
    if (!meta) continue;
    for (const ref of LINKAGE_REFS[ds.entity] ?? []) {
      const label = labelOf(meta, ref.column);
      if (!label) continue;
      for (let i = 0; i < ds.rows.length; i += 1) {
        const raw = (ds.rows[i][label] ?? "").trim();
        if (!raw) continue;
        const value = pendingKeyOf(ref.target, raw);
        if (value) hits.push({ entity: ds.entity, label, ref, value, line: ds.lines[i] });
      }
    }
  }

  // 2. Batch-resolve against the database (one query per referenced dataset).
  const byTarget = new Map<string, Set<string>>();
  for (const h of hits) {
    let s = byTarget.get(h.ref.target);
    if (!s) { s = new Set(); byTarget.set(h.ref.target, s); }
    s.add(h.value);
  }
  const found = new Map<string, Set<string>>();
  await Promise.all([...byTarget.entries()].map(async ([target, values]) => {
    const list = [...values];
    if (!list.length) return;
    let strings: string[] = [];
    if (target === "users") {
      const rows = await db.user.findMany({ where: { email: { in: list } }, select: { email: true } });
      strings = rows.map((r) => r.email);
    } else if (target === "portfolios") {
      const rows = await db.portfolio.findMany({ where: { code: { in: list } }, select: { code: true } });
      strings = rows.map((r) => r.code);
    } else if (target === "programs") {
      const rows = await db.program.findMany({ where: { code: { in: list } }, select: { code: true } });
      strings = rows.map((r) => r.code);
    } else if (target === "projects") {
      const rows = await db.project.findMany({ where: { code: { in: list } }, select: { code: true } });
      strings = rows.map((r) => r.code);
    } else if (target === "resources") {
      const rows = await db.resource.findMany({ where: { email: { in: list } }, select: { email: true } });
      strings = rows.map((r) => r.email);
    }
    found.set(target, new Set(strings));
  }));

  // 3. Unresolved → issues (deduped per dataset/column/value, lines aggregated).
  const issueMap = new Map<string, LinkageIssue>();
  for (const h of hits) {
    const inPending = pending.keys.get(h.ref.target)?.has(h.value) ?? false;
    const inDb = found.get(h.ref.target)?.has(h.value) ?? false;
    if (inPending || inDb) continue;
    const entityMeta = byKey.get(h.entity);
    const targetMeta = byKey.get(h.ref.target);
    const id = `${h.entity}|${h.label}|${h.value}|${h.ref.required ? "error" : "warning"}`;
    let issue = issueMap.get(id);
    if (!issue) {
      issue = {
        severity: h.ref.required ? "error" : "warning",
        entity: h.entity,
        entityLabel: entityMeta?.label ?? h.entity,
        column: h.label,
        value: h.value,
        target: h.ref.target,
        targetLabel: targetMeta?.label ?? h.ref.target,
        lines: [],
      };
      issueMap.set(id, issue);
    }
    if (issue.lines.length < 10 && !issue.lines.includes(h.line)) issue.lines.push(h.line);
  }

  const issues = [...issueMap.values()].sort(
    (a, b) => (a.severity === b.severity ? a.entity.localeCompare(b.entity) : a.severity === "error" ? -1 : 1),
  );
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  return { ok: errors === 0, errors, warnings, issues };
}
