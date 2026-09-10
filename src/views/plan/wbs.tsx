"use client";
// PM CONTROL TOWER — Plan: work breakdown structure authoring for the selected project

import { PageHeader, EmptyState } from "@/components/pmct/kit";
import { ProjectPicker, useStoredProjectId } from "./shared/ProjectPicker";
import WbsTree from "./shared/WbsTree";

export default function WbsView() {
  const [projectId, setProjectId] = useStoredProjectId();

  return (
    <div className="space-y-5">
      <PageHeader
        io="wbs-nodes"
        title="Work Breakdown Structure"
        subtitle="Decompose scope into summary nodes and work packages — the backbone of schedule and cost control."
        breadcrumb={["Home", "Plan", "WBS"]}
        actions={<ProjectPicker value={projectId} onChange={setProjectId} className="w-full sm:w-auto" />}
      />
      {projectId ? <WbsTree key={projectId} projectId={projectId} /> : (
        <EmptyState title="No project selected" description="Pick a project above to build its work breakdown structure." />
      )}
    </div>
  );
}
