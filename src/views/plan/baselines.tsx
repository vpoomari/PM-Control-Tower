"use client";
// PM CONTROL TOWER — Plan: performance baselines for the selected project

import { PageHeader, EmptyState } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import BaselinesPanel from "./shared/BaselinesPanel";

export default function BaselinesView() {
  const [projectId, setProjectId] = useStoredProjectId();

  return (
    <div className="space-y-5">
      <PageHeader
        io="baselines"
        title="Baselines"
        subtitle="Versioned plan snapshots — schedule, effort and cost frozen for variance control."
        breadcrumb={["Home", "Plan", "Baselines"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />
      {projectId ? <BaselinesPanel key={projectId} projectId={projectId} /> : (
        <EmptyState title="No project selected" description="Pick a project above to manage its baselines." />
      )}
    </div>
  );
}
