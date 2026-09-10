"use client";
// PM CONTROL TOWER — Plan: milestone timeline for the selected project

import { PageHeader, EmptyState } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import MilestonesPanel from "./shared/MilestonesPanel";

export default function MilestonesView() {
  const [projectId, setProjectId] = useStoredProjectId();

  return (
    <div className="space-y-5">
      <PageHeader
        io="milestones"
        title="Milestones"
        subtitle="Contractual checkpoints with baseline variance tracking and completion control."
        breadcrumb={["Home", "Plan", "Milestones"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />
      {projectId ? <MilestonesPanel key={projectId} projectId={projectId} /> : (
        <EmptyState title="No project selected" description="Pick a project above to manage its milestones." />
      )}
    </div>
  );
}
