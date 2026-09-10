"use client";
// PM CONTROL TOWER — Plan: requirements capture against the selected project

import { useApi } from "@/lib/client";
import { PageHeader, EmptyState, StatCard, LoadingBlock, ErrorBlock } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import RequirementsPanel from "./shared/RequirementsPanel";
import { ScrollText, Wallet, ListChecks, Clock } from "lucide-react";

interface ReqLite { id: string; status: string; effortEstimate: number; priority: string }
interface RequirementsBundle { items: ReqLite[]; total: number }

export default function RequirementsView() {
  const [projectId, setProjectId] = useStoredProjectId();
  const summary = useApi<RequirementsBundle>(projectId ? `/api/projects/${projectId}/requirements` : null);

  const items = summary.data?.items || [];
  const byStatus = (s: string) => items.filter((r) => r.status === s).length;

  return (
    <div className="space-y-5">
      <PageHeader
        io="requirements"
        title="Requirements"
        subtitle="Traceable scope register — capture, prioritise and track requirement status per project."
        breadcrumb={["Home", "Plan", "Requirements"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />

      {projectId && (
        summary.loading ? <LoadingBlock label="Summarising requirements…" /> :
        summary.error ? <ErrorBlock message={summary.error} onRetry={summary.refetch} /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Requirements" value={summary.data?.total ?? 0} sub="Registered scope items" icon={<ScrollText className="h-4 w-4" />} />
            <StatCard label="Baselined" value={byStatus("BASELINED") + byStatus("ACCEPTED")} sub="Committed to delivery" icon={<ListChecks className="h-4 w-4" />} />
            <StatCard label="In delivery" value={byStatus("IN_PROGRESS") + byStatus("DELIVERED")} sub="Being built or verified" icon={<Clock className="h-4 w-4" />} />
            <StatCard label="Total effort" value={`${Math.round(items.reduce((a, r) => a + (r.effortEstimate || 0), 0))}h`} sub="Estimate across all requirements" icon={<Wallet className="h-4 w-4" />} />
          </div>
        )
      )}

      {projectId ? <RequirementsPanel key={projectId} projectId={projectId} /> : (
        <EmptyState title="No project selected" description="Pick a project above to manage its requirements." />
      )}
    </div>
  );
}
