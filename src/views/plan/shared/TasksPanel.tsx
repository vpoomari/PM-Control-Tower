"use client";
// PM CONTROL TOWER — Shared tasks panel (plan page; workspace uses the Gantt)
// Task table with quick status/progress editing and task creation against WBS packages.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, ProgressBar, ConfirmButton } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUS, PRIORITY, fmtDate, num } from "@/lib/constants";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

interface TaskRow {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  progress: number;
  plannedHours: number;
  actualHours: number;
  isCritical: boolean;
  wbs?: { id: string; code: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
}
interface TasksBundle { projectId: string; items: TaskRow[]; total: number }
interface WbsFlat { id: string; code: string; name: string; nodeType: string }

export default function TasksPanel({ projectId, showGanttLink }: { projectId: string; showGanttLink?: boolean }) {
  const tasks = useApi<TasksBundle>(`/api/projects/${projectId}/tasks`);
  const wbs = useApi<{ tree: WbsFlat[] }>(`/api/projects/${projectId}/wbs`);
  useRealtimeRefetch(tasks.refetch, ["task:changed", "schedule:changed", "dependency:changed"]);

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", wbsId: "", status: "NOT_STARTED", priority: "MEDIUM", startDate: "", endDate: "", plannedHours: "" });

  const flatWbs = useMemo(() => {
    const out: WbsFlat[] = [];
    const walk = (nodes: { id: string; code: string; name: string; nodeType: string; children?: unknown }[]) => {
      for (const n of nodes) { out.push(n); if (n.children) walk(n.children as typeof nodes); }
    };
    walk(wbs.data?.tree || []);
    return out;
  }, [wbs.data]);

  const create = async () => {
    if (form.name.trim().length < 1) { toast.error("Task name is required"); return; }
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/tasks`, {
        name: form.name.trim(),
        wbsId: form.wbsId || undefined,
        status: form.status,
        priority: form.priority,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        plannedHours: form.plannedHours === "" ? undefined : Number(form.plannedHours),
      });
      toast.success("Task created — network rescheduled");
      setAddOpen(false);
      setForm({ name: "", wbsId: "", status: "NOT_STARTED", priority: "MEDIUM", startDate: "", endDate: "", plannedHours: "" });
      await tasks.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const patch = async (t: TaskRow, body: Record<string, unknown>, label: string) => {
    try {
      await api.patch(`/api/projects/${projectId}/tasks/${t.id}`, body);
      toast.success(label);
      await tasks.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
      await tasks.refetch();
    }
  };

  const remove = async (t: TaskRow) => {
    try {
      await api.del(`/api/projects/${projectId}/tasks/${t.id}`);
      toast.success(`${t.code} deleted`);
      await tasks.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      {showGanttLink && (
        <div className="flex justify-end">
          <a href="#/schedule" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800">
            <ExternalLink className="h-3.5 w-3.5" /> Open Gantt chart
          </a>
        </div>
      )}
      <SectionCard
        title="Tasks"
        description={`${tasks.data?.total ?? 0} tasks · red rows are critical-path activities`}
        actions={<Button size="sm" className="h-8" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add task</Button>}
      >
        {tasks.loading ? <LoadingBlock label="Loading tasks…" />
          : tasks.error ? <ErrorBlock message={tasks.error} onRetry={tasks.refetch} />
          : !(tasks.data?.items || []).length ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <p className="text-sm font-medium text-slate-700">No tasks yet</p>
              <p className="text-xs text-slate-500 mt-1">Tasks attach to WBS work packages and drive the CPM schedule.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Task</th>
                    <th className="px-3 py-2.5 font-medium">WBS</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Dates</th>
                    <th className="px-3 py-2.5 font-medium text-right">Dur</th>
                    <th className="px-3 py-2.5 font-medium w-36">Progress</th>
                    <th className="px-3 py-2.5 font-medium text-right">Hours (P/A)</th>
                    <th className="px-3 py-2.5 font-medium">Assignee</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(tasks.data?.items || []).map((t) => (
                    <tr key={t.id} className={`border-b border-slate-100 last:border-0 hover:bg-blue-50/40 ${t.isCritical ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{t.code}</td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <p className="font-medium text-slate-800 truncate">{t.name}</p>
                        {t.assignee && <p className="text-[11px] text-slate-400">{t.assignee.name}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{t.wbs?.code || "—"}</td>
                      <td className="px-3 py-2">
                        <Select value={t.status} onValueChange={(v) => patch(t, { status: v }, `${t.code} → ${v.replace("_", " ").toLowerCase()}`)}>
                          <SelectTrigger className="h-7 w-[130px] text-xs" aria-label={`Status of ${t.code}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{TASK_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{num(t.durationDays, 0)}d</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={t.progress} className="flex-1" />
                          <span className="text-[11px] tabular-nums text-slate-500 w-9 text-right">{Math.round(t.progress)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-600 whitespace-nowrap">{num(t.plannedHours, 0)} / {num(t.actualHours, 0)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {t.isCritical && <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Critical</span>}
                          <StatusChip status={t.priority} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <ConfirmButton variant="ghost" title={`Delete ${t.code}?`} description="Dependencies referencing this task are removed with it and the network is rescheduled." confirmLabel="Delete" onConfirm={() => remove(t)}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${t.code}`}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add task</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="task-name">Name</Label>
              <Input id="task-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Configure integration middleware" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>WBS package</Label>
                <Select value={form.wbsId || "none"} onValueChange={(v) => setForm({ ...form, wbsId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {flatWbs.filter((w) => w.nodeType === "WORK_PACKAGE").map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="task-start">Start</Label>
                <Input id="task-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="task-end">Finish</Label>
                <Input id="task-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="task-hours">Planned hours</Label>
                <Input id="task-hours" type="number" min={0} value={form.plannedHours} onChange={(e) => setForm({ ...form, plannedHours: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
