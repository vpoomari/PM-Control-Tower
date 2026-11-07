"use client";
// PM CONTROL TOWER — Governance center: threshold rules engine + alert management.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDateTime } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, SeverityDot, LoadingBlock, ErrorBlock, EmptyState, DataTable, Column,
  ConfirmButton, Button, Input, cn,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectPicker, useControlProjectOptions, type ProjectOption } from "@/views/control/shared/pickers";
import { Badge } from "@/components/ui/badge";
import { useModuleFieldsHandle } from "@/components/fields/ModuleFields";
import { customFieldColumns, CustomFieldValueCell } from "@/components/fields/custom-columns";
import RecordFieldsButton from "@/components/fields/RecordFieldsButton";
import { Pencil, Plus, Play, Trash2, ShieldCheck, Landmark, GitBranch, Truck, Coins, Radar } from "lucide-react";

const RULE_METRICS = ["CPI", "SPI", "EAC", "BUDGET_UTILIZATION", "HEALTH_SCORE", "COST_VARIANCE", "SCHEDULE_VARIANCE_DAYS", "OPEN_RISKS", "OPEN_ISSUES"] as const;
const RULE_OPERATORS = ["LT", "LTE", "GT", "GTE", "EQ"] as const;
const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

interface Rule {
  [key: string]: unknown;
  id: string; name: string; description: string | null; metric: string; operator: string;
  threshold: number; severity: string; scopeType: string; scopeId: string | null;
  isActive: boolean; actionNotify: boolean; actionInbox: boolean; actionRecalcHealth: boolean;
  executionCount: number; lastTriggeredAt: string | null; createdAt: string;
}
interface Alert {
  [key: string]: unknown;
  id: string; projectId: string | null; alertType: string; severity: string; title: string;
  message: string; metricValue: number | null; threshold: number | null; status: string;
  source: string; createdAt: string;
  project: { id: string; code: string; name: string } | null;
}

const emptyRule = {
  name: "", description: "", metric: "CPI", operator: "LT", threshold: "0.9", severity: "WARNING",
  scopeType: "GLOBAL", scopeId: "", isActive: true, actionNotify: true, actionInbox: true, actionRecalcHealth: false,
};

// ---- Governance framework (PMO control baseline) ----
// The 15 controls the organisation governs by, grouped into four domains. Each
// control is mapped to the PM Control Tower module that operationalises it.
interface FrameworkControl {
  n: number;
  title: string;
  rule: string;
  module: string;
  href: string;
}
interface FrameworkDomain {
  key: string;
  label: string;
  icon: typeof Landmark;
  accent: string;
  controls: FrameworkControl[];
}

const FRAMEWORK: FrameworkDomain[] = [
  {
    key: "ppm", label: "Project & Program Management", icon: Landmark, accent: "text-blue-600 bg-blue-50 border-blue-100",
    controls: [
      { n: 1, title: "Standardized Stage-Gating", rule: "Every project must pass through formal stage-gate reviews (e.g., Initiation, Planning, Execution, Closure) with signed approvals before funding and resources are released for the next phase.", module: "Stage Gates", href: "#/gates" },
      { n: 2, title: "Baselined Change Control", rule: "Any deviation from the baselined scope, schedule, or cost requires a formal Change Request (CR) reviewed and approved by the Change Control Board (CCB) or Steering Committee.", module: "Change Control", href: "#/changes" },
      { n: 3, title: "Executive Status Cadence", rule: "Standardized RAG (Red, Amber, Green) status reports must be published weekly, focusing on milestone progress, critical escalations, and financial health, eliminating subjective progress reporting.", module: "Health", href: "#/health" },
    ],
  },
  {
    key: "delivery", label: "Delivery Management", icon: Truck, accent: "text-emerald-600 bg-emerald-50 border-emerald-100",
    controls: [
      { n: 4, title: "Strict Definition of Done (DoD)", rule: "Deliverables cannot be marked complete or transitioned to operations until they meet predefined quality metrics, compliance standards, and stakeholder sign-off criteria.", module: "Tasks", href: "#/tasks" },
      { n: 5, title: "Resource Capacity Baselining", rule: "Resource allocations must be mapped against actual capacity, ensuring no critical path activities are dependent on a single point of failure or over-allocated personnel.", module: "Resources", href: "#/resources" },
      { n: 6, title: "Value-Driven Milestone Tracking", rule: "Programs must demonstrate measurable business value or tangible milestone achievement at regular intervals (e.g., quarterly or per increment) to justify continued investment.", module: "Milestones", href: "#/milestones" },
      { n: 7, title: "Post-Implementation Reviews (PIR)", rule: "A formal lessons-learned and benefits-realization assessment must be conducted and documented within 30 days of project closure.", module: "Projects", href: "#/projects" },
    ],
  },
  {
    key: "financials", label: "Financials & Budgeting", icon: Coins, accent: "text-amber-600 bg-amber-50 border-amber-100",
    controls: [
      { n: 8, title: "Strict Variance Thresholds", rule: "Any budget variance (Estimate at Completion vs. Budget at Completion) exceeding +/- 10% mandates an immediate root-cause analysis and an executive remediation plan.", module: "Financials", href: "#/financials" },
      { n: 9, title: "Monthly Financial Reconciliation", rule: "Actual spend must be reconciled against the forecast by the 5th business day of each month to ensure accurate cash flow reporting and prevent end-of-quarter budget surprises.", module: "Financials", href: "#/financials" },
      { n: 10, title: "CAPEX/OPEX Segregation", rule: "Project labor, software, and infrastructure costs must be strictly categorized and tracked as Capital Expenditure (CAPEX) or Operational Expenditure (OPEX) in adherence to corporate financial compliance.", module: "Financials", href: "#/financials" },
      { n: 11, title: "Earned Value Tracking", rule: "For high-budget enterprise programs, Earned Value Management (EVM) metrics — specifically Cost Performance Index (CPI) and Schedule Performance Index (SPI) — must be used to objectively measure financial health.", module: "EVM", href: "#/evm" },
    ],
  },
  {
    key: "raid", label: "RAID Management (Risks, Assumptions, Issues, Dependencies)", icon: Radar, accent: "text-red-600 bg-red-50 border-red-100",
    controls: [
      { n: 12, title: "Quantified Risk Mitigation", rule: "Every risk rated as \"High\" impact or probability must have a documented mitigation strategy, a contingency budget/buffer, and a specifically named owner accountable for its resolution.", module: "Risks", href: "#/raid" },
      { n: 13, title: "Time-Bound Issue Escalation", rule: "Issues threatening the critical path or remaining unresolved for more than 5 business days must trigger an automatic escalation to the project sponsor or steering committee.", module: "Issues", href: "#/raid" },
      { n: 14, title: "Cross-Program Dependency Contracts", rule: "Inter-project dependencies must be formally mapped, agreed upon by both project managers, and reviewed weekly to prevent downstream delays from external bottlenecks.", module: "Dependencies", href: "#/raid" },
      { n: 15, title: "Continuous Assumption Validation", rule: "Assumptions established during the initial business case must be logged and reviewed at every stage gate to explicitly convert them into accepted facts, identified risks, or resolved items.", module: "Assumptions", href: "#/raid" },
    ],
  },
];

const FRAMEWORK_TOTAL = FRAMEWORK.reduce((s, d) => s + d.controls.length, 0);

function FrameworkSection() {
  return (
    <SectionCard
      title="Governance framework"
      description={`${FRAMEWORK_TOTAL} controls across ${FRAMEWORK.length} domains · each control maps to the module that operationalises it`}
      actions={<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-normal">PMO baseline</Badge>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {FRAMEWORK.map((d) => {
          const Icon = d.icon;
          return (
            <div key={d.key} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md border", d.accent)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{d.label}</p>
                  <p className="text-xs text-slate-400">{d.controls.length} control{d.controls.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {d.controls.map((c) => (
                  <li key={c.n} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 tabular-nums">
                        {c.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{c.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{c.rule}</p>
                        <a
                          href={c.href}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          <GitBranch className="h-3 w-3" />
                          Enforced in {c.module}
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function RuleDialog({ mode, target, options, onClose, onSaved }: {
  mode: "add" | "edit"; target: Rule | null; options: ProjectOption[];
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(() => target ? {
    name: target.name, description: target.description ?? "", metric: target.metric, operator: target.operator,
    threshold: String(target.threshold), severity: target.severity, scopeType: target.scopeType,
    scopeId: target.scopeId ?? "", isActive: target.isActive, actionNotify: target.actionNotify,
    actionInbox: target.actionInbox, actionRecalcHealth: target.actionRecalcHealth,
  } : emptyRule);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (form.name.trim().length < 3) { toast.error("Rule name is required (min 3 chars)"); return; }
    if (form.scopeType === "PROJECT" && !form.scopeId) { toast.error("Pick the project this rule scopes to"); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description || null,
      metric: form.metric,
      operator: form.operator,
      threshold: Number(form.threshold),
      severity: form.severity,
      scopeType: form.scopeType,
      scopeId: form.scopeType === "PROJECT" ? form.scopeId : null,
      isActive: form.isActive,
      actionNotify: form.actionNotify,
      actionInbox: form.actionInbox,
      actionRecalcHealth: form.actionRecalcHealth,
    };
    try {
      if (mode === "edit" && target) await api.patch(`/api/governance/rules/${target.id}`, body);
      else await api.post("/api/governance/rules", body);
      toast.success(mode === "edit" ? "Rule updated" : "Rule created — it evaluates on every governance run");
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? `Edit rule — ${target?.name}` : "New governance rule"}</DialogTitle>
          <DialogDescription>Thresholds are evaluated against live project metrics on every run.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label htmlFor="ru-name">Name *</Label>
            <Input id="ru-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Cost performance below 0.9" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label htmlFor="ru-desc">Description</Label>
            <Input id="ru-desc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Metric</Label>
            <Select value={form.metric} onValueChange={(v) => setForm((p) => ({ ...p, metric: v }))}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{RULE_METRICS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Operator</Label>
            <Select value={form.operator} onValueChange={(v) => setForm((p) => ({ ...p, operator: v }))}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{RULE_OPERATORS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ru-th">Threshold</Label>
            <Input id="ru-th" type="number" step="any" value={form.threshold} onChange={(e) => setForm((p) => ({ ...p, threshold: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Severity</Label>
            <Select value={form.severity} onValueChange={(v) => setForm((p) => ({ ...p, severity: v }))}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>{SEVERITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Scope</Label>
            <Select value={form.scopeType} onValueChange={(v) => setForm((p) => ({ ...p, scopeType: v }))}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GLOBAL">Global (all projects)</SelectItem>
                <SelectItem value="PROJECT">Single project</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.scopeType === "PROJECT" && (
            <div className="space-y-1">
              <Label>Project</Label>
              <ProjectPicker value={form.scopeId} onChange={(v) => setForm((p) => ({ ...p, scopeId: v }))} options={options} />
            </div>
          )}
          <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-slate-200 px-3 py-2.5">
            {([["actionNotify", "Notify roles"], ["actionInbox", "Create inbox items"], ["actionRecalcHealth", "Recalc health"]] as const).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox id={`ru-${key}`} checked={form[key]} onCheckedChange={(c) => setForm((p) => ({ ...p, [key]: c === true }))} />
                <Label htmlFor={`ru-${key}`} className="text-xs text-slate-600 cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
          {mode === "add" && (
            <div className="col-span-2 flex items-center gap-2">
              <Switch id="ru-active" checked={form.isActive} onCheckedChange={(c) => setForm((p) => ({ ...p, isActive: c }))} />
              <Label htmlFor="ru-active" className="text-xs text-slate-600 cursor-pointer">Rule active on creation</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GovernanceView() {
  const { options } = useControlProjectOptions();
  const rules = useApi<{ rules: Rule[] }>("/api/governance/rules");
  const alerts = useApi<{ alerts: Alert[]; total: number }>("/api/alerts");
  const refetchGov = () => { rules.refetch(); alerts.refetch(); };
  useRealtimeRefetch(refetchGov, ["governance:changed", "alert:created", "automation:executed"]);

  // --- Field Dictionary: assignments + bulk values for rules and alerts ---
  const ruleFields = useModuleFieldsHandle("governance_rule", (rules.data?.rules ?? []).map((r) => r.id));
  const alertFields = useModuleFieldsHandle("governance_alert", (alerts.data?.alerts ?? []).map((a) => a.id));

  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; target?: Rule } | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    options.forEach((p) => { m[p.id] = p.code; });
    return m;
  }, [options]);

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const d = await api.post<{ evaluated: number; breaches: unknown[] }>("/api/governance/evaluate", {});
      const breaches = d.breaches?.length ?? 0;
      toast.success(`Evaluated ${d.evaluated} rules — ${breaches} breach${breaches === 1 ? "" : "es"} detected`);
      await refetchGov();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  };

  const alertAction = async (a: Alert, status: "ACKNOWLEDGED" | "RESOLVED") => {
    try {
      await api.patch(`/api/alerts/${a.id}`, { status });
      toast.success(`Alert ${status.toLowerCase()}`);
      await alerts.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const ruleColumns: Column<Rule>[] = [
    { key: "name", header: "Rule", className: "min-w-52", render: (r) => (
      <div><p className="font-medium text-slate-800">{r.name}</p>{r.description && <p className="text-xs text-slate-400 line-clamp-1 max-w-72">{r.description}</p>}</div>
    ) },
    { key: "condition", header: "Condition", render: (r) => (
      <span className="text-xs font-mono text-slate-600 whitespace-nowrap">{r.metric.replace(/_/g, " ")} {r.operator} {r.threshold}</span>
    ) },
    { key: "severity", header: "Severity", render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-xs"><SeverityDot severity={r.severity} />{r.severity.toLowerCase()}</span>
    ) },
    { key: "scope", header: "Scope", render: (r) => (
      <span className="text-xs text-slate-600">{r.scopeType === "GLOBAL" ? "Global" : projectMap[r.scopeId ?? ""] || "Project"}</span>
    ) },
    { key: "active", header: "Active", render: (r) => (
      <Switch checked={r.isActive} aria-label={`Toggle ${r.name}`}
        onCheckedChange={(c) => {
          toast.promise(api.patch(`/api/governance/rules/${r.id}`, { isActive: c }), {
            loading: "Updating…", success: `${r.name} ${c ? "activated" : "deactivated"}`, error: (err) => (err instanceof Error ? err.message : "Failed"),
          });
          rules.refetch();
        }} />
    ) },
    { key: "executions", header: "Runs", render: (r) => <span className="tabular-nums text-slate-600">{r.executionCount}</span> },
    { key: "lastTriggered", header: "Last triggered", render: (r) => <span className="text-xs tabular-nums text-slate-500">{r.lastTriggeredAt ? fmtDateTime(r.lastTriggeredAt) : "never"}</span> },
    // Field Dictionary: dynamic columns for any field flagged "in table"
    ...customFieldColumns<Rule>(ruleFields.tableColumns, ruleFields.values),
    { key: "cf", header: "", className: "w-10", render: (r) => (
      <RecordFieldsButton moduleKey="governance_rule" recordId={r.id} label={r.name} onSaved={ruleFields.refetch} />
    ) },
    { key: "actions", header: "", className: "w-20", render: (r) => (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${r.name}`} onClick={() => setDialog({ mode: "edit", target: r })}><Pencil className="h-3.5 w-3.5" /></Button>
        <ConfirmButton onConfirm={async () => {
          try { await api.del(`/api/governance/rules/${r.id}`); toast.success("Rule deleted"); await rules.refetch(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
        }} title={`Delete "${r.name}"?`} description="The rule stops evaluating immediately. Past alerts remain." variant="ghost">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-red-500" aria-label={`Delete ${r.name}`}><Trash2 className="h-3.5 w-3.5" /></span>
        </ConfirmButton>
      </div>
    ) },
  ];

  const alertRows = alerts.data?.alerts ?? [];
  const newAlerts = alertRows.filter((a) => a.status === "NEW").length;

  return (
    <div className="space-y-5">
      <PageHeader
        io="governance-rules"
        title="Governance Center"
        subtitle="Threshold rules watch every project metric — breaches raise alerts, inbox items and escalations automatically."
        breadcrumb={["Home", "Control", "Governance"]}
        actions={
          <>
            {ruleFields.actions}
            {alertFields.actions}
            <Button size="sm" variant="outline" disabled={evaluating} onClick={() => void evaluate()}>
              <Play className="h-4 w-4 mr-1.5" />{evaluating ? "Evaluating…" : "Evaluate now"}
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: "add" })}><Plus className="h-4 w-4 mr-1.5" />New rule</Button>
          </>
        }
      />

      {/* GOVERNANCE FRAMEWORK */}
      <FrameworkSection />

      {/* RULES */}
      <SectionCard title="Threshold rules" description={`${rules.data?.rules.length ?? 0} rules · engine runs on events and on demand`}>
        {rules.loading && !rules.data ? <LoadingBlock label="Loading rules…" /> :
          rules.error && !rules.data ? <ErrorBlock message={rules.error} onRetry={rules.refetch} /> : (
            <DataTable columns={ruleColumns} rows={rules.data?.rules ?? []} keyField="id"
              onRowDoubleClick={(r) => setDialog({ mode: "edit", target: r })}
              emptyTitle="No rules defined" emptyDescription="Create the first threshold rule to start watching your portfolio."
              maxHeight="30rem" />
          )}
      </SectionCard>

      {/* ALERTS */}
      <SectionCard
        title="Alerts"
        description={`${alertRows.length} alerts · ${newAlerts} new`}
        actions={<span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />Governance engine</span>}
      >
        {alerts.loading && !alerts.data ? <LoadingBlock label="Loading alerts…" /> :
          alerts.error && !alerts.data ? <ErrorBlock message={alerts.error} onRetry={alerts.refetch} /> :
            alertRows.length === 0 ? <EmptyState title="No alerts" description="Breaches will appear here the moment a rule trips." /> : (
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1]">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {["Severity", "Alert", "Metric vs threshold", "Project", "Status", "Created"].map((h) => (
                        <th key={h} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                      ))}
                      {/* Field Dictionary: dynamic columns for any field flagged "in table" */}
                      {alertFields.tableColumns.map((a) => (
                        <th key={a.id} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{a.displayLabel || a.field.label}</th>
                      ))}
                      <th className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertRows.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><SeverityDot severity={a.severity} />{a.severity.toLowerCase()}</span></td>
                        <td className="px-3 py-2.5 max-w-64"><p className="font-medium text-slate-800 truncate">{a.title}</p><p className="text-xs text-slate-400 line-clamp-1">{a.message}</p></td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                          {a.metricValue !== null ? `${a.metricValue} vs ${a.threshold}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{a.project?.code ?? "—"}</td>
                        <td className="px-3 py-2.5"><StatusChip status={a.status} /></td>
                        <td className="px-3 py-2.5 text-xs tabular-nums text-slate-400 whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                        {/* Field Dictionary: dynamic columns for any field flagged "in table" */}
                        {alertFields.tableColumns.map((col) => (
                          <td key={col.id} className="px-3 py-2.5">
                            <CustomFieldValueCell assignment={col} value={alertFields.values[a.id]?.[col.field.fieldKey] ?? null} />
                          </td>
                        ))}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {a.status === "NEW" && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void alertAction(a, "ACKNOWLEDGED")}>Acknowledge</Button>}
                            {a.status !== "RESOLVED" && <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => void alertAction(a, "RESOLVED")}>Resolve</Button>}
                            {a.status === "RESOLVED" && <span className="text-xs text-slate-300">closed</span>}
                            <RecordFieldsButton moduleKey="governance_alert" recordId={a.id} label={a.title} onSaved={alertFields.refetch} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </SectionCard>

      {dialog && (
        <RuleDialog mode={dialog.mode} target={dialog.target ?? null} options={options}
          onClose={() => setDialog(null)} onSaved={async () => { await rules.refetch(); }} />
      )}
    </div>
  );
}
