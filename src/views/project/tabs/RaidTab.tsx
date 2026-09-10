"use client";
// PM CONTROL TOWER — Workspace RAID tab: Risks, Issues, Assumptions registers

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, ConfirmButton, EmptyState } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/constants";
import { Plus, Trash2 } from "lucide-react";

const RISK_STATUSES = ["OPEN", "MITIGATING", "ACCEPTED", "ESCALATED", "CLOSED"];
const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ASSUMPTION_STATUSES = ["VALID", "AT_RISK", "INVALID", "CLOSED"];
const RISK_CATEGORIES = ["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "EXTERNAL", "OTHER"];
const STRATEGIES = ["AVOID", "MITIGATE", "TRANSFER", "ACCEPT", "MONITOR", "ESCALATE"];

interface Risk {
  id: string; code: string; title: string; category: string;
  probability: number; impact: number; score: number; severity: string; status: string;
  ownerName: string | null; responseStrategy: string; identifiedAt: string; dueDate: string | null;
}
interface Issue {
  id: string; code: string; title: string; category: string; severity: string; status: string;
  ownerName: string | null; raisedAt: string; dueDate: string | null; resolvedAt: string | null;
}
interface Assumption {
  id: string; code: string; description: string; rationale: string | null;
  impactIfFalse: string | null; status: string; ownerName: string | null; dueDate: string | null;
}

function severityChip(v: number | string): string {
  const s = typeof v === "number" ? (v >= 16 ? "CRITICAL" : v >= 10 ? "HIGH" : v >= 5 ? "MEDIUM" : "LOW") : v;
  const tone = s === "CRITICAL" ? "bg-red-50 text-red-700 border-red-200"
    : s === "HIGH" ? "bg-orange-50 text-orange-700 border-orange-200"
    : s === "MEDIUM" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  return `inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tone}`;
}

export default function RaidTab({ projectId }: { projectId: string }) {
  const risks = useApi<{ risks: Risk[] }>(`/api/risks?projectId=${projectId}`);
  const issues = useApi<{ issues: Issue[] }>(`/api/issues?projectId=${projectId}`);
  const assumptions = useApi<{ assumptions: Assumption[] }>(`/api/assumptions?projectId=${projectId}`);
  useRealtimeRefetch(risks.refetch, ["raid:changed"]);
  useRealtimeRefetch(issues.refetch, ["raid:changed"]);
  useRealtimeRefetch(assumptions.refetch, ["raid:changed"]);

  const [riskOpen, setRiskOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [asmOpen, setAsmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [riskForm, setRiskForm] = useState({ title: "", category: "TECHNICAL", probability: "3", impact: "3", ownerName: "", responseStrategy: "MITIGATE", mitigation: "" });
  const [issueForm, setIssueForm] = useState({ title: "", category: "TECHNICAL", severity: "MEDIUM", ownerName: "", impact: "" });
  const [asmForm, setAsmForm] = useState({ description: "", rationale: "", impactIfFalse: "", ownerName: "" });

  const guard = (ok: boolean, msg: string) => { if (!ok) { toast.error(msg); return false; } return true; };

  const createRisk = async () => {
    if (!guard(riskForm.title.trim().length >= 3, "Risk title must be at least 3 characters")) return;
    setSaving(true);
    try {
      await api.post("/api/risks", {
        projectId, title: riskForm.title.trim(), category: riskForm.category,
        probability: Number(riskForm.probability), impact: Number(riskForm.impact),
        ownerName: riskForm.ownerName.trim() || null, responseStrategy: riskForm.responseStrategy,
        mitigation: riskForm.mitigation.trim() || null,
      });
      toast.success("Risk logged");
      setRiskOpen(false);
      setRiskForm({ title: "", category: "TECHNICAL", probability: "3", impact: "3", ownerName: "", responseStrategy: "MITIGATE", mitigation: "" });
      await risks.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to create risk"); } finally { setSaving(false); }
  };

  const createIssue = async () => {
    if (!guard(issueForm.title.trim().length >= 3, "Issue title must be at least 3 characters")) return;
    setSaving(true);
    try {
      await api.post("/api/issues", {
        projectId, title: issueForm.title.trim(), category: issueForm.category,
        severity: issueForm.severity, ownerName: issueForm.ownerName.trim() || null,
        impact: issueForm.impact.trim() || null,
      });
      toast.success("Issue logged");
      setIssueOpen(false);
      setIssueForm({ title: "", category: "TECHNICAL", severity: "MEDIUM", ownerName: "", impact: "" });
      await issues.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to create issue"); } finally { setSaving(false); }
  };

  const createAssumption = async () => {
    if (!guard(asmForm.description.trim().length >= 3, "Assumption description must be at least 3 characters")) return;
    setSaving(true);
    try {
      await api.post("/api/assumptions", {
        projectId, description: asmForm.description.trim(),
        rationale: asmForm.rationale.trim() || null,
        impactIfFalse: asmForm.impactIfFalse.trim() || null,
        ownerName: asmForm.ownerName.trim() || null,
      });
      toast.success("Assumption logged");
      setAsmOpen(false);
      setAsmForm({ description: "", rationale: "", impactIfFalse: "", ownerName: "" });
      await assumptions.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to create assumption"); } finally { setSaving(false); }
  };

  const patchStatus = async (kind: "risks" | "issues" | "assumptions", id: string, body: Record<string, unknown>, refetch: () => void) => {
    try {
      await api.patch(`/api/${kind}/${id}`, body);
      toast.success("Status updated");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
      refetch();
    }
  };

  const deleteRow = async (kind: "risks" | "issues" | "assumptions", id: string, refetch: () => void) => {
    try {
      await api.del(`/api/${kind}/${id}`);
      toast.success("Deleted");
      refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const statusSelect = (value: string, options: string[], onValue: (v: string) => void, label: string) => (
    <Select value={value} onValueChange={onValue}>
      <SelectTrigger className="h-7 w-[130px] text-xs" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
    </Select>
  );

  const addBtn = (label: string, onClick: () => void) => (
    <Button size="sm" className="h-8" onClick={onClick}><Plus className="h-3.5 w-3.5 mr-1" /> {label}</Button>
  );

  return (
    <div className="space-y-4">
      {/* RISKS */}
      <SectionCard title="Risk register" description={`${risks.data?.risks.length ?? 0} risks · score = probability × impact`}
        actions={addBtn("Log risk", () => setRiskOpen(true))}>
        {risks.loading ? <LoadingBlock label="Loading risks…" />
          : risks.error ? <ErrorBlock message={risks.error} onRetry={risks.refetch} />
          : !(risks.data?.risks || []).length ? <EmptyState title="No risks logged" description="Capture threats with probability and impact scoring." />
          : (
            <div className="rounded-lg border border-slate-200 overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Risk</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">P×I</th>
                    <th className="px-3 py-2 font-medium">Severity</th>
                    <th className="px-3 py-2 font-medium">Strategy</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(risks.data?.risks || []).map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                      <td className="px-3 py-2 max-w-[260px]"><p className="font-medium text-slate-800 truncate" title={r.title}>{r.title}</p></td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{r.probability}×{r.impact}={r.score}</td>
                      <td className="px-3 py-2"><span className={severityChip(r.score)}>{r.severity}</span></td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.responseStrategy}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{r.ownerName || "—"}</td>
                      <td className="px-3 py-2">{statusSelect(r.status, RISK_STATUSES, (v) => patchStatus("risks", r.id, { status: v }, risks.refetch), `Status of ${r.code}`)}</td>
                      <td className="px-3 py-2 text-right">
                        <ConfirmButton variant="ghost" title={`Delete ${r.code}?`} confirmLabel="Delete" onConfirm={() => deleteRow("risks", r.id, risks.refetch)}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${r.code}`}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      {/* ISSUES */}
      <SectionCard title="Issue log" description={`${issues.data?.issues.length ?? 0} issues raised through delivery quality monitoring`}
        actions={addBtn("Log issue", () => setIssueOpen(true))}>
        {issues.loading ? <LoadingBlock label="Loading issues…" />
          : issues.error ? <ErrorBlock message={issues.error} onRetry={issues.refetch} />
          : !(issues.data?.issues || []).length ? <EmptyState title="No issues logged" />
          : (
            <div className="rounded-lg border border-slate-200 overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Issue</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Severity</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Raised</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(issues.data?.issues || []).map((i) => (
                    <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{i.code}</td>
                      <td className="px-3 py-2 max-w-[260px]"><p className="font-medium text-slate-800 truncate" title={i.title}>{i.title}</p></td>
                      <td className="px-3 py-2 text-xs text-slate-500">{i.category}</td>
                      <td className="px-3 py-2"><span className={severityChip(i.severity)}>{i.severity}</span></td>
                      <td className="px-3 py-2 text-xs text-slate-600">{i.ownerName || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDate(i.raisedAt)}</td>
                      <td className="px-3 py-2">{statusSelect(i.status, ISSUE_STATUSES, (v) => patchStatus("issues", i.id, { status: v }, issues.refetch), `Status of ${i.code}`)}</td>
                      <td className="px-3 py-2 text-right">
                        <ConfirmButton variant="ghost" title={`Delete ${i.code}?`} confirmLabel="Delete" onConfirm={() => deleteRow("issues", i.id, issues.refetch)}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${i.code}`}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      {/* ASSUMPTIONS */}
      <SectionCard title="Assumptions" description={`${assumptions.data?.assumptions.length ?? 0} assumptions underpinning the plan`}
        actions={addBtn("Log assumption", () => setAsmOpen(true))}>
        {assumptions.loading ? <LoadingBlock label="Loading assumptions…" />
          : assumptions.error ? <ErrorBlock message={assumptions.error} onRetry={assumptions.refetch} />
          : !(assumptions.data?.assumptions || []).length ? <EmptyState title="No assumptions logged" />
          : (
            <div className="rounded-lg border border-slate-200 overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Assumption</th>
                    <th className="px-3 py-2 font-medium">Impact if false</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(assumptions.data?.assumptions || []).map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{a.code}</td>
                      <td className="px-3 py-2 max-w-[320px]"><p className="text-slate-800 truncate" title={a.description}>{a.description}</p></td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-[220px] truncate">{a.impactIfFalse || "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{a.ownerName || "—"}</td>
                      <td className="px-3 py-2">{statusSelect(a.status, ASSUMPTION_STATUSES, (v) => patchStatus("assumptions", a.id, { status: v }, assumptions.refetch), `Status of ${a.code}`)}</td>
                      <td className="px-3 py-2 text-right">
                        <ConfirmButton variant="ghost" title={`Delete ${a.code}?`} confirmLabel="Delete" onConfirm={() => deleteRow("assumptions", a.id, assumptions.refetch)}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${a.code}`}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      {/* Risk dialog */}
      <Dialog open={riskOpen} onOpenChange={setRiskOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Log risk</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="risk-title">Title</Label>
              <Input id="risk-title" value={riskForm.title} onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={riskForm.category} onValueChange={(v) => setRiskForm({ ...riskForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISK_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="risk-p">Probability (1–5)</Label>
                <Input id="risk-p" type="number" min={1} max={5} value={riskForm.probability} onChange={(e) => setRiskForm({ ...riskForm, probability: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="risk-i">Impact (1–5)</Label>
                <Input id="risk-i" type="number" min={1} max={5} value={riskForm.impact} onChange={(e) => setRiskForm({ ...riskForm, impact: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Response strategy</Label>
                <Select value={riskForm.responseStrategy} onValueChange={(v) => setRiskForm({ ...riskForm, responseStrategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="risk-owner">Owner</Label>
                <Input id="risk-owner" value={riskForm.ownerName} onChange={(e) => setRiskForm({ ...riskForm, ownerName: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="risk-mit">Mitigation</Label>
              <Textarea id="risk-mit" rows={2} value={riskForm.mitigation} onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskOpen(false)}>Cancel</Button>
            <Button onClick={createRisk} disabled={saving}>{saving ? "Saving…" : "Log risk"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Log issue</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-title">Title</Label>
              <Input id="issue-title" value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={issueForm.category} onValueChange={(v) => setIssueForm({ ...issueForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["TECHNICAL", "OPERATIONAL", "RESOURCE", "VENDOR", "QUALITY", "OTHER"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Severity</Label>
                <Select value={issueForm.severity} onValueChange={(v) => setIssueForm({ ...issueForm, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="issue-owner">Owner</Label>
                <Input id="issue-owner" value={issueForm.ownerName} onChange={(e) => setIssueForm({ ...issueForm, ownerName: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="issue-impact">Impact</Label>
                <Input id="issue-impact" value={issueForm.impact} onChange={(e) => setIssueForm({ ...issueForm, impact: e.target.value })} placeholder="Describe the impact" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button onClick={createIssue} disabled={saving}>{saving ? "Saving…" : "Log issue"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assumption dialog */}
      <Dialog open={asmOpen} onOpenChange={setAsmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Log assumption</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="asm-desc">Assumption</Label>
              <Textarea id="asm-desc" rows={2} value={asmForm.description} onChange={(e) => setAsmForm({ ...asmForm, description: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="asm-rat">Rationale</Label>
              <Input id="asm-rat" value={asmForm.rationale} onChange={(e) => setAsmForm({ ...asmForm, rationale: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="asm-impact">Impact if false</Label>
                <Input id="asm-impact" value={asmForm.impactIfFalse} onChange={(e) => setAsmForm({ ...asmForm, impactIfFalse: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="asm-owner">Owner</Label>
                <Input id="asm-owner" value={asmForm.ownerName} onChange={(e) => setAsmForm({ ...asmForm, ownerName: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsmOpen(false)}>Cancel</Button>
            <Button onClick={createAssumption} disabled={saving}>{saving ? "Saving…" : "Log assumption"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
