"use client";
// PM CONTROL TOWER — Schedule task detail dialog (enterprise CPM inspector)
// One dialog, three modes: VIEW (rich detail + linked items) → EDIT (TaskFormFields)
// → LINK (create a predecessor/successor dependency). Linked items are openable
// (click a task → its own detail) and unlinkable (confirm → DELETE + reschedule).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip, ProgressBar, ConfirmButton, cn } from "@/components/pmct/kit";
import {
  Pencil, Plus, X, Link2, Route, ExternalLink, CalendarClock, Timer, Gauge, Flag,
  AlertTriangle, Activity, ArrowRight, Users, GitBranch, Network, RefreshCw,
} from "lucide-react";
import { DEP_TYPES, fmtDate, num } from "@/lib/constants";
import { TaskFormFields, taskFormFrom, taskFormPayload, type TaskFormState, type TaskWbsOption } from "./TaskForm";
import { floatTone, shortDate, statusMeta, type ScheduleDep, type ScheduleTask } from "./schedule-types";

// ---- colored metric tile ----
function Tile({ icon, label, value, tone, sub }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; tone?: string; sub?: string;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", tone || "border-slate-200 bg-white")}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{icon}{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

// ---- linked-item card (predecessor/successor row) ----
function LinkCard({ dep, direction, tasksById, onOpen, onUnlink }: {
  dep: ScheduleDep;
  direction: "pred" | "succ";
  tasksById: Map<string, ScheduleTask>;
  onOpen: (id: string) => void;
  onUnlink: (dep: ScheduleDep) => void;
}) {
  const other = direction === "pred" ? dep.predecessor : dep.successor;
  const otherTask = tasksById.get(other.id);
  const crit = otherTask?.isCritical;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors", crit ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white hover:border-blue-300")}>
      <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold", crit ? "border-red-300 bg-red-100 text-red-700" : "border-slate-300 bg-slate-100 text-slate-500")}>
        {direction === "pred" ? "P" : "S"}
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(other.id)} title="Open this linked task">
        <p className="truncate text-xs font-semibold text-slate-800 hover:text-blue-700">{other.code} · {other.name}</p>
        <p className="text-[10px] text-slate-400">{crit ? "critical path" : otherTask ? `float ${Math.round(otherTask.totalFloat)}d` : ""}</p>
      </button>
      <span className="inline-flex shrink-0 items-center rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700" title="Link type">
        {dep.depType}{dep.lagDays ? `+${dep.lagDays}d` : ""}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Open task" onClick={() => onOpen(other.id)}>
          <ExternalLink className="h-3 w-3 text-slate-400" />
        </Button>
        <ConfirmButton
          title={`Remove link ${dep.predecessor.code} → ${dep.successor.code}?`}
          description="The dependency is deleted and the network is rescheduled immediately."
          confirmLabel="Remove link" variant="destructive"
          onConfirm={() => onUnlink(dep)}
        >
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Unlink"><X className="h-3 w-3 text-red-400 hover:text-red-600" /></Button>
        </ConfirmButton>
      </div>
    </div>
  );
}

export default function ScheduleTaskDialog({
  projectId, taskId, tasks, dependencies, onClose, onChanged, onOpenTask, onTrace, startInEdit,
}: {
  projectId: string;
  taskId: string;
  tasks: ScheduleTask[];
  dependencies: ScheduleDep[];
  onClose: () => void;
  onChanged: () => void;      // refetch the schedule bundle (edit/link/unlink side-effects)
  onOpenTask: (id: string) => void; // open a linked item's detail
  onTrace?: (id: string) => void;   // highlight the driving predecessor chain in the chart
  startInEdit?: boolean;      // open directly in Edit mode (double-click on a bar/row/node)
}) {
  const [mode, setMode] = useState<"view" | "edit" | "link">(startInEdit ? "edit" : "view");
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [saving, setSaving] = useState(false);
  // link form state
  const [linkMode, setLinkMode] = useState<"pred" | "succ">("pred");
  const [linkTaskId, setLinkTaskId] = useState("");
  const [linkType, setLinkType] = useState<string>("FS");
  const [linkLag, setLinkLag] = useState("");

  const task = tasks.find((t) => t.id === taskId) ?? null;

  // auto-close if the task vanished (deleted elsewhere)
  useEffect(() => {
    if (!task) onClose();
  }, [task]);

  // reset the sub-modes whenever a different task is opened
  useEffect(() => { setMode("view"); }, [taskId]);

  // double-click entry: land directly in Edit mode with the form prefilled (once per open)
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    if (!primed && startInEdit && task) { setMode("edit"); setForm(taskFormFrom(task)); setPrimed(true); }
  }, [primed, startInEdit, task]);

  // lazy WBS options only when editing
  const wbs = useApi<{ tree: { id: string; code: string; name: string; nodeType: string; children?: unknown }[] }>(
    mode === "edit" ? `/api/projects/${projectId}/wbs` : null,
  );
  const flatWbs = useMemo<TaskWbsOption[]>(() => {
    const out: TaskWbsOption[] = [];
    const walk = (nodes: { id: string; code: string; name: string; nodeType: string; children?: unknown }[]) => {
      for (const n of nodes) { out.push(n); if (n.children) walk(n.children as typeof nodes); }
    };
    walk(wbs.data?.tree ?? []);
    return out;
  }, [wbs.data]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const preds = dependencies.filter((d) => d.successorId === taskId);
  const succs = dependencies.filter((d) => d.predecessorId === taskId);
  const subtasks = tasks.filter((t) => t.parentId === taskId);
  const parent = task?.parentId ? tasksById.get(task.parentId) : null;

  // candidate tasks for the link picker (exclude self + existing direct pairs)
  // NOTE: memo must sit above the early return — Rules of Hooks.
  const linkCandidates = useMemo(() => {
    const existing = new Set(
      dependencies
        .filter((d) => (linkMode === "pred" ? d.successorId === taskId : d.predecessorId === taskId))
        .map((d) => (linkMode === "pred" ? d.predecessorId : d.successorId)),
    );
    return tasks.filter((t) => t.id !== taskId && !existing.has(t.id));
  }, [tasks, dependencies, linkMode, taskId]);

  if (!task) return null;

  const ft = floatTone(task.totalFloat, task.isCritical);
  const sm = statusMeta(task.status);
  const hasConstraint = (task.constraintType || "ASAP") !== "ASAP" || !!task.constraintDate;
  const lateFinish = task.earliestFinish && task.deadline && new Date(task.earliestFinish) > new Date(task.deadline);

  // ---- actions ----
  const startEdit = () => { setForm(taskFormFrom(task)); setMode("edit"); };
  const saveEdit = async () => {
    if (!form) return;
    if (form.name.trim().length < 1) { toast.error("Task name is required"); return; }
    setSaving(true);
    try {
      await api.patch(`/api/projects/${projectId}/tasks/${task.id}`, taskFormPayload(form));
      toast.success(`${task.code} updated — network rescheduled`);
      setForm(null);
      setMode("view");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally { setSaving(false); }
  };

  const createLink = async () => {
    if (!linkTaskId) { toast.error(linkMode === "pred" ? "Pick a predecessor task" : "Pick a successor task"); return; }
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/dependencies`, {
        predecessorId: linkMode === "pred" ? linkTaskId : task.id,
        successorId: linkMode === "pred" ? task.id : linkTaskId,
        depType: linkType,
        lagDays: linkLag === "" ? 0 : Number(linkLag),
      });
      toast.success("Items linked — network rescheduled");
      setMode("view");
      setLinkTaskId(""); setLinkLag(""); setLinkType("FS");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally { setSaving(false); }
  };

  const unlink = async (dep: ScheduleDep) => {
    try {
      await api.del(`/api/projects/${projectId}/dependencies/${dep.id}`);
      toast.success(`${dep.predecessor.code} → ${dep.successor.code} unlinked`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unlink failed");
    }
  };

  // candidate tasks for the link picker — see memo above the early return.

  const modeTitle = mode === "edit" ? `Edit — ${task.code}` : mode === "link" ? `Link items — ${task.code}` : undefined;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        {mode !== "view" && modeTitle && (
          <DialogHeader><DialogTitle className="flex items-center gap-2">{modeTitle}</DialogTitle></DialogHeader>
        )}

        {mode === "edit" && form && (
          <>
            <TaskFormFields form={form} setForm={setForm} wbsOptions={flatWbs} />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setForm(null); setMode("view"); }}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </>
        )}

        {mode === "link" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Link direction</Label>
              <Select value={linkMode} onValueChange={(v) => { setLinkMode(v as "pred" | "succ"); setLinkTaskId(""); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pred">‹ {task.code} depends on another task (predecessor)</SelectItem>
                  <SelectItem value="succ">Another task depends on {task.code} (successor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs">Task *</Label>
                <Select value={linkTaskId} onValueChange={setLinkTaskId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a task…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {linkCandidates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.code} · {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link type</Label>
                <Select value={linkType} onValueChange={setLinkType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEP_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lag (days)</Label>
                <Input className="h-9" type="number" value={linkLag} placeholder="0" onChange={(e) => setLinkLag(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">FS = finish→start · SS = start→start · FF = finish→finish · SF = start→finish. Cycles and duplicates are rejected; the CPM network recalculates on save.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMode("view")}>Cancel</Button>
              <Button onClick={createLink} disabled={saving}><Link2 className="h-3.5 w-3.5 mr-1.5" />{saving ? "Linking…" : "Create link"}</Button>
            </DialogFooter>
          </div>
        )}

        {mode === "view" && (
          <>
            {/* ---------- header ---------- */}
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-white">{task.code}</span>
                <span>{task.name}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-1.5 -mt-2">
              <StatusChip status={task.status} />
              <StatusChip status={task.priority} />
              <StatusChip status={task.criticality} className="hidden sm:inline-flex" />
              {task.isSummary && <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"><Network className="h-3 w-3" />summary</span>}
              {task.isCritical ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <AlertTriangle className="h-3 w-3" />CRITICAL PATH
                </span>
              ) : (
                <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold", ft.bg, ft.fg, ft.border)}>
                  {Math.round(task.totalFloat)}d total float
                </span>
              )}
            </div>

            {/* ---------- CPM metric grid (colorful) ---------- */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile icon={<CalendarClock className="h-3 w-3" />} label="Early start" value={shortDate(task.earliestStart)} tone="border-sky-200 bg-sky-50/60" />
              <Tile icon={<CalendarClock className="h-3 w-3" />} label="Early finish" value={shortDate(task.earliestFinish)} tone="border-sky-200 bg-sky-50/60" />
              <Tile icon={<Flag className="h-3 w-3" />} label="Late start" value={shortDate(task.latestStart)} tone="border-violet-200 bg-violet-50/60" />
              <Tile icon={<Flag className="h-3 w-3" />} label="Late finish" value={shortDate(task.latestFinish)} tone="border-violet-200 bg-violet-50/60" />
              <Tile icon={<Gauge className="h-3 w-3" />} label="Total float" value={`${Math.round(task.totalFloat)}d`} sub={task.isCritical ? "drives the finish date" : "slack before impact"} tone={task.isCritical ? "border-red-300 bg-red-50" : task.totalFloat <= 5 ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60"} />
              <Tile icon={<Activity className="h-3 w-3" />} label="Free float" value={`${Math.round(task.freeFloat)}d`} sub="before successors move" />
              <Tile icon={<Timer className="h-3 w-3" />} label="Duration" value={`${num(task.durationDays, 0)}d`} sub={`${fmtDate(task.startDate)} → ${fmtDate(task.endDate)}`} />
              <Tile icon={<Gauge className="h-3 w-3" />} label="Progress" value={`${Math.round(task.progress)}%`} tone={task.progress >= 100 ? "border-emerald-200 bg-emerald-50/60" : undefined}>
              </Tile>
            </div>
            <ProgressBar value={task.progress} className="-mt-1" />

            {/* ---------- schedule controls + effort ---------- */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><CalendarClock className="h-3.5 w-3.5" />Schedule controls</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {hasConstraint && (
                    <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                      {task.constraintType}{task.constraintDate ? ` · ${fmtDate(task.constraintDate)}` : ""}
                    </span>
                  )}
                  {task.deadline && (
                    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold", lateFinish ? "border-red-300 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-700")} title={lateFinish ? "Early finish is AFTER the deadline" : "Deadline"}>
                      DL {fmtDate(task.deadline)}{lateFinish ? " ⚠" : ""}
                    </span>
                  )}
                  {!hasConstraint && !task.deadline && <span className="text-xs text-slate-400">ASAP · no deadline</span>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-slate-500">Planned dates</span><span className="text-right tabular-nums text-slate-700">{fmtDate(task.startDate)} → {fmtDate(task.endDate)}</span>
                  <span className="text-slate-500">Criticality</span><span className="text-right"><StatusChip status={task.criticality} /></span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Users className="h-3.5 w-3.5" />Effort &amp; cost</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-slate-500">Hours P / A / R</span>
                  <span className="text-right tabular-nums text-slate-700">{num(task.plannedHours, 0)} / {num(task.actualHours, 0)} / {num(task.remainingHours, 0)}</span>
                  <span className="text-slate-500">Cost P / A</span>
                  <span className={cn("text-right tabular-nums", task.actualCost > task.plannedCost && task.plannedCost > 0 ? "text-red-600 font-semibold" : "text-slate-700")}>{num(task.plannedCost, 0)} / {num(task.actualCost, 0)}</span>
                  <span className="text-slate-500">Assignee</span>
                  <span className="text-right text-slate-700">{task.assignee?.name ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* ---------- linked items ---------- */}
            <div className="mt-1 space-y-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Link2 className="h-3.5 w-3.5" />Linked items ({preds.length + succs.length + (task.wbs ? 1 : 0) + (parent ? 1 : 0) + subtasks.length})</p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Predecessors ({preds.length})</p>
                  {!preds.length && <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400">No predecessors — starts as soon as possible</p>}
                  {preds.map((d) => <LinkCard key={d.id} dep={d} direction="pred" tasksById={tasksById} onOpen={onOpenTask} onUnlink={unlink} />)}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Successors ({succs.length})</p>
                  {!succs.length && <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-[11px] text-slate-400">No successors — nothing waits on this task</p>}
                  {succs.map((d) => <LinkCard key={d.id} dep={d} direction="succ" tasksById={tasksById} onOpen={onOpenTask} onUnlink={unlink} />)}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {task.wbs && (
                  <a href="#/wbs" className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:border-teal-300">
                    <GitBranch className="h-3.5 w-3.5" />WBS {task.wbs.code} — {task.wbs.name}
                  </a>
                )}
                {parent && (
                  <button onClick={() => onOpenTask(parent.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-800 hover:border-indigo-300">
                    <ArrowRight className="h-3.5 w-3.5 -rotate-90" />Parent {parent.code}
                  </button>
                )}
                {subtasks.map((s) => (
                  <button key={s.id} onClick={() => onOpenTask(s.id)} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium", s.isCritical ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300")}>
                    <Network className="h-3.5 w-3.5" />{s.code} {s.name}
                  </button>
                ))}
                {task.assignee && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800">
                    <Users className="h-3.5 w-3.5" />{task.assignee.name}
                  </span>
                )}
              </div>
            </div>

            {/* ---------- description / notes ---------- */}
            {(task.description || task.notes) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                {task.description && (<><p className="text-[11px] font-semibold uppercase text-slate-400">Description</p><p className="mb-1.5 text-xs text-slate-600 whitespace-pre-wrap">{task.description}</p></>)}
                {task.notes && (<><p className="text-[11px] font-semibold uppercase text-slate-400">Notes</p><p className="text-xs text-slate-600 whitespace-pre-wrap">{task.notes}</p></>)}
              </div>
            )}

            {/* ---------- footer actions ---------- */}
            <DialogFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit task</Button>
                <Button variant="outline" size="sm" onClick={() => setMode("link")}><Plus className="h-3.5 w-3.5 mr-1.5" />Link item</Button>
                {onTrace && (
                  <Button variant="outline" size="sm" onClick={() => { onTrace(task.id); onClose(); }}>
                    <Route className="h-3.5 w-3.5 mr-1.5" />Trace path
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { onChanged(); setMode("view"); }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
