"use client";
// PM CONTROL TOWER — Shared milestones panel (workspace tab + plan page)
// Timeline table with baseline variance, completion action and creation dialog.

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, StatCard, ConfirmButton } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayNum, fmtDate } from "@/lib/constants";
import { Flag, CalendarClock, AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
interface Milestone {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  baselineDate: string | null;
  status: string;
  isCritical: boolean;
  completedAt: string | null;
}
interface MilestonesBundle { projectId: string; items: Milestone[]; overdue: number; total: number }

export default function MilestonesPanel({ projectId }: { projectId: string }) {
  const ms = useApi<MilestonesBundle>(`/api/projects/${projectId}/milestones`);
  useRealtimeRefetch(ms.refetch, ["milestone:changed", "project:updated"]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", dueDate: "", baselineDate: "", isCritical: false, description: "" });

  const create = async () => {
    if (form.name.trim().length < 1) { toast.error("Milestone name is required"); return; }
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/milestones`, {
        name: form.name.trim(),
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        baselineDate: form.baselineDate ? new Date(form.baselineDate).toISOString() : undefined,
        isCritical: form.isCritical,
        description: form.description.trim() || null,
      });
      toast.success("Milestone created");
      setOpen(false);
      setForm({ name: "", dueDate: "", baselineDate: "", isCritical: false, description: "" });
      await ms.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create milestone");
    } finally {
      setSaving(false);
    }
  };

  const complete = async (m: Milestone) => {
    try {
      await api.patch(`/api/projects/${projectId}/milestones/${m.id}`, { status: "COMPLETED" });
      toast.success(`${m.code} completed`);
      await ms.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete milestone");
    }
  };

  const remove = async (m: Milestone) => {
    try {
      await api.del(`/api/projects/${projectId}/milestones/${m.id}`);
      toast.success(`${m.code} deleted`);
      await ms.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const items = ms.data?.items || [];
  const completed = items.filter((m) => m.status === "COMPLETED").length;
  const overdue = ms.data?.overdue ?? 0;

  const variance = (m: Milestone): number | null => {
    if (!m.dueDate || !m.baselineDate) return null;
    return Math.round((dayNum(m.dueDate) - dayNum(m.baselineDate)));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Milestones" value={ms.data?.total ?? 0} sub={`${completed} completed`} icon={<Flag className="h-4 w-4" />} />
        <StatCard label="Overdue" value={overdue} tone={overdue > 0 ? "bad" : "good"} sub="Past due date, not completed" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Critical" value={items.filter((m) => m.isCritical).length} sub="Business-critical checkpoints" icon={<CalendarClock className="h-4 w-4" />} />
        <StatCard label="Completion" value={`${items.length ? Math.round((completed / items.length) * 100) : 0}%`} sub={`${items.length - completed} outstanding`} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <SectionCard
        title="Milestone timeline"
        description="Variance = forecast due date minus baseline date (positive = slip)"
        actions={<Button size="sm" className="h-8" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add milestone</Button>}
      >
        {ms.loading ? <LoadingBlock label="Loading milestones…" />
          : ms.error ? <ErrorBlock message={ms.error} onRetry={ms.refetch} />
          : !items.length ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-sm font-medium text-slate-700">No milestones</p>
              <p className="text-xs text-slate-500 mt-1">Define the contractual checkpoints for this project.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Milestone</th>
                    <th className="px-3 py-2.5 font-medium">Due</th>
                    <th className="px-3 py-2.5 font-medium">Baseline</th>
                    <th className="px-3 py-2.5 font-medium text-right">Variance</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Flags</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => {
                    const v = variance(m);
                    return (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                        <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{m.code}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">{m.name}</p>
                          {m.completedAt && <p className="text-[11px] text-emerald-600">Completed {fmtDate(m.completedAt)}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(m.dueDate)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(m.baselineDate)}</td>
                        <td className="px-3 py-2 text-right">
                          {v === null ? <span className="text-slate-400">—</span> : (
                            <span className={`tabular-nums text-xs font-medium ${v > 0 ? "text-red-600" : v < 0 ? "text-emerald-600" : "text-slate-500"}`}>
                              {v > 0 ? "+" : ""}{v}d
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2"><StatusChip status={m.status} /></td>
                        <td className="px-3 py-2">
                          {m.isCritical && <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Critical</span>}
                          {!m.isCritical && <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {m.status !== "COMPLETED" && (
                            <Button variant="outline" size="sm" className="h-7 mr-1" onClick={() => complete(m)}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Complete
                            </Button>
                          )}
                          <ConfirmButton variant="ghost" title={`Delete ${m.code}?`} description="Milestone history is removed from the plan." confirmLabel="Delete" onConfirm={() => remove(m)}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${m.code}`}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </ConfirmButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add milestone</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="ms-name">Name</Label>
              <Input id="ms-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. UAT sign-off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ms-due">Forecast due</Label>
                <Input id="ms-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ms-baseline">Baseline date</Label>
                <Input id="ms-baseline" type="date" value={form.baselineDate} onChange={(e) => setForm({ ...form, baselineDate: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.isCritical} onChange={(e) => setForm({ ...form, isCritical: e.target.checked })} className="rounded border-slate-300" />
              Business-critical milestone
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="ms-desc">Description</Label>
              <Textarea id="ms-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create milestone"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
