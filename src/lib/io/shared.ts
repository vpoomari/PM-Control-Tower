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
}

// ---- Shared lookup helpers (throw with human messages — surfaced per row) ----

export async function portfolioByCode(tx: Prisma.TransactionClient, code: string | null) {
  if (!code) return null;
  const p = await tx.portfolio.findUnique({ where: { code } });
  if (!p) throw new Error(`Portfolio "${code}" not found`);
  return p;
}

export async function programByCode(tx: Prisma.TransactionClient, code: string | null) {
  if (!code) return null;
  const p = await tx.program.findUnique({ where: { code } });
  if (!p) throw new Error(`Program "${code}" not found`);
  return p;
}

export async function projectByCode(tx: Prisma.TransactionClient, code: string | null) {
  if (!code) throw new Error("ProjectCode is required");
  const p = await tx.project.findUnique({ where: { code } });
  if (!p) throw new Error(`Project "${code}" not found`);
  return p;
}

export async function userByEmail(tx: Prisma.TransactionClient, email: string | null) {
  if (!email) return null;
  const u = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u) throw new Error(`User "${email}" not found`);
  return u;
}

export async function resourceByEmail(tx: Prisma.TransactionClient, email: string | null) {
  if (!email) return null;
  const r = await tx.resource.findFirst({ where: { email: email.trim().toLowerCase() } });
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

export const IMPORT_MAX_ROWS = 2000;

export async function runImport(
  def: EntityDef,
  rows: Record<string, string>[],
  session: SessionUser,
  mode: "validate" | "apply"
): Promise<{ results: RowResult[] }> {
  const keyOf = (row: Record<string, string>) =>
    row.code || row.Code || row.reqCode || row["Req Code"] || row.employeeCode || row["Employee Code"]
    || row.email || row.Email || row.name || row.Name || "";
  try {
    const committed = await db.$transaction(async (tx) => {
      const results: RowResult[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const rowNum = i + 2; // header is line 1
        try {
          const r = await def.applyRow(tx, rows[i], session);
          results.push({ row: rowNum, key: keyOf(rows[i]), ...r });
        } catch (e) {
          results.push({ row: rowNum, key: keyOf(rows[i]), action: "error", message: e instanceof Error ? e.message : "Invalid row" });
        }
      }
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

// ---- Common export field formatters ----
export { dateStr, isoStr };
