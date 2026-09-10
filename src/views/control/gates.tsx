"use client";
// PM CONTROL TOWER — Stage gates: sequence stepper, gate cards, decision dialog.

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDate } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Metric, cn,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker, useControlProjectId, useControlProjectOptions } from "@/views/control/shared/pickers";
import { hasPerm, useMe } from "@/views/execute/shared/pickers";
import { Gavel, Stamp } from "lucide-react";

interface Gate {
  id: string; projectId: string; code: string; sequence: number; name: string;
  description: string | null; criteria: string | null; plannedDate: string | null;
  decisionStatus: string; decisionDate: string | null; approverName: string | null;
  evidence: string | null; comments: string | null;
  project: { id: string; code: string; name: string };
}

const DECISIONS = ["PASSED", "FAILED", "CONDITIONAL", "DEFERRED", "PENDING"] as const;

const STEP_TONES: Record<string, { ring: string; dot: string; text: string; line: string }> = {
  PASSED: { ring: "border-emerald-500 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-700", line: "bg-emerald-400" },
  FAILED: { ring: "border-red-500 bg-red-50", dot: "bg-red-500", text: "text-red-700", line: "bg-red-400" },
  CONDITIONAL: { ring: "border-amber-500 bg-amber-50", dot: "bg-amber-500", text: "text-amber-700", line: "bg-amber-300" },
  DEFERRED: { ring: "border-slate-600 bg-slate-100", dot: "bg-slate-600", text: "text-slate-700", line: "bg-slate-400" },
  PENDING: { ring: "border-slate-300 bg-white", dot: "bg-slate-300", text: "text-slate-500", line: "bg-slate-200" },
};

export default function GatesView() {
  const me = useMe();
  const { options, loading: optionsLoading } = useControlProjectOptions();
  const [projectId, setProjectId] = useControlProjectId(options);

  const gates = useApi<{ gates: Gate[] }>(projectId ? `/api/gates?projectId=${projectId}` : null);
  useRealtimeRefetch(gates.refetch, ["governance:changed"]);

  const [target, setTarget] = useState<Gate | null>(null);
  const [decision, setDecision] = useState<string>("PASSED");
  const [evidence, setEvidence] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  const openDecision = (g: Gate) => {
    setTarget(g);
    setDecision(g.decisionStatus === "PENDING" ? "PASSED" : g.decisionStatus);
    setEvidence(g.evidence ?? "");
    setComments(g.comments ?? "");
  };

  const saveDecision = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await api.patch(`/api/gates/${target.id}`, {
        decisionStatus: decision,
        evidence: evidence || null,
        comments: comments || null,
      });
      toast.success(`${target.code} decision recorded: ${decision.toLowerCase()}`);
      setTarget(null);
      await gates.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setSaving(false);
    }
  };

  if (optionsLoading) return <LoadingBlock label="Loading projects…" />;
  if (!projectId) return <EmptyState title="No projects available" />;

  const sorted = [...(gates.data?.gates ?? [])].sort((a, b) => a.sequence - b.sequence);
  const passedCount = sorted.filter((g) => g.decisionStatus === "PASSED").length;
  const selected = options.find((o) => o.id === projectId);

  return (
    <div className="space-y-5">
      <PageHeader
        io="stage-gates"
        title="Stage Gates"
        subtitle="Governed progression checkpoints — evidence in, decision out."
        breadcrumb={["Home", "Control", "Stage Gates"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} options={options} />}
      />

      {gates.loading && !gates.data ? <LoadingBlock label="Loading gates…" /> :
        gates.error && !gates.data ? <ErrorBlock message={gates.error} onRetry={gates.refetch} /> : sorted.length === 0 ? (
          <EmptyState title="No gates defined" description="Gates are created with project methodology or templates." />
        ) : (
          <>
            {/* Stepper */}
            <SectionCard title={selected ? `${selected.code} — ${selected.name}` : "Gate sequence"} description={`${passedCount} of ${sorted.length} gates passed`}>
              <div className="overflow-x-auto pb-1">
                <div className="flex items-stretch min-w-max">
                  {sorted.map((g, idx) => {
                    const tone = STEP_TONES[g.decisionStatus] ?? STEP_TONES.PENDING;
                    return (
                      <div key={g.id} className="flex items-center">
                        <button onClick={() => openDecision(g)} className="flex flex-col items-center group w-28" aria-label={`Gate ${g.sequence}: ${g.name}`}>
                          <div className={cn("h-10 w-10 rounded-full border-2 flex items-center justify-center text-sm font-bold tabular-nums transition-transform group-hover:scale-105", tone.ring, tone.text)}>
                            {g.sequence}
                          </div>
                          <span className={cn("mt-1.5 text-[10px] font-medium text-center leading-tight line-clamp-2", tone.text)}>{g.name.replace(/^Gate \d+ — /, "")}</span>
                          <span className="text-[9px] uppercase text-slate-400 mt-0.5">{g.decisionStatus.toLowerCase()}</span>
                        </button>
                        {idx < sorted.length - 1 && <div className={cn("h-0.5 w-8 -mt-6", g.decisionStatus === "PASSED" ? tone.line : "bg-slate-200")} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionCard>

            {/* Gate cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sorted.map((g) => (
                <SectionCard key={g.id}
                  title={g.name}
                  description={g.code}
                  actions={<StatusChip status={g.decisionStatus} />}
                >
                  <div className="space-y-3">
                    {g.criteria && <p className="text-xs text-slate-600 leading-relaxed"><span className="font-semibold text-slate-500 uppercase text-[10px] block mb-0.5">Criteria</span>{g.criteria}</p>}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <Metric label="Planned date" value={fmtDate(g.plannedDate)} />
                      <Metric label="Decided" value={g.decisionDate ? fmtDate(g.decisionDate) : "—"} />
                      <Metric label="Approver" value={g.approverName || "Unassigned"} />
                      <Metric label="Sequence" value={g.sequence} />
                    </div>
                    {g.evidence && <p className="text-xs text-slate-500"><span className="font-semibold text-slate-400 uppercase text-[10px] block mb-0.5">Evidence</span>{g.evidence}</p>}
                    {g.comments && <p className="text-xs text-slate-500"><span className="font-semibold text-slate-400 uppercase text-[10px] block mb-0.5">Comments</span>{g.comments}</p>}
                    {hasPerm(me, "gate.decide") && (
                      <Button size="sm" variant="outline" onClick={() => openDecision(g)}>
                        <Stamp className="h-3.5 w-3.5 mr-1.5" />{g.decisionStatus === "PENDING" ? "Record decision" : "Revise decision"}
                      </Button>
                    )}
                  </div>
                </SectionCard>
              ))}
            </div>
          </>
        )}

      {/* Decision dialog */}
      <Dialog open={Boolean(target)} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gavel className="h-4 w-4 text-slate-500" />{target ? `Decision — ${target.code}` : "Gate decision"}</DialogTitle>
            <DialogDescription>{target?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Decision</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{DECISIONS.map((dOpt) => <SelectItem key={dOpt} value={dOpt}>{dOpt}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-ev">Evidence</Label>
              <Textarea id="g-ev" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Gate pack, metrics, artifacts reviewed" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-cm">Comments</Label>
              <Textarea id="g-cm" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Conditions, notes for the PM" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void saveDecision()}>{saving ? "Recording…" : "Record decision"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
