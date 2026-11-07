"use client";
// PM CONTROL TOWER — List View
// Dense task table (the kanban's sibling under the List/Kanban toggle): row
// checkboxes with bulk status change, priority dot, status pill, assignee,
// due date, progress — click a row to open the slide-over panel.

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/pmct/kit";
import {
  Avatar, PRIORITY_DOT, PRIORITY_TEXT, StatusPill, type KanbanTask,
} from "./shared/KanbanBoard";
import { CheckCheck, ChevronRight, X } from "lucide-react";

export function TaskListView({ tasks, onOpen, onMoved, showProject = true }: {
  tasks: KanbanTask[];
  onOpen: (task: KanbanTask) => void;
  onMoved?: () => void;
  showProject?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.id)));

  const bulkComplete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => api.patch("/api/agile", { taskId: id, status: "COMPLETED" })));
      toast.success(`${ids.length} task${ids.length > 1 ? "s" : ""} marked done`);
      setSelected(new Set());
      onMoved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0">
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-semibold text-blue-800 tabular-nums">{selected.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={bulkComplete} disabled={busy}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark done
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 ml-auto" onClick={() => setSelected(new Set())}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="w-10 px-3 py-2.5">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all tasks" />
                </th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2 py-2.5">Priority</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2 py-2.5">Task</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2 py-2.5">Status</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2 py-2.5">Assignee</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2 py-2.5">Due</th>
                <th className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 px-2 py-2.5 w-44">Progress</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const due = t.endDate ? t.endDate.slice(0, 10) : null;
                const overdue = Boolean(due && due < today && t.status !== "COMPLETED" && t.status !== "CANCELLED");
                return (
                  <tr
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Select ${t.code}`} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[t.priority] || "bg-slate-400")} />
                        <span className={PRIORITY_TEXT[t.priority] || "text-slate-500"}>{t.priority}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 min-w-[240px] max-w-[420px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 shrink-0">{t.code}</span>
                        <span className="text-xs font-medium text-slate-800 truncate">{t.name}</span>
                      </div>
                      {showProject && t.project && (
                        <span className="mt-0.5 inline-block text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">{t.project.code}</span>
                      )}
                    </td>
                    <td className="px-2 py-2"><StatusPill status={t.status} /></td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {t.assignee ? (
                        <span className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Avatar name={t.assignee.name} color={t.assignee.avatarColor} url={t.assignee.avatarUrl} />
                          <span className="max-w-28 truncate">{t.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className={cn("px-2 py-2 text-xs whitespace-nowrap tabular-nums", overdue ? "text-red-600 font-semibold" : "text-slate-500")}>
                      {due ? fmtDate(due) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <ProgressBar value={t.progress} className="w-24" />
                        <span className="text-[10px] text-slate-400 tabular-nums w-8">{Math.round(t.progress)}%</span>
                      </span>
                    </td>
                    <td className="pr-2 text-right" title={`Open ${t.code}`}>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {tasks.length} task{tasks.length === 1 ? "" : "s"} shown · select rows for bulk actions, or click a row to open the task panel
      </p>
    </div>
  );
}
