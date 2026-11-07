"use client";
// PM CONTROL TOWER — Shared task form fields (create = update = view parity)
// ONE field definition rendered by every surface that writes a task:
// Plan → Tasks "Add task" and "Edit task" dialogs both render TaskFormFields,
// and the task table shows the same set read-only (WBS, Status, Priority,
// Dates, Dur, Hours, Constraint/Deadline chips). Server-side, POST and PATCH
// accept the identical payload built by taskFormPayload().

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUS, PRIORITY } from "@/lib/constants";

export const CONSTRAINT_TYPES = [
  { code: "ASAP", label: "As Soon As Possible", ms: "default" },
  { code: "ALAP", label: "As Late As Possible", ms: "flexible" },
  { code: "MSO", label: "Must Start On", ms: "inflexible — locks the start" },
  { code: "SNET", label: "Start No Earlier Than", ms: "semi-flexible" },
  { code: "SNLT", label: "Start No Later Than", ms: "semi-flexible" },
  { code: "FNET", label: "Finish No Earlier Than", ms: "semi-flexible" },
  { code: "FNLT", label: "Finish No Later Than", ms: "semi-flexible" },
] as const;

/** The canonical task field set — identical for create, update and view. */
export interface TaskFormState {
  name: string;
  wbsId: string;
  status: string;
  priority: string;
  startDate: string;
  endDate: string;
  durationDays: string;
  plannedHours: string;
  constraintType: string;
  constraintDate: string;
  deadline: string;
}

/** Anything task-shaped: a list row (TaskRow) prefills the edit dialog. */
export interface TaskFormSource {
  name: string;
  status: string;
  priority: string;
  wbs?: { id: string } | null;
  wbsId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  plannedHours?: number | null;
  constraintType?: string | null;
  constraintDate?: string | null;
  deadline?: string | null;
}

export interface TaskWbsOption {
  id: string;
  code: string;
  name: string;
  nodeType: string;
}

const iso = (d: string) => new Date(d).toISOString();
const day = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function emptyTaskForm(): TaskFormState {
  return {
    name: "", wbsId: "", status: "NOT_STARTED", priority: "MEDIUM",
    startDate: "", endDate: "", durationDays: "", plannedHours: "",
    constraintType: "ASAP", constraintDate: "", deadline: "",
  };
}

export function taskFormFrom(t: TaskFormSource): TaskFormState {
  return {
    name: t.name,
    wbsId: t.wbs?.id ?? t.wbsId ?? "",
    status: t.status,
    priority: t.priority,
    startDate: day(t.startDate),
    endDate: day(t.endDate),
    durationDays: t.durationDays && t.durationDays > 0 ? String(t.durationDays) : "",
    plannedHours: t.plannedHours ? String(t.plannedHours) : "",
    constraintType: t.constraintType || "ASAP",
    constraintDate: day(t.constraintDate),
    deadline: day(t.deadline),
  };
}

/**
 * Shared payload builder — POST /tasks and PATCH /tasks/[id] both accept it.
 * Duration is inferred from the start/finish window (same formula as the CPM
 * engine fallback: max(1, round((end - start) / day))) when left blank.
 */
export function taskFormPayload(form: TaskFormState): Record<string, unknown> {
  let durationDays: number | undefined;
  if (form.durationDays !== "") durationDays = Number(form.durationDays);
  else if (form.startDate && form.endDate) {
    durationDays = Math.max(1, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86_400_000));
  }
  return {
    name: form.name.trim(),
    wbsId: form.wbsId || null,
    status: form.status,
    priority: form.priority,
    startDate: form.startDate ? iso(form.startDate) : null,
    endDate: form.endDate ? iso(form.endDate) : null,
    ...(durationDays !== undefined ? { durationDays } : {}),
    plannedHours: form.plannedHours === "" ? 0 : Number(form.plannedHours),
    constraintType: form.constraintType,
    constraintDate: form.constraintType === "ASAP" ? null : form.constraintDate ? iso(form.constraintDate) : null,
    deadline: form.deadline ? iso(form.deadline) : null,
  };
}

/** The single field grid — imported by the Add and Edit dialogs. */
export function TaskFormFields({ form, setForm, wbsOptions = [] }: {
  form: TaskFormState;
  setForm: (f: TaskFormState) => void;
  wbsOptions?: TaskWbsOption[];
}) {
  const set = <K extends keyof TaskFormState>(k: K, v: TaskFormState[K]) => setForm({ ...form, [k]: v });
  const constraintDateLocked = form.constraintType === "ASAP";
  const packages = wbsOptions.filter((w) => w.nodeType === "WORK_PACKAGE");
  return (
    <div className="grid gap-3 py-1">
      <div className="grid gap-1.5">
        <Label htmlFor="tf-name">Name</Label>
        <Input id="tf-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Configure integration middleware" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>WBS package</Label>
          <Select value={form.wbsId || "none"} onValueChange={(v) => set("wbsId", v === "none" ? "" : v)}>
            <SelectTrigger aria-label="WBS package"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {packages.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
            <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tf-duration">Duration (days)</Label>
          <Input id="tf-duration" type="number" min={0} value={form.durationDays} onChange={(e) => set("durationDays", e.target.value)} placeholder="from dates" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tf-hours">Planned hours</Label>
          <Input id="tf-hours" type="number" min={0} value={form.plannedHours} onChange={(e) => set("plannedHours", e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="tf-start">Start</Label>
          <Input id="tf-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tf-end">Finish</Label>
          <Input id="tf-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tf-deadline">Deadline</Label>
          <Input id="tf-deadline" type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Constraint type</Label>
          <Select value={form.constraintType} onValueChange={(v) => set("constraintType", v)}>
            <SelectTrigger aria-label="Constraint type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONSTRAINT_TYPES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tf-constraint-date">Constraint date</Label>
          <Input id="tf-constraint-date" type="date" value={form.constraintDate} disabled={constraintDateLocked}
            onChange={(e) => set("constraintDate", e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-slate-400 -mt-1">
        Constraint &amp; deadline feed the CPM engine — the network reschedules when you save. ASAP needs no date.
      </p>
    </div>
  );
}
