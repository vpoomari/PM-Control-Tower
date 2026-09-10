"use client";
// PM CONTROL TOWER — Shared project picker (plan domain)
// Persists the selection in localStorage ("pmct.plan.project") so plan pages keep context.

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderKanban } from "lucide-react";

export const PLAN_PROJECT_KEY = "pmct.plan.project";

export interface PickerProject {
  id: string;
  code: string;
  name: string;
  status: string;
  healthScore: number;
  ragStatus: string;
  progress: number;
}

export function readStoredProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAN_PROJECT_KEY);
}

/** Hook: plan-page selection backed by localStorage. */
export function useStoredProjectId(): [string | null, (id: string) => void] {
  const [id, setId] = useState<string | null>(() => readStoredProjectId());
  const set = useCallback((v: string) => {
    localStorage.setItem(PLAN_PROJECT_KEY, v);
    setId(v);
  }, []);
  return [id, set];
}

export function ProjectPicker({ value, onChange, className }: {
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
}) {
  const projects = useApi<{ items: PickerProject[]; total: number }>("/api/projects?take=500");
  const selected = (projects.data?.items || []).find((p) => p.id === value);

  // Auto-select the first project when nothing is stored yet.
  useEffect(() => {
    if (!value && projects.data?.items?.length) onChange(projects.data.items[0].id);
  }, [projects.data, value, onChange]);

  return (
    <div className={className}>
      <label className="sr-only" htmlFor="plan-project-picker">Project</label>
      <div className="flex items-center gap-2">
        <FolderKanban className="h-4 w-4 text-slate-400 shrink-0" />
        <Select value={value || ""} onValueChange={onChange} disabled={projects.loading}>
          <SelectTrigger id="plan-project-picker" className="w-full sm:w-[340px] h-10 bg-white" aria-label="Select project">
            <SelectValue placeholder={projects.loading ? "Loading projects…" : "Select a project"} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {(projects.data?.items || []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-medium">{p.code}</span>
                <span className="text-slate-500"> — {p.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && (
        <p className="text-xs text-slate-500 mt-1.5">
          {selected.code} · {selected.name} — {selected.status.replace("_", " ").toLowerCase()} · {Math.round(selected.progress)}% complete
        </p>
      )}
    </div>
  );
}
