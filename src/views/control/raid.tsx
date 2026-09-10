"use client";
// PM CONTROL TOWER — RAID console: risks, issues, assumptions and dependencies per project.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDate } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, DataTable, Column,
  ConfirmButton, Button, Input,
} from "@/components/pmct/kit";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectPicker, useControlProjectId, useControlProjectOptions } from "@/views/control/shared/pickers";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";

const RISK_CATEGORIES = ["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "EXTERNAL", "OTHER"] as const;
const RISK_STATUSES = ["OPEN", "MITIGATING", "ACCEPTED", "ESCALATED", "CLOSED"] as const;
const STRATEGIES = ["MITIGATE", "AVOID", "TRANSFER", "ACCEPT", "MONITOR", "ESCALATE"] as const;
const ISSUE_CATEGORIES = ["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "QUALITY", "VENDOR", "OTHER"] as const;
const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const ISSUE_SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const ASSUMPTION_STATUSES = ["VALID", "AT_RISK", "INVALID", "CLOSED"] as const;

interface Risk {
  [key: string]: unknown;
  id: string; projectId: string; code: string; title: string; description: string | null;
  category: string; probability: number; impact: number; score: number; severity: string;
  status: string; ownerName: string | null; responseStrategy: string; mitigation: string | null;
  escalationLevel: string; dueDate: string | null; closedAt: string | null;
  project: { id: string; code: string; name: string };
}
interface Issue {
  [key: string]: unknown;
  id: string; projectId: string; code: string; title: string; description: string | null;
  category: string; priority: string; severity: string; status: string; ownerName: string | null;
  raisedBy: string | null; impact: string | null; resolution: string | null; escalationLevel: string;
  raisedAt: string | null; dueDate: string | null; resolvedAt: string | null;
  project: { id: string; code: string; name: string };
}
interface Assumption {
  [key: string]: unknown;
  id: string; projectId: string; code: string; description: string; rationale: string | null;
  impactIfFalse: string | null; status: string; ownerName: string | null;
  validationDate: string | null; dueDate: string | null;
  project: { id: string; code: string; name: string };
}
interface Dependency {
  id: string; depType: string; lagDays: number; isExternal: boolean;
  predecessor: { id: string; code: string; name: string; status: string };
  successor: { id: string; code: string; name: string; status: string };
}

const emptyRisk = { title: "", description: "", category: "TECHNICAL", probability: "3", impact: "3", ownerName: "", responseStrategy: "MITIGATE", mitigation: "", dueDate: "" };
const emptyIssue = { title: "", description: "", category: "TECHNICAL", severity: "MEDIUM", ownerName: "", raisedBy: "", impact: "", dueDate: "", escalationLevel: "NONE", resolution: "" };
const emptyAssumption = { description: "", rationale: "", impactIfFalse: "", ownerName: "", dueDate: "" };

export default function RaidView() {
  const { options, loading: optionsLoading } = useControlProjectOptions();
  const [projectId, setProjectId] = useControlProjectId(options);

  const [tab, setTab] = useState<"risks" | "issues" | "assumptions" | "dependencies">("risks");
  const refreshRaid = async () => {
    await Promise.all([risks.refetch(), issues.refetch(), assumptions.refetch()]);
  };

  const risks = useApi<{ risks: Risk[] }>(projectId ? `/api/risks?projectId=${projectId}` : null);
  const issues = useApi<{ issues: Issue[] }>(projectId ? `/api/issues?projectId=${projectId}` : null);
  const assumptions = useApi<{ assumptions: Assumption[] }>(projectId ? `/api/assumptions?projectId=${projectId}` : null);
  const dependencies = useApi<{ items: Dependency[] }>(projectId && tab === "dependencies" ? `/api/projects/${projectId}/dependencies` : null);
  useRealtimeRefetch(() => { void refreshRaid(); }, ["raid:changed"]);

  const selected = options.find((o) => o.id === projectId);

  // ---- patch helpers ----
  const patch = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast.success(okMsg);
      await refreshRaid();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  // ---- Risk dialogs ----
  const [riskDialog, setRiskDialog] = useState<{ mode: "add" | "edit"; target?: Risk } | null>(null);
  const [riskForm, setRiskForm] = useState(emptyRisk);
  const [savingRisk, setSavingRisk] = useState(false);

  const openRiskDialog = (mode: "add" | "edit", target?: Risk) => {
    setRiskForm(target ? {
      title: target.title, description: target.description ?? "", category: target.category,
      probability: String(target.probability), impact: String(target.impact), ownerName: target.ownerName ?? "",
      responseStrategy: target.responseStrategy, mitigation: target.mitigation ?? "", dueDate: target.dueDate?.slice(0, 10) ?? "",
    } : emptyRisk);
    setRiskDialog({ mode, target });
  };

  const saveRisk = async () => {
    if (riskForm.title.trim().length < 3) { toast.error("Risk title is required (min 3 chars)"); return; }
    setSavingRisk(true);
    const body = {
      projectId,
      title: riskForm.title.trim(),
      description: riskForm.description || null,
      category: riskForm.category,
      probability: Number(riskForm.probability) || 3,
      impact: Number(riskForm.impact) || 3,
      ownerName: riskForm.ownerName || null,
      responseStrategy: riskForm.responseStrategy,
      mitigation: riskForm.mitigation || null,
      dueDate: riskForm.dueDate || null,
    };
    try {
      if (riskDialog?.mode === "edit" && riskDialog.target) await api.patch(`/api/risks/${riskDialog.target.id}`, body);
      else await api.post("/api/risks", body);
      toast.success(riskDialog?.mode === "edit" ? "Risk updated" : "Risk registered");
      setRiskDialog(null);
      await refreshRaid();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save risk");
    } finally {
      setSavingRisk(false);
    }
  };

  // ---- Issue dialogs ----
  const [issueDialog, setIssueDialog] = useState<{ mode: "add" | "edit"; target?: Issue } | null>(null);
  const [issueForm, setIssueForm] = useState(emptyIssue);
  const [savingIssue, setSavingIssue] = useState(false);

  const openIssueDialog = (mode: "add" | "edit", target?: Issue) => {
    setIssueForm(target ? {
      title: target.title, description: target.description ?? "", category: target.category,
      severity: target.severity, ownerName: target.ownerName ?? "", raisedBy: target.raisedBy ?? "",
      impact: target.impact ?? "", dueDate: target.dueDate?.slice(0, 10) ?? "", escalationLevel: target.escalationLevel,
      resolution: target.resolution ?? "",
    } : emptyIssue);
    setIssueDialog({ mode, target });
  };

  const saveIssue = async () => {
    if (issueForm.title.trim().length < 3) { toast.error("Issue title is required (min 3 chars)"); return; }
    setSavingIssue(true);
    const body = {
      projectId,
      title: issueForm.title.trim(),
      description: issueForm.description || null,
      category: issueForm.category,
      severity: issueForm.severity,
      ownerName: issueForm.ownerName || null,
      raisedBy: issueForm.raisedBy || null,
      impact: issueForm.impact || null,
      dueDate: issueForm.dueDate || null,
      escalationLevel: issueForm.escalationLevel,
    };
    try {
      if (issueDialog?.mode === "edit" && issueDialog.target) {
        await api.patch(`/api/issues/${issueDialog.target.id}`, { ...body, resolution: issueForm.resolution || null });
      } else {
        await api.post("/api/issues", body);
      }
      toast.success(issueDialog?.mode === "edit" ? "Issue updated" : "Issue logged");
      setIssueDialog(null);
      await refreshRaid();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save issue");
    } finally {
      setSavingIssue(false);
    }
  };

  // ---- Assumption dialogs ----
  const [asmDialog, setAsmDialog] = useState<{ mode: "add" | "edit"; target?: Assumption } | null>(null);
  const [asmForm, setAsmForm] = useState(emptyAssumption);
  const [savingAsm, setSavingAsm] = useState(false);

  const openAsmDialog = (mode: "add" | "edit", target?: Assumption) => {
    setAsmForm(target ? {
      description: target.description, rationale: target.rationale ?? "",
      impactIfFalse: target.impactIfFalse ?? "", ownerName: target.ownerName ?? "", dueDate: target.dueDate?.slice(0, 10) ?? "",
    } : emptyAssumption);
    setAsmDialog({ mode, target });
  };

  const saveAsm = async () => {
    if (asmForm.description.trim().length < 3) { toast.error("Describe the assumption (min 3 chars)"); return; }
    setSavingAsm(true);
    const body = {
      projectId,
      description: asmForm.description.trim(),
      rationale: asmForm.rationale || null,
      impactIfFalse: asmForm.impactIfFalse || null,
      ownerName: asmForm.ownerName || null,
      dueDate: asmForm.dueDate || null,
    };
    try {
      if (asmDialog?.mode === "edit" && asmDialog.target) await api.patch(`/api/assumptions/${asmDialog.target.id}`, body);
      else await api.post("/api/assumptions", body);
      toast.success(asmDialog?.mode === "edit" ? "Assumption updated" : "Assumption recorded");
      setAsmDialog(null);
      await refreshRaid();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save assumption");
    } finally {
      setSavingAsm(false);
    }
  };

  const summary = useMemo(() => {
    const r = risks.data?.risks ?? [];
    const i = issues.data?.issues ?? [];
    const a = assumptions.data?.assumptions ?? [];
    return {
      openRisks: r.filter((x) => x.status !== "CLOSED").length,
      critical: r.filter((x) => x.severity === "CRITICAL" && x.status !== "CLOSED").length,
      openIssues: i.filter((x) => !["RESOLVED", "CLOSED"].includes(x.status)).length,
      atRisk: a.filter((x) => x.status === "AT_RISK").length,
    };
  }, [risks.data, issues.data, assumptions.data]);

  // ---- Columns ----
  const riskColumns: Column<Risk>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs text-slate-500">{r.code}</span> },
    { key: "title", header: "Risk", className: "min-w-56 max-w-72", render: (r) => (
      <div><p className="font-medium text-slate-800 truncate">{r.title}</p><p className="text-xs text-slate-400">{r.category.toLowerCase()}</p></div>
    ) },
    { key: "score", header: "P × I", render: (r) => (
      <span className="tabular-nums text-slate-600">{r.probability}×{r.impact}=<span className={`font-semibold ${r.score >= 16 ? "text-red-600" : r.score >= 10 ? "text-amber-600" : "text-slate-700"}`}>{r.score}</span></span>
    ) },
    { key: "severity", header: "Severity", render: (r) => <StatusChip status={r.severity} /> },
    { key: "status", header: "Status", render: (r) => (
      <Select value={r.status} onValueChange={(v) => void patch(() => api.patch(`/api/risks/${r.id}`, { status: v }), `${r.code} → ${v.toLowerCase()}`)}>
        <SelectTrigger className="h-7 w-32 text-xs bg-white" aria-label={`Status for ${r.code}`}><SelectValue /></SelectTrigger>
        <SelectContent>{RISK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
    ) },
    { key: "owner", header: "Owner", render: (r) => <span className="text-slate-600">{r.ownerName || "—"}</span> },
    { key: "strategy", header: "Strategy", render: (r) => <span className="text-xs text-slate-500">{r.responseStrategy.toLowerCase()}</span> },
    { key: "due", header: "Due", render: (r) => <span className="tabular-nums text-slate-500">{fmtDate(r.dueDate)}</span> },
    { key: "escalation", header: "Escalation", render: (r) => <span className="text-xs text-slate-400">{r.escalationLevel.toLowerCase()}</span> },
    { key: "actions", header: "", className: "w-20", render: (r) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${r.code}`} onClick={(e) => { e.stopPropagation(); openRiskDialog("edit", r); }}><Pencil className="h-3.5 w-3.5" /></Button>
        <ConfirmButton onConfirm={() => void patch(() => api.del(`/api/risks/${r.id}`), `${r.code} deleted`)} title={`Delete ${r.code}?`} description="The risk record will be permanently removed." variant="ghost">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-red-500" aria-label={`Delete ${r.code}`} onClick={(e) => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5" /></span>
        </ConfirmButton>
      </div>
    ) },
  ];

  const issueColumns: Column<Issue>[] = [
    { key: "code", header: "Code", render: (i) => <span className="font-mono text-xs text-slate-500">{i.code}</span> },
    { key: "title", header: "Issue", className: "min-w-56 max-w-72", render: (i) => (
      <div><p className="font-medium text-slate-800 truncate">{i.title}</p><p className="text-xs text-slate-400">{i.category.toLowerCase()}{i.impact ? ` · ${i.impact}` : ""}</p></div>
    ) },
    { key: "severity", header: "Severity", render: (i) => <StatusChip status={i.severity} /> },
    { key: "priority", header: "Priority", render: (i) => <StatusChip status={i.priority} /> },
    { key: "status", header: "Status", render: (i) => (
      <Select value={i.status} onValueChange={(v) => void patch(() => api.patch(`/api/issues/${i.id}`, { status: v }), `${i.code} → ${v.toLowerCase()}`)}>
        <SelectTrigger className="h-7 w-32 text-xs bg-white" aria-label={`Status for ${i.code}`}><SelectValue /></SelectTrigger>
        <SelectContent>{ISSUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
    ) },
    { key: "owner", header: "Owner", render: (i) => <span className="text-slate-600">{i.ownerName || "—"}</span> },
    { key: "due", header: "Due", render: (i) => <span className="tabular-nums text-slate-500">{fmtDate(i.dueDate)}</span> },
    { key: "resolution", header: "Resolution", className: "max-w-40", render: (i) => <span className="text-xs text-slate-500 truncate block">{i.resolution || "—"}</span> },
    { key: "actions", header: "", className: "w-20", render: (i) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${i.code}`} onClick={(e) => { e.stopPropagation(); openIssueDialog("edit", i); }}><Pencil className="h-3.5 w-3.5" /></Button>
        <ConfirmButton onConfirm={() => void patch(() => api.del(`/api/issues/${i.id}`), `${i.code} deleted`)} title={`Delete ${i.code}?`} description="The issue record will be permanently removed." variant="ghost">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-red-500" aria-label={`Delete ${i.code}`} onClick={(e) => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5" /></span>
        </ConfirmButton>
      </div>
    ) },
  ];

  const asmColumns: Column<Assumption>[] = [
    { key: "code", header: "Code", render: (a) => <span className="font-mono text-xs text-slate-500">{a.code}</span> },
    { key: "description", header: "Assumption", className: "min-w-72 max-w-md", render: (a) => <p className="text-slate-800">{a.description}</p> },
    { key: "status", header: "Status", render: (a) => (
      <Select value={a.status} onValueChange={(v) => void patch(() => api.patch(`/api/assumptions/${a.id}`, { status: v }), `${a.code} → ${v.toLowerCase()}${v === "VALID" ? " (validated)" : ""}`)}>
        <SelectTrigger className="h-7 w-32 text-xs bg-white" aria-label={`Status for ${a.code}`}><SelectValue /></SelectTrigger>
        <SelectContent>{ASSUMPTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
    ) },
    { key: "owner", header: "Owner", render: (a) => <span className="text-slate-600">{a.ownerName || "—"}</span> },
    { key: "validationDate", header: "Validated", render: (a) => <span className="tabular-nums text-slate-500">{fmtDate(a.validationDate)}</span> },
    { key: "due", header: "Review by", render: (a) => <span className="tabular-nums text-slate-500">{fmtDate(a.dueDate)}</span> },
    { key: "actions", header: "", className: "w-20", render: (a) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${a.code}`} onClick={(e) => { e.stopPropagation(); openAsmDialog("edit", a); }}><Pencil className="h-3.5 w-3.5" /></Button>
        <ConfirmButton onConfirm={() => void patch(() => api.del(`/api/assumptions/${a.id}`), `${a.code} deleted`)} title={`Delete ${a.code}?`} description="The assumption will be permanently removed." variant="ghost">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-red-500" aria-label={`Delete ${a.code}`} onClick={(e) => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5" /></span>
        </ConfirmButton>
      </div>
    ) },
  ];

  if (optionsLoading) return <LoadingBlock label="Loading projects…" />;
  if (!projectId) return <EmptyState title="No projects available" />;
  const loadingAny = (risks.loading && !risks.data) || (issues.loading && !issues.data) || (assumptions.loading && !assumptions.data);
  const firstError = risks.error || issues.error || assumptions.error;

  return (
    <div className="space-y-5">
      <PageHeader
        io={tab === "issues" ? "issues" : tab === "assumptions" ? "assumptions" : "risks"}
        title="RAID Console"
        subtitle="Risks, assumptions, issues and dependencies — one governed log per project."
        breadcrumb={["Home", "Control", "RAID"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} options={options} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SectionCard bodyClass="p-4"><p className="text-xs uppercase text-slate-400">Open risks</p><p className="text-2xl font-semibold text-slate-900 tabular-nums">{summary.openRisks}</p></SectionCard>
        <SectionCard bodyClass="p-4"><p className="text-xs uppercase text-slate-400">Critical severity</p><p className="text-2xl font-semibold text-red-600 tabular-nums">{summary.critical}</p></SectionCard>
        <SectionCard bodyClass="p-4"><p className="text-xs uppercase text-slate-400">Open issues</p><p className="text-2xl font-semibold text-amber-600 tabular-nums">{summary.openIssues}</p></SectionCard>
        <SectionCard bodyClass="p-4"><p className="text-xs uppercase text-slate-400">Assumptions at risk</p><p className="text-2xl font-semibold text-slate-900 tabular-nums">{summary.atRisk}</p></SectionCard>
      </div>

      <SectionCard
        title={selected ? `${selected.code} — ${selected.name}` : "RAID log"}
        actions={
          <div className="flex items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="h-9">
                <TabsTrigger value="risks" className="text-xs">Risks</TabsTrigger>
                <TabsTrigger value="issues" className="text-xs">Issues</TabsTrigger>
                <TabsTrigger value="assumptions" className="text-xs">Assumptions</TabsTrigger>
                <TabsTrigger value="dependencies" className="text-xs">Dependencies</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "risks" && <Button size="sm" onClick={() => openRiskDialog("add")}><Plus className="h-4 w-4 mr-1" />Add risk</Button>}
            {tab === "issues" && <Button size="sm" onClick={() => openIssueDialog("add")}><Plus className="h-4 w-4 mr-1" />Log issue</Button>}
            {tab === "assumptions" && <Button size="sm" onClick={() => openAsmDialog("add")}><Plus className="h-4 w-4 mr-1" />Add assumption</Button>}
          </div>
        }
      >
        {loadingAny && !(risks.data || issues.data || assumptions.data) ? <LoadingBlock label="Loading RAID log…" /> :
          firstError && !(risks.data || issues.data || assumptions.data) ? <ErrorBlock message={firstError} onRetry={() => void refreshRaid()} /> : (
            <>
              {tab === "risks" && (risks.error ? <ErrorBlock message={risks.error} onRetry={risks.refetch} /> :
                <DataTable columns={riskColumns} rows={risks.data?.risks ?? []} keyField="id" emptyTitle="No risks registered" emptyDescription="A clean log is good news — register new risks as they emerge." maxHeight="36rem" />)}
              {tab === "issues" && (issues.error ? <ErrorBlock message={issues.error} onRetry={issues.refetch} /> :
                <DataTable columns={issueColumns} rows={issues.data?.issues ?? []} keyField="id" emptyTitle="No issues logged" emptyDescription="Issues raised through monitoring will appear here." maxHeight="36rem" />)}
              {tab === "assumptions" && (assumptions.error ? <ErrorBlock message={assumptions.error} onRetry={assumptions.refetch} /> :
                <DataTable columns={asmColumns} rows={assumptions.data?.assumptions ?? []} keyField="id" emptyTitle="No assumptions recorded" maxHeight="36rem" />)}
              {tab === "dependencies" && (dependencies.loading && !dependencies.data ? <LoadingBlock /> :
                dependencies.error ? <ErrorBlock message={dependencies.error} onRetry={dependencies.refetch} /> :
                  (dependencies.data?.items ?? []).length === 0 ? <EmptyState title="No dependencies mapped" /> : (
                    <div className="rounded-lg border border-slate-200 overflow-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-[1]">
                          <tr className="bg-slate-50 border-b border-slate-200">
                            {["Predecessor", "", "Type", "Lag", "", "Successor", "External"].map((h, idx) => (
                              <th key={idx} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(dependencies.data?.items ?? []).map((d) => (
                            <tr key={d.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-3 py-2.5"><span className="font-mono text-xs text-slate-500">{d.predecessor.code}</span><span className="block text-slate-700 truncate max-w-56">{d.predecessor.name}</span></td>
                              <td className="px-3 py-2.5"><ArrowRight className="h-3.5 w-3.5 text-slate-300" /></td>
                              <td className="px-3 py-2.5 font-medium text-slate-700">{d.depType}{d.lagDays ? ` +${d.lagDays}d` : ""}</td>
                              <td className="px-3 py-2.5 tabular-nums text-slate-500">{d.lagDays}d</td>
                              <td className="px-3 py-2.5"></td>
                              <td className="px-3 py-2.5"><span className="font-mono text-xs text-slate-500">{d.successor.code}</span><span className="block text-slate-700 truncate max-w-56">{d.successor.name}</span></td>
                              <td className="px-3 py-2.5 text-xs text-slate-400">{d.isExternal ? "yes" : "no"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
            </>
          )}
      </SectionCard>

      {/* Risk dialog */}
      <Dialog open={Boolean(riskDialog)} onOpenChange={(o) => { if (!o) setRiskDialog(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{riskDialog?.mode === "edit" ? `Edit ${riskDialog.target?.code}` : "Add risk"}</DialogTitle>
            <DialogDescription>Score is computed as probability × impact; severity derives from the score.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="rk-title">Title *</Label>
              <Input id="rk-title" value={riskForm.title} onChange={(e) => setRiskForm((p) => ({ ...p, title: e.target.value }))} placeholder="What could go wrong?" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="rk-desc">Description</Label>
              <Textarea id="rk-desc" rows={2} value={riskForm.description} onChange={(e) => setRiskForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={riskForm.category} onValueChange={(v) => setRiskForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{RISK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Response strategy</Label>
              <Select value={riskForm.responseStrategy} onValueChange={(v) => setRiskForm((p) => ({ ...p, responseStrategy: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{STRATEGIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rk-p">Probability (1–5)</Label>
              <Select value={riskForm.probability} onValueChange={(v) => setRiskForm((p) => ({ ...p, probability: v }))}>
                <SelectTrigger className="bg-white" id="rk-p"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rk-i">Impact (1–5)</Label>
              <Select value={riskForm.impact} onValueChange={(v) => setRiskForm((p) => ({ ...p, impact: v }))}>
                <SelectTrigger className="bg-white" id="rk-i"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
              Score: <span className="font-semibold tabular-nums">{Number(riskForm.probability) * Number(riskForm.impact)}</span>
              <span className="text-slate-400"> — severity {(Number(riskForm.probability) * Number(riskForm.impact)) >= 16 ? "CRITICAL" : (Number(riskForm.probability) * Number(riskForm.impact)) >= 10 ? "HIGH" : (Number(riskForm.probability) * Number(riskForm.impact)) >= 5 ? "MEDIUM" : "LOW"}</span>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rk-owner">Owner</Label>
              <Input id="rk-owner" value={riskForm.ownerName} onChange={(e) => setRiskForm((p) => ({ ...p, ownerName: e.target.value }))} placeholder="Responsible person" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rk-due">Review by</Label>
              <Input id="rk-due" type="date" value={riskForm.dueDate} onChange={(e) => setRiskForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="rk-mit">Mitigation</Label>
              <Textarea id="rk-mit" rows={2} value={riskForm.mitigation} onChange={(e) => setRiskForm((p) => ({ ...p, mitigation: e.target.value }))} placeholder="Planned response" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskDialog(null)}>Cancel</Button>
            <Button disabled={savingRisk} onClick={() => void saveRisk()}>{savingRisk ? "Saving…" : riskDialog?.mode === "edit" ? "Save changes" : "Register risk"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue dialog */}
      <Dialog open={Boolean(issueDialog)} onOpenChange={(o) => { if (!o) setIssueDialog(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{issueDialog?.mode === "edit" ? `Edit ${issueDialog.target?.code}` : "Log issue"}</DialogTitle>
            <DialogDescription>CRITICAL severity auto-propagates to priority.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="is-title">Title *</Label>
              <Input id="is-title" value={issueForm.title} onChange={(e) => setIssueForm((p) => ({ ...p, title: e.target.value }))} placeholder="What is going wrong?" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="is-desc">Description</Label>
              <Textarea id="is-desc" rows={2} value={issueForm.description} onChange={(e) => setIssueForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={issueForm.category} onValueChange={(v) => setIssueForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{ISSUE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Severity</Label>
              <Select value={issueForm.severity} onValueChange={(v) => setIssueForm((p) => ({ ...p, severity: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{ISSUE_SEVERITY.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="is-owner">Owner</Label>
              <Input id="is-owner" value={issueForm.ownerName} onChange={(e) => setIssueForm((p) => ({ ...p, ownerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="is-raised">Raised by</Label>
              <Input id="is-raised" value={issueForm.raisedBy} onChange={(e) => setIssueForm((p) => ({ ...p, raisedBy: e.target.value }))} placeholder="Source / person" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="is-due">Due</Label>
              <Input id="is-due" type="date" value={issueForm.dueDate} onChange={(e) => setIssueForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Escalation</Label>
              <Select value={issueForm.escalationLevel} onValueChange={(v) => setIssueForm((p) => ({ ...p, escalationLevel: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{["NONE", "PROJECT", "PROGRAM", "PORTFOLIO"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="is-impact">Impact</Label>
              <Input id="is-impact" value={issueForm.impact} onChange={(e) => setIssueForm((p) => ({ ...p, impact: e.target.value }))} placeholder="Consequence if unresolved" />
            </div>
            {issueDialog?.mode === "edit" && (
              <div className="space-y-1 col-span-2">
                <Label htmlFor="is-res">Resolution (record when resolving/closing)</Label>
                <Input id="is-res" value={issueForm.resolution} onChange={(e) => setIssueForm((p) => ({ ...p, resolution: e.target.value }))} placeholder="How was this resolved?" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialog(null)}>Cancel</Button>
            <Button disabled={savingIssue} onClick={() => void saveIssue()}>{savingIssue ? "Saving…" : issueDialog?.mode === "edit" ? "Save changes" : "Log issue"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assumption dialog */}
      <Dialog open={Boolean(asmDialog)} onOpenChange={(o) => { if (!o) setAsmDialog(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{asmDialog?.mode === "edit" ? `Edit ${asmDialog.target?.code}` : "Add assumption"}</DialogTitle>
            <DialogDescription>Setting status to VALID stamps the validation date automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="as-desc">Assumption *</Label>
              <Textarea id="as-desc" rows={2} value={asmForm.description} onChange={(e) => setAsmForm((p) => ({ ...p, description: e.target.value }))} placeholder="We assume that…" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="as-rat">Rationale</Label>
              <Textarea id="as-rat" rows={2} value={asmForm.rationale} onChange={(e) => setAsmForm((p) => ({ ...p, rationale: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="as-imp">Impact if false</Label>
              <Textarea id="as-imp" rows={2} value={asmForm.impactIfFalse} onChange={(e) => setAsmForm((p) => ({ ...p, impactIfFalse: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="as-owner">Owner</Label>
              <Input id="as-owner" value={asmForm.ownerName} onChange={(e) => setAsmForm((p) => ({ ...p, ownerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="as-due">Review by</Label>
              <Input id="as-due" type="date" value={asmForm.dueDate} onChange={(e) => setAsmForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsmDialog(null)}>Cancel</Button>
            <Button disabled={savingAsm} onClick={() => void saveAsm()}>{savingAsm ? "Saving…" : asmDialog?.mode === "edit" ? "Save changes" : "Record assumption"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
