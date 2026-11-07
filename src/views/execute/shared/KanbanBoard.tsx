"use client";
// PM CONTROL TOWER — Shared Kanban board (Command Center v3.0)
// Status-column kanban with dnd-kit drag & drop; used by Boards and Agile views.
// Tinted status columns with count badges and dense cards (priority dot ·
// label chip · due date · avatar · kebab quick-actions). Presentation labels
// map onto the real TASK_STATUS values — drags still PATCH the real statuses.

import { useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { TASK_STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, GripVertical, Loader2, MoreHorizontal } from "lucide-react";

export interface KanbanTask {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  storyPoints: number;
  sprintId: string | null;
  epicId: string | null;
  endDate: string | null;
  projectId: string;
  updatedAt?: string | null;
  project?: { id: string; code: string; name: string } | null;
  assignee?: { id: string; name: string; avatarColor: string; avatarUrl?: string | null } | null;
}

// ---- Presentation tokens (labels + tints over real statuses) ----
export interface StatusPresentation {
  label: string; header: string; body: string; border: string;
  pill: string; dot: string; ring: string;
}

export const STATUS_PRESENTATION: Record<string, StatusPresentation> = {
  NOT_STARTED: { label: "To Do", header: "bg-blue-100/70 text-blue-900", body: "bg-blue-50/50", border: "border-blue-200", pill: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", ring: "ring-blue-400" },
  IN_PROGRESS: { label: "In Progress", header: "bg-amber-100/70 text-amber-900", body: "bg-amber-50/50", border: "border-amber-200", pill: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", ring: "ring-amber-400" },
  COMPLETED: { label: "Done", header: "bg-emerald-100/70 text-emerald-900", body: "bg-emerald-50/50", border: "border-emerald-200", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", ring: "ring-emerald-400" },
  BLOCKED: { label: "Blocked", header: "bg-red-100/70 text-red-900", body: "bg-red-50/50", border: "border-red-200", pill: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", ring: "ring-red-400" },
  ON_HOLD: { label: "On Hold", header: "bg-violet-100/70 text-violet-900", body: "bg-violet-50/50", border: "border-violet-200", pill: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", ring: "ring-violet-400" },
  CANCELLED: { label: "Cancelled", header: "bg-slate-100 text-slate-600", body: "bg-slate-50/70", border: "border-slate-200", pill: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400", ring: "ring-slate-400" },
};

const FALLBACK_PRESENTATION: StatusPresentation = {
  label: "", header: "bg-slate-100 text-slate-600", body: "bg-slate-50/70", border: "border-slate-200",
  pill: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400", ring: "ring-slate-400",
};

export function presentationOf(status: string): StatusPresentation {
  const known = STATUS_PRESENTATION[status];
  if (known) return known;
  const label = status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { ...FALLBACK_PRESENTATION, label };
}

/** Priority dot / text / chip tones (CRITICAL..LOW). */
export const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-600", HIGH: "bg-orange-500", MEDIUM: "bg-amber-400", LOW: "bg-sky-400",
};
export const PRIORITY_TEXT: Record<string, string> = {
  CRITICAL: "text-red-600", HIGH: "text-orange-600", MEDIUM: "text-amber-600", LOW: "text-sky-600",
};
export const PRIORITY_CHIP: Record<string, string> = {
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-sky-50 text-sky-700 border-sky-200",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact "Oct 24" label from a raw ISO date string (no timezone math). */
export function shortDate(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return m > 0 && d > 0 ? `${MONTHS[m - 1] ?? iso.slice(5, 7)} ${d}` : iso;
}

/** Status pill using the presentation label + tint. */
export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const p = presentationOf(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", p.pill, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
      {p.label}
    </span>
  );
}

import { Avatar } from "@/components/pmct/avatar";

/** Avatar for a person — delegates to the shared Avatar (bundled image + initials fallback). */
export { Avatar };

// ---- Card ----
function TaskCard({
  task, showProject, onOpen, onMove, readOnly,
}: {
  task: KanbanTask;
  showProject: boolean;
  onOpen?: (task: KanbanTask) => void;
  onMove?: (task: KanbanTask, status: string) => void;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const today = new Date().toISOString().slice(0, 10);
  const due = task.endDate ? task.endDate.slice(0, 10) : null;
  const open = task.status !== "COMPLETED" && task.status !== "CANCELLED";
  const overdue = Boolean(due && open && due < today);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.target !== e.currentTarget) return;
        onOpen?.(task);
      }}
      className={cn(
        "group rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm cursor-grab active:cursor-grabbing select-none transition-all",
        isDragging ? "opacity-40 ring-2 ring-blue-400" : "hover:shadow-md hover:border-blue-300"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[task.priority] || "bg-slate-400")} />
          <span className={PRIORITY_TEXT[task.priority] || "text-slate-500"}>{task.priority}</span>
        </span>
        <div className="flex items-center gap-1 -mt-1 -mr-1">
          <GripVertical className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          {onOpen && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Task actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-6 w-6 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onOpen(task)}>Open details</DropdownMenuItem>
                {!readOnly && onMove && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-400">Move to</DropdownMenuLabel>
                    {TASK_STATUS.filter((s) => s !== task.status).map((s) => {
                      const p = presentationOf(s);
                      return (
                        <DropdownMenuItem key={s} onClick={() => onMove(task, s)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full mr-2", p.dot)} />
                          {p.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-xs font-medium text-slate-800 leading-snug line-clamp-2">{task.name}</p>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{task.code}</span>
        {showProject && task.project && (
          <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 truncate max-w-24">{task.project.code}</span>
        )}
        {task.storyPoints > 0 && (
          <span className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums" title="Story points">{task.storyPoints} pts</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1 text-[10px] tabular-nums", overdue ? "text-red-600 font-semibold" : "text-slate-400")}>
          <CalendarDays className="h-3 w-3" />
          {due ? shortDate(due) : "No date"}
        </span>
        <Avatar name={task.assignee?.name} color={task.assignee?.avatarColor} url={task.assignee?.avatarUrl} />
      </div>
    </div>
  );
}

// ---- Column ----
function Column({
  status, tasks, showProject, onOpen, onMove, readOnly,
}: {
  status: string; tasks: KanbanTask[]; showProject: boolean;
  onOpen?: (task: KanbanTask) => void;
  onMove?: (task: KanbanTask, status: string) => void;
  readOnly?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const p = presentationOf(status);
  return (
    <div className={cn("flex flex-col rounded-xl border overflow-hidden min-w-[264px] w-[264px] shrink-0 max-h-full", p.border, p.body)}>
      <div className={cn("flex items-center justify-between px-3 py-2 border-b", p.header)}>
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={cn("h-2 w-2 rounded-full", p.dot)} />
          {p.label}
        </span>
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-white/85 border border-white text-[10px] font-bold text-slate-600 flex items-center justify-center tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("flex-1 overflow-y-auto p-2 space-y-2 transition-colors", isOver && cn("ring-2 ring-inset bg-white/60", p.ring))}
      >
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} showProject={showProject} onOpen={onOpen} onMove={onMove} readOnly={readOnly} />
        ))}
        {tasks.length === 0 && (
          <div className="h-16 rounded-lg border border-dashed border-slate-300/70 flex items-center justify-center text-[11px] text-slate-400">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Board ----
export function KanbanBoard({
  tasks, onMoved, showProject = true, readOnly = false, onCardClick, order,
}: {
  tasks: KanbanTask[];
  onMoved?: (taskId: string, newStatus: string) => void;
  showProject?: boolean;
  readOnly?: boolean;
  /** Opens the slide-over task panel (also enables each card's kebab menu). */
  onCardClick?: (task: KanbanTask) => void;
  /** Column order override (Boards uses its own order; Agile keeps TASK_STATUS). */
  order?: string[];
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastDragAt = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dragTask = tasks.find((t) => t.id === dragId) || null;
  const columns = order && order.length ? order : [...TASK_STATUS];

  const moveTask = async (task: KanbanTask, newStatus: string) => {
    if (readOnly || task.status === newStatus) return;
    // Optimistic move (single shared task object; roll back on failure)
    const previous = task.status;
    task.status = newStatus;
    setSaving(true);
    try {
      await api.patch("/api/agile", { taskId: task.id, status: newStatus });
      onMoved?.(task.id, newStatus);
      toast.success(`${task.code} → ${presentationOf(newStatus).label}`);
    } catch (err) {
      task.status = previous;
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setSaving(false);
    }
  };

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    lastDragAt.current = Date.now();
    setDragId(null);
    const { active, over } = e;
    if (!over || readOnly) return;
    const overId = String(over.id);
    if (!overId.startsWith("col-")) return;
    const newStatus = overId.slice(4);
    const task = tasks.find((t) => t.id === String(active.id));
    if (!task || task.status === newStatus) return;
    void moveTask(task, newStatus);
  };

  // The click that ends a drag must not also open the slide-over.
  const openTask = (task: KanbanTask) => {
    if (Date.now() - lastDragAt.current < 350) return;
    onCardClick?.(task);
  };

  return (
    <div className="relative">
      {saving && <Loader2 className="h-4 w-4 animate-spin text-blue-600 absolute top-0 right-0 z-10" />}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3 items-start max-h-[calc(100vh-340px)]">
          {columns.map((s) => (
            <Column key={s} status={s} tasks={tasks.filter((t) => (t.status || "NOT_STARTED") === s)} showProject={showProject} onOpen={onCardClick ? openTask : undefined} onMove={moveTask} readOnly={readOnly} />
          ))}
        </div>
        <DragOverlay>
          {dragTask ? (
            <div className="w-[260px] rounded-lg border border-blue-300 bg-white p-2.5 shadow-xl opacity-95 rotate-1">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[dragTask.priority] || "bg-slate-400")} />
                <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">{dragTask.code}</span>
                <span className="text-xs font-medium text-slate-800 truncate">{dragTask.name}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
