"use client";
// PM CONTROL TOWER — Plan: compact read-only project register with CSV export.
// Rows navigate to the project workspace.

import { useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, LoadingBlock, ErrorBlock, StatCard, StatusChip, RagBadge, ProgressBar,
  Toolbar, DataTable, Button,
} from "@/components/pmct/kit";
import type { Column } from "@/components/pmct/kit";
import { money, num, fmtDate } from "@/lib/constants";
import { Download, FolderKanban, Wallet, Activity } from "lucide-react";

type ProjectRow = {
  id: string; code: string; name: string; status: string; phase: string;
  progress: number; healthScore: number; ragStatus: string;
  startDate: string | null; endDate: string | null; currentBudget: number;
  owner: { id: string; name: string } | null;
  program: { id: string; code: string; name: string; portfolio?: { id: string; code: string; name: string } } | null;
  portfolio: { id: string; code: string; name: string } | null;
};
interface ProjectsBundle { items: ProjectRow[]; total: number }

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function RegisterView() {
  const projects = useApi<ProjectsBundle>("/api/projects?take=500");
  useRealtimeRefetch(projects.refetch, ["project:created", "project:updated", "project:health"]);

  const rows = projects.data?.items || [];

  const exportCsv = () => {
    const header = ["Code", "Name", "Status", "Phase", "Program", "Portfolio", "PM", "RAG", "Health", "Progress", "Start", "Finish", "Budget"];
    const lines = rows.map((p) => [
      p.code, p.name, p.status, p.phase,
      p.program?.name || "", p.program?.portfolio?.name || p.portfolio?.name || "",
      p.owner?.name || "", p.ragStatus, Math.round(p.healthScore), Math.round(p.progress),
      p.startDate ? fmtDate(p.startDate) : "", p.endDate ? fmtDate(p.endDate) : "",
      p.currentBudget,
    ].map(csvEscape).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pmct-project-register-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const columns: Column<ProjectRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs text-slate-500">{r.code}</span> },
    { key: "name", header: "Project", render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
    { key: "phase", header: "Phase", render: (r) => <StatusChip status={r.phase} /> },
    { key: "program", header: "Program", render: (r) => r.program?.name || "—" },
    { key: "pm", header: "PM", render: (r) => r.owner?.name || "—" },
    { key: "budget", header: "Budget", className: "text-right", render: (r) => <span className="tabular-nums text-xs">{money(r.currentBudget)}</span> },
    { key: "progress", header: "Progress", className: "w-32", render: (r) => (
      <div className="flex items-center gap-2">
        <ProgressBar value={r.progress} className="flex-1" />
        <span className="text-[11px] tabular-nums text-slate-500 w-9 text-right">{Math.round(r.progress)}%</span>
      </div>
    ) },
    { key: "rag", header: "RAG", render: (r) => <RagBadge rag={r.ragStatus} score={r.healthScore} /> },
  ];

  if (projects.loading) return <LoadingBlock label="Loading register…" />;
  if (projects.error || !projects.data) return <ErrorBlock message={projects.error || "Register unavailable"} onRetry={projects.refetch} />;

  const totBudget = rows.reduce((a, p) => a + p.currentBudget, 0);
  const avgProgress = rows.length ? rows.reduce((a, p) => a + p.progress, 0) / rows.length : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        io="projects"
        title="Project Register"
        subtitle="Planning view across every project — export the register or open a workspace."
        breadcrumb={["Home", "Plan", "Register"]}
        actions={(
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        )}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Projects" value={projects.data.total} sub="Full register" icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Combined budget" value={money(totBudget)} sub="Current budgets" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Average progress" value={`${num(avgProgress, 1)}%`} sub="Portfolio mean" icon={<Activity className="h-4 w-4" />} />
      </div>

      <Toolbar>
        <span className="text-xs text-slate-400">Read-only planning register — edit projects from the Projects page.</span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
        onRowClick={(r) => { window.location.hash = `/projects/${r.id}`; }}
        emptyTitle="No projects registered"
        emptyDescription="Create projects from the Projects page."
        maxHeight="640px"
      />
    </div>
  );
}
