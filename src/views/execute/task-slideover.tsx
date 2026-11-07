"use client";
// PM CONTROL TOWER — Slide-over task panel
// Right-side sheet opened from kanban cards / list rows / rail widgets.
// Quick status moves go through /api/agile (same as drag-and-drop); meta edits
// go through the task detail PATCH. Escape or backdrop click closes it.

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import { PRIORITY, TASK_STATUS, fmtDate, fmtDateTime } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/pmct/kit";
import { Avatar, PRIORITY_CHIP, StatusPill, presentationOf, type KanbanTask } from "./shared/KanbanBoard";
import { AiBreakdown } from "./ai-breakdown";
import { ExternalLink, Loader2 } from "lucide-react";

interface TaskDetailPayload {
  task: {
    id: string;
    projectId: string;
    code: string;
    name: string;
    description: string | null;
    notes: string | null;
    status: string;
    priority: string;
    criticality: string;
    startDate: string | null;
    endDate: string | null;
    durationDays: number;
    progress: number;
    plannedHours: number;
    actualHours: number;
    remainingHours: number;
    plannedCost: number;
    actualCost: number;
    storyPoints: number;
    sprintId: string | null;
    wbsId: string | null;
    constraintType: string;
    constraintDate: string | null;
    deadline: string | null;
    updatedAt: string;
    assignee?: { id: string; name: string; email: string; avatarColor: string; avatarUrl?: string | null } | null;
    wbs?: { id: string; code: string; name: string } | null;
  };
  timesheet: { entryCount: number; totalHours: number; billableHours: number };
  predecessors: { dependencyId: string; depType: string; lagDays: number; task: { code: string; name: string; status: string; progress: number } }[];
  successors: { dependencyId: string; depType: string; lagDays: number; task: { code: string; name: string; status: string; progress: number } }[];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-xs text-slate-700 truncate">{children}</dd>
    </div>
  );
}

export function TaskSlideOver({ projectId, taskId, projectLabel, onClose, onChanged }: {
  projectId: string | null;
  taskId: string | null;
  projectLabel?: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const detail = useApi<TaskDetailPayload>(
    projectId && taskId ? `/api/projects/${projectId}/tasks/${taskId}` : null
  );
  const task = detail.data?.task;

  const patchTask = async (body: Record<string, unknown>, successMsg: string) => {
    if (!projectId || !taskId) return;
    setSaving(true);
    try {
      await api.patch(`/api/projects/${projectId}/tasks/${taskId}`, body);
      await detail.refetch();
      onChanged?.();
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const moveStatus = async (status: string) => {
    if (!taskId || !task || task.status === status) return;
    setSaving(true);
    try {
      await api.patch("/api/agile", { taskId, status });
      await detail.refetch();
      onChanged?.();
      toast.success(`${task.code} → ${presentationOf(status).label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setSaving(false);
    }
  };

  const bundle = detail.data;

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pr-8">
          <div className="flex items-center gap-2 flex-wrap">
            {task && <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{task.code}</span>}
            {task && <StatusPill status={task.status} />}
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
          </div>
          <SheetTitle className="text-base leading-snug">{task ? task.name : "Task details"}</SheetTitle>
          <SheetDescription>
            {projectLabel ? `${projectLabel} · ` : ""}click-through from the board
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {detail.loading && <LoadingBlock label="Loading task…" />}
          {detail.error && <p className="text-xs text-red-600">{detail.error}</p>}

          {task && bundle && (
            <>
              {/* Quick status moves */}
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Status</h4>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_STATUS.map((s) => {
                    const p = presentationOf(s);
                    const active = task.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={saving}
                        onClick={() => moveStatus(s)}
                        className={cn(
                          "h-8 px-3 rounded-lg border text-xs font-medium transition-all disabled:opacity-60",
                          active ? cn(p.pill, "border-2 shadow-sm") : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Meta edits */}
              <section className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-1" htmlFor="sl-priority">Priority</label>
                  <Select value={task.priority} onValueChange={(v) => patchTask({ priority: v }, "Priority updated")}>
                    <SelectTrigger id="sl-priority" className="h-9 text-xs" disabled={saving}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-1" htmlFor="sl-due">Due date</label>
                  <Input
                    id="sl-due"
                    type="date"
                    className="h-9 text-xs"
                    disabled={saving}
                    value={task.endDate ? task.endDate.slice(0, 10) : ""}
                    onChange={(e) => patchTask({ endDate: e.target.value ? e.target.value : null }, "Due date updated")}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-1" htmlFor="sl-start">Start date</label>
                  <Input
                    id="sl-start"
                    type="date"
                    className="h-9 text-xs"
                    disabled={saving}
                    value={task.startDate ? task.startDate.slice(0, 10) : ""}
                    onChange={(e) => patchTask({ startDate: e.target.value ? e.target.value : null }, "Start date updated")}
                  />
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-1">Assignee</span>
                  {task.assignee ? (
                    <span className="flex items-center gap-2 h-9 px-2 rounded-md border border-slate-200 bg-slate-50">
                      <Avatar name={task.assignee.name} color={task.assignee.avatarColor} url={task.assignee.avatarUrl} />
                      <span className="text-xs text-slate-700 truncate">{task.assignee.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center h-9 px-2 rounded-md border border-dashed border-slate-200 text-xs text-slate-400">Unassigned</span>
                  )}
                </div>
              </section>

              {/* Progress */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Progress</h4>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">{Math.round(task.progress)}%</span>
                </div>
                <Slider
                  value={[Math.round(task.progress)]}
                  max={100}
                  step={5}
                  disabled={saving}
                  onValueCommit={(v) => patchTask({ progress: v[0] ?? 0 }, "Progress updated")}
                />
              </section>

              {/* Description */}
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Description</h4>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/60 p-3 min-h-12">
                  {task.description || <span className="text-slate-400">No description yet.</span>}
                </p>
              </section>

              {/* AI breakdown — BYOK sub-task suggestions (server action) */}
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">AI sub-tasks</h4>
                <AiBreakdown task={{ id: task.id, code: task.code, name: task.name, description: task.description }} />
              </section>

              {/* Facts */}
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Details</h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-200 p-3 bg-white">
                  <Field label="Priority"><span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5", PRIORITY_CHIP[task.priority] || "bg-slate-50 text-slate-600 border-slate-200")}>{task.priority}</span></Field>
                  <Field label="Criticality">{task.criticality}</Field>
                  <Field label="Story points">{task.storyPoints || "—"}</Field>
                  <Field label="Duration">{task.durationDays} d</Field>
                  <Field label="Planned hours">{task.plannedHours || "—"}</Field>
                  <Field label="Logged hours">{bundle.timesheet.totalHours} h · {bundle.timesheet.entryCount} entries</Field>
                  <Field label="Planned cost">{task.plannedCost ? `${Math.round(task.plannedCost).toLocaleString()}` : "—"}</Field>
                  <Field label="Actual cost">{task.actualCost ? `${Math.round(task.actualCost).toLocaleString()}` : "—"}</Field>
                  <Field label="WBS node">{task.wbs ? `${task.wbs.code} ${task.wbs.name}` : "—"}</Field>
                  <Field label="Constraint">{task.constraintType}{task.constraintDate ? ` · ${fmtDate(task.constraintDate)}` : ""}</Field>
                  <Field label="Deadline">{task.deadline ? fmtDate(task.deadline) : "—"}</Field>
                  <Field label="Last updated">{fmtDateTime(task.updatedAt)}</Field>
                </dl>
              </section>

              {/* Dependencies */}
              {(bundle.predecessors.length > 0 || bundle.successors.length > 0) && (
                <section>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Dependencies</h4>
                  <div className="space-y-1.5">
                    {bundle.predecessors.map((d) => (
                      <div key={d.dependencyId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                        <span className="text-[10px] font-semibold uppercase text-slate-400 shrink-0">After</span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">{d.task.code}</span>
                        <span className="text-xs text-slate-700 truncate flex-1">{d.task.name}</span>
                        <StatusPill status={d.task.status} className="shrink-0" />
                      </div>
                    ))}
                    {bundle.successors.map((d) => (
                      <div key={d.dependencyId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                        <span className="text-[10px] font-semibold uppercase text-slate-400 shrink-0">Before</span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">{d.task.code}</span>
                        <span className="text-xs text-slate-700 truncate flex-1">{d.task.name}</span>
                        <StatusPill status={d.task.status} className="shrink-0" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Footer action */}
              <section className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => { onClose(); window.location.hash = `/tasks?focus=${task.id}`; }}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in Tasks module
                </Button>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
