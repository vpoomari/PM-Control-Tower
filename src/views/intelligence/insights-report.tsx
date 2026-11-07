"use client";
// PM CONTROL TOWER — PMO Analytics report page: one generic renderer draws any
// of the 50 reports from its declarative ReportPayload (KPIs → StatCards,
// charts → charts3d primitives, tables → DataTable). Roadmap reports render
// their specification card (formula + sources + capture gap) instead.

import { ArrowLeft, Calculator } from "lucide-react";
import { PageHeader, StatCard, SectionCard, DataTable, ErrorBlock, LoadingBlock, EmptyState } from "@/components/pmct/kit";
import type { Column } from "@/components/pmct/kit";
import { Panel, Bar3D, Donut3D, Area3D, Gauge3D } from "@/components/pmct/charts3d";
import { ReportStatusBadge } from "@/components/pmct/report-badge";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { fmtValue, fmtFor } from "@/lib/analytics/format";
import type { ChartSpec, ModuleMeta, ReportPayload, TableSpec } from "@/lib/analytics/types";

interface ReportMeta {
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
interface ReportResponse {
  report: ReportMeta;
  moduleMeta: ModuleMeta;
  payload: ReportPayload | null;
}
type Row = Record<string, unknown>;

function ChartPanel({ spec, accent }: { spec: ChartSpec; accent: string }) {
  const fmt = fmtFor(spec.format);
  if (spec.kind === "gauge") {
    return (
      <Panel accent={accent}>
        <div className="flex justify-center py-2">
          <Gauge3D value={spec.value} max={spec.max} goodAt={spec.goodAt} label={spec.title} sublabel={spec.sublabel} format={fmt} />
        </div>
      </Panel>
    );
  }
  return (
    <Panel title={spec.title} subtitle={spec.subtitle} accent={accent}>
      {spec.kind === "bar" && <Bar3D groups={spec.groups} series={spec.series} yMax={spec.yMax} format={fmt} />}
      {spec.kind === "area" && <Area3D points={spec.points} color={spec.color} format={fmt} />}
      {spec.kind === "donut" && (
        <div className="flex justify-center py-1">
          <Donut3D slices={spec.slices} centerLabel={spec.centerLabel} format={fmt} />
        </div>
      )}
    </Panel>
  );
}

function TableCard({ table }: { table: TableSpec }) {
  const rows: Row[] = table.rows.map((r, i) => ({ ...r, __k: i }));
  const columns: Column<Row>[] = table.columns.map((c) => ({
    key: c.key,
    header: c.header,
    className: c.align === "right" ? "text-right tabular-nums" : undefined,
    render: (row) => fmtValue(row[c.key] as number | string | null | undefined, c.format),
  }));
  return (
    <SectionCard title={table.title} description={table.subtitle} className="mb-4">
      <DataTable columns={columns} rows={rows} keyField="__k" maxHeight="420px" />
    </SectionCard>
  );
}

export default function InsightsReport() {
  const { query } = useRoute();
  const id = query.get("id") ?? "";
  const { data, loading, error, refetch } = useApi<ReportResponse>(
    id ? `/api/analytics/report/${encodeURIComponent(id)}` : null,
    [id],
  );
  useRealtimeRefetch(refetch, ["evm:changed", "project:health", "data:imported"]);

  if (!id) {
    return (
      <div className="pt-2 pb-8">
        <EmptyState
          title="No report selected"
          description="Pick one of the 50 PMO analytics reports from the hub."
          action={
            <a href="#/insights" className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Open PMO Analytics
            </a>
          }
        />
      </div>
    );
  }
  if (loading) return <LoadingBlock label="Computing report…" />;
  if (error || !data) return <ErrorBlock message={error ?? "Report unavailable"} onRetry={refetch} />;

  const { report, moduleMeta, payload } = data;
  const accent = moduleMeta?.accent ?? "#00D9FF";
  const backLink = (
    <a
      href="#/insights"
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All reports
    </a>
  );

  return (
    <div className="pt-2 pb-8">
      <PageHeader
        title={report.title}
        subtitle={report.subtitle}
        breadcrumb={["PMO Analytics", moduleMeta?.label ?? report.module, report.title]}
        actions={backLink}
      />

      {/* Formula + provenance strip — every number on this page is traceable. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
          <Calculator className="h-3.5 w-3.5" aria-hidden /> Formula
        </span>
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{report.formula}</code>
        <span className="text-slate-300" aria-hidden>·</span>
        <span className="text-slate-500">Sources: {report.sources.join(", ")}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: accent, backgroundColor: `${accent}14`, border: `1px solid ${accent}45` }}
          >
            {report.pillar}
          </span>
          <ReportStatusBadge status={report.status} />
        </span>
      </div>

      {/* Roadmap specification view (no fabricated numbers). */}
      {(!payload || report.status === "roadmap") && (
        <SectionCard
          title="Roadmap specification"
          description="Fully defined in the registry — computes as soon as the capture data exists"
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>{report.roadmapNote ?? "This report is scheduled; its data capture is not yet available."}</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-slate-700 mb-1">Required sources</p>
              <div className="flex flex-wrap gap-1">
                {report.sources.map((s) => (
                  <span key={s} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {payload && (
        <>
          {payload.kpis.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {payload.kpis.map((k, i) => (
                <StatCard key={`${k.label}-${i}`} label={k.label} value={fmtValue(k.value, k.format)} tone={k.tone} sub={k.sub} delta={k.delta} spark={k.spark} />
              ))}
            </div>
          )}

          {payload.charts.length > 0 && (
            <div className="mb-5 grid gap-4 xl:grid-cols-2">
              {payload.charts.map((c, i) => (
                <ChartPanel key={`${c.title}-${i}`} spec={c} accent={accent} />
              ))}
            </div>
          )}

          {payload.tables.map((t, i) => (
            <TableCard key={`${t.title}-${i}`} table={t} />
          ))}

          {payload.emptyHints && payload.emptyHints.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900" role="note">
              <p className="mb-1 font-semibold">No source data captured for this report yet</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {payload.emptyHints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {payload.notes.filter(Boolean).length > 0 && (
            <SectionCard title="Methodology" description="How this report computes its numbers" className="mt-5">
              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-500">
                {payload.notes.filter(Boolean).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </SectionCard>
          )}

          <p className="mt-4 text-[11px] text-slate-400">
            Scope: {payload.scope.label} ({payload.scope.projects} project{payload.scope.projects === 1 ? "" : "s"}) ·
            {" "}Computed {new Date(payload.generatedAt).toLocaleString()} ·
            {" "}Report id <span className="font-mono">{payload.reportId}</span>
          </p>
        </>
      )}
    </div>
  );
}
