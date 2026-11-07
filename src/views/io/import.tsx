"use client";
// PM CONTROL TOWER — DATA IMPORTING AND EXPORTING · AI import hub.
// Drop ANY CSV — even one that spans several datasets in a single flat file.
//   1. The heuristic mapper plans instantly (src/lib/io/model → buildHeuristicPlan)
//      and every line is routed to its dataset(s) with parents first (routeRows) —
//      a live preview shows exactly what will be imported before anything runs.
//   2. AI refines the mapping (POST /api/io/plan) — status chip says whether the
//      plan came from AI or the heuristic fallback; every mapping stays editable.
//   3. Check/Import runs the governed flow (POST /api/import/auto): linkage
//      pre-flight (unresolved required references block the apply), per-entity
//      RBAC, apply in dependency order, audit per dataset.
//   4. After an apply, `data:imported` fans out — every mounted tab re-reads itself.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, useApi, dispatchRealtime } from "@/lib/client";
import { csvToObjects } from "@/lib/csv";
import {
  buildHeuristicPlan, targetsFor, type IoPlan, type PlanTarget,
} from "@/lib/io/model";
import { routeRows, type RouteOutcome } from "@/lib/io/route-rows";
import {
  PageHeader, SectionCard, Button, LoadingBlock, ErrorBlock, EmptyState, Badge, cn,
} from "@/components/pmct/kit";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMe, hasPerm } from "@/views/execute/shared/pickers";
import {
  FileUp, FileSpreadsheet, Loader2, Wand2, UploadCloud, CircleCheckBig, TriangleAlert,
  RotateCcw, Layers, Sparkles, ShieldAlert,
} from "lucide-react";

/** Mirrors IMPORT_MAX_ROWS (src/lib/io/shared.ts — not client-importable: pulls db). */
const MAX_ROWS = 2000;
const SHOW_RESULTS = 200;
const SHOW_SKIPPED = 50;
const IGNORE = "__ignore__";
const ADD = "__add__";

interface EntityInfo {
  key: string; label: string; viewPermission: string; managePermission: string | null;
  importable: boolean; columns: { key: string; label: string }[];
}

interface PlanAi {
  status: string; fallback: boolean;
  durationMs?: number | null; provider?: string | null; model?: string | null;
}
interface PlanResponse { plan: IoPlan; ai: PlanAi }

interface RowResult {
  row: number; key: string; action: "created" | "updated" | "error";
  name?: string; message?: string;
}
interface LinkageIssue {
  severity: "error" | "warning";
  entity: string; entityLabel: string; column: string; value: string;
  target: string; targetLabel: string; lines: number[];
}
interface DatasetReport {
  entity: string; label: string; total: number;
  created: number; updated: number; failed: number; synthesized: number;
  results: RowResult[];
}
interface AutoResult {
  mode: "validate" | "apply"; runMode: "validate" | "apply";
  applied: boolean; blocked: boolean; aborted: string | null;
  datasets: DatasetReport[];
  linkage: { ok: boolean; errors: number; warnings: number; issues: LinkageIssue[] };
  skipped: { line: number; reason: string }[];
  totals: { rows: number; created: number; updated: number; failed: number };
  note?: string;
}

const parseTarget = (v: string): PlanTarget => {
  const i = v.indexOf("::");
  return { entity: v.slice(0, i), column: v.slice(i + 2) };
};
const targetValue = (t: PlanTarget) => `${t.entity}::${t.column}`;

/** Per-header mapping source chip (neutral palette — kit StatusChip is for domain statuses). */
function ViaChip({ via }: { via: "ai" | "heuristic" | "manual" | "ignored" }) {
  const tones = {
    ai: "bg-violet-50 text-violet-700 border-violet-200",
    heuristic: "bg-slate-100 text-slate-600 border-slate-200",
    manual: "bg-blue-50 text-blue-700 border-blue-200",
    ignored: "bg-slate-50 text-slate-400 border-slate-200",
  } as const;
  const labels = { ai: "AI", heuristic: "Auto", manual: "Manual", ignored: "Ignored" } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", tones[via])}>
      {labels[via]}
    </span>
  );
}

export default function DataImportView() {
  const me = useMe();
  const entities = useApi<{ entities: EntityInfo[]; importableCount: number; exportableCount: number }>("/api/io/entities");

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, PlanTarget[]>>({});
  const [aiPlan, setAiPlan] = useState<IoPlan | null>(null);
  const [aiStatus, setAiStatus] = useState<PlanAi | null>(null);
  const [aiNonce, setAiNonce] = useState(0);
  const aiDoneRef = useRef("");
  const [validation, setValidation] = useState<AutoResult | null>(null);
  const [applied, setApplied] = useState<AutoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addSeq, setAddSeq] = useState(0);

  const importables = useMemo(
    () => (entities.data?.entities ?? []).filter((e) => e.importable),
    [entities.data],
  );

  // ---- Plans ---------------------------------------------------------------
  // Heuristic baseline: instant, AI-free, recomputed whenever the catalog or the
  // file changes. The AI plan (when it arrives) replaces it; manual overrides
  // always sit on top of either.
  const heuristicPlan = useMemo(
    () => (parsed && importables.length ? buildHeuristicPlan(parsed.headers, importables) : null),
    [parsed, importables],
  );

  const effectivePlan = useMemo<IoPlan | null>(() => {
    if (!parsed) return null;
    const base = aiPlan ?? heuristicPlan;
    if (!base) return null;
    const byHeader = new Map(base.assignments.map((a) => [a.header, a]));
    return {
      ...base,
      assignments: parsed.headers.map((h) => {
        const o = overrides[h];
        if (o) return { header: h, targets: o, via: "manual" as const };
        return byHeader.get(h) ?? { header: h, targets: [], via: "heuristic" as const };
      }),
    };
  }, [parsed, aiPlan, heuristicPlan, overrides]);

  // ---- AI refinement (async, never blocks the instant heuristic preview) ----
  useEffect(() => {
    if (!parsed || !importables.length) return;
    const sig = `${fileName ?? ""}::${parsed.headers.join("\u0001")}`;
    if (aiDoneRef.current === sig) return;
    aiDoneRef.current = sig;
    const nonce = aiNonce;
    let alive = true;
    setAiStatus({ status: "loading", fallback: false });
    api.post<PlanResponse>("/api/io/plan", {
      headers: parsed.headers,
      sample: parsed.rows.slice(0, 3),
      fileName: fileName ?? undefined,
    })
      .then((d) => {
        if (!alive || nonce !== aiNonce) return;
        setAiPlan(d.plan);
        setAiStatus(d.ai);
      })
      .catch(() => {
        if (!alive || nonce !== aiNonce) return;
        setAiStatus({ status: "error", fallback: true });
      });
    return () => { alive = false; };
  }, [parsed, importables, fileName, aiNonce]);

  const retryAi = () => {
    aiDoneRef.current = "";
    setAiPlan(null);
    setAiNonce((n) => n + 1);
  };

  // ---- Routing preview (client-side, same engine the server re-runs) --------
  const cappedRows = useMemo(() => (parsed ? parsed.rows.slice(0, MAX_ROWS) : []), [parsed]);
  const preview: RouteOutcome | null = useMemo(() => {
    if (!parsed || !effectivePlan || !importables.length) return null;
    return routeRows(parsed.headers, cappedRows, effectivePlan, importables);
  }, [parsed, cappedRows, effectivePlan, importables]);

  const permOf = (entity: string) => importables.find((e) => e.key === entity)?.managePermission ?? null;
  const allowedDatasets = useMemo(
    () => (preview?.datasets ?? []).filter((ds) => {
      const perm = permOf(ds.entity);
      return Boolean(perm && hasPerm(me, perm));
    }),
    [preview, importables, me],
  );
  const allowedRows = allowedDatasets.reduce((a, d) => a + d.rows.length, 0);

  const invalidate = () => { setValidation(null); setApplied(null); };

  const resetFile = () => {
    setFileName(null); setParsed(null); setOverrides({}); setAiPlan(null); setAiStatus(null);
    aiDoneRef.current = ""; setValidation(null); setApplied(null); setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setError(null); setValidation(null); setApplied(null);
    setOverrides({}); setAiPlan(null); setAiStatus(null); aiDoneRef.current = "";
    try {
      const text = await file.text();
      const p = csvToObjects(text);
      if (!p.headers.length) throw new Error("The file has no header row — nothing to map.");
      if (!p.rows.length) throw new Error("The file has no data rows.");
      setFileName(file.name);
      setParsed(p);
    } catch (e) {
      resetFile();
      setError(e instanceof Error ? e.message : "Could not read the file");
    }
  };

  // ---- Mapping edits -------------------------------------------------------
  const setPrimary = (h: string, v: string) => {
    setOverrides((prev) => ({
      ...prev,
      [h]: v === IGNORE ? [] : [parseTarget(v)],
    }));
    invalidate();
  };
  const addTarget = (h: string, v: string, current: PlanTarget[]) => {
    if (v === ADD) return;
    const t = parseTarget(v);
    if (current.some((x) => x.entity === t.entity && x.column === t.column)) return;
    setOverrides((prev) => ({ ...prev, [h]: [...(prev[h] ?? current), t] }));
    invalidate();
    setAddSeq((s) => s + 1);
  };
  const removeTarget = (h: string, t: PlanTarget, current: PlanTarget[]) => {
    setOverrides((prev) => ({
      ...prev,
      [h]: current.filter((x) => !(x.entity === t.entity && x.column === t.column)),
    }));
    invalidate();
  };

  const labelFor = (t: PlanTarget) => {
    const e = importables.find((x) => x.key === t.entity);
    const c = e?.columns.find((x) => x.key === t.column);
    return `${e?.label ?? t.entity} · ${c?.label ?? t.column}`;
  };

  const viaOf = (h: string, targets: PlanTarget[]): "ai" | "heuristic" | "manual" | "ignored" => {
    if (overrides[h]) return targets.length ? "manual" : "ignored";
    const a = aiPlan?.assignments.find((x) => x.header === h);
    if (a?.via === "ai") return "ai";
    return targets.length ? "heuristic" : "ignored";
  };

  // ---- Governed validate → apply -------------------------------------------
  const runAuto = async (mode: "validate" | "apply") => {
    if (!parsed || !effectivePlan) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.post<AutoResult>("/api/import/auto", {
        headers: parsed.headers,
        rows: cappedRows,
        plan: effectivePlan,
        mode,
      });
      if (mode === "validate") {
        setValidation(d);
        setApplied(null);
        if (d.linkage.errors > 0) {
          toast.warning(`Dry-run finished, but ${d.linkage.errors} required reference(s) cannot be resolved — apply would be blocked.`);
        } else {
          toast.success(`Dry-run finished — ${d.totals.created + d.totals.updated} row(s) would change, ${d.totals.failed} would fail.`);
        }
      } else if (d.blocked) {
        // Server refused the apply and ran a dry-run instead — show it.
        setValidation(d);
        setApplied(null);
        toast.error(`Import blocked — ${d.linkage.errors} required reference(s) unresolved (see below).`);
      } else {
        setApplied(d);
        setValidation(null);
        if (d.totals.created > 0 || d.totals.updated > 0) {
          // Local fan-out fallback (the server also emits via Socket.IO): every
          // mounted useApi re-reads itself, so all tabs refresh after the import.
          dispatchRealtime("data:imported", {
            datasets: d.datasets.map((x) => ({ entity: x.entity, created: x.created, updated: x.updated })),
            created: d.totals.created, updated: d.totals.updated, failed: d.totals.failed, by: "self",
          });
        }
        if (d.aborted) toast.error(`Import stopped: ${d.aborted}`);
        else {
          toast.success(
            `Import complete — ${d.totals.created} created, ${d.totals.updated} updated`
            + `${d.totals.failed ? `, ${d.totals.failed} failed` : ""} across ${d.datasets.length} dataset(s).`,
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Import ${mode} failed`);
    } finally {
      setBusy(false);
    }
  };

  const summary = applied ?? validation;
  const wouldBlock = Boolean(validation && !applied && (validation.blocked || validation.linkage.errors > 0));
  const mappedCount = effectivePlan
    ? effectivePlan.assignments.filter((a) => a.targets.length > 0).length
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import CSV"
        breadcrumb={["Data Importing and Exporting", "Import"]}
        subtitle="Drop any CSV — AI maps every column, one file may span several datasets, links between them are validated before anything is written, and every tab refreshes when the import lands."
      />

      {/* ---- Clear upload zone ---- */}
      <SectionCard title="Upload" description="CSV files only (UTF-8, one header row). A single file may hold several datasets — e.g. portfolio, program, project and task columns side by side; rows are routed and imported parents-first automatically.">
        <input
          ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {fileName ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{fileName}</p>
              <p className="text-xs text-slate-500">
                {parsed?.rows.length ?? 0} data rows · {parsed?.headers.length ?? 0} columns
                {preview ? ` · ${preview.datasets.length} dataset(s) detected` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetFile} disabled={busy}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Start over
            </Button>
          </div>
        ) : (
          <div
            role="button" tabIndex={0} aria-label="Upload CSV file"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFile(e.dataTransfer.files?.[0] ?? null); }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/40",
            )}
          >
            <UploadCloud className="h-9 w-9 text-blue-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-700">Drop your CSV here, or click to browse</p>
            <p className="text-xs text-slate-500 max-w-md">
              Columns are matched to the platform&apos;s fields automatically — AI refines the mapping and multi-dataset files are split and linked for you.
            </p>
            <Button size="sm" className="mt-1 pointer-events-none" tabIndex={-1}>
              <FileUp className="h-4 w-4 mr-1.5" /> Upload CSV
            </Button>
          </div>
        )}
      </SectionCard>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {parsed && entities.loading && !entities.data ? <LoadingBlock label="Loading dataset catalog…" /> : null}

      {parsed && importables.length === 0 && entities.data ? (
        <ErrorBlock message="No importable datasets are available for your account." />
      ) : null}

      {/* ---- AI mapping + routing preview + mapping table ---- */}
      {parsed && effectivePlan && importables.length > 0 && (
        <SectionCard
          title="AI field mapping"
          description="Every column is mapped to the platform's fields and every row is routed to its dataset. Adjust anything that looks off — “Ignore” leaves the column out, extra targets let one column feed several datasets."
          actions={
            <div className="flex items-center gap-2">
              {aiStatus?.status === "loading" ? (
                <Badge variant="outline" className="gap-1.5 text-violet-700 border-violet-200 bg-violet-50">
                  <Loader2 className="h-3 w-3 animate-spin" /> AI refining…
                </Badge>
              ) : aiStatus && !aiStatus.fallback ? (
                <Badge variant="outline" className="gap-1.5 text-violet-700 border-violet-200 bg-violet-50">
                  <Sparkles className="h-3 w-3" /> AI mapping{aiStatus.durationMs ? ` · ${(aiStatus.durationMs / 1000).toFixed(1)}s` : ""}
                </Badge>
              ) : aiStatus ? (
                <Badge variant="outline" className="gap-1.5 text-amber-700 border-amber-200 bg-amber-50" title={`AI status: ${aiStatus.status}`}>
                  <TriangleAlert className="h-3 w-3" /> Heuristic fallback ({aiStatus.status})
                </Badge>
              ) : null}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={retryAi} disabled={busy}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-run AI mapping
              </Button>
            </div>
          }
        >
          {aiPlan?.notes?.length ? (
            <p className="mb-3 rounded-md border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-800">
              {aiPlan.notes.slice(0, 2).join(" ")}
            </p>
          ) : null}

          {/* ---- Detected datasets (live routing preview) ---- */}
          {preview && preview.datasets.length > 0 ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {preview.datasets.map((ds) => {
                const perm = permOf(ds.entity);
                const ok = Boolean(perm && hasPerm(me, perm));
                return (
                  <div
                    key={ds.entity}
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      ok ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        <Layers className="h-3.5 w-3.5 text-slate-400" /> {ds.label}
                      </span>
                      {ok ? (
                        <span className="text-[10px] font-medium text-emerald-700">ready</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700">
                          <ShieldAlert className="h-3 w-3" /> needs {perm}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {ds.rows.length} row(s)
                      {ds.spawnedCount > 0 ? ` · ${ds.spawnedCount} linked in from other blocks` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No dataset detected yet — map the columns below. Each dataset needs its key columns filled (e.g. Code + Name, plus Project Code for project-scoped rows).
            </div>
          )}

          {preview && preview.skipped.length > 0 && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-medium">{preview.skipped.length} line(s) will not be imported:</p>
              <ul className="mt-1 list-disc pl-4">
                {preview.skipped.slice(0, 4).map((s) => (
                  <li key={s.line}>Line {s.line}: {s.reason}</li>
                ))}
                {preview.skipped.length > 4 && <li>…and {preview.skipped.length - 4} more.</li>}
              </ul>
            </div>
          )}

          {/* ---- Per-header mapping table ---- */}
          <div className="max-h-[440px] overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold">Column in your file</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Source</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((h) => {
                  const targets = targetsFor(effectivePlan, h);
                  const primary = targets[0];
                  const extras = targets.slice(1);
                  const candidates = importables.flatMap((e) =>
                    e.columns
                      .filter((c) => !targets.some((t) => t.entity === e.key && t.column === c.key))
                      .map((c) => ({ value: `${e.key}::${c.key}`, label: `${e.label} · ${c.label}` })));
                  return (
                    <tr key={h} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-700 max-w-[220px] break-words">{h}</td>
                      <td className="px-3 py-2"><ViaChip via={viaOf(h, targets)} /></td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Select value={primary ? targetValue(primary) : IGNORE} onValueChange={(v) => setPrimary(h, v)}>
                            <SelectTrigger className="h-7 w-[240px] bg-white text-xs" aria-label={`Map ${h}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORE}>— Ignore this column —</SelectItem>
                              {importables.map((e) => (
                                <SelectGroup key={e.key}>
                                  <SelectLabel>{e.label}</SelectLabel>
                                  {e.columns.map((c) => (
                                    <SelectItem key={c.key} value={`${e.key}::${c.key}`}>{c.label}</SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>

                          {extras.map((t, i) => (
                            <span
                              key={`${t.entity}:${t.column}:${i}`}
                              className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600"
                              title={labelFor(t)}
                            >
                              <span className="truncate">{labelFor(t)}</span>
                              <button
                                type="button" aria-label={`Remove ${labelFor(t)}`}
                                className="shrink-0 text-slate-400 hover:text-red-600"
                                onClick={() => removeTarget(h, t, targets)}
                              >
                                ×
                              </button>
                            </span>
                          ))}

                          <Select key={`${h}:${addSeq}`} onValueChange={(v) => addTarget(h, v, targets)}>
                            <SelectTrigger className="h-7 w-[120px] bg-white text-xs text-slate-400" aria-label={`Add target for ${h}`}>
                              <SelectValue placeholder="+ target" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ADD} disabled>— Add target —</SelectItem>
                              {candidates.map((c) => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{cappedRows.length} rows ready</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{mappedCount} of {parsed.headers.length} columns mapped</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{allowedDatasets.length} dataset(s) importable by you</span>
            {parsed.rows.length > MAX_ROWS && (
              <span className="text-amber-600">File has {parsed.rows.length} rows — the first {MAX_ROWS} will be imported.</span>
            )}
            {allowedDatasets.length === 0 && (
              <span className="text-amber-600">No routed dataset is importable with your permissions.</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm" className="h-8 text-xs"
              disabled={busy || allowedRows === 0 || Boolean(applied)}
              onClick={() => void runAuto("validate")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CircleCheckBig className="h-3.5 w-3.5 mr-1.5" />}
              Check file (dry-run)
            </Button>
            {validation && !applied && (
              <Button
                size="sm" className="h-8 text-xs"
                disabled={busy || wouldBlock || validation.totals.created + validation.totals.updated === 0}
                onClick={() => void runAuto("apply")}
                title={wouldBlock ? "Resolve the linkage issues below first" : undefined}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Import {validation.totals.created + validation.totals.updated} row(s)
                {validation.totals.failed ? ` — ${validation.totals.failed} will be skipped` : ""}
              </Button>
            )}
            {wouldBlock && (
              <span className="text-xs text-red-600">Apply is blocked until the required references below resolve.</span>
            )}
            {applied && (
              <span className="text-xs text-emerald-700 font-medium">Imported ✓ — every tab refreshes automatically; drop another file to import more.</span>
            )}
          </div>
        </SectionCard>
      )}

      {/* ---- Dry-run / apply results ---- */}
      {summary && (
        <SectionCard
          title={applied ? "Import result" : "Dry-run result (nothing written)"}
          description={applied
            ? "Rows applied to the database in dependency order — parents before children."
            : "What would change if you apply this import now, including linkage validation."}
        >
          {summary.aborted && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" /> Import stopped: {summary.aborted}
            </div>
          )}
          {summary.blocked && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              Import blocked — {summary.linkage.errors} required reference(s) could not be resolved. Nothing was written.
            </div>
          )}
          {!summary.blocked && summary.linkage.errors > 0 && !applied && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {summary.linkage.errors} required reference(s) cannot be resolved — apply will be blocked until they do.
            </div>
          )}
          {summary.note && (
            <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{summary.note}</div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{summary.totals.rows} rows</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{summary.totals.created} created</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">{summary.totals.updated} updated</span>
            {summary.totals.failed > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">{summary.totals.failed} failed</span>}
            {summary.linkage.warnings > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{summary.linkage.warnings} linkage warning(s)</span>}
          </div>

          {/* ---- Linkage issues ---- */}
          {summary.linkage.issues.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Severity</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Dataset</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Field</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Value</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Expected in</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.linkage.issues.map((i) => (
                    <tr key={`${i.entity}|${i.column}|${i.value}|${i.severity}`} className="border-t border-slate-100">
                      <td className="px-2.5 py-1">
                        <span className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          i.severity === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700",
                        )}>
                          {i.severity === "error" ? "blocks" : "warning"}
                        </span>
                      </td>
                      <td className="px-2.5 py-1 text-slate-700">{i.entityLabel}</td>
                      <td className="px-2.5 py-1 text-slate-700">{i.column}</td>
                      <td className="px-2.5 py-1 font-medium text-slate-800">{i.value}</td>
                      <td className="px-2.5 py-1 text-slate-500">{i.targetLabel}</td>
                      <td className="px-2.5 py-1 tabular-nums text-slate-400">{i.lines.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---- Per-dataset totals ---- */}
          {summary.datasets.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summary.datasets.map((d) => (
                <div key={d.entity} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">{d.label}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{d.created} created</span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{d.updated} updated</span>
                    {d.failed > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">{d.failed} failed</span>}
                    {d.synthesized > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">{d.synthesized} linked</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---- Row-level results ---- */}
          {summary.datasets.some((d) => d.results.length > 0) && (
            <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Dataset</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Line</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Key</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.datasets
                    .flatMap((d) => d.results.map((r) => ({ ...r, dataset: d.label })))
                    .slice(0, SHOW_RESULTS)
                    .map((r) => (
                      <tr key={`${r.dataset}:${r.row}`} className="border-t border-slate-100">
                        <td className="px-2.5 py-1 text-slate-500">{r.dataset}</td>
                        <td className="px-2.5 py-1 tabular-nums text-slate-400">{r.row}</td>
                        <td className="px-2.5 py-1 font-medium text-slate-700 max-w-[200px] truncate">{r.key || "—"}</td>
                        <td className={cn("px-2.5 py-1", r.action === "error" ? "text-red-600" : r.action === "created" ? "text-emerald-600" : "text-blue-600")}>
                          {r.action === "error" ? r.message : `${r.action}${r.name ? ` — ${r.name}` : ""}`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {summary.datasets.reduce((a, d) => a + d.results.length, 0) > SHOW_RESULTS && (
            <p className="mt-2 text-[11px] text-slate-400">Showing first {SHOW_RESULTS} of {summary.datasets.reduce((a, d) => a + d.results.length, 0)} row results.</p>
          )}

          {/* ---- Skipped lines ---- */}
          {summary.skipped.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-semibold w-16">Line</th>
                    <th className="px-2.5 py-1.5 text-left font-semibold">Why it was skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.skipped.slice(0, SHOW_SKIPPED).map((s, i) => (
                    <tr key={`${s.line}:${i}`} className="border-t border-slate-100">
                      <td className="px-2.5 py-1 tabular-nums text-slate-400">{s.line}</td>
                      <td className="px-2.5 py-1 text-slate-600">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {summary.skipped.length > SHOW_SKIPPED && (
            <p className="mt-2 text-[11px] text-slate-400">Showing first {SHOW_SKIPPED} of {summary.skipped.length} skipped lines.</p>
          )}
        </SectionCard>
      )}

      {parsed && importables.length === 0 && !entities.data && entities.error ? (
        <EmptyState title="Catalog unavailable" description={entities.error} />
      ) : null}
    </div>
  );
}
