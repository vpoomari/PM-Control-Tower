"use client";
// PM CONTROL TOWER — Leadership sections C: Decisions (register + CRUD), Scope Changes,
// Action Register (+CRUD), Deliverables, Quality, KPIs, 30/60/90 Outlook, Meeting Mode,
// History & Schedules.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import {
  SectionCard, StatCard, DataTable, Column, StatusChip, Button, Badge, Metric, EmptyState,
  Input, cn,
} from "@/components/pmct/kit";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtDateTime, money, num } from "@/lib/constants";
import type { LeadershipBundle } from "@/lib/engines/leadership";
import {
  Scale, ListChecks, CalendarRange, Presentation, History as HistoryIcon, Play,
  ArrowUpRight, CheckCircle2, XCircle, TrendingUp, TrendingDown, MinusCircle, Award,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const tone = (t: "good" | "bad" | "neutral") => t === "good" ? "border-emerald-100 bg-emerald-50/60 text-emerald-800" : t === "bad" ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600";
const clsBadge = (c: string) => c === "DECISION_REQUIRED_NOW" ? "bg-red-600 text-white border-0"
  : c === "DECISION_DUE_SOON" ? "bg-amber-500 text-white border-0"
  : c === "COMPLETED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
  : "bg-slate-100 text-slate-600 border-slate-300";

// ================= DECISION REGISTER =================
export function DecisionSection({ d, onChanged }: { d: LeadershipBundle; onChanged: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [deciding, setDeciding] = useState<LeadershipBundle["decisions"][number] | null>(null);
  const [decisionText, setDecisionText] = useState("");
  const [form, setForm] = useState({ title: "", description: "", decisionOwner: "", requiredBy: "", businessImpact: "", recommendedDecision: "" });
  const [busy, setBusy] = useState(false);

  const raise = async () => {
    if (form.title.trim().length < 3) { toast.error("Decision title is required"); return; }
    setBusy(true);
    try {
      await api.post("/api/decisions", {
        title: form.title.trim(), description: form.description.trim() || undefined,
        decisionOwner: form.decisionOwner.trim() || undefined,
        requiredBy: form.requiredBy || undefined,
        businessImpact: form.businessImpact.trim() || undefined,
        recommendedDecision: form.recommendedDecision.trim() || undefined,
        priority: "HIGH",
      });
      toast.success("Decision raised", { description: "It now appears in the Leadership Decision Register and all status reports." });
      setShowCreate(false);
      setForm({ title: "", description: "", decisionOwner: "", requiredBy: "", businessImpact: "", recommendedDecision: "" });
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not raise decision"); }
    finally { setBusy(false); }
  };

  const record = async () => {
    if (!deciding || decisionText.trim().length < 3) { toast.error("Record the actual decision text"); return; }
    setBusy(true);
    try {
      await api.patch(`/api/decisions/${deciding.id}`, { decision: decisionText.trim() });
      toast.success(`Decision ${deciding.code} recorded`, { description: "Marked COMPLETED and written to the audit trail." });
      setDeciding(null); setDecisionText("");
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record decision"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Decision required NOW" value={d.decisions.filter((x) => x.classification === "DECISION_REQUIRED_NOW").length} tone="bad" icon={<Scale className="h-4 w-4" />} />
        <StatCard label="Due soon (14d)" value={d.decisions.filter((x) => x.classification === "DECISION_DUE_SOON").length} tone="warn" />
        <StatCard label="Pending" value={d.decisions.filter((x) => x.classification === "PENDING").length} />
        <StatCard label="Completed" value={d.decisions.filter((x) => x.classification === "COMPLETED").length} tone="good" />
      </div>
      <SectionCard
        title="Leadership Decision Register"
        description="Decision required · owner · date raised · required-by · days pending · business impact · recommended decision — overdue decisions escalate automatically"
        actions={<Button size="sm" onClick={() => setShowCreate(true)}>Raise decision</Button>}
      >
        <DataTable
          keyField="id"
          rows={d.decisions as never[]}
          maxHeight="520px"
          columns={[
            { key: "title", header: "Decision", render: (r: never) => { const x = r as LeadershipBundle["decisions"][number]; return <div className="min-w-[220px]"><p className="text-xs font-medium text-slate-800">{x.title}</p><p className="text-[10px] text-slate-400 font-mono">{x.code}{x.projectCode ? ` · ${x.projectCode}` : ""}</p></div>; } },
            { key: "cls", header: "Classification", render: (r: never) => <Badge variant="outline" className={cn("text-[9px]", clsBadge((r as LeadershipBundle["decisions"][number]).classification))}>{(r as LeadershipBundle["decisions"][number]).classification.replace(/_/g, " ")}</Badge> },
            { key: "owner", header: "Decision owner", render: (r: never) => <span className="text-[11px]">{(r as LeadershipBundle["decisions"][number]).decisionOwner ?? "—"}</span> },
            { key: "requiredBy", header: "Required by", render: (r: never) => { const x = r as LeadershipBundle["decisions"][number]; return <span className={cn("text-[11px] tabular-nums", x.classification === "DECISION_REQUIRED_NOW" && "text-red-600 font-semibold")}>{fmtDate(x.requiredBy)}</span>; } },
            { key: "pending", header: "Days pending", render: (r: never) => { const x = r as LeadershipBundle["decisions"][number]; return <span className={cn("text-[11px] tabular-nums", (x.daysPending ?? 0) > 14 && !x.decision ? "text-red-600 font-semibold" : "text-slate-500")}>{x.decision ? "—" : `${x.daysPending ?? 0}d`}</span>; } },
            { key: "impact", header: "Business impact", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[220px] block">{(r as LeadershipBundle["decisions"][number]).businessImpact ?? "—"}</span> },
            { key: "decision", header: "Decision", render: (r: never) => { const x = r as LeadershipBundle["decisions"][number]; return x.decision ? <span className="text-[11px] text-emerald-700 truncate max-w-[200px] block">{x.decision}</span> : <span className="text-[11px] text-amber-600">awaiting decision</span>; } },
            { key: "act", header: "", render: (r: never) => { const x = r as LeadershipBundle["decisions"][number]; return !x.decision ? <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setDeciding(x)}>Record decision</Button> : null; } },
          ] as Column<never>[]}
        />
      </SectionCard>

      {/* Raise dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a leadership decision</DialogTitle>
            <DialogDescription>Define WHAT is required, WHO decides, BY WHEN, and WHAT HAPPENS IF NO DECISION IS MADE. It will surface on the Control Tower and every status report.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-600">Decision required</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-9" placeholder="e.g. Approve funding for phase 2 mobilization" /></div>
            <div><Label className="text-xs text-slate-600">Context / description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 h-9" placeholder="Background the decision maker needs" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-600">Decision owner (WHO)</Label><Input value={form.decisionOwner} onChange={(e) => setForm({ ...form, decisionOwner: e.target.value })} className="mt-1 h-9" placeholder="e.g. CEO / Steering Committee" /></div>
              <div><Label className="text-xs text-slate-600">Required by (WHEN)</Label><Input type="date" value={form.requiredBy} onChange={(e) => setForm({ ...form, requiredBy: e.target.value })} className="mt-1 h-9" /></div>
            </div>
            <div><Label className="text-xs text-slate-600">What happens if no decision is made</Label><Input value={form.businessImpact} onChange={(e) => setForm({ ...form, businessImpact: e.target.value })} className="mt-1 h-9" placeholder="e.g. Vendor mobilization window is lost; 3-week delay" /></div>
            <div><Label className="text-xs text-slate-600">Recommended decision</Label><Input value={form.recommendedDecision} onChange={(e) => setForm({ ...form, recommendedDecision: e.target.value })} className="mt-1 h-9" placeholder="PM recommendation" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={raise} disabled={busy}>{busy ? "Raising…" : "Raise decision"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record decision dialog */}
      <Dialog open={deciding !== null} onOpenChange={(v) => { if (!v) { setDeciding(null); setDecisionText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record decision — {deciding?.code}</DialogTitle>
            <DialogDescription>{deciding?.title}</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-slate-600">Decision</Label>
            <Input value={decisionText} onChange={(e) => setDecisionText(e.target.value)} className="mt-1 h-9" placeholder="The decision taken and any conditions" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeciding(null); setDecisionText(""); }}>Cancel</Button>
            <Button onClick={record} disabled={busy}>{busy ? "Recording…" : "Record decision"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================= SCOPE CHANGES =================
export function ScopeSection({ d }: { d: LeadershipBundle }) {
  return (
    <SectionCard title="Scope change report" description="Every change request with cost / schedule / risk impact and final decision — full traceability, nothing disappears">
      <DataTable
        keyField="code"
        rows={d.scopeChanges as never[]}
        maxHeight="520px"
        columns={[
          { key: "code", header: "Change", render: (r: never) => { const x = r as LeadershipBundle["scopeChanges"][number]; return <div><p className="text-xs font-medium text-slate-800">{x.title}</p><p className="text-[10px] text-slate-400 font-mono">{x.code} · {x.projectCode}</p></div>; } },
          { key: "requester", header: "Requestor", render: (r: never) => <span className="text-[11px]">{(r as LeadershipBundle["scopeChanges"][number]).requester ?? "—"}</span> },
          { key: "reason", header: "Reason", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[200px] block">{(r as LeadershipBundle["scopeChanges"][number]).reason ?? "—"}</span> },
          { key: "cost", header: "Cost impact", render: (r: never) => <span className="text-[11px] tabular-nums">{money((r as LeadershipBundle["scopeChanges"][number]).costImpact)}</span> },
          { key: "sched", header: "Schedule impact", render: (r: never) => <span className="text-[11px] tabular-nums">{(r as LeadershipBundle["scopeChanges"][number]).scheduleImpactDays}d</span> },
          { key: "risk", header: "Risk impact", render: (r: never) => <StatusChip status={(r as LeadershipBundle["scopeChanges"][number]).riskImpact} /> },
          { key: "status", header: "Status", render: (r: never) => <StatusChip status={(r as LeadershipBundle["scopeChanges"][number]).status} /> },
          { key: "decision", header: "Final decision", render: (r: never) => <span className="text-[11px] text-slate-600 truncate max-w-[200px] block">{(r as LeadershipBundle["scopeChanges"][number]).decision ?? "pending"}</span> },
        ] as Column<never>[]}
      />
    </SectionCard>
  );
}

// ================= ACTION REGISTER =================
export function ActionSection({ d, onChanged }: { d: LeadershipBundle; onChanged: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", ownerName: "", dueDate: "", priority: "HIGH", relatedType: "", relatedCode: "" });

  const raise = async () => {
    if (form.title.trim().length < 3) { toast.error("Action title is required"); return; }
    setBusy(true);
    try {
      await api.post("/api/actions", {
        title: form.title.trim(), ownerName: form.ownerName.trim() || undefined,
        dueDate: form.dueDate || undefined, priority: form.priority,
        relatedType: form.relatedType.trim() || undefined, relatedCode: form.relatedCode.trim() || undefined,
      });
      toast.success("Action registered", { description: "Owners are tracked; overdue actions escalate into leadership reports automatically." });
      setShowCreate(false); setForm({ title: "", ownerName: "", dueDate: "", priority: "HIGH", relatedType: "", relatedCode: "" });
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not register action"); }
    finally { setBusy(false); }
  };

  const update = async (id: string, patch: Record<string, unknown>, msg: string) => {
    try { await api.patch(`/api/actions/${id}`, patch); toast.success(msg); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
  };

  const open = d.actions.filter((a) => ["OPEN", "IN_PROGRESS"].includes(a.status));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open actions" value={open.length} icon={<ListChecks className="h-4 w-4" />} />
        <StatCard label="Overdue" value={open.filter((a) => a.overdue).length} tone={open.some((a) => a.overdue) ? "bad" : "good"} />
        <StatCard label="Escalated" value={open.filter((a) => a.escalationLevel !== "NONE").length} tone={open.some((a) => a.escalationLevel === "LEADERSHIP") ? "warn" : undefined} />
        <StatCard label="Completed" value={d.actions.filter((a) => a.status === "DONE").length} tone="good" />
      </div>
      <SectionCard
        title="Central action register"
        description="Action · owner · priority · created · due · status · related risk/issue/decision · escalation level — overdue actions auto-surface in every leadership report"
        actions={<Button size="sm" onClick={() => setShowCreate(true)}>Register action</Button>}
      >
        <DataTable
          keyField="id"
          rows={d.actions as never[]}
          maxHeight="520px"
          columns={[
            { key: "title", header: "Action", render: (r: never) => { const x = r as LeadershipBundle["actions"][number]; return <div className="min-w-[220px]"><p className="text-xs font-medium text-slate-800">{x.title}</p><p className="text-[10px] text-slate-400 font-mono">{x.code}{x.projectCode ? ` · ${x.projectCode}` : ""}{x.relatedType ? ` · ${x.relatedType} ${x.relatedCode ?? ""}` : ""}</p></div>; } },
            { key: "owner", header: "Owner", render: (r: never) => <span className="text-[11px]">{(r as LeadershipBundle["actions"][number]).owner ?? "—"}</span> },
            { key: "priority", header: "Priority", render: (r: never) => <StatusChip status={(r as LeadershipBundle["actions"][number]).priority} /> },
            { key: "due", header: "Due", render: (r: never) => { const x = r as LeadershipBundle["actions"][number]; return <span className={cn("text-[11px] tabular-nums", x.overdue && "text-red-600 font-semibold")}>{fmtDate(x.dueDate)}</span>; } },
            { key: "status", header: "Status", render: (r: never) => <StatusChip status={(r as LeadershipBundle["actions"][number]).status} /> },
            { key: "esc", header: "Escalation", render: (r: never) => <span className="text-[10px] text-slate-500">{(r as LeadershipBundle["actions"][number]).escalationLevel}</span> },
            { key: "act", header: "", render: (r: never) => { const x = r as LeadershipBundle["actions"][number]; return ["OPEN", "IN_PROGRESS"].includes(x.status) ? (
              <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => update(x.id, { status: "DONE" }, `Action ${x.code} completed`)}>Done</Button>
                {x.escalationLevel === "NONE" && <Button size="sm" variant="ghost" className="h-6 text-[10px] text-amber-600" onClick={() => update(x.id, { escalationLevel: "LEADERSHIP" }, `Action ${x.code} escalated to leadership`)}>Escalate</Button>}
              </div>
            ) : null; } },
          ] as Column<never>[]}
        />
      </SectionCard>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register a leadership action</DialogTitle>
            <DialogDescription>Track responsibility explicitly — the engine reminds, escalates and reports outstanding actions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-600">Action</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-9" placeholder="e.g. Provide updated benefits case for PTF-DT" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-600">Owner</Label><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className="mt-1 h-9" placeholder="Responsible person" /></div>
              <div><Label className="text-xs text-slate-600">Due date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 h-9" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-600">Priority</Label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-xs">
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><Label className="text-xs text-slate-600">Related (type · code)</Label><Input value={form.relatedType} onChange={(e) => setForm({ ...form, relatedType: e.target.value })} className="mt-1 h-9" placeholder="RISK / ISSUE / DECISION" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={raise} disabled={busy}>{busy ? "Registering…" : "Register action"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================= DELIVERABLES =================
export function DeliverableSection({ d }: { d: LeadershipBundle }) {
  const x = d.deliverables;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Required" value={x.total} />
        <StatCard label="Completed" value={x.completed} tone="good" />
        <StatCard label="Pending" value={x.pending} />
        <StatCard label="Overdue" value={x.overdue} tone={x.overdue ? "bad" : "good"} />
        <StatCard label="Missing owner" value={x.missingOwner} tone={x.missingOwner ? "warn" : undefined} />
        <StatCard label="Missing deadline" value={x.missingDeadline} tone={x.missingDeadline ? "warn" : undefined} />
      </div>
      <SectionCard title="Deliverable control report" description="Is the project actually producing the required outcomes?">
        <DataTable
          keyField="code"
          rows={x.list as never[]}
          maxHeight="480px"
          columns={[
            { key: "name", header: "Deliverable", render: (r: never) => { const y = r as LeadershipBundle["deliverables"]["list"][number]; return <div><p className="text-xs font-medium text-slate-800">{y.name}</p><p className="text-[10px] text-slate-400 font-mono">{y.code} · {y.projectCode}</p></div>; } },
            { key: "status", header: "Status", render: (r: never) => <StatusChip status={(r as LeadershipBundle["deliverables"]["list"][number]).status} /> },
            { key: "quality", header: "Acceptance", render: (r: never) => <StatusChip status={(r as LeadershipBundle["deliverables"]["list"][number]).qualityStatus} /> },
            { key: "owner", header: "Owner", render: (r: never) => <span className="text-[11px]">{(r as LeadershipBundle["deliverables"]["list"][number]).owner ?? "—"}</span> },
            { key: "due", header: "Deadline", render: (r: never) => { const y = r as LeadershipBundle["deliverables"]["list"][number]; return <span className={cn("text-[11px] tabular-nums", y.overdue && "text-red-600 font-semibold")}>{fmtDate(y.dueDate)}</span>; } },
            { key: "delivered", header: "Delivered", render: (r: never) => <span className="text-[11px] tabular-nums text-slate-500">{fmtDate((r as LeadershipBundle["deliverables"]["list"][number]).deliveredAt)}</span> },
          ] as Column<never>[]}
        />
      </SectionCard>
    </div>
  );
}

// ================= QUALITY =================
export function QualitySection({ d }: { d: LeadershipBundle }) {
  const q = d.quality;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Quality records" value={q.total} icon={<Award className="h-4 w-4" />} />
        <StatCard label="Failed" value={q.failed} tone={q.failed ? "bad" : "good"} />
        <StatCard label="Conditional" value={q.conditional} tone={q.conditional ? "warn" : undefined} />
        <StatCard label="Average score" value={q.avgScore !== null ? num(q.avgScore, 1) : "—"} />
      </div>
      <SectionCard title="Quality report" description="Reviews, defects, failed acceptance and corrective actions — quality issues that could affect cost, schedule, scope or business outcomes">
        <DataTable
          keyField="title"
          rows={q.list as never[]}
          maxHeight="480px"
          columns={[
            { key: "title", header: "Record", render: (r: never) => { const y = r as LeadershipBundle["quality"]["list"][number]; return <div><p className="text-xs font-medium text-slate-800">{y.title}</p><p className="text-[10px] text-slate-400">{y.recordType} · {y.projectCode} · {fmtDate(y.reviewedAt)}</p></div>; } },
            { key: "result", header: "Result", render: (r: never) => <StatusChip status={(r as LeadershipBundle["quality"]["list"][number]).result} /> },
            { key: "score", header: "Score", render: (r: never) => <span className="text-[11px] tabular-nums">{(r as LeadershipBundle["quality"]["list"][number]).score ?? "—"}</span> },
            { key: "reviewer", header: "Reviewer", render: (r: never) => <span className="text-[11px]">{(r as LeadershipBundle["quality"]["list"][number]).reviewer ?? "—"}</span> },
            { key: "findings", header: "Findings", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[240px] block">{(r as LeadershipBundle["quality"]["list"][number]).findings ?? "—"}</span> },
            { key: "actions", header: "Corrective actions", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[200px] block">{(r as LeadershipBundle["quality"]["list"][number]).actions ?? "—"}</span> },
          ] as Column<never>[]}
        />
      </SectionCard>
    </div>
  );
}

// ================= KPIs / BENEFITS =================
export function KpiSection({ d, onChanged }: { d: LeadershipBundle; onChanged: () => void }) {
  const [measuring, setMeasuring] = useState<LeadershipBundle["kpis"][number] | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const record = async () => {
    if (!measuring) return;
    const v = Number(value);
    if (isNaN(v)) { toast.error("Enter a numeric measurement"); return; }
    setBusy(true);
    try {
      await api.patch(`/api/kpis/${measuring.id}`, {
        currentValue: v,
        status: v >= measuring.target ? "ACHIEVED" : v >= measuring.target * 0.8 ? "ON_TRACK" : "AT_RISK",
      });
      toast.success(`${measuring.code} measurement recorded`);
      setMeasuring(null); setValue("");
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record measurement"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Business KPI / benefits realization" description="Is the project delivering business value, or merely delivering activities? Realization = current ÷ target.">
        <DataTable
          keyField="code"
          rows={d.kpis as never[]}
          maxHeight="480px"
          columns={[
            { key: "name", header: "KPI / Benefit", render: (r: never) => { const x = r as LeadershipBundle["kpis"][number]; return <div className="min-w-[200px]"><p className="text-xs font-medium text-slate-800">{x.name}</p><p className="text-[10px] text-slate-400 font-mono">{x.code} · {x.category}{x.projectCode ? ` · ${x.projectCode}` : ""}</p></div>; } },
            { key: "target", header: "Target", render: (r: never) => <span className="text-[11px] tabular-nums">{num((r as LeadershipBundle["kpis"][number]).target, 1)} {(r as LeadershipBundle["kpis"][number]).unit}</span> },
            { key: "current", header: "Current", render: (r: never) => <span className="text-[11px] tabular-nums font-medium">{num((r as LeadershipBundle["kpis"][number]).current, 1)} {(r as LeadershipBundle["kpis"][number]).unit}</span> },
            { key: "realization", header: "Realization", render: (r: never) => { const x = r as LeadershipBundle["kpis"][number]; return (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden"><div className={cn("h-full rounded-full", x.realizationPct >= 90 ? "bg-emerald-500" : x.realizationPct >= 60 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(100, x.realizationPct)}%` }} /></div>
                <span className={cn("text-[11px] font-semibold tabular-nums", x.realizationPct >= 90 ? "text-emerald-600" : x.realizationPct >= 60 ? "text-amber-600" : "text-red-600")}>{x.realizationPct}%</span>
              </div>
            ); } },
            { key: "status", header: "Status", render: (r: never) => <StatusChip status={(r as LeadershipBundle["kpis"][number]).status} /> },
            { key: "benefit", header: "Expected benefit", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[220px] block">{(r as LeadershipBundle["kpis"][number]).expectedBenefit ?? "—"}</span> },
            { key: "act", header: "", render: (r: never) => { const x = r as LeadershipBundle["kpis"][number]; return <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setMeasuring(x); setValue(String(x.current)); }}>Measure</Button>; } },
          ] as Column<never>[]}
        />
      </SectionCard>

      <Dialog open={measuring !== null} onOpenChange={(v) => { if (!v) { setMeasuring(null); setValue(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Record measurement — {measuring?.code}</DialogTitle><DialogDescription>{measuring?.name} (target {measuring ? num(measuring.target, 1) : ""} {measuring?.unit})</DialogDescription></DialogHeader>
          <div><Label className="text-xs text-slate-600">Current value ({measuring?.unit})</Label><Input value={value} onChange={(e) => setValue(e.target.value)} className="mt-1 h-9" /></div>
          <DialogFooter><Button variant="outline" onClick={() => { setMeasuring(null); setValue(""); }}>Cancel</Button><Button onClick={record} disabled={busy}>{busy ? "Saving…" : "Save measurement"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================= OUTLOOK =================
export function OutlookSection({ d }: { d: LeadershipBundle }) {
  const windows = [d.outlook.d30, d.outlook.d60, d.outlook.d90];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {windows.map((w) => (
        <SectionCard key={w.label} title={w.label} description={`${w.milestones.length} milestones · ${w.decisions.length} decisions · ${w.deliverables.length} deliverables · ~${money(w.budgetRequirement)} funding requirement`}>
          <div className="space-y-3 text-xs">
            <div>
              <h5 className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Major milestones & deadlines</h5>
              {w.milestones.slice(0, 6).map((m) => <p key={m.name} className="text-slate-600 truncate">• {m.critical ? "🚩 " : ""}{m.name} <span className="text-slate-400">({m.projectCode}, {fmtDate(m.date)})</span></p>)}
              {!w.milestones.length && <p className="text-slate-400">None scheduled.</p>}
            </div>
            <div>
              <h5 className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Leadership decisions required</h5>
              {w.decisions.slice(0, 5).map((x) => <p key={x.title} className="text-slate-600 truncate">• {x.title} <span className="text-slate-400">(by {fmtDate(x.requiredBy)})</span></p>)}
              {!w.decisions.length && <p className="text-slate-400">None due.</p>}
            </div>
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
              <Metric label="Risk reviews" value={w.riskReviews} />
              <Metric label="Approvals due" value={w.approvals} />
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

// ================= MEETING MODE =================
export function MeetingMode({ d }: { d: LeadershipBundle }) {
  const t = d.tower;
  return (
    <div className="space-y-5" id="leadership-meeting-view">
      <div className="rounded-xl border border-slate-800 bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2"><Presentation className="h-5 w-5 text-blue-300" /><div><p className="text-[10px] uppercase tracking-wider text-slate-400">Leadership Meeting Mode</p><p className="text-sm font-semibold">{fmtDateTime(d.generatedAt)}</p></div></div>
        <div className="flex gap-6 ml-auto text-center">
          <div><p className="text-2xl font-bold text-emerald-400">{t.onTrack}</p><p className="text-[10px] text-slate-400">ON TRACK</p></div>
          <div><p className="text-2xl font-bold text-amber-400">{t.atRisk}</p><p className="text-[10px] text-slate-400">AT RISK</p></div>
          <div><p className="text-2xl font-bold text-red-400">{t.critical}</p><p className="text-[10px] text-slate-400">CRITICAL</p></div>
          <div><p className="text-2xl font-bold text-slate-400">{t.insufficient}</p><p className="text-[10px] text-slate-400">NO DATA</p></div>
        </div>
      </div>

      {/* 1 Overall Health 2 What Changed 3 Critical Problems 4 Decisions 5 Risks 6 Budget 7 Milestones 8 Actions 9 Next 30 Days */}
      <SectionCard title="1 · Overall health" description={`${t.totalProjects} projects · ${t.completionPct}% weighted completion · avg health ${num(t.avgHealth, 1)}`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="On track" value={t.onTrack} tone="text-emerald-600" />
          <Metric label="At risk" value={t.atRisk} tone="text-amber-600" />
          <Metric label="Critical" value={t.critical} tone="text-red-600" />
          <Metric label="Insufficient data" value={t.insufficient} />
        </div>
      </SectionCard>

      <SectionCard title="2 · What changed" description={d.sinceLabel}>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {d.changed.slice(0, 9).map((c, i) => <div key={i} className={cn("rounded-md border px-2.5 py-1.5 text-xs", tone(c.tone))}><b>{c.label}:</b> {c.text}</div>)}
        </div>
      </SectionCard>

      <SectionCard title="3 · Critical problems" description="Top exceptions by priority">
        <div className="space-y-1.5">
          {d.exceptions.slice(0, 6).map((ex) => (
            <div key={ex.id} className="flex items-start gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              {ex.level === "CRITICAL" ? <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5" /> : ex.level === "DECISION_NOW" ? <Scale className="h-3.5 w-3.5 text-purple-500 mt-0.5" /> : <MinusCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5" />}
              <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{ex.title}</p><p className="text-[11px] text-slate-500">{ex.detail}</p></div>
            </div>
          ))}
          {!d.exceptions.length && <EmptyState title="No critical problems" />}
        </div>
      </SectionCard>

      <SectionCard title="4 · Decisions required" description="WHAT · WHO · BY WHEN · IMPACT IF NO DECISION">
        {d.decisions.filter((x) => x.classification !== "COMPLETED").length === 0 ? <EmptyState title="No pending decisions" /> : (
          <div className="space-y-1.5">
            {d.decisions.filter((x) => x.classification !== "COMPLETED").slice(0, 6).map((x) => (
              <div key={x.id} className="rounded-md border border-slate-100 px-3 py-2 grid gap-1 sm:grid-cols-[1fr_auto] text-xs">
                <div><p className="font-semibold text-slate-800">{x.title}</p><p className="text-[11px] text-slate-500">Owner {x.decisionOwner ?? "—"} · impact: {x.businessImpact ?? "not documented"}</p></div>
                <div className="text-right"><Badge variant="outline" className={cn("text-[9px]", clsBadge(x.classification))}>{x.classification.replace(/_/g, " ")}</Badge><p className="text-[10px] text-slate-400 mt-1">by {fmtDate(x.requiredBy)}</p></div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="5 · Risks" description={`${d.risks.total} open · ${d.risks.bySeverity.CRITICAL ?? 0} critical`}>
          {d.risks.critical.slice(0, 4).map((k) => <p key={k.code} className="text-xs text-slate-600 mb-1">• <b>{k.code}</b> {k.title} <span className="text-slate-400">({k.projectCode}, score {k.score})</span></p>)}
          {!d.risks.critical.length && <p className="text-xs text-slate-400">No critical risks.</p>}
        </SectionCard>
        <SectionCard title="6 · Budget" description="Approved vs forecast">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Approved" value={money(t.budget.approved)} />
            <Metric label="Forecast" value={money(t.budget.forecast)} tone={t.budget.variance > 0 ? "text-red-600" : "text-emerald-600"} />
            <Metric label="Variance" value={`${t.budget.variancePct >= 0 ? "+" : ""}${t.budget.variancePct}%`} />
            <Metric label="Actual spent" value={money(t.budget.actual)} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="7 · Milestones" description={`${d.milestones.delayed} delayed · ${d.milestones.atRisk} at risk`}>
          {d.milestones.list.slice(0, 5).map((m) => <p key={m.code} className="text-xs text-slate-600 mb-1">• <b>{m.name}</b> <span className="text-slate-400">({m.projectCode}, {fmtDate(m.dueDate)}, {m.status})</span></p>)}
          {!d.milestones.list.length && <p className="text-xs text-slate-400">No delayed or at-risk milestones.</p>}
        </SectionCard>
        <SectionCard title="8 · Actions" description={`${d.actions.filter((a) => ["OPEN", "IN_PROGRESS"].includes(a.status)).length} open · ${d.actions.filter((a) => a.overdue).length} overdue`}>
          {d.actions.filter((a) => ["OPEN", "IN_PROGRESS"].includes(a.status)).slice(0, 5).map((a) => <p key={a.id} className="text-xs text-slate-600 mb-1">• {a.title} <span className="text-slate-400">({a.owner ?? "—"}, due {fmtDate(a.dueDate)}{a.overdue ? " — OVERDUE" : ""})</span></p>)}
        </SectionCard>
      </div>

      <SectionCard title="9 · Next 30 days" description={`${d.outlook.d30.milestones.length} milestones · ${d.outlook.d30.decisions.length} decisions · ${d.outlook.d30.deliverables.length} deliverables`}>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {d.outlook.d30.milestones.slice(0, 6).map((m) => <p key={m.name} className="text-xs text-slate-600">• 🚩 {m.name} <span className="text-slate-400">({m.projectCode}, {fmtDate(m.date)})</span></p>)}
          {d.outlook.d30.decisions.slice(0, 4).map((x) => <p key={x.title} className="text-xs text-purple-700">• Decision: {x.title} <span className="text-slate-400">(by {fmtDate(x.requiredBy)})</span></p>)}
          {!d.outlook.d30.milestones.length && !d.outlook.d30.decisions.length && <p className="text-xs text-slate-400">Nothing scheduled in the next 30 days.</p>}
        </div>
      </SectionCard>
    </div>
  );
}

// ================= HISTORY & SCHEDULES =================
interface SnapshotRow { id: string; scope: string; projectCode: string | null; title: string; version: number; periodStart: string | null; periodEnd: string | null; generatedByName: string | null; createdAt: string; headline: { totals?: Record<string, number> } | null }

export function HistorySection({ onChanged }: { onChanged: () => void }) {
  const history = useApi<{ snapshots: SnapshotRow[] }>("/api/reports/leadership/history");
  const schedules = useApi<{ schedules: Array<{ id: string; name: string; frequency: string; scope: string; isActive: boolean; recipients: string | null; nextRunAt: string | null; lastRunAt: string | null; lastRunSummary: string | null }> }>("/api/reports/schedules");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", frequency: "WEEKLY", recipients: "" });
  const [viewing, setViewing] = useState<{ title: string; totals: Record<string, number> } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const d = await api.post<{ title: string }>("/api/reports/leadership/pack", { scope: "PORTFOLIO" });
      toast.success("Leadership Pack generated", { description: `${d.title} — versioned snapshot retained for comparison.` });
      history.refetch(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); }
    finally { setBusy(false); }
  };

  const runDue = async () => {
    setBusy(true);
    try {
      const d = await api.post<{ ran: number; generated: string[] }>("/api/reports/leadership/run-due", {});
      toast.success(d.ran ? `${d.ran} schedule(s) executed` : "No schedules due", { description: d.generated.join("; ") || undefined });
      history.refetch(); schedules.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Run failed"); }
    finally { setBusy(false); }
  };

  const createSchedule = async () => {
    if (form.name.trim().length < 2) { toast.error("Schedule name is required"); return; }
    setBusy(true);
    try {
      await api.post("/api/reports/schedules", { name: form.name.trim(), frequency: form.frequency, scope: "PORTFOLIO", recipients: form.recipients.trim() || undefined });
      toast.success("Report schedule created", { description: `${form.frequency} portfolio packs will be generated and distributed in-app.` });
      setShowCreate(false); setForm({ name: "", frequency: "WEEKLY", recipients: "" });
      schedules.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create schedule"); }
    finally { setBusy(false); }
  };

  const toggle = async (id: string, isActive: boolean) => {
    try { await api.patch(`/api/reports/schedules/${id}`, { isActive }); schedules.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
  };

  const compare = history.data && history.data.snapshots.length >= 2
    ? { latest: history.data.snapshots[0], previous: history.data.snapshots[1] }
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={generate} disabled={busy}>Generate Leadership Pack now</Button>
        <Button size="sm" variant="outline" onClick={runDue} disabled={busy}><Play className="h-3.5 w-3.5 mr-1" /> Run due schedules</Button>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>New schedule</Button>
        <Button size="sm" variant="outline" onClick={() => { toast.info("Opening print dialog — choose Save as PDF."); setTimeout(() => window.print(), 150); }}>Print / PDF</Button>
      </div>

      {compare && compare.latest.headline?.totals && compare.previous.headline?.totals && (
        <SectionCard title="Report comparison" description={`${compare.previous.title} → ${compare.latest.title}`}>
          <div className="grid gap-3 sm:grid-cols-4 text-xs">
            {[["Forecast", "forecast"], ["Actual", "actual"], ["Open risks", "openRisks"], ["Pending decisions", "pendingDecisions"]].map(([label, key]) => {
              const a = Number(compare.previous.headline?.totals?.[key] ?? 0);
              const b = Number(compare.latest.headline?.totals?.[key] ?? 0);
              const delta = b - a;
              return (
                <div key={key} className="rounded-md border border-slate-200 px-3 py-2">
                  <p className="text-[10px] uppercase text-slate-400">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">{num(b, 0)}</p>
                  <p className={cn("text-[10px] tabular-nums flex items-center gap-1", delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : "text-slate-400")}>
                    {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <MinusCircle className="h-3 w-3" />}
                    {delta >= 0 ? "+" : ""}{num(delta, 0)} vs previous
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Report history & audit" description="Every generated pack is retained with date, period, generator, version and headline snapshot — compare this week vs last week vs last month">
        <DataTable
          keyField="id"
          rows={(history.data?.snapshots ?? []) as never[]}
          maxHeight="420px"
          columns={[
            { key: "title", header: "Report", render: (r: never) => { const x = r as SnapshotRow; return <div><p className="text-xs font-medium text-slate-800">{x.title}</p><p className="text-[10px] text-slate-400">v{x.version} · {x.scope}</p></div>; } },
            { key: "period", header: "Reporting period", render: (r: never) => { const x = r as SnapshotRow; return <span className="text-[11px] tabular-nums">{fmtDate(x.periodStart)} → {fmtDate(x.periodEnd)}</span>; } },
            { key: "by", header: "Generated by", render: (r: never) => <span className="text-[11px]">{(r as SnapshotRow).generatedByName ?? "System"}</span> },
            { key: "when", header: "Generated at", render: (r: never) => <span className="text-[11px] tabular-nums text-slate-500">{fmtDateTime((r as SnapshotRow).createdAt)}</span> },
            { key: "view", header: "", render: (r: never) => { const x = r as SnapshotRow; return <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => x.headline?.totals && setViewing({ title: x.title, totals: x.headline.totals })}>Headline</Button>; } },
          ] as Column<never>[]}
        />
      </SectionCard>

      <SectionCard title="Automated report scheduling" description="Daily executive exceptions · weekly status · monthly portfolio & financial · quarterly benefits — recipients receive in-app notifications when a pack is generated">
        <DataTable
          keyField="id"
          rows={(schedules.data?.schedules ?? []) as never[]}
          columns={[
            { key: "name", header: "Schedule", render: (r: never) => { const x = r as { name: string; frequency: string; scope: string }; return <div><p className="text-xs font-medium text-slate-800">{x.name}</p><p className="text-[10px] text-slate-400">{x.frequency} · {x.scope}</p></div>; } },
            { key: "recipients", header: "Recipients", render: (r: never) => <span className="text-[11px] text-slate-500 truncate max-w-[240px] block">{(r as { recipients: string | null }).recipients ?? "—"}</span> },
            { key: "next", header: "Next run", render: (r: never) => <span className="text-[11px] tabular-nums">{fmtDateTime((r as { nextRunAt: string | null }).nextRunAt)}</span> },
            { key: "last", header: "Last run", render: (r: never) => { const x = r as { lastRunAt: string | null; lastRunSummary: string | null }; return <div><p className="text-[11px] tabular-nums">{fmtDateTime(x.lastRunAt)}</p><p className="text-[10px] text-slate-400 truncate max-w-[200px]">{x.lastRunSummary ?? "—"}</p></div>; } },
            { key: "active", header: "Active", render: (r: never) => { const x = r as { id: string; isActive: boolean }; return <button onClick={() => toggle(x.id, !x.isActive)} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", x.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{x.isActive ? "ACTIVE" : "PAUSED"}</button>; } },
          ] as Column<never>[]}
        />
      </SectionCard>

      {/* Create schedule dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New report schedule</DialogTitle><DialogDescription>Configure frequency and recipients. Distribution is in-app; email delivery follows the email integration.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-slate-600">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-9" placeholder="e.g. Weekly leadership pack" /></div>
            <div><Label className="text-xs text-slate-600">Frequency</Label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-xs">
                {["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"].map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div><Label className="text-xs text-slate-600">Recipients (emails, comma separated)</Label><Input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} className="mt-1 h-9" placeholder="ceo@pmct.io, pmo@pmct.io" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button onClick={createSchedule} disabled={busy}>Create schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Headline view dialog */}
      <Dialog open={viewing !== null} onOpenChange={(v) => { if (!v) setViewing(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{viewing?.title}</DialogTitle><DialogDescription>Headline snapshot at generation time</DialogDescription></DialogHeader>
          <div className="space-y-1.5 text-xs">
            {viewing && Object.entries(viewing.totals).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span><span className="font-semibold tabular-nums">{typeof v === "number" ? num(v, 1) : String(v)}</span></div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
