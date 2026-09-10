"use client";
// PM CONTROL TOWER — Execute shared: session hook + project/task pickers + week navigation

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addDays, startOfWeek } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PickOption { id: string; code: string; name: string }

export interface MeInfo {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/** Current session user (small, cached per mount). */
export function useMe() {
  const [me, setMe] = useState<MeInfo | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<{ user: { id: string; email: string; name: string; roles: string[]; permissions: string[] } }>("/api/auth/me")
      .then((d) => { if (alive) setMe({ id: d.user.id, name: d.user.name, email: d.user.email, roles: d.user.roles, permissions: d.user.permissions }); })
      .catch(() => { /* unauthorized handled globally */ });
    return () => { alive = false; };
  }, []);
  return me;
}

export function hasPerm(me: MeInfo | null, perm: string): boolean {
  if (!me) return false;
  return me.permissions.includes(perm) || me.roles.includes("PMO_ADMIN");
}

/** Fetch lightweight project options (id/code/name). */
export function useProjectOptions(enabled = true): { options: PickOption[]; loading: boolean } {
  const [options, setOptions] = useState<PickOption[]>([]);
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

export function ProjectSelect({ value, onChange, options, placeholder = "Select project", allowEmpty = false, className }: {
  value: string; onChange: (projectId: string) => void;
  options: PickOption[]; placeholder?: string; allowEmpty?: boolean; className?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className={`bg-white h-9 ${className || ""}`} aria-label="Project">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowEmpty && <SelectItem value="__none__">No project</SelectItem>}
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Task picker filtered by project; loads lazily when projectId is set. */
export function TaskSelect({ projectId, value, onChange, className }: {
  projectId: string; value: string; onChange: (taskId: string) => void; className?: string;
}) {
  const [state, setState] = useState<{ loadedFor: string; tasks: PickOption[] }>({ loadedFor: "", tasks: [] });
  const [loading, setLoading] = useState(false);
  const tasks = state.loadedFor === projectId ? state.tasks : [];
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    api.get<{ items: { id: string; code: string; name: string }[] }>(`/api/projects/${projectId}/tasks`)
      .then((d) => { if (alive) { setState({ loadedFor: projectId, tasks: d.items.map((t) => ({ id: t.id, code: t.code, name: t.name })) }); setLoading(false); } })
      .catch(() => { if (alive) { setState({ loadedFor: projectId, tasks: [] }); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId]);

  if (!projectId) {
    return (
      <div className={`h-9 rounded-md border border-dashed border-slate-200 flex items-center px-3 text-xs text-slate-400 ${className || ""}`}>
        Select a project first
      </div>
    );
  }
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger className={`bg-white h-9 ${className || ""}`} aria-label="Task">
        <SelectValue placeholder={loading ? "Loading tasks…" : "Task (optional)"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="__none__">No task</SelectItem>
        {tasks.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.code} — {t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const WEEK_LABEL_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const WEEK_YEAR_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

export function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  return `${WEEK_LABEL_FMT.format(weekStart)} – ${WEEK_LABEL_FMT.format(end)}, ${WEEK_YEAR_FMT.format(end)}`;
}

/** Monday-start week navigator with label + "This week" reset. */
export function WeekNav({ weekStart, onChange }: { weekStart: Date; onChange: (d: Date) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-1 shadow-sm">
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous week" onClick={() => onChange(addDays(weekStart, -7))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[10.5rem] text-center text-sm font-medium text-slate-700 tabular-nums">{weekLabel(weekStart)}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Next week" onClick={() => onChange(addDays(weekStart, 7))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange(startOfWeek(new Date()))}>This week</Button>
    </div>
  );
}

export const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
