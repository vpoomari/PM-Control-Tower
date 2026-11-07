"use client";
// PM CONTROL TOWER — Field Dictionary · impact analysis & history dialog
// Shows what a proposed change to a SHARED definition touches before it saves:
// modules using it, assignment + record counts, potentially incompatible values
// and the migration / approval actions implied. Also renders the field's full
// audit history.

import { useApi } from "@/lib/client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, LoadingBlock, StatusChip, cn } from "@/components/pmct/kit";
import { FIELD_MODULES, moduleLabel } from "@/lib/engines/field-dictionary";
import { AlertTriangle, CheckCircle2, History, ShieldAlert, TriangleAlert } from "lucide-react";
import type { FieldLite } from "@/components/fields/types";

interface Finding { code: string; severity: string; message: string; requiresMigration: boolean; requiresApproval: boolean }
interface ImpactReport {
  usage: { assignments: { moduleKey: string; count: number; sections: string[] }[]; totalAssignments: number; totalValues: number; recordsWithValue: number; modulesWithValues: string[] };
  findings: Finding[];
  severity: string;
  recordCounts: Record<string, number>;
  incompatibleValues: { moduleKey: string; recordId: string; value: unknown }[];
}
interface AuditRow { id: string; action: string; summary: string; moduleKey: string | null; userName: string | null; createdAt: string; beforeJson: string | null; afterJson: string | null }

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-blue-200 bg-blue-50 text-blue-700",
  none: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function ImpactDialog({
  field, open, onOpenChange,
}: {
  field: FieldLite | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const impact = useApi<ImpactReport>(open && field ? `/api/field-dictionary/${field.id}/impact` : null, [field?.id]);
  const audit = useApi<{ logs: AuditRow[]; total: number }>(open && field ? `/api/field-dictionary/audit?fieldId=${field.id}&limit=100` : null, [field?.id]);
  const report = impact.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Impact &amp; history — {field?.label}
            {field && <code className="text-xs font-normal text-slate-400">{field.fieldKey}</code>}
          </DialogTitle>
          <DialogDescription>
            Shared definitions are used by every module that assigned them. Review the blast radius before changing one.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="impact" className="flex-1 overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="impact">Impact analysis</TabsTrigger>
            <TabsTrigger value="usage">Module usage</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <TabsContent value="impact" className="mt-4 space-y-4">
              {impact.loading ? <LoadingBlock label="Analysing impact…" /> : impact.error ? (
                <EmptyState title="Impact analysis unavailable" description={impact.error} />
              ) : !impact.data ? null : (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Metric label="Modules using it" value={impact.data.usage.assignments.length} />
                    <Metric label="Assignments" value={impact.data.usage.totalAssignments} />
                    <Metric label="Stored values" value={impact.data.usage.totalValues} />
                    <Metric label="Records affected" value={impact.data.usage.recordsWithValue} />
                  </div>

                  {impact.data.findings.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> No impact — this change is safe to save.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {impact.data.findings.map((f) => (
                        <li key={f.code} className={cn("rounded-md border p-3 text-sm", SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.low)}>
                          <div className="flex items-start gap-2">
                            {f.severity === "high" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                              : f.severity === "medium" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                            <div>
                              <p className="font-medium">{f.code.replace(/_/g, " ").toLowerCase()} · {f.severity}</p>
                              <p className="mt-0.5 text-xs opacity-90">{f.message}</p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {f.requiresMigration && <Badge variant="outline" className="bg-white text-[10px]">Migration required</Badge>}
                                {f.requiresApproval && <Badge variant="outline" className="bg-white text-[10px]">Extra approval required</Badge>}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {impact.data.incompatibleValues.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      <p className="font-medium">{impact.data.incompatibleValues.length} stored value(s) would become invalid:</p>
                      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                        {impact.data.incompatibleValues.slice(0, 20).map((v, i) => (
                          <li key={i}><code>{moduleLabel(v.moduleKey)}</code> · record <code>{v.recordId.slice(0, 10)}…</code> · value <strong>{String(v.value)}</strong></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="usage" className="mt-4">
              {!report || report.usage.assignments.length === 0 ? (
                <EmptyState title="Not used in any module yet" description="Assign this field to modules from their Configure Fields action." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {report.usage.assignments.map((a) => (
                    <li key={a.moduleKey} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{moduleLabel(a.moduleKey)}</p>
                        <p className="text-[11px] text-slate-400">Sections: {a.sections.join(", ") || "—"}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{a.count} assignment(s)</span>
                        <span className="tabular-nums">{report.recordCounts[a.moduleKey] ?? 0} records</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-slate-400">
                Supported modules: {FIELD_MODULES.map((m) => m.label).join(" · ")}
              </p>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {audit.loading ? <LoadingBlock label="Loading history…" /> : !audit.data?.logs.length ? (
                <EmptyState title="No history yet" description="Creation, updates, assignments and status changes appear here." />
              ) : (
                <ul className="space-y-2">
                  {audit.data.logs.map((l) => (
                    <li key={l.id} className="rounded-md border border-slate-200 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <History className="h-3.5 w-3.5 text-slate-400" />
                          <StatusChip status={l.action} />
                          {l.moduleKey && <Badge variant="outline" className="text-[10px]">{moduleLabel(l.moduleKey)}</Badge>}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(l.createdAt).toLocaleString()} {l.userName ? `· ${l.userName}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{l.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800">{value}</p>
    </div>
  );
}
