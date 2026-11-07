"use client";
// PM CONTROL TOWER — PMO Analytics hub: catalog of all 50 reports across five
// functional modules. Every card navigates to the generic report renderer at
// #/insights/report?id=<report-id>.

import { useMemo, useState } from "react";
import { ClipboardList, Users, GanttChartSquare, Wallet, ShieldCheck, ChevronRight, type LucideIcon } from "lucide-react";
import { PageHeader, SectionCard, SearchInput, Toolbar, LoadingBlock, ErrorBlock, EmptyState } from "@/components/pmct/kit";
import { ReportStatusBadge } from "@/components/pmct/report-badge";
import { useApi } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { ModuleMeta } from "@/lib/analytics/types";

interface CatalogReport {
  id: string;
  module: string;
  pillar: string;
  title: string;
  subtitle: string;
  formula: string;
  sources: string[];
  status: "live" | "roadmap";
  roadmapNote?: string;
}
interface CatalogData {
  modules: ModuleMeta[];
  reports: CatalogReport[];
  generatedAt: string;
}

const MODULE_ICONS: Record<string, LucideIcon> = {
  planning: ClipboardList,
  resources: Users,
  delivery: GanttChartSquare,
  cost: Wallet,
  quality: ShieldCheck,
};

export default function InsightsHub() {
  const { navigate } = useRoute();
  const { data, loading, error, refetch } = useApi<CatalogData>("/api/analytics/catalog");
  const [moduleId, setModuleId] = useState<string>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.reports.filter((r) =>
      (moduleId === "all" || r.module === moduleId) &&
      (!needle ||
        r.title.toLowerCase().includes(needle) ||
        r.subtitle.toLowerCase().includes(needle) ||
        r.id.includes(needle.replace(/\s+/g, "-")) ||
        r.sources.join(" ").toLowerCase().includes(needle)),
    );
  }, [data, moduleId, q]);

  const grouped = useMemo(
    () => (data ? data.modules.map((m) => ({ module: m, reports: filtered.filter((r) => r.module === m.id) })) : []),
    [data, filtered],
  );
  const live = data?.reports.filter((r) => r.status === "live").length ?? 0;
  const roadmap = data?.reports.filter((r) => r.status === "roadmap").length ?? 0;

  if (loading) return <LoadingBlock label="Loading report catalog…" />;
  if (error || !data) return <ErrorBlock message={error ?? "Catalog unavailable"} onRetry={refetch} />;

  return (
    <div className="pt-2 pb-8">
      <PageHeader
        title="PMO Analytics"
        subtitle={`${data.reports.length} reports across five functional modules · PLAN · EXECUTE · MONITOR · GOVERN · DELIVER · ${live} live · ${roadmap} roadmap`}
        actions={
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
            Computed from live data — no hardcoded metrics
          </span>
        }
      />

      <Toolbar className="mb-5">
        <SearchInput value={q} onChange={setQ} placeholder="Search reports, formulas, sources…" className="w-full sm:w-72" />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by module">
          <button
            onClick={() => setModuleId("all")}
            aria-pressed={moduleId === "all"}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
              moduleId === "all" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            All modules
          </button>
          {data.modules.map((m) => (
            <button
              key={m.id}
              onClick={() => setModuleId(m.id)}
              aria-pressed={moduleId === m.id}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                moduleId === m.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {m.label} <span className="text-slate-400">{m.liveCount}/{m.reportCount}</span>
            </button>
          ))}
        </div>
      </Toolbar>

      {filtered.length === 0 && (
        <EmptyState
          title="No reports match"
          description={`Nothing found for “${q}”${moduleId !== "all" ? " in the selected module" : ""}.`}
          action={
            <button onClick={() => { setQ(""); setModuleId("all"); }} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Clear filters
            </button>
          }
        />
      )}

      <div className="space-y-5">
        {grouped.map(({ module: m, reports }) =>
          reports.length === 0 ? null : (
            <SectionCard
              key={m.id}
              title={m.label}
              description={`${m.description} · ${m.liveCount} live of ${m.reportCount}`}
              actions={
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: m.accent, border: `1px solid ${m.accent}55`, background: `${m.accent}12` }}
                >
                  {m.pillar}
                </span>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {reports.map((r) => {
                  const Icon = MODULE_ICONS[m.id];
                  return (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/insights/report?id=${r.id}`)}
                      className="group text-left rounded-lg border border-slate-200 bg-white/70 p-3 transition-colors hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: m.accent }} aria-hidden />}
                          {r.title}
                        </span>
                        <ReportStatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{r.subtitle}</p>
                      <p className="mt-2 line-clamp-2 rounded bg-slate-50 px-1.5 py-1 font-mono text-[10px] leading-relaxed text-slate-400">
                        {r.formula}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {r.sources.slice(0, 3).map((s) => (
                          <span key={s} className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-500">
                            {s}
                          </span>
                        ))}
                        {r.sources.length > 3 && <span className="text-[10px] text-slate-400">+{r.sources.length - 3}</span>}
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-blue-500" aria-hidden />
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
          ),
        )}
      </div>
    </div>
  );
}
