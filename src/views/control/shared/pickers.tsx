"use client";
// PM CONTROL TOWER — Control shared: project picker (local to the control batch)
// Selection persists in localStorage ("pmct.control.project") so control pages keep context.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const CONTROL_PROJECT_KEY = "pmct.control.project";

export interface ProjectOption { id: string; code: string; name: string }

/** Lightweight project options hook for control views. */
export function useControlProjectOptions(enabled = true): { options: ProjectOption[]; loading: boolean } {
  const [options, setOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.get<{ items: { id: string; code: string; name: string }[] }>("/api/projects")
      .then((d) => { if (alive) { setOptions(d.items.map((p) => ({ id: p.id, code: p.code, name: p.name }))); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [enabled]);
  return { options, loading };
}

/** Persisted control-domain project selection: falls back to the first option and heals stale ids. */
export function useControlProjectId(options: ProjectOption[]): [string, (id: string) => void] {
  const [stored, setStored] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(CONTROL_PROJECT_KEY) ?? "";
  });
  // Derive the effective id during render — no effect needed; stale/empty ids resolve
  // to the first option until the user picks one (which persists the choice).
  const id = options.length && !options.some((o) => o.id === stored) ? options[0].id : stored;
  const set = useCallback((v: string) => {
    if (typeof window !== "undefined") localStorage.setItem(CONTROL_PROJECT_KEY, v);
    setStored(v);
  }, []);
  return [id, set];
}

export function ProjectPicker({ value, onChange, options, placeholder = "Select project", className }: {
  value: string; onChange: (projectId: string) => void; options: ProjectOption[];
  placeholder?: string; className?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className={`bg-white h-9 w-full sm:w-72 ${className || ""}`} aria-label="Project selector">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="__none__">All projects</SelectItem>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
