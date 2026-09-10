"use client";
// PM CONTROL TOWER — Import/Export buttons. One compact dropdown per module:
// export full-fidelity CSV/JSON, download the import template, import from CSV with a
// validate-first (dry-run) → apply flow. Server enforces permissions per entity.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { api, dispatchRealtime, getToken } from "@/lib/client";
import { csvToObjects } from "@/lib/csv";
import { Button } from "@/components/pmct/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMe, hasPerm } from "@/views/execute/shared/pickers";

// The manage permission required per entity (must mirror src/lib/io/* managePermission).
const IMPORT_PERMISSIONS: Record<string, string> = {
  portfolios: "portfolio.manage", programs: "program.manage", projects: "project.manage",
  requirements: "project.manage", tasks: "wbs.manage", milestones: "schedule.manage",
  resources: "resource.manage", risks: "raid.manage", issues: "raid.manage",
  assumptions: "raid.manage", changes: "change.manage", "budget-lines": "financial.manage",
  users: "admin.users",
};

async function downloadFile(entity: string, qs: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`/api/export/${entity}${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(cd);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = m?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface ImportSummary {
  total: number; created: number; updated: number; failed: number;
  results: { row: number; key: string; action: string; name?: string; message?: string }[];
}

export function ImportExportButtons({ entity, projectId }: { entity: string; projectId?: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [validation, setValidation] = useState<ImportSummary | null>(null);
  const [applied, setApplied] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canImport = Boolean(IMPORT_PERMISSIONS[entity] && hasPerm(me, IMPORT_PERMISSIONS[entity]));
  const exportQs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";

  const runExport = async (format: "csv" | "json") => {
    setBusy(true);
    try {
      await downloadFile(entity, `${exportQs}${exportQs ? "&" : "?"}format=${format}`, `pmct-${entity}.${format}`);
      toast.success(`Export started — ${entity} (${format.toUpperCase()})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setBusy(true);
    try {
      await downloadFile(entity, "?template=1", `pmct-${entity}-import-template.csv`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Template download failed");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFileName(null); setRows(null); setValidation(null); setApplied(null); setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setError(null); setValidation(null); setApplied(null); setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = csvToObjects(text);
      if (!parsed.headers.length) throw new Error("The file has no header row");
      // Fetch the canonical column set, then normalize headers: accept either template
      // labels or raw column keys (case-insensitive); unknown headers are dropped.
      const meta = await api.get<{ columns: { key: string; label: string }[] }>(`/api/export/${entity}?meta=1`);
      const byLabel = new Map(meta.columns.map((c) => [c.label.toLowerCase(), c.label]));
      const byKey = new Map(meta.columns.map((c) => [c.key.toLowerCase(), c.label]));
      const unknown = parsed.headers.filter((h) => !byLabel.has(h.trim().toLowerCase()) && !byKey.has(h.trim().toLowerCase()));
      const nonEmpty = parsed.rows
        .map((r) => {
          const out: Record<string, string> = {};
          for (const [h, v] of Object.entries(r)) {
            const canonical = byLabel.get(h.trim().toLowerCase()) ?? byKey.get(h.trim().toLowerCase());
            if (canonical) out[canonical] = v;
          }
          return out;
        })
        .filter((r) => Object.values(r).some((v) => v !== ""));
      if (!nonEmpty.length) throw new Error("No data rows found in the file");
      if (unknown.length) toast.warning(`Ignored unrecognized column(s): ${unknown.slice(0, 5).join(", ")}`);
      setRows(nonEmpty);
      await doValidate(nonEmpty);
    } catch (e) {
      setRows(null); setValidation(null);
      setError(e instanceof Error ? e.message : "Could not read the file");
    }
  };

  const doValidate = async (dataRows: Record<string, string>[]) => {
    setBusy(true);
    try {
      const d = await api.post<ImportSummary>(`/api/import/${entity}`, { rows: dataRows, mode: "validate" });
      setValidation(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setBusy(false);
    }
  };

  const doApply = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const d = await api.post<ImportSummary>(`/api/import/${entity}`, { rows, mode: "apply" });
      setApplied(d);
      setValidation(null);
      // Refresh the hosting view immediately and socket-independently: the server
      // also emits "data:imported" via Socket.IO, but the mini-service may be
      // unreachable — a local dispatch guarantees the list updates either way.
      if (d.created + d.updated > 0) {
        dispatchRealtime("data:imported", { entity, created: d.created, updated: d.updated, failed: d.failed, by: "self" });
      }
      toast.success(`Import complete — ${d.created} created, ${d.updated} updated${d.failed ? `, ${d.failed} failed` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const summary = applied ?? validation;
  const hasErrors = summary ? summary.failed > 0 : false;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Import / Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs">Data exchange</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void runExport("csv")}>
            <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Export CSV (Excel-ready)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void runExport("json")}>
            <FileJson className="h-4 w-4 mr-2 text-blue-600" /> Export JSON (all fields)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void downloadTemplate()}>
            <Download className="h-4 w-4 mr-2 text-slate-400" /> Import template
          </DropdownMenuItem>
          {canImport && (
            <DropdownMenuItem
              // Defer the dialog open: Radix restores focus to the trigger as the menu
              // closes, which would immediately cancel a dialog opened synchronously.
              onClick={() => { reset(); setTimeout(() => setOpen(true), 80); }}
            >
              <FileUp className="h-4 w-4 mr-2 text-amber-600" /> Import from CSV…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import {entity.replace(/-/g, " ")}</DialogTitle>
            <DialogDescription>
              Upload a CSV (export the template first for the exact columns). Rows are matched on
              their business code and upserted — existing records are updated, new ones created.
              Empty cells leave existing values unchanged. Validation never writes anything.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={busy}>
              <FileUp className="h-3.5 w-3.5 mr-1.5" /> {fileName ? "Choose another file" : "Choose CSV file"}
            </Button>
            {fileName && <span className="text-xs text-slate-500 truncate max-w-[280px]">{fileName}{rows ? ` — ${rows.length} rows` : ""}</span>}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {summary && !error && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{summary.total} rows</span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{summary.created} created</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">{summary.updated} updated</span>
                {summary.failed > 0 && (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">{summary.failed} failed</span>
                )}
                {validation && !applied && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">Dry-run — nothing written yet</span>}
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2.5 py-1.5 text-left font-semibold">Row</th>
                      <th className="px-2.5 py-1.5 text-left font-semibold">Key</th>
                      <th className="px-2.5 py-1.5 text-left font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.slice(0, 200).map((r) => (
                      <tr key={r.row} className="border-t border-slate-100">
                        <td className="px-2.5 py-1 tabular-nums text-slate-400">{r.row}</td>
                        <td className="px-2.5 py-1 font-medium text-slate-700 max-w-[180px] truncate">{r.key || "—"}</td>
                        <td className={`px-2.5 py-1 ${r.action === "error" ? "text-red-600" : r.action === "created" ? "text-emerald-600" : "text-blue-600"}`}>
                          {r.action === "error" ? r.message : `${r.action}${r.name ? ` — ${r.name}` : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.results.length > 200 && (
                <p className="text-[11px] text-slate-400">Showing first 200 of {summary.results.length} rows.</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { reset(); setOpen(false); }}>
              Close
            </Button>
            {rows && validation && !applied && (
              <Button size="sm" className="h-8 text-xs" onClick={() => void doApply()} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Apply {validation.created + validation.updated} changes{hasErrors ? ` (${validation.failed} rows will be skipped)` : ""}
              </Button>
            )}
            {applied && (
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  // Re-trigger the refresh hint (idempotent refetch) and close —
                  // no full page reload needed.
                  dispatchRealtime("data:imported", { entity, by: "self" });
                  setOpen(false);
                }}
              >
                Refresh data
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
