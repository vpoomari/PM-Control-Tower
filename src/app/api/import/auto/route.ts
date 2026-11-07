// PM CONTROL TOWER — POST /api/import/auto
// AI-assisted multi-dataset import: one CSV can describe several datasets at once.
//   1. Route every line to its dataset (src/lib/io/route-rows — parents first,
//      multi-block lines spawn the other datasets they fully describe).
//   2. Per-entity RBAC: datasets the session cannot manage are dropped (reported).
//   3. Linkage pre-flight (src/lib/io/linkage): every code/e-mail reference is
//      resolved against the pending batch + the database. Unresolved REQUIRED
//      references block apply — 200 + blocked:true + issues — so a broken link is
//      never written.
//   4. Validate runs the WHOLE batch in one transaction (runImportBatch) that is
//      rolled back at the end: parents insert with their real ids, children
//      resolve them in the same tx — the dry-run exercises exactly the apply
//      lookup path. Apply runs in IMPORT_ORDER (parents first), one transaction
//      per dataset, with the governed runImport — audit per dataset, one realtime
//      fan-out, so every tab refreshes (useApi listens for data:imported).

import { z } from "zod";
import { withApi, ok, ApiError, parseBody, writeAudit } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { emitRealtime } from "@/lib/realtime";
import { ENTITIES, getEntity, IMPORT_MAX_ROWS, runImport, runImportBatch, type EntityDef, type RowResult } from "@/lib/io/entities";
import { buildHeuristicPlan, type IoPlan } from "@/lib/io/model";
import { routeRows, buildPendingIndex, type RouteEntityMeta } from "@/lib/io/route-rows";
import { checkLinkage, type LinkageReport } from "@/lib/io/linkage";
import type { EntityMeta } from "@/lib/io/auto-map";

const planSchema = z.object({
  assignments: z.array(
    z.object({
      header: z.string(),
      targets: z.array(z.object({ entity: z.string(), column: z.string() })).max(20),
      via: z.enum(["heuristic", "ai", "manual"]).optional(),
    }),
  ).max(400),
  targets: z.array(z.string()).max(60).default([]),
  source: z.enum(["heuristic", "ai", "mixed"]).default("heuristic"),
  notes: z.array(z.string()).max(20).default([]),
});

const bodySchema = z.object({
  headers: z.array(z.string()).min(1).max(300),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(IMPORT_MAX_ROWS),
  plan: planSchema.optional(),
  mode: z.enum(["validate", "apply"]),
});

interface DatasetReport {
  entity: string;
  label: string;
  total: number;
  created: number;
  updated: number;
  failed: number;
  synthesized: number;         // rows spawned from a multi-block line
  results: RowResult[];        // row numbers remapped to original CSV lines
}

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const session = ctx.session;
  const body = await parseBody(ctx.req, bodySchema);

  // Importable metas — routing is data-driven over every importable dataset;
  // permissions are enforced right after routing, before anything is planned.
  const metas: RouteEntityMeta[] = Object.entries(ENTITIES)
    .filter(([, def]) => def.managePermission)
    .map(([key, def]) => ({
      key,
      label: def.label,
      columns: def.columns.map((c) => ({ key: c.key, label: c.label })),
    }));

  const plan: IoPlan = body.plan ?? buildHeuristicPlan(body.headers, metas as EntityMeta[]);
  const outcome = routeRows(body.headers, body.rows, plan, metas);

  // ---- Per-entity RBAC: drop datasets the session may not manage ----
  const allowed: typeof outcome.datasets = [];
  const skipped = [...outcome.skipped];
  for (const ds of outcome.datasets) {
    const def = ENTITIES[ds.entity];
    if (!def || !def.managePermission || !hasPermission(session, def.managePermission)) {
      skipped.push({
        line: ds.lines[0] ?? 0,
        reason: `Skipped ${ds.rows.length} ${ds.label} row(s): importing requires the “${def?.managePermission ?? "n/a"}” permission.`,
      });
      continue;
    }
    allowed.push(ds);
  }

  const emptyTotals = { rows: 0, created: 0, updated: 0, failed: 0 };
  if (!allowed.length) {
    return ok({
      mode: body.mode,
      runMode: body.mode,
      applied: false,
      blocked: false,
      aborted: null,
      plan,
      datasets: [] as DatasetReport[],
      linkage: { ok: true, errors: 0, warnings: 0, issues: [] } satisfies LinkageReport,
      skipped,
      totals: emptyTotals,
      note: outcome.datasets.length
        ? "No dataset in this file can be imported with your permissions."
        : "No rows could be routed to an importable dataset.",
    });
  }

  // ---- Linkage pre-flight (pending = the keys this batch will create) ----
  const pending = buildPendingIndex(allowed, metas);
  const linkage = await checkLinkage(allowed, metas, pending);
  const blocked = body.mode === "apply" && !linkage.ok;

  // Blocked applies still run a dry-run so the user sees exactly what WOULD happen.
  const runMode: "validate" | "apply" = body.mode === "apply" && !blocked ? "apply" : "validate";

  const datasets: DatasetReport[] = [];
  let aborted: string | null = null;

  // Registered entities only — allowed is already RBAC-filtered (belt and braces).
  const runnable: { ds: (typeof allowed)[number]; def: EntityDef }[] = [];
  for (const ds of allowed) {
    const def = getEntity(ds.entity);
    if (def) runnable.push({ ds, def });
  }

  // Validate: ONE transaction for the whole batch, no pending overlay — parents
  // insert with their real ids, children resolve them in the same tx, so the
  // dry-run exercises exactly the apply lookup path; a single rollback marker
  // at the end discards every write (the database is left untouched).
  let validated: RowResult[][] | null = null;
  if (runMode === "validate") {
    try {
      validated = await runImportBatch(
        runnable.map(({ def, ds }) => ({ def, rows: ds.rows })),
        session,
      );
    } catch (e) {
      // Infrastructure failure (finalize/timeout): the transaction rolled back,
      // nothing was written — report the abort with no per-dataset results.
      aborted = e instanceof Error ? e.message : "Import failed";
    }
  }

  // Apply: one transaction per dataset (runImport) — parents are already
  // committed (IMPORT_ORDER), an infrastructure failure stops the batch and the
  // completed datasets stay committed.
  for (let idx = 0; aborted === null && idx < runnable.length; idx += 1) {
    const { ds, def } = runnable[idx];
    let results: RowResult[];
    if (validated) {
      results = validated[idx];
    } else {
      try {
        ({ results } = await runImport(def, ds.rows, session, "apply"));
      } catch (e) {
        aborted = e instanceof Error ? e.message : "Import failed";
        break;
      }
    }
    // runImport numbers rows inside its own dataset (i → i+2); map back to the file.
    const remapped: RowResult[] = results.map((r, i) => ({ ...r, row: ds.lines[i] ?? r.row }));
    const created = remapped.filter((r) => r.action === "created").length;
    const updated = remapped.filter((r) => r.action === "updated").length;
    const failed = remapped.filter((r) => r.action === "error").length;
    datasets.push({
      entity: ds.entity,
      label: def.label,
      total: remapped.length,
      created,
      updated,
      failed,
      synthesized: ds.spawnedCount,
      results: remapped,
    });

    if (runMode === "apply" && (created > 0 || updated > 0)) {
      void writeAudit({
        userId: session.id, userName: session.name, role: session.roles?.[0] ?? null,
        action: "IMPORT", entityType: ds.entity, entityId: null, entityName: def.label,
        after: { created, updated, failed },
        context: `Auto import (multi-dataset): ${created} created, ${updated} updated, ${failed} failed`,
        severity: failed ? "WARNING" : "INFO",
        ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
      });
    }
  }

  const totals = {
    rows: datasets.reduce((a, d) => a + d.total, 0),
    created: datasets.reduce((a, d) => a + d.created, 0),
    updated: datasets.reduce((a, d) => a + d.updated, 0),
    failed: datasets.reduce((a, d) => a + d.failed, 0),
  };

  const applied = runMode === "apply" && !aborted;
  if (applied && (totals.created > 0 || totals.updated > 0)) {
    // One fan-out for the whole batch: every mounted tab silently re-reads its data.
    emitRealtime("data:imported", {
      datasets: datasets.map((d) => ({ entity: d.entity, created: d.created, updated: d.updated })),
      created: totals.created,
      updated: totals.updated,
      failed: totals.failed,
      by: session.name,
    });
  }

  return ok({
    mode: body.mode,
    runMode,
    applied,
    blocked,
    aborted,
    plan,
    datasets,
    linkage,
    skipped,
    totals,
  });
}, { rateLimit: { limit: 20, windowMs: 60_000 } });
