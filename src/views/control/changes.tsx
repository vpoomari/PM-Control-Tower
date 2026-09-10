"use client";
// PM CONTROL TOWER — Change control: CR register + governed workflow drawer.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDate, fmtDateTime, money, num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, Toolbar, LoadingBlock, ErrorBlock, EmptyState, DataTable, Column,
  Button, Input, Metric,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker, useControlProjectOptions } from "@/views/control/shared/pickers";
import { AlertTriangle, Plus } from "lucide-react";

interface ChangeRequest {
  [key: string]: unknown;
  id: string; projectId: string; code: string; title: string; description: string | null;
  reason: string | null; category: string; requesterName: string; impactHours: number;
  impactCost: number; scheduleImpactDays: number; riskImpact: string; status: string;
  decision: string | null; decisionDate: string | null; decidedBy: string | null;
  priority: string; createdAt: string;
  project: { id: string; code: string; name: string };
}
interface ChangesData { changes: ChangeRequest[]; total: number }
interface ChangeDetail { change: ChangeRequest; workflow: { allowedNext: string[] } }

const NEXT_LABELS: Record<string, string> = {
  SUBMITTED: "Submit",
  ASSESSMENT: "Start assessment",
  APPROVAL: "Send to approval",
  APPROVED: "Approve",
  REJECTED: "Reject",
  IMPLEMENTED: "Mark implemented",
  CLOSED: "Close",
};

const CATEGORIES = ["SCOPE", "COST", "SCHEDULE", "QUALITY", "RISK", "RESOURCE", "CONTRACT", "OTHER"] as const;
const IMPACTS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const emptyCr = { projectId: "", title: "", description: "", reason: "", category: "SCOPE", impactHours: "0", impactCost: "0", scheduleImpactDays: "0", riskImpact: "LOW", priority: "MEDIUM" };

export default function ChangesView() {
  const { options } = useControlProjectOptions();
  const changes = useApi<ChangesData>("/api/changes");
  useRealtimeRefetch(changes.refetch, ["change:changed", "governance:changed"]);

  const [projectFilter, setProjectFilter] = useState("all");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const detail = useApi<ChangeDetail>(drawerId ? `/api/changes/${drawerId}` : null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [form, setForm] = useState(emptyCr);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const rows = (changes.data?.changes ?? []).filter((c) => projectFilter === "all" || c.projectId === projectFilter);

  const doTransition = async (id: string, body: Record<string, string>) => {
    setTransitioning(true);
    setInlineError(null);
    try {
      await api.patch(`/api/changes/${id}`, body);
      toast.success(`Change moved to ${String(body.status || body.decision).toLowerCase()}`);
      await Promise.all([detail.refetch(), changes.refetch()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transition failed";
      setInlineError(msg); // 409 and friends surface inline in the workflow panel
      toast.error("Transition rejected by the workflow engine");
    } finally {
      setTransitioning(false);
    }
  };

  const createCr = async () => {
    if (!form.projectId) { toast.error("Select the affected project"); return; }
    if (form.title.trim().length < 3) { toast.error("Title is required (min 3 chars)"); return; }
    setSavingNew(true);
    try {
      await api.post("/api/changes", {
        projectId: form.projectId,
        title: form.title.trim(),
        description: form.description || null,
        reason: form.reason || null,
        category: form.category,
        impactHours: Number(form.impactHours) || 0,
        impactCost: Number(form.impactCost) || 0,
        scheduleImpactDays: Number(form.scheduleImpactDays) || 0,
        riskImpact: form.riskImpact,
        priority: form.priority,
      });
      toast.success("Change request raised");
      setNewOpen(false);
      setForm(emptyCr);
      await changes.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not raise change request");
    } finally {
      setSavingNew(false);
    }
  };

  useEffect(() => { setInlineError(null); }, [drawerId]);

  const columns: Column<ChangeRequest>[] = [
    { key: "code", header: "Code", render: (c) => <span className="font-mono text-xs text-slate-500">{c.code}</span> },
    { key: "title", header: "Change", className: "min-w-56 max-w-80", render: (c) => (
      <div><p className="font-medium text-slate-800 truncate">{c.title}</p><p className="text-xs text-slate-400">{c.project.code} · {c.category.toLowerCase()}</p></div>
    ) },
    { key: "requester", header: "Requester", render: (c) => <span className="text-slate-600">{c.requesterName}</span> },
    { key: "status", header: "Status", render: (c) => <StatusChip status={c.status} /> },
    { key: "impactHours", header: "Effort", render: (c) => <span className="tabular-nums text-slate-600">{num(c.impactHours)}h</span> },
    { key: "impactCost", header: "Cost", render: (c) => <span className="tabular-nums text-slate-600">{money(c.impactCost)}</span> },
    { key: "scheduleImpactDays", header: "Schedule", render: (c) => <span className="tabular-nums text-slate-600">{c.scheduleImpactDays}d</span> },
    { key: "riskImpact", header: "Risk", render: (c) => <StatusChip status={c.riskImpact} /> },
    { key: "decision", header: "Decision", render: (c) => c.decision ? <StatusChip status={c.decision} /> : <span className="text-slate-400 text-xs">—</span> },
    { key: "decidedAt", header: "Decided", render: (c) => <span className="text-xs tabular-nums text-slate-500">{c.decisionDate ? fmtDate(c.decisionDate) : "—"}</span> },
  ];

  const d = detail.data;

  return (
    <div className="space-y-5">
      <PageHeader
        io="changes"
        title="Change Control"
        subtitle="Governed change requests — impact assessed, decided and recorded before anything moves."
        breadcrumb={["Home", "Control", "Change Control"]}
        actions={<Button size="sm" onClick={() => { setForm((p) => ({ ...p, projectId: projectFilter !== "all" ? projectFilter : "" })); setNewOpen(true); }}><Plus className="h-4 w-4 mr-1.5" />New change request</Button>}
      />

      <Toolbar>
        <ProjectPicker value={projectFilter} onChange={setProjectFilter} options={options} placeholder="All projects" />
        <span className="text-xs text-slate-400 ml-1">{rows.length} of {changes.data?.total ?? 0} requests</span>
      </Toolbar>

      {changes.loading && !changes.data ? <LoadingBlock label="Loading change register…" /> :
        changes.error && !changes.data ? <ErrorBlock message={changes.error} onRetry={changes.refetch} /> : (
          <SectionCard bodyClass="p-0">
            <DataTable columns={columns} rows={rows} keyField="id" onRowClick={(c) => setDrawerId(c.id)}
              emptyTitle="No change requests" emptyDescription="Raised changes will appear here with their live workflow state."
              maxHeight="36rem" />
          </SectionCard>
        )}

      {/* Detail drawer with workflow */}
      <Sheet open={Boolean(drawerId)} onOpenChange={(o) => { if (!o) setDrawerId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{d ? `${d.change.code} — ${d.change.title}` : "Change request"}</SheetTitle>
            <SheetDescription>{d ? `${d.change.project.code} — ${d.change.project.name}` : ""}</SheetDescription>
          </SheetHeader>
          {detail.loading && !d ? <LoadingBlock /> : detail.error ? <ErrorBlock message={detail.error} onRetry={detail.refetch} /> : d ? (
            <div className="px-4 pb-8 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={d.change.status} />
                <StatusChip status={d.change.priority} />
                <span className="text-xs text-slate-400">raised by {d.change.requesterName} · {fmtDateTime(d.change.createdAt)}</span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Metric label="Category" value={d.change.category} />
                <Metric label="Risk impact" value={<StatusChip status={d.change.riskImpact} />} />
                <Metric label="Effort impact" value={`${num(d.change.impactHours)}h`} />
                <Metric label="Cost impact" value={money(d.change.impactCost)} />
                <Metric label="Schedule impact" value={`${d.change.scheduleImpactDays}d`} />
                <Metric label="Decision" value={d.change.decision ? <StatusChip status={d.change.decision} /> : "Pending"} />
              </div>

              {d.change.description && <div><p className="text-[10px] uppercase text-slate-400 mb-1">Description</p><p className="text-sm text-slate-600">{d.change.description}</p></div>}
              {d.change.reason && <div><p className="text-[10px] uppercase text-slate-400 mb-1">Reason</p><p className="text-sm text-slate-600">{d.change.reason}</p></div>}
              {d.change.decidedBy && (
                <p className="text-xs text-slate-400">Decided by {d.change.decidedBy} on {fmtDateTime(d.change.decisionDate)}. Impact is recorded only — budgets are not auto-applied.</p>
              )}

              {/* Workflow */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">Workflow — allowed next steps</p>
                {inlineError && (
                  <div className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{inlineError}
                  </div>
                )}
                {d.workflow.allowedNext.length === 0 ? (
                  <p className="text-xs text-slate-400">Terminal state — no further transitions.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {d.workflow.allowedNext.map((next) => next === "REJECTED" ? (
                      <Button key={next} size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={transitioning}
                        onClick={() => { setRejectReason(""); setRejectOpen(true); }}>
                        {NEXT_LABELS[next]}
                      </Button>
                    ) : (
                      <Button key={next} size="sm" disabled={transitioning}
                        variant={next === "APPROVED" ? "default" : "outline"}
                        onClick={() => void doTransition(d.change.id, next === "APPROVED" ? { status: "APPROVED", decision: "APPROVED" } : next === "REJECTED" ? { status: "REJECTED", decision: "REJECTED" } : { status: next })}>
                        {NEXT_LABELS[next]}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-2">DRAFT → SUBMITTED → ASSESSMENT → APPROVAL → APPROVED / REJECTED → IMPLEMENTED → CLOSED</p>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject change request</DialogTitle>
            <DialogDescription>{d ? `${d.change.code} will move to REJECTED. The decision is recorded in the audit trail.` : ""}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Decision rationale (required)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={rejectReason.trim().length < 3 || !d || transitioning}
              onClick={() => { setRejectOpen(false); if (d) void doTransition(d.change.id, { status: "REJECTED", decision: "REJECTED" }); }}>
              Reject change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New CR dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New change request</DialogTitle>
            <DialogDescription>Raise a governed change with its assessed impact.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Project *</Label>
              <ProjectPicker value={form.projectId} onChange={(v) => setForm((p) => ({ ...p, projectId: v }))} options={options} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="cr-title">Title *</Label>
              <Input id="cr-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="What is changing?" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="cr-desc">Description</Label>
              <Textarea id="cr-desc" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="cr-reason">Reason</Label>
              <Input id="cr-reason" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Why this change is needed" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{IMPACTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-hours">Impact effort (h)</Label>
              <Input id="cr-hours" type="number" min={0} value={form.impactHours} onChange={(e) => setForm((p) => ({ ...p, impactHours: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-cost">Impact cost</Label>
              <Input id="cr-cost" type="number" min={0} value={form.impactCost} onChange={(e) => setForm((p) => ({ ...p, impactCost: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-days">Schedule impact (days)</Label>
              <Input id="cr-days" type="number" value={form.scheduleImpactDays} onChange={(e) => setForm((p) => ({ ...p, scheduleImpactDays: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Risk impact</Label>
              <Select value={form.riskImpact} onValueChange={(v) => setForm((p) => ({ ...p, riskImpact: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{IMPACTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={savingNew} onClick={() => void createCr()}>{savingNew ? "Raising…" : "Raise change request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
