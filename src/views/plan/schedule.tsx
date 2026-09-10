"use client";
// PM CONTROL TOWER — Plan: CPM Gantt schedule for the selected project

import { PageHeader, EmptyState } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import GanttChart from "./shared/GanttChart";

export default function ScheduleView() {
  const [projectId, setProjectId] = useStoredProjectId();

  return (
    <div className="space-y-5">
      <PageHeader
        io="tasks"
        title="Schedule"
        subtitle="Critical Path Method network — early dates, total float and the critical path, updated on every plan change."
        breadcrumb={["Home", "Plan", "Schedule"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />
      {projectId ? <GanttChart key={projectId} projectId={projectId} /> : (
        <EmptyState title="No project selected" description="Pick a project above to explore its schedule network." />
      )}
    </div>
  );
}
