"use client";
// PM CONTROL TOWER — Workspace Changes tab: change request governance workflow
// DRAFT → SUBMITTED → ASSESSMENT → APPROVAL → APPROVED|REJECTED → IMPLEMENTED → CLOSED
// Decisions are only valid from ASSESSMENT/APPROVAL and are role-gated server-side.

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, EmptyState } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money, num, fmtDate } from "@/lib/constants";
import { GitPullRequest, ArrowRight } from "lucide-react";

interface ChangeRequest {
  id: string;
  code: string;
  title: string;
  description: string | null;
  reason: string | null;
  category: string;
  requesterName: string | null;
  impactHours: number;
  impactCost: number;
  scheduleImpactDays: number;
  riskImpact: string;
  priority: string;
  status: string;
  decision: string | null;
  decisionDate: string | null;
  decidedBy: string | null;
  dueDate: string | null;
  createdAt: string;
}
interface ChangesBundle { changes: ChangeRequest[] }

/** Mirror of the server-side transition table (kept in sync with the API contract). */
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["ASSESSMENT"],
  ASSESSMENT: ["APPROVAL", "REJECTED"],
  APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["IMPLEMENTED"],
  IMPLEMENTED: ["CLOSED"],
  REJECTED: [],
  CLOSED: [],
};

export default function ChangesTab({ projectId }: { projectId: string }) {
  const changes = useApi<ChangesBundle>(`/api/changes?projectId=${projectId}`);
  useRealtimeRefetch(changes.refetch, ["change:changed", "project:updated"]);

  const [decision, setDecision] = useState<{ cr: ChangeRequest; action: "APPROVED" | "REJECTED" } | null>(null);
  const [busy, setBusy] = useState(false);

  const transition = async (cr: ChangeRequest, next: string) => {
    if (next === "APPROVED" || next === "REJECTED") {
      setDecision({ cr, action: next });
      return;
    }
    try {
      await api.patch(`/api/changes/${cr.id}`, { status: next });
      toast.success(`${cr.code} → ${next.replace("_", " ").toLowerCase()}`);
      await changes.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transition failed");
    }
  };

  const submitDecision = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      await api.patch(`/api/changes/${decision.cr.id}`, {
        status: decision.action,
        decision: decision.action,
      });
      toast.success(`${decision.cr.code} ${decision.action.toLowerCase()} — decision recorded`);
      setDecision(null);
      await changes.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  };

  if (changes.loading) return <LoadingBlock label="Loading change requests…" />;
  if (changes.error) return <ErrorBlock message={changes.error} onRetry={changes.refetch} />;

  const items = changes.data?.changes || [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Change requests"
        description="Governance workflow with recorded impact — approval does not auto-apply budget changes"
      >
        {!items.length ? (
          <EmptyState title="No change requests" description="Scope, cost or schedule changes raised for this project will appear here." />
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Change</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium text-right">Impact (h / cost / days)</th>
                  <th className="px-3 py-2.5 font-medium">Risk impact</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Decision</th>
                  <th className="px-3 py-2.5 font-medium">Workflow</th>
                </tr>
              </thead>
              <tbody>
                {items.map((cr) => {
                  const nexts = TRANSITIONS[cr.status] || [];
                  return (
                    <tr key={cr.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40 align-top">
                      <td className="px-3 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{cr.code}</td>
                      <td className="px-3 py-3 max-w-[260px]">
                        <p className="font-medium text-slate-800">{cr.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Requested by {cr.requesterName || "—"} · {fmtDate(cr.createdAt)}
                          {cr.dueDate && <> · decision due {fmtDate(cr.dueDate)}</>}
                        </p>
                        {cr.reason && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cr.reason}</p>}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{cr.category}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {num(cr.impactHours, 0)}h · {money(cr.impactCost)} · {num(cr.scheduleImpactDays, 0)}d
                      </td>
                      <td className="px-3 py-3"><StatusChip status={cr.riskImpact} /></td>
                      <td className="px-3 py-3"><StatusChip status={cr.status} /></td>
                      <td className="px-3 py-3">
                        {cr.decision ? (
                          <div>
                            <StatusChip status={cr.decision} />
                            <p className="text-[10px] text-slate-400 mt-1">{cr.decidedBy} · {fmtDate(cr.decisionDate)}</p>
                          </div>
                        ) : <span className="text-slate-400 text-xs">Pending</span>}
                      </td>
                      <td className="px-3 py-3">
                        {nexts.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {nexts.map((n) => (
                              <Button
                                key={n}
                                size="sm"
                                variant={n === "APPROVED" ? "default" : n === "REJECTED" ? "outline" : "secondary"}
                                className="h-7 text-xs"
                                onClick={() => transition(cr, n)}
                              >
                                {n === "APPROVED" || n === "REJECTED" ? n : <><ArrowRight className="h-3 w-3 mr-1" />{n}</>}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Terminal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <GitPullRequest className="h-3.5 w-3.5" />
          Workflow: DRAFT → SUBMITTED → ASSESSMENT → APPROVAL → APPROVED/REJECTED → IMPLEMENTED → CLOSED. Decisions (approve/reject) require a governance role and are only taken during ASSESSMENT or APPROVAL.
        </p>
      </SectionCard>

      {/* Decision dialog */}
      <Dialog open={Boolean(decision)} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{decision?.action === "APPROVED" ? "Approve" : "Reject"} {decision?.cr.code}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <p className="text-sm text-slate-600">
              {decision?.cr.title} — recorded impact {decision ? `${num(decision.cr.impactHours, 0)}h, ${money(decision.cr.impactCost)}, ${num(decision.cr.scheduleImpactDays, 0)} days schedule` : ""}.
            </p>
            <p className="text-xs text-slate-500">Impact is recorded for governance traceability; applying it to budget/schedule is a separate implementation step. The decision and decider are written to the audit trail.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              onClick={submitDecision}
              disabled={busy}
              className={decision?.action === "REJECTED" ? "bg-red-600 hover:bg-red-700" : undefined}
            >
              {busy ? "Recording…" : `Confirm ${decision?.action === "APPROVED" ? "approval" : "rejection"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
