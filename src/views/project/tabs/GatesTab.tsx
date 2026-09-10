"use client";
// PM CONTROL TOWER — Workspace Stage Gates tab: governance checkpoints with decisions

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, EmptyState, StatCard } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/constants";
import { ShieldCheck, ShieldAlert, CalendarClock, Gavel } from "lucide-react";

interface Gate {
  id: string;
  code: string;
  sequence: number;
  name: string;
  description: string | null;
  criteria: string | null;
  plannedDate: string | null;
  decisionStatus: string;
  decisionDate: string | null;
  approverId: string | null;
  approverName: string | null;
  evidence: string | null;
  comments: string | null;
}
interface GatesBundle { gates: Gate[] }

const DECISIONS = ["PASSED", "FAILED", "CONDITIONAL", "DEFERRED"];

export default function GatesTab({ projectId }: { projectId: string }) {
  const gates = useApi<GatesBundle>(`/api/gates?projectId=${projectId}`);
  useRealtimeRefetch(gates.refetch, ["gate:changed", "project:updated"]);

  const [dialog, setDialog] = useState<{ gate: Gate; decision: string; evidence: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      await api.patch(`/api/gates/${dialog.gate.id}`, {
        decisionStatus: dialog.decision,
        evidence: dialog.evidence.trim() || undefined,
      });
      toast.success(`${dialog.gate.code} → ${dialog.decision.toLowerCase()}`);
      setDialog(null);
      await gates.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };

  if (gates.loading) return <LoadingBlock label="Loading stage gates…" />;
  if (gates.error) return <ErrorBlock message={gates.error} onRetry={gates.refetch} />;

  const items = [...(gates.data?.gates || [])].sort((a, b) => a.sequence - b.sequence);
  const passed = items.filter((g) => g.decisionStatus === "PASSED").length;
  const pending = items.filter((g) => g.decisionStatus === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Stage gates" value={items.length} sub="Lifecycle checkpoints" icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Passed" value={passed} tone={passed === items.length && items.length > 0 ? "good" : "default"} sub="Clean approvals" icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Pending" value={pending} tone={pending > 0 ? "warn" : "default"} sub="Awaiting decision" icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Conditional / failed" value={items.filter((g) => ["CONDITIONAL", "FAILED", "DEFERRED"].includes(g.decisionStatus)).length} sub="Attention required" tone="warn" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <SectionCard title="Gate sequence" description="Ordered by lifecycle sequence — decisions require the gate.decide permission">
        {!items.length ? (
          <EmptyState title="No stage gates defined" description="Gates are created from templates or governance configuration." />
        ) : (
          <div className="space-y-3">
            {items.map((g) => {
              const decided = g.decisionStatus !== "PENDING";
              return (
                <div key={g.id} className="relative rounded-lg border border-slate-200 p-4 pl-12">
                  <span className="absolute left-4 top-4 h-6 w-6 rounded-full bg-slate-800 text-white text-xs font-semibold flex items-center justify-center" aria-hidden>
                    {g.sequence}
                  </span>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{g.code}</span>
                        <h4 className="text-sm font-semibold text-slate-800">{g.name}</h4>
                        <StatusChip status={g.decisionStatus} />
                      </div>
                      {g.criteria && <p className="text-xs text-slate-500 mt-1.5"><b className="text-slate-600">Criteria:</b> {g.criteria}</p>}
                      <p className="text-xs text-slate-500 mt-1">
                        Planned {fmtDate(g.plannedDate)}
                        {decided && g.decisionDate && <> · decided {fmtDate(g.decisionDate)}</>}
                        {g.approverName && <> · approver {g.approverName}</>}
                      </p>
                      {g.evidence && <p className="text-xs text-slate-500 mt-1"><b className="text-slate-600">Evidence:</b> {g.evidence}</p>}
                      {g.comments && <p className="text-xs text-slate-400 mt-1">{g.comments}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {decided && <StatusChip status={g.decisionStatus} className="hidden sm:inline-flex" />}
                      <Button
                        size="sm"
                        variant={decided ? "outline" : "default"}
                        className="h-8"
                        onClick={() => setDialog({ gate: g, decision: decided ? g.decisionStatus : "PASSED", evidence: g.evidence || "" })}
                      >
                        <Gavel className="h-3.5 w-3.5 mr-1" /> {decided ? "Re-decide" : "Record decision"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <Dialog open={Boolean(dialog)} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gate decision — {dialog?.gate.code}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <p className="text-sm text-slate-600">{dialog?.gate.name}</p>
            <div className="grid gap-1.5">
              <Label>Decision</Label>
              <div className="grid grid-cols-2 gap-2">
                {DECISIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => dialog && setDialog({ ...dialog, decision: d })}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      dialog?.decision === d
                        ? d === "PASSED" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : d === "FAILED" ? "border-red-300 bg-red-50 text-red-700"
                            : "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gate-evidence">Evidence</Label>
              <Textarea id="gate-evidence" rows={3} value={dialog?.evidence || ""} onChange={(e) => dialog && setDialog({ ...dialog, evidence: e.target.value })} placeholder="Gate pack, minutes, metrics pack references…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !dialog?.decision}>{busy ? "Recording…" : "Record decision"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
