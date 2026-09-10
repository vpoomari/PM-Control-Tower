"use client";
// PM CONTROL TOWER — Workspace Scope & Requirements tab

import type { ProjectCore } from "./types";
import { SectionCard } from "@/components/pmct/kit";
import RequirementsPanel from "@/views/plan/shared/RequirementsPanel";
import { ScrollText } from "lucide-react";

export default function ScopeTab({ project }: { project: ProjectCore }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Project Charter" description="Committed scope narrative for this project" bodyClass="p-4 pt-2">
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {project.charter || project.description || "No charter has been recorded for this project yet."}
        </p>
        {project.successCriteria && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500 border-t border-slate-100 pt-2">
            <ScrollText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span><b className="text-slate-600">Success criteria:</b> {project.successCriteria}</span>
          </p>
        )}
      </SectionCard>
      <RequirementsPanel projectId={project.id} />
    </div>
  );
}
