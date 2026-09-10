"use client";
// PM CONTROL TOWER — Workspace Audit tab: governance-grade audit trail for this project

import { useApi } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, DataTable, EmptyState } from "@/components/pmct/kit";
import type { Column } from "@/components/pmct/kit";
import { fmtDateTime } from "@/lib/constants";
import { History } from "lucide-react";

type AuditItem = {
  id: string;
  userName: string | null;
  role: string | null;
  action: string;
  entityType: string;
  entityName: string | null;
  ipAddress: string | null;
  severity: string;
  createdAt: string;
};
interface AuditBundle { projectId: string; projectName: string; items: AuditItem[]; total: number }

export default function AuditTab({ projectId }: { projectId: string }) {
  const audit = useApi<AuditBundle>(`/api/projects/${projectId}/audit`);

  const columns: Column<AuditItem>[] = [
    { key: "createdAt", header: "Time", render: (r) => <span className="text-xs text-slate-600 whitespace-nowrap tabular-nums">{fmtDateTime(r.createdAt)}</span> },
    { key: "userName", header: "User", render: (r) => r.userName || "System" },
    { key: "action", header: "Action", render: (r) => (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">{r.action}</span>
    ) },
    { key: "entityType", header: "Entity", render: (r) => <span className="text-xs">{r.entityType}</span> },
    { key: "entityName", header: "Name", render: (r) => <span className="text-xs text-slate-600 max-w-[280px] truncate inline-block">{r.entityName || "—"}</span> },
    { key: "ipAddress", header: "IP", render: (r) => <span className="text-xs text-slate-400 font-mono">{r.ipAddress || "—"}</span> },
  ];

  return (
    <SectionCard
      title="Audit trail"
      description={`${audit.data?.total ?? 0} events for this project and its planning artifacts (latest 100)`}
    >
      {audit.loading ? <LoadingBlock label="Loading audit trail…" />
        : audit.error ? <ErrorBlock message={audit.error} onRetry={audit.refetch} />
        : !(audit.data?.items || []).length ? (
          <EmptyState title="No audit events recorded yet" description="Plan and control actions on this project are captured here." />
        ) : (
          <DataTable columns={columns} rows={audit.data?.items || []} keyField="id" maxHeight="520px" />
        )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
        <History className="h-3.5 w-3.5" /> Every mutation is captured with actor, entity and source IP for compliance review.
      </p>
    </SectionCard>
  );
}
