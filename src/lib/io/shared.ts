// PM CONTROL TOWER — Import/Export framework: entity contracts, lookup helpers and the
// transactional import runner. One registry drives /api/export/[entity] and /api/import/[entity].

import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import type { CsvColumn } from "@/lib/csv";
import { dateStr, isoStr } from "@/lib/csv";
import type { Prisma } from "@prisma/client";

export interface RowResult {
  row: number;                                   // 1-based data row number (as in the CSV)
  key: string;                                   // business key (code/email)
  action: "created" | "updated" | "error";
  name?: string;
  message?: string;
}

export interface ExportContext {
  projectId?: string | null;
  ownResourceId?: string | null;                 // timesheets: restrict to own rows
  scopeAll: boolean;
}

export interface EntityDef {
  label: string;                                 // human name for buttons/toasts
  viewPermission: string;                        // required to export
  managePermission?: string;                     // required to import; absent = export-only
  columns: CsvColumn[];                          // ALL fields, in export order
  example: Record<string, string>;               // template sample row
  exportRows: (ctx: ExportContext) => Promise<Record<string, unknown>[]>;
  applyRow: (tx: Prisma.TransactionClient, row: Record<string, string>, session: SessionUser) => Promise<{ action: "created" | "updated"; id: string; name: string }>;
  // Optional post-row pass (e.g. summary roll-ups) — runs inside the same transaction,
  // after every row, in both validate and apply modes. Throwing rolls everything back.
  finalize?: (tx: Prisma.TransactionClient, rows: Record<string, string>[]) => Promise<void>;
}

// ---- Shared lookup helpers (throw with human messages — surfaced per row) ----
// Every lookup reads the real database, in apply AND validate modes: dry-runs
// execute inside a real transaction that is rolled back at the end (runImport /
// runImportBatch), so a parent the batch itself inserts is visible to its
// children through ordinary read-your-writes — never through a synthetic id.
// An unresolved reference always throws instead of writing a dangling link.
// Return shapes are narrowed to the fields applyRow actually reads
// (id / code / name / email).

export async function portfolioByCode(
  tx: Prisma.TransactionClient,
  code: string | null
): Promise<{ id: string; code?: string; name?: string } | null> {
  if (!code) return null;
  const p = await tx.portfolio.findUnique({ where: { code } });
  if (!p) throw new Error(`Portfolio "${code}" not found`);
  return p;
}

export async function programByCode(
  tx: Prisma.TransactionClient,
  code: string | null
): Promise<{ id: string; code?: string; name?: string } | null> {
  if (!code) return null;
  const p = await tx.program.findUnique({ where: { code } });
  if (!p) throw new Error(`Program "${code}" not found`);
  return p;
}

export async function projectByCode(
  tx: Prisma.TransactionClient,
  code: string | null
): Promise<{ id: string; code?: string; name?: string }> {
  if (!code) throw new Error("ProjectCode is required");
  const p = await tx.project.findUnique({ where: { code } });
  if (!p) throw new Error(`Project "${code}" not found`);
  return p;
}

export async function userByEmail(
  tx: Prisma.TransactionClient,
  email: string | null
): Promise<{ id: string; email?: string } | null> {
  if (!email) return null;
  const key = email.trim().toLowerCase();
  const u = await tx.user.findUnique({ where: { email: key } });
  if (!u) throw new Error(`User "${email}" not found`);
  return u;
}

export async function resourceByEmail(
  tx: Prisma.TransactionClient,
  email: string | null
): Promise<{ id: string; email?: string } | null> {
  if (!email) return null;
  const key = email.trim().toLowerCase();
  const r = await tx.resource.findFirst({ where: { email: key } });
  if (!r) throw new Error(`Resource "${email}" not found — import resources first`);
  return r;
}

export function required(row: Record<string, string>, key: string, label?: string): string {
  const v = (row[key] ?? "").trim();
  if (!v) throw new Error(`${label ?? key} is required`);
  return v;
}

// ---- Import runner: one code path for validate (dry-run) and apply ----

interface RollbackMarker { __pmctRollback: true; results: RowResult[] }
interface BatchRollbackMarker { __pmctRollback: true; batches: RowResult[][] }

export const IMPORT_MAX_ROWS = 2000;

function keyOfRow(row: Record<string, string>): string {
  return row.code || row.Code || row.reqCode || row["Req Code"] || row.employeeCode || row["Employee Code"]
    || row.email || row.Email || row.name || row.Name || "";
}

/** Run every row of one dataset inside `tx`; row failures are reported, not thrown. */
async function runRows(
  tx: Prisma.TransactionClient,
  def: EntityDef,
  rows: Record<string, string>[],
  session: SessionUser,
): Promise<RowResult[]> {
  const results: RowResult[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 2; // header is line 1
    try {
      const r = await def.applyRow(tx, rows[i], session);
      results.push({ row: rowNum, key: keyOfRow(rows[i]), ...r });
    } catch (e) {
      results.push({ row: rowNum, key: keyOfRow(rows[i]), action: "error", message: e instanceof Error ? e.message : "Invalid row" });
    }
  }
  return results;
}

export async function runImport(
  def: EntityDef,
  rows: Record<string, string>[],
  session: SessionUser,
  mode: "validate" | "apply",
): Promise<{ results: RowResult[] }> {
  try {
    const committed = await db.$transaction(async (tx) => {
      const results = await runRows(tx, def, rows, session);
      if (def.finalize) await def.finalize(tx, rows);
      if (mode === "validate") throw { __pmctRollback: true, results } as RollbackMarker;
      return results;
    }, { timeout: 60000, maxWait: 10000 });
    return { results: committed };
  } catch (e) {
    const marker = e as RollbackMarker;
    if (marker && marker.__pmctRollback) return { results: marker.results };
    throw e;
  }
}

// ---- Batch dry-run: the WHOLE multi-dataset import in ONE transaction -------
// Used by /api/import/auto in validate mode. Every dataset runs against the
// same transaction client with NO overlay: parents are inserted with their real
// ids and children resolve them through ordinary read-your-writes, so the
// dry-run exercises exactly the lookup path apply uses (real FK values, never
// synthetic `__pmct_pending__:*` ids — SQLite would reject those anyway).
// One rollback marker at the end discards every write, leaving the database
// untouched. Row-level failures are reported per row like apply; only
// infrastructure failures (finalize, timeout) reject and abort the batch.
export async function runImportBatch(
  batch: { def: EntityDef; rows: Record<string, string>[] }[],
  session: SessionUser,
): Promise<RowResult[][]> {
  try {
    const committed = await db.$transaction(async (tx) => {
      const batches: RowResult[][] = [];
      for (const { def, rows } of batch) {
        batches.push(await runRows(tx, def, rows, session));
        if (def.finalize) await def.finalize(tx, rows);
      }
      throw { __pmctRollback: true, batches } as BatchRollbackMarker;
    }, { timeout: 60000, maxWait: 10000 });
    return committed;
  } catch (e) {
    const marker = e as BatchRollbackMarker;
    if (marker && marker.__pmctRollback) return marker.batches;
    throw e;
  }
}

// ---- Common export field formatters ----
export { dateStr, isoStr };
