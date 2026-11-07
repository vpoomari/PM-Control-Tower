"use client";
// PM CONTROL TOWER — Shared tasks panel (plan page; workspace uses the Gantt)
// Task table with quick status/progress editing, task creation and task editing
// against WBS packages. Add and Edit dialogs render the SAME TaskFormFields, and
// the table shows every form field read-only (incl. constraint/deadline chips).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, ProgressBar, ConfirmButton } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUS, fmtDate, num } from "@/lib/constants";
import { useModuleFieldsHandle } from "@/components/fields/ModuleFields";
import { customFieldColumns } from "@/components/fields/custom-columns";
import RecordFieldsButton from "@/components/fields/RecordFieldsButton";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import {
  TaskFormFields, emptyTaskForm, taskFormFrom, taskFormPayload,
  type TaskFormState, type TaskWbsOption,
} from "./TaskForm";

interface TaskRow {
  [key: string]: unknown;
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
  constraintType?: string | null;
  constraintDate?: string | null;
  deadline?: string | null;
  wbs?: { id: string; code: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
}
interface TasksBundle { projectId: string; items: TaskRow[]; total: number }
interface WbsFlat { id: string; code: string; name: string; nodeType: string }

export default function TasksPanel({ projectId, showGanttLink }: { projectId: string; showGanttLink?: boolean }) {
  const tasks = useApi<TasksBundle>(`/api/projects/${projectId}/tasks`);
  const wbs = useApi<{ tree: WbsFlat[] }>(`/api/projects/${projectId}/wbs`);
  useRealtimeRefetch(tasks.refetch, ["task:changed", "schedule:changed", "dependency:changed"]);

  // --- Field Dictionary: assignments + bulk values for the visible tasks ---
  const fields = useModuleFieldsHandle("task", (tasks.data?.items || []).map((t) => t.id));
  const cfCols = customFieldColumns<TaskRow>(fields.tableColumns, fields.values);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TaskFormState>(emptyTaskForm);
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [editForm, setEditForm] = useState<TaskFormState>(emptyTaskForm);
  const [saving, setSaving] = useState(false);

  const flatWbs = useMemo(() => {
    const out: WbsFlat[] = [];
    const walk = (nodes: { id: string; code: string; name: string; nodeType: string; children?: unknown }[]) => {
      for (const n of nodes) { out.push(n); if (n.children) walk(n.children as typeof nodes); }
    };
    walk(wbs.data?.tree || []);
    return out;
  }, [wbs.data]);

  const openAdd = () => { setAddForm(emptyTaskForm()); setAddOpen(true); };
  const openEdit = (t: TaskRow) => { setEditTask(t); setEditForm(taskFormFrom(t)); setEditOpen(true); };
  const closeEdit = () => { setEditOpen(false); setEditTask(null); };

  const create = async () => {
    if (addForm.name.trim().length < 1) { toast.error("Task name is required"); return; }
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/tasks`, taskFormPayload(addForm));
      toast.success("Task created — network rescheduled");
      setAddOpen(false);
      setAddForm(emptyTaskForm());
      await tasks.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editTask) return;
    if (editForm.name.trim().length < 1) { toast.error("Task name is required"); return; }
    setSaving(true);
    try {
      await api.patch(`/api/projects/${projectId}/tasks/${editTask.id}`, taskFormPayload(editForm));
      toast.success(`${editTask.code} updated — plan rescheduled`);
      closeEdit();
      await tasks.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
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

  const wbsOptions: TaskWbsOption[] = flatWbs;

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
        description={`${tasks.data?.total ?? 0} tasks · red rows are critical-path activities · double-click a row to edit`}
        actions={(
          <>
            {fields.actions}
            <Button size="sm" className="h-8" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add task</Button>
          </>
        )}
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
                    <th className="px-3 py-2.5 font-medium">Constraint / Deadline</th>
                    <th className="px-3 py-2.5 font-medium text-right">Dur</th>
                    <th className="px-3 py-2.5 font-medium w-36">Progress</th>
                    <th className="px-3 py-2.5 font-medium text-right">Hours (P/A)</th>
                    <th className="px-3 py-2.5 font-medium">Assignee</th>
                    {cfCols.map((c) => <th key={c.key} className="px-3 py-2.5 font-medium">{c.header}</th>)}
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(tasks.data?.items || []).map((t) => {
                    const ctype = t.constraintType || "ASAP";
                    const hasConstraint = ctype !== "ASAP" || !!t.constraintDate;
                    return (
                    <tr key={t.id} onDoubleClick={() => openEdit(t)} title="Double-click to edit" className={`border-b border-slate-100 last:border-0 hover:bg-blue-50/40 ${t.isCritical ? "bg-red-50/40" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{t.code}</td>
                      <td className="px-3 py-2 max-w-[220px]">
                        <button type="button" onClick={() => openEdit(t)} title="Edit task"
                          className="block w-full text-left font-medium text-slate-800 truncate hover:text-blue-700">
                          {t.name}
                        </button>
                        {t.assignee && <p className="text-[11px] text-slate-400">{t.assignee.name}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{t.wbs?.code || "—"}</td>
                      <td className="px-3 py-2" onDoubleClick={(e) => e.stopPropagation()}>
                        <Select value={t.status} onValueChange={(v) => patch(t, { status: v }, `${t.code} → ${v.replace("_", " ").toLowerCase()}`)}>
                          <SelectTrigger className="h-7 w-[130px] text-xs" aria-label={`Status of ${t.code}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{TASK_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {hasConstraint && (
                            <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                              title="Scheduling constraint (Planning Lab)">
                              {ctype}{t.constraintDate ? ` · ${fmtDate(t.constraintDate)}` : ""}
                            </span>
                          )}
                          {t.deadline && (
                            <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700"
                              title="Deadline (Planning Lab)">
                              DL {fmtDate(t.deadline)}
                            </span>
                          )}
                          {!hasConstraint && !t.deadline && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
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
                      {cfCols.map((c) => <td key={c.key} className="px-3 py-2 text-slate-700 align-middle">{c.render?.(t)}</td>)}
                      <td className="px-3 py-2 text-right whitespace-nowrap" onDoubleClick={(e) => e.stopPropagation()}>
                        <RecordFieldsButton moduleKey="task" recordId={t.id} label={t.code} onSaved={fields.refetch} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${t.code}`} onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <ConfirmButton variant="ghost" title={`Delete ${t.code}?`} description="Dependencies referencing this task are removed with it and the network is rescheduled." confirmLabel="Delete" onConfirm={() => remove(t)}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${t.code}`}>
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

      {/* Add task — same fields as Edit */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add task</DialogTitle></DialogHeader>
          <TaskFormFields form={addForm} setForm={setAddForm} wbsOptions={wbsOptions} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit task — same fields as Add */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit task {editTask ? `— ${editTask.code}` : ""}</DialogTitle>
          </DialogHeader>
          <TaskFormFields form={editForm} setForm={setEditForm} wbsOptions={wbsOptions} />
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
