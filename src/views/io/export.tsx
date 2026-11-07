"use client";
// PM CONTROL TOWER — DATA IMPORTING AND EXPORTING · Export hub.
// Three ways out:
//   1. Export everything — one click, every dataset you may view, bundled in linkage
//      order (parents first) as a single Excel workbook or JSON archive, with an
//      AI-written cover note (static fallback) — GET /api/export/all.
//   2. Natural language — "export Q4 project status with budgets": AI picks the
//      dataset, columns and filter and hands back a ready download (POST
//      /api/export/ai → GET /api/export/[entity]?cols=…&q=…), heuristic fallback.
//   3. Per dataset — full-fidelity CSV / JSON or the governed import template via
//      GET /api/export/[entity] (permission-checked and audited server-side).

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import { downloadFile } from "@/components/pmct/io-buttons";
import { PageHeader, SectionCard, Button, LoadingBlock, ErrorBlock, Badge, cn } from "@/components/pmct/kit";
import {
  FileSpreadsheet, FileJson, Download, Loader2, FileUp, ShieldCheck,
  Sparkles, Package, Wand2, Send, TriangleAlert,
} from "lucide-react";

interface EntityInfo {
  key: string; label: string; viewPermission: string; managePermission: string | null;
  importable: boolean; columns: { key: string; label: string }[];
}

interface AiExportPlan {
  entity: string;
  label: string;
  columnKeys: string[];
  columns: { key: string; label: string }[];
  allColumns: boolean;
  q: string | null;
  reason: string;
  source: "ai" | "heuristic";
  qs: string;
  url: string;
  ai: { status: string; fallback: boolean; durationMs?: number | null; model?: string | null };
}

export default function DataExportView() {
  const entities = useApi<{ entities: EntityInfo[]; importableCount: number; exportableCount: number }>("/api/io/entities");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // ---- Export everything ----
  const [bundleBusy, setBundleBusy] = useState<"xlsx" | "json" | null>(null);

  // ---- Natural-language export ----
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [nlPlan, setNlPlan] = useState<AiExportPlan | null>(null);

  const run = async (entity: string, qs: string, fallbackName: string, what: string) => {
    setBusyKey(entity);
    try {
      await downloadFile(entity, qs, fallbackName);
      toast.success(`${what} download started`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${what} failed`);
    } finally {
      setBusyKey(null);
    }
  };

  const runEntity = (e: EntityInfo, qs: string, fallbackName: string, what: string) =>
    run(e.key, qs, fallbackName, `${e.label} — ${what}`);

  const exportBundle = async (format: "xlsx" | "json") => {
    setBundleBusy(format);
    try {
      await run("all", `?format=${format}`, `pmct-export-all.${format}`, `All datasets (${format.toUpperCase()})`);
    } finally {
      setBundleBusy(null);
    }
  };

  const askAiExport = async () => {
    const prompt = nlPrompt.trim();
    if (!prompt) return;
    setNlBusy(true);
    try {
      const d = await api.post<AiExportPlan>("/api/export/ai", { prompt });
      setNlPlan(d);
      if (d.source === "ai" && !d.ai.fallback) toast.success(`AI picked ${d.label}`);
      else toast.info(`AI unavailable (${d.ai.status}) — matched ${d.label} by keywords instead.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI export planning failed");
    } finally {
      setNlBusy(false);
    }
  };

  const rows = entities.data?.entities ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Export Center"
        breadcrumb={["Data Importing and Exporting", "Export"]}
        subtitle="Export everything in one click, ask for exactly what you want in plain English, or download any single dataset — Excel-ready CSV or full-fidelity JSON."
      />

      {/* ---- 1. One-click bundle ---- */}
      <SectionCard
        title="Export everything"
        description="Every dataset you may view, in linkage order (parents before children) so codes and e-mail references stay resolvable. Excel gets a cover note + index + one sheet per dataset; JSON is a single archive."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm" className="h-8 text-xs"
              disabled={bundleBusy !== null}
              onClick={() => void exportBundle("xlsx")}
              title="One workbook: Cover (AI-written) + Index + one sheet per dataset"
            >
              {bundleBusy === "xlsx" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Package className="h-3.5 w-3.5 mr-1.5" />}
              Export all (Excel)
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 text-xs"
              disabled={bundleBusy !== null}
              onClick={() => void exportBundle("json")}
              title="Single JSON archive with cover, column sets and rows per dataset"
            >
              {bundleBusy === "json" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5 mr-1.5 text-blue-600" />}
              Export all (JSON)
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-600">
          <Sparkles className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
          <p>
            The workbook opens with a cover note written by AI from the actual row counts (a static note is used when AI is
            unavailable), followed by an index of all {rows.length || "…"} datasets. Datasets are capped at 5,000 rows each —
            use the per-dataset export below for the full file. Permission-filtered, audited, rate-limited.
          </p>
        </div>
      </SectionCard>

      {/* ---- 2. Natural-language export ---- */}
      <SectionCard
        title="Ask for your export"
        description="Describe what you need — AI picks the dataset, the columns and a text filter, then hands you the download. Falls back to keyword matching when AI is unavailable."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void askAiExport(); }}
            placeholder='e.g. “export overdue tasks for PRJ-1 as CSV” or “project status with budgets”'
            aria-label="Describe the export you want"
            className="h-9 flex-1 min-w-[260px] rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            size="sm" className="h-9 text-xs"
            disabled={nlBusy || !nlPrompt.trim()}
            onClick={() => void askAiExport()}
          >
            {nlBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            Plan export
          </Button>
        </div>

        {nlPlan && (
          <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="bg-white text-slate-700 border-slate-200">{nlPlan.label}</Badge>
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    nlPlan.source === "ai" && !nlPlan.ai.fallback
                      ? "bg-violet-50 text-violet-700 border-violet-200"
                      : "bg-amber-50 text-amber-700 border-amber-200",
                  )}>
                    {nlPlan.source === "ai" && !nlPlan.ai.fallback
                      ? `AI plan${nlPlan.ai.durationMs ? ` · ${(nlPlan.ai.durationMs / 1000).toFixed(1)}s` : ""}`
                      : `Keyword fallback (${nlPlan.ai.status})`}
                  </Badge>
                  {nlPlan.q && (
                    <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 text-[10px]">
                      filter: “{nlPlan.q}”
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-600">{nlPlan.reason}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {nlPlan.allColumns
                    ? "All columns included."
                    : `${nlPlan.columns.length} columns: ${nlPlan.columns.map((c) => c.label).join(", ")}`}
                </p>
              </div>
              <Button
                size="sm" className="h-8 text-xs shrink-0"
                disabled={busyKey === nlPlan.entity}
                onClick={() => void run(nlPlan.entity, nlPlan.qs, `pmct-${nlPlan.entity}.csv`, `${nlPlan.label} — filtered CSV`)}
              >
                {busyKey === nlPlan.entity ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Download CSV
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {entities.loading && !entities.data ? <LoadingBlock label="Loading dataset catalog…" />
        : entities.error ? <ErrorBlock message={entities.error} onRetry={entities.refetch} />
        : rows.length === 0 ? <ErrorBlock message="No datasets are visible for your account." />
        : (
        <SectionCard
          title="Datasets"
          description={`${rows.length} datasets available · ${entities.data?.importableCount ?? 0} importable`}
        >
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Dataset</th>
                  <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">Fields</th>
                  <th className="px-3 py-2 text-left font-semibold">Access</th>
                  <th className="px-3 py-2 text-right font-semibold">Download</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.key} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{e.label}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{e.key}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 hidden md:table-cell">{e.columns.length} columns</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal text-[10px]">
                          export
                        </Badge>
                        {e.importable && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-normal text-[10px]">
                            importable
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs"
                          disabled={busyKey === e.key}
                          onClick={() => void runEntity(e, "?format=csv", `pmct-${e.key}.csv`, "CSV")}
                          title="Excel-ready CSV (UTF-8 BOM)"
                        >
                          {busyKey === e.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}
                          CSV
                        </Button>
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs"
                          disabled={busyKey === e.key}
                          onClick={() => void runEntity(e, "?format=json", `pmct-${e.key}.json`, "JSON")}
                          title="Full-fidelity JSON"
                        >
                          <FileJson className={cn("h-3.5 w-3.5 text-blue-600")} />
                          JSON
                        </Button>
                        {e.importable && (
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs"
                            disabled={busyKey === e.key}
                            onClick={() => void runEntity(e, "?template=1", `pmct-${e.key}-import-template.csv`, "import template")}
                            title="One-row import template with the exact expected columns"
                          >
                            <Download className="h-3.5 w-3.5 text-slate-400" />
                            Template
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Every export is permission-checked and written to the audit trail. Need a combined report? Use “Export” in the top bar for a single PDF / Excel / CSV across all your tabs.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Round-trip tip" description="How to move data between systems safely.">
        <div className="flex items-start gap-3 text-xs text-slate-600">
          <FileUp className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Export the dataset (or its template) first — it contains the canonical column labels the importer maps against.
            Any CSV with recognizable column names also works: on the <strong>Import CSV</strong> tab the file&apos;s columns are matched
            to the existing fields automatically, multi-dataset files are split and linked in dependency order, validated in a
            dry-run, then applied transactionally.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
