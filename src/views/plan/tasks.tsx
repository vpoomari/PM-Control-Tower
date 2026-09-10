"use client";
// PM CONTROL TOWER — Plan: task register for the selected project (quick edits + Gantt link)

import { PageHeader, EmptyState, StatCard, LoadingBlock, ErrorBlock } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import TasksPanel from "./shared/TasksPanel";
import { useApi, useRealtimeRefetch } from "@/lib/client";
import { ClipboardList, GitBranch, AlarmClock, ListTodo } from "lucide-react";
import { num } from "@/lib/constants";

interface TaskLite { id: string; status: string; isCritical: boolean; progress: number; plannedHours: number; actualHours: number }
interface TasksBundle { items: TaskLite[]; total: number }

export default function TasksView() {
  const [projectId, setProjectId] = useStoredProjectId();
  const summary = useApi<TasksBundle>(projectId ? `/api/projects/${projectId}/tasks` : null);
  useRealtimeRefetch(summary.refetch, ["task:changed"]);

  const items = summary.data?.items || [];
  const done = items.filter((t) => t.status === "COMPLETED").length;
  const critical = items.filter((t) => t.isCritical).length;
  const planned = items.reduce((a, t) => a + t.plannedHours, 0);
  const actual = items.reduce((a, t) => a + t.actualHours, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        io="tasks"
        title="Tasks"
        subtitle="Execution register — status, effort and critical-path flags per task."
        breadcrumb={["Home", "Plan", "Tasks"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />

      {projectId && (
        summary.loading ? <LoadingBlock label="Summarising tasks…" /> :
        summary.error ? <ErrorBlock message={summary.error} onRetry={summary.refetch} /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Tasks" value={summary.data?.total ?? 0} sub={`${done} completed`} icon={<ListTodo className="h-4 w-4" />} />
            <StatCard label="Critical path" value={critical} tone={critical > 0 ? "bad" : "good"} sub="Zero-float activities" icon={<GitBranch className="h-4 w-4" />} />
            <StatCard label="Planned hours" value={num(planned, 0)} sub={`${num(actual, 0)}h actual`} icon={<AlarmClock className="h-4 w-4" />} />
            <StatCard label="Completion" value={`${items.length ? Math.round((done / items.length) * 100) : 0}%`} sub="Tasks finished" icon={<ClipboardList className="h-4 w-4" />} />
          </div>
        )
      )}

      {projectId ? <TasksPanel key={projectId} projectId={projectId} showGanttLink /> : (
        <EmptyState title="No project selected" description="Pick a project above to manage its tasks." />
      )}
    </div>
  );
}
