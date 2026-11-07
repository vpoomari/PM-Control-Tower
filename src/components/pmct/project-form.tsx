"use client";
// PM CONTROL TOWER — Shared project form fields (create = update = view parity)
// ONE field definition rendered by every surface that writes a project:
// Project Register "New project" and workspace "Edit project" both render
// ProjectFormFields, and the workspace Overview "Project details" card shows
// the same set read-only. Payload builders map onto the POST /api/projects and
// PATCH /api/projects/[id] schemas, which are field-for-field identical
// (code is create-only).

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS, PRIORITY } from "@/lib/constants";

const PHASES = ["INITIATION", "PLANNING", "EXECUTION", "MONITORING", "DELIVERY", "CLOSURE"];
const METHODOLOGIES = ["HYBRID", "WATERFALL", "AGILE", "SCRUM", "SAFE", "PRINCE2"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const BILLING_TYPES = ["BILLABLE", "NON_BILLABLE", "FIXED_PRICE", "TIME_MATERIAL", "INTERNAL"];

/** The canonical project field set — identical for create, update and view. */
export interface ProjectFormState {
  code: string;
  name: string;
  description: string;
  programId: string;
  portfolioId: string;
  ownerId: string;
  managerId: string;
  sponsorId: string;
  status: string;
  priority: string;
  phase: string;
  methodology: string;
  riskLevel: string;
  billingType: string;
  currency: string;
  startDate: string;
  endDate: string;
  baselineStart: string;
  baselineFinish: string;
  statusDate: string;
  currentBudget: string;
  baselineBudget: string;
  forecastCost: string;
  charter: string;
  objectives: string;
  successCriteria: string;
}

/** Anything project-shaped: the workspace bundle's project row prefills Edit. */
export interface ProjectFormSource {
  code?: string;
  name: string;
  description?: string | null;
  programId?: string | null;
  portfolioId?: string | null;
  ownerId?: string | null;
  managerId?: string | null;
  sponsorId?: string | null;
  status: string;
  priority: string;
  phase?: string | null;
  methodology?: string | null;
  riskLevel?: string | null;
  billingType?: string | null;
  currency?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  baselineStart?: string | null;
  baselineFinish?: string | null;
  statusDate?: string | null;
  currentBudget?: number | null;
  baselineBudget?: number | null;
  forecastCost?: number | null;
  charter?: string | null;
  objectives?: string | null;
  successCriteria?: string | null;
}

export interface ProjectFormMeta {
  programs?: { id: string; code: string; name: string }[];
  portfolios?: { id: string; code: string; name: string }[];
  users?: { id: string; name: string; isActive?: boolean }[];
}

const iso = (d: string) => new Date(d).toISOString();
const day = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const num = (n?: number | null) => (n === null || n === undefined ? "" : String(n));

export function emptyProjectForm(): ProjectFormState {
  return {
    code: "", name: "", description: "",
    programId: "", portfolioId: "", ownerId: "", managerId: "", sponsorId: "",
    status: "DRAFT", priority: "MEDIUM", phase: "INITIATION", methodology: "HYBRID",
    riskLevel: "MEDIUM", billingType: "BILLABLE", currency: "USD",
    startDate: "", endDate: "", baselineStart: "", baselineFinish: "", statusDate: "",
    currentBudget: "", baselineBudget: "", forecastCost: "",
    charter: "", objectives: "", successCriteria: "",
  };
}

export function projectFormFrom(p: ProjectFormSource): ProjectFormState {
  return {
    code: p.code ?? "",
    name: p.name,
    description: p.description ?? "",
    programId: p.programId ?? "",
    portfolioId: p.portfolioId ?? "",
    ownerId: p.ownerId ?? "",
    managerId: p.managerId ?? "",
    sponsorId: p.sponsorId ?? "",
    status: p.status,
    priority: p.priority,
    phase: p.phase ?? "INITIATION",
    methodology: p.methodology ?? "HYBRID",
    riskLevel: p.riskLevel ?? "MEDIUM",
    billingType: p.billingType ?? "BILLABLE",
    currency: p.currency ?? "USD",
    startDate: day(p.startDate),
    endDate: day(p.endDate),
    baselineStart: day(p.baselineStart),
    baselineFinish: day(p.baselineFinish),
    statusDate: day(p.statusDate),
    currentBudget: num(p.currentBudget),
    baselineBudget: num(p.baselineBudget),
    forecastCost: num(p.forecastCost),
    charter: p.charter ?? "",
    objectives: p.objectives ?? "",
    successCriteria: p.successCriteria ?? "",
  };
}

function commonPayload(form: ProjectFormState): Record<string, unknown> {
  const date = (v: string) => (v ? iso(v) : null);
  const money = (v: string) => (v === "" ? undefined : Number(v));
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    programId: form.programId || null,
    portfolioId: form.portfolioId || null,
    ownerId: form.ownerId || null,
    managerId: form.managerId || null,
    sponsorId: form.sponsorId || null,
    status: form.status,
    priority: form.priority,
    phase: form.phase,
    methodology: form.methodology,
    riskLevel: form.riskLevel,
    billingType: form.billingType,
    currency: form.currency.trim().toUpperCase() || "USD",
    startDate: date(form.startDate),
    endDate: date(form.endDate),
    baselineStart: date(form.baselineStart),
    baselineFinish: date(form.baselineFinish),
    statusDate: date(form.statusDate),
    currentBudget: money(form.currentBudget),
    baselineBudget: money(form.baselineBudget),
    forecastCost: money(form.forecastCost),
    charter: form.charter.trim() || null,
    objectives: form.objectives.trim() || null,
    successCriteria: form.successCriteria.trim() || null,
  };
}

/** POST /api/projects payload (adds the create-only code). */
export function projectCreatePayload(form: ProjectFormState): Record<string, unknown> {
  return { code: form.code.trim().toUpperCase(), ...commonPayload(form) };
}

/** PATCH /api/projects/[id] payload. */
export function projectPatchPayload(form: ProjectFormState): Record<string, unknown> {
  return commonPayload(form);
}

/** Keep the current value visible even when it is outside the option list. */
const opts = (list: readonly string[], cur: string) => (cur && !list.includes(cur) ? [cur, ...list] : list);

function UserSelect({ label, value, onChange, users, id }: {
  label: string; value: string; onChange: (v: string) => void;
  users: { id: string; name: string; isActive?: boolean }[]; id: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Unassigned —</SelectItem>
          {users.filter((u) => u.isActive !== false).map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The single field grid — imported by the New and Edit project dialogs. */
export function ProjectFormFields({ form, setForm, meta = {}, showCode = false }: {
  form: ProjectFormState;
  setForm: (f: ProjectFormState) => void;
  meta?: ProjectFormMeta;
  showCode?: boolean;
}) {
  const set = <K extends keyof ProjectFormState>(k: K, v: ProjectFormState[K]) => setForm({ ...form, [k]: v });
  const users = meta.users || [];
  const programs = meta.programs || [];
  const portfolios = meta.portfolios || [];
  return (
    <div className="grid gap-3 py-1">
      <div className="grid gap-1.5">
        <Label htmlFor="pf-name">Name</Label>
        <Input id="pf-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Customer Onboarding Revamp" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-program">Program</Label>
          <Select value={form.programId || "none"} onValueChange={(v) => set("programId", v === "none" ? "" : v)}>
            <SelectTrigger id="pf-program"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Standalone —</SelectItem>
              {programs.map((g) => <SelectItem key={g.id} value={g.id}>{g.code} — {g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-portfolio">Portfolio</Label>
          <Select value={form.portfolioId || "none"} onValueChange={(v) => set("portfolioId", v === "none" ? "" : v)}>
            <SelectTrigger id="pf-portfolio"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {portfolios.map((f) => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <UserSelect id="pf-owner" label="Project manager" value={form.ownerId} onChange={(v) => set("ownerId", v)} users={users} />
        <UserSelect id="pf-manager" label="Manager" value={form.managerId} onChange={(v) => set("managerId", v)} users={users} />
        <UserSelect id="pf-sponsor" label="Sponsor" value={form.sponsorId} onChange={(v) => set("sponsorId", v)} users={users} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-status">Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger id="pf-status"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-priority">Priority</Label>
          <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
            <SelectTrigger id="pf-priority"><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITY.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-phase">Phase</Label>
          <Select value={form.phase} onValueChange={(v) => set("phase", v)}>
            <SelectTrigger id="pf-phase"><SelectValue /></SelectTrigger>
            <SelectContent>{opts(PHASES, form.phase).map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-methodology">Methodology</Label>
          <Select value={form.methodology} onValueChange={(v) => set("methodology", v)}>
            <SelectTrigger id="pf-methodology"><SelectValue /></SelectTrigger>
            <SelectContent>{opts(METHODOLOGIES, form.methodology).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-risk">Risk level</Label>
          <Select value={form.riskLevel} onValueChange={(v) => set("riskLevel", v)}>
            <SelectTrigger id="pf-risk"><SelectValue /></SelectTrigger>
            <SelectContent>{opts(RISK_LEVELS, form.riskLevel).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-billing">Billing type</Label>
          <Select value={form.billingType} onValueChange={(v) => set("billingType", v)}>
            <SelectTrigger id="pf-billing"><SelectValue /></SelectTrigger>
            <SelectContent>{opts(BILLING_TYPES, form.billingType).map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-start">Start</Label>
          <Input id="pf-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-end">Finish</Label>
          <Input id="pf-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-status-date">Status date</Label>
          <Input id="pf-status-date" type="date" value={form.statusDate} onChange={(e) => set("statusDate", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-baseline-start">Baseline start</Label>
          <Input id="pf-baseline-start" type="date" value={form.baselineStart} onChange={(e) => set("baselineStart", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-baseline-finish">Baseline finish</Label>
          <Input id="pf-baseline-finish" type="date" value={form.baselineFinish} onChange={(e) => set("baselineFinish", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-currency">Currency</Label>
          <Input id="pf-currency" value={form.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} placeholder="USD" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pf-budget">Current budget</Label>
          <Input id="pf-budget" type="number" min={0} value={form.currentBudget} onChange={(e) => set("currentBudget", e.target.value)} placeholder="0" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-baseline-budget">Baseline budget</Label>
          <Input id="pf-baseline-budget" type="number" min={0} value={form.baselineBudget} onChange={(e) => set("baselineBudget", e.target.value)} placeholder="0" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pf-forecast">Forecast cost</Label>
          <Input id="pf-forecast" type="number" min={0} value={form.forecastCost} onChange={(e) => set("forecastCost", e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="pf-desc">Description</Label>
        <Textarea id="pf-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pf-charter">Charter</Label>
        <Textarea id="pf-charter" rows={3} value={form.charter} onChange={(e) => set("charter", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pf-objectives">Objectives</Label>
        <Textarea id="pf-objectives" rows={2} value={form.objectives} onChange={(e) => set("objectives", e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pf-success">Success criteria</Label>
        <Textarea id="pf-success" rows={2} value={form.successCriteria} onChange={(e) => set("successCriteria", e.target.value)} />
      </div>
    </div>
  );
}
