"use client";
// PM CONTROL TOWER — Governance center: threshold rules engine + alert management.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { fmtDateTime } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, SeverityDot, LoadingBlock, ErrorBlock, EmptyState, DataTable, Column,
  ConfirmButton, Button, Input,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ProjectPicker, useControlProjectOptions, type ProjectOption } from "@/views/control/shared/pickers";
import { Pencil, Plus, Play, Trash2, ShieldCheck } from "lucide-react";

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
  id: string; projectId: string | null; alertType: string; severity: string; title: string;
  message: string; metricValue: number | null; threshold: number | null; status: string;
  source: string; createdAt: string;
  project: { id: string; code: string; name: string } | null;
}

const emptyRule = {
  name: "", description: "", metric: "CPI", operator: "LT", threshold: "0.9", severity: "WARNING",
  scopeType: "GLOBAL", scopeId: "", isActive: true, actionNotify: true, actionInbox: true, actionRecalcHealth: false,
};

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
            <Button size="sm" variant="outline" disabled={evaluating} onClick={() => void evaluate()}>
              <Play className="h-4 w-4 mr-1.5" />{evaluating ? "Evaluating…" : "Evaluate now"}
            </Button>
            <Button size="sm" onClick={() => setDialog({ mode: "add" })}><Plus className="h-4 w-4 mr-1.5" />New rule</Button>
          </>
        }
      />

      {/* RULES */}
      <SectionCard title="Threshold rules" description={`${rules.data?.rules.length ?? 0} rules · engine runs on events and on demand`}>
        {rules.loading && !rules.data ? <LoadingBlock label="Loading rules…" /> :
          rules.error && !rules.data ? <ErrorBlock message={rules.error} onRetry={rules.refetch} /> : (
            <DataTable columns={ruleColumns} rows={rules.data?.rules ?? []} keyField="id"
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
                      {["Severity", "Alert", "Metric vs threshold", "Project", "Status", "Created", "Actions"].map((h) => (
                        <th key={h} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                      ))}
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
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {a.status === "NEW" && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void alertAction(a, "ACKNOWLEDGED")}>Acknowledge</Button>}
                            {a.status !== "RESOLVED" && <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => void alertAction(a, "RESOLVED")}>Resolve</Button>}
                            {a.status === "RESOLVED" && <span className="text-xs text-slate-300">closed</span>}
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
