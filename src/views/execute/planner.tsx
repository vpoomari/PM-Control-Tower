"use client";
// PM CONTROL TOWER — Focus planner: week strip of personal blocks (tasks, meetings, focus time).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { addDays, num, startOfWeek } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Input, cn,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectSelect, TaskSelect, useProjectOptions } from "@/views/execute/shared/pickers";
import {
  ChevronLeft, ChevronRight, Plus, ListTodo, Users, Calendar, Target, Coffee, Play, CheckCircle2, Trash2,
} from "lucide-react";

interface PlannerEntry {
  id: string; title: string; entryType: string; date: string;
  startTime: string | null; endTime: string | null; durationMins: number;
  priority: string; status: string; estimatedHours: number; notes: string | null;
  taskId: string | null; projectId: string | null;
  task: { id: string; code: string; name: string } | null;
  project: { id: string; code: string; name: string } | null;
}
interface PlannerData { entries: PlannerEntry[]; range: { from: string; to: string }; stats: { total: number; plannedHours: number; byStatus: Record<string, number> } }

const TYPE_ICONS: Record<string, typeof Target> = {
  TASK: ListTodo, MEETING: Users, CALENDAR: Calendar, FOCUS: Target, BREAK: Coffee,
};
const ENTRY_TYPES = ["FOCUS", "TASK", "MEETING", "CALENDAR", "BREAK"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function dayLabel(d: Date, idx: number): string {
  return new Date(addDays(d, idx)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
function dayNum(d: Date, idx: number): string {
  return addDays(d, idx).toISOString().slice(0, 10);
}

export default function PlannerView() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const from = weekStart.toISOString().slice(0, 10);
  const to = addDays(weekStart, 6).toISOString().slice(0, 10);

  const planner = useApi<PlannerData>(`/api/planner?from=${from}&to=${to}`);
  useRealtimeRefetch(planner.refetch, ["planner:changed", "task:changed"]);

  const { options: projectOptions } = useProjectOptions();

  const [planOpen, setPlanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", date: dayNum(weekStart, 0), startTime: "09:00", endTime: "11:00",
    entryType: "FOCUS", projectId: "", taskId: "", estimatedHours: "2", priority: "MEDIUM", notes: "",
  });

  const byDay = useMemo(() => {
    const map: Record<string, PlannerEntry[]> = {};
    for (let i = 0; i < 7; i += 1) map[dayNum(weekStart, i)] = [];
    (planner.data?.entries ?? []).forEach((e) => {
      const key = e.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99")));
    return map;
  }, [planner.data, weekStart]);

  const transition = async (entry: PlannerEntry, next: "IN_PROGRESS" | "DONE") => {
    try {
      await api.patch(`/api/planner/${entry.id}`, { status: next });
      toast.success(next === "DONE" ? "Block completed" : "Block started");
      await planner.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update block");
    }
  };

  const removeBlock = async (entry: PlannerEntry) => {
    try {
      await api.del(`/api/planner/${entry.id}`);
      toast.success("Block removed");
      await planner.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove block");
    }
  };

  const planFocus = async () => {
    if (form.title.trim().length < 2) { toast.error("Give the block a title"); return; }
    if (!form.date) { toast.error("Pick a date"); return; }
    setSaving(true);
    try {
      let durationMins = 60;
      if (form.startTime && form.endTime) {
        const [sh, sm] = form.startTime.split(":").map(Number);
        const [eh, em] = form.endTime.split(":").map(Number);
        const mins = eh * 60 + em - (sh * 60 + sm);
        if (mins <= 0) { toast.error("End time must be after start time"); setSaving(false); return; }
        durationMins = mins;
      }
      await api.post("/api/planner", {
        title: form.title.trim(),
        entryType: form.entryType,
        date: form.date,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        durationMins,
        priority: form.priority,
        projectId: form.projectId || null,
        taskId: form.taskId || null,
        estimatedHours: Number(form.estimatedHours) || 1,
        notes: form.notes || null,
      });
      toast.success("Focus block planned");
      setPlanOpen(false);
      setForm((p) => ({ ...p, title: "", notes: "", taskId: "" }));
      await planner.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not plan block");
    } finally {
      setSaving(false);
    }
  };

  if (planner.loading && !planner.data) return <LoadingBlock label="Loading your week…" />;
  if (planner.error && !planner.data) return <ErrorBlock message={planner.error} onRetry={planner.refetch} />;

  const weekTotal = num(planner.data?.stats.plannedHours ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Focus Planner"
        subtitle="Structure your week — protect focus time and link blocks to real project work."
        breadcrumb={["Home", "Execute", "Focus Planner"]}
        actions={
          <>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-1 shadow-sm mr-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-40 text-center text-sm font-medium text-slate-700 tabular-nums">{from} → {to}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
            </div>
            <Button size="sm" onClick={() => { setForm((p) => ({ ...p, date: new Date().toISOString().slice(0, 10) })); setPlanOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />Plan focus time
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{planner.data?.stats.total ?? 0} blocks</span>
        <span>·</span>
        <span>{weekTotal}h planned this week</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const iso = dayNum(weekStart, i);
          const entries = byDay[iso] ?? [];
          const total = entries.reduce((s, e) => s + e.estimatedHours, 0);
          const isToday = iso === new Date().toISOString().slice(0, 10);
          return (
            <div key={iso} className={cn("rounded-lg border bg-white shadow-sm flex flex-col", isToday ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200")}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <div>
                  <p className={cn("text-xs font-semibold", isToday ? "text-blue-700" : "text-slate-700")}>{dayLabel(weekStart, i)}{isToday && " · today"}</p>
                  <p className="text-[10px] text-slate-400 tabular-nums">{iso.slice(5)}</p>
                </div>
                <span className={cn("text-[10px] tabular-nums px-1.5 py-0.5 rounded-full", total > 8 ? "bg-red-50 text-red-600 font-semibold" : total > 0 ? "bg-slate-100 text-slate-500" : "text-slate-300")}>{num(total)}h</span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {entries.length === 0 ? (
                  <p className="text-[11px] text-slate-300 text-center py-3">Free</p>
                ) : entries.map((e) => {
                  const Icon = TYPE_ICONS[e.entryType] ?? Target;
                  return (
                    <div key={e.id} className={cn("rounded-md border p-2 space-y-1.5",
                      e.status === "DONE" ? "border-slate-100 bg-slate-50 opacity-70" : e.entryType === "FOCUS" ? "border-blue-200 bg-blue-50/50" : "border-slate-200")}>
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px] tabular-nums text-slate-500 font-medium">{e.startTime || "—"}{e.endTime ? `–${e.endTime}` : ""}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-slate-400">{num(e.estimatedHours)}h</span>
                      </div>
                      <p className={cn("text-xs font-medium leading-snug", e.status === "DONE" ? "text-slate-400 line-through" : "text-slate-800")}>{e.title}</p>
                      <div className="flex flex-wrap items-center gap-1">
                        {e.project && <span className="text-[10px] text-slate-500 font-medium">{e.project.code}</span>}
                        {e.task && <span className="text-[10px] text-slate-400 truncate max-w-24">{e.task.code}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusChip status={e.status} />
                        <StatusChip status={e.priority} />
                      </div>
                      {e.status !== "DONE" && (
                        <div className="flex items-center gap-1 pt-0.5">
                          {e.status === "PLANNED" && (
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-blue-600" onClick={() => void transition(e, "IN_PROGRESS")}>
                              <Play className="h-3 w-3 mr-0.5" />Start
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-emerald-600" onClick={() => void transition(e, "DONE")}>
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />Complete
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-slate-300 hover:text-red-500 ml-auto" aria-label="Delete block" onClick={() => void removeBlock(e)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {planner.data && planner.data.entries.length === 0 && (
        <SectionCard>
          <EmptyState
            title="Your week is unstructured"
            description="Plan focus blocks and link them to project tasks so time lands where it matters."
            action={<Button size="sm" onClick={() => setPlanOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Plan focus time</Button>}
          />
        </SectionCard>
      )}

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plan focus time</DialogTitle>
            <DialogDescription>Blocks reference real projects and tasks — the planner validates every link.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="p-title">Title *</Label>
              <Input id="p-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Deep work — settlement engine" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-date">Date *</Label>
              <Input id="p-date" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.entryType} onValueChange={(v) => setForm((p) => ({ ...p, entryType: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{ENTRY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-start">Start</Label>
              <Input id="p-start" type="time" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-end">End</Label>
              <Input id="p-end" type="time" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Link project (optional)</Label>
              <ProjectSelect value={form.projectId} onChange={(v) => setForm((p) => ({ ...p, projectId: v, taskId: "" }))} options={projectOptions} allowEmpty />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Link task (optional, filtered by project)</Label>
              <TaskSelect projectId={form.projectId} value={form.taskId} onChange={(v) => setForm((p) => ({ ...p, taskId: v }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-hours">Estimated hours</Label>
              <Input id="p-hours" type="number" min={0} max={24} step={0.5} value={form.estimatedHours} onChange={(e) => setForm((p) => ({ ...p, estimatedHours: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="p-notes">Notes</Label>
              <Textarea id="p-notes" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Context for this block" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void planFocus()}>{saving ? "Planning…" : "Plan block"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
