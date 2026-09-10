"use client";
// PM CONTROL TOWER — CONNECT · Control Automations (rules, executions, run-now)

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, StatCard, DataTable, Column, StatusChip, Button, Badge, Input,
  LoadingBlock, ErrorBlock, EmptyState, cn,
} from "@/components/pmct/kit";
import { Drawer, DrawerSection, KV } from "./shared/drawer";
import { AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS, toJson, fromJson, fmtDateTime } from "@/lib/constants";
import {
  Workflow, Play, Plus, RefreshCw, Pencil, Trash2, Zap, CheckCircle2, XCircle, MinusCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

interface AutomationExecution {
  id: string; ruleId: string; status: string; triggeredBy: string; entityType: string;
  entityId: string; inputJson: string | null; outputJson: string | null;
  error: string | null; durationMs: number; attempts: number; createdAt: string;
}
interface AutomationRule {
  id: string; name: string; description: string | null; triggerType: string;
  conditionsJson: string | null; actionsJson: string | null; isActive: boolean;
  priority: number; executionCount: number; failureCount: number; lastRunAt: string | null;
  createdAt: string; updatedAt: string; executions: AutomationExecution[];
}

interface Condition { field: string; op: string; value: string }
interface ActionSel { type: string; title: string; message: string }

const OPS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "CONTAINS", "EXISTS"];
const PARAM_ACTIONS = new Set(["NOTIFY_USER", "NOTIFY_PM", "NOTIFY_ROLE", "CREATE_ALERT", "CREATE_NOTIFICATION", "CREATE_INBOX_ITEM"]);

function outputSummary(ex: AutomationExecution): string {
  if (ex.error) return ex.error;
  const parsed = fromJson<Record<string, unknown> | null>(ex.outputJson, null);
  if (!parsed) return "—";
  try { return JSON.stringify(parsed); } catch { return "—"; }
}

export default function AutomationsView() {
  const list = useApi<{ rules: AutomationRule[]; history: AutomationExecution[] }>("/api/automations");
  useRealtimeRefetch(list.refetch, ["automation:executed"]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [creating, setCreating] = useState(false);

  const rules = list.data?.rules ?? [];
  const history = list.data?.history ?? [];

  const runNow = async (r: AutomationRule) => {
    setRunningId(r.id);
    try {
      const res = await api.post<{ ruleId: string; executions: AutomationExecution[] }>(`/api/automations/${r.id}/run`);
      const exs = res.executions ?? [];
      const counts = exs.reduce<Record<string, number>>((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {});
      const summary = Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(", ") || "no executions";
      if (counts.FAILED) toast.error(`Rule "${r.name}" ran with failures`, { description: summary });
      else toast.success(`Rule "${r.name}" executed`, { description: summary });
      list.refetch();
    } catch (e) {
      toast.error("Could not run rule", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setRunningId(null); }
  };

  const toggleActive = async (r: AutomationRule, next: boolean) => {
    try {
      await api.patch(`/api/automations/${r.id}`, { isActive: next });
      toast.success(`Rule "${r.name}" ${next ? "activated" : "paused"}`);
      list.refetch();
    } catch (e) {
      toast.error("Could not update rule", { description: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  const removeRule = async (r: AutomationRule) => {
    try {
      await api.del(`/api/automations/${r.id}`);
      toast.success(`Rule "${r.name}" deleted`);
      list.refetch();
    } catch (e) {
      toast.error("Could not delete rule", { description: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  const successRuns = history.filter((h) => h.status === "SUCCESS").length;
  const failedRuns = history.filter((h) => h.status === "FAILED").length;
  const activeRules = rules.filter((r) => r.isActive).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Control Automations"
        breadcrumb={["Connect", "Automations"]}
        subtitle="Event-driven rules that watch the delivery engine and act automatically — escalations, recalculations, notifications and governance evaluation."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={list.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1.5" /> New rule</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Rules" value={rules.length} sub={`${activeRules} active`} icon={<Workflow className="h-4 w-4" />} />
        <StatCard label="Executions (recent)" value={history.length} tone="info" icon={<Zap className="h-4 w-4" />} />
        <StatCard label="Successful" value={successRuns} tone="good" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Failed" value={failedRuns} tone={failedRuns ? "bad" : "default"} icon={<XCircle className="h-4 w-4" />} />
      </div>

      {list.loading && !list.data ? <LoadingBlock label="Loading automation rules…" />
        : list.error ? <ErrorBlock message={list.error} onRetry={list.refetch} />
        : rules.length === 0 ? <EmptyState title="No automation rules" description="Create your first rule to automate escalations and recalculations." />
        : (
        <SectionCard title="Automation rules" description="Click a row to inspect actions and recent executions">
          <DataTable<AutomationRule & Record<string, unknown>>
            keyField="id"
            rows={rules as (AutomationRule & Record<string, unknown>)[]}
            onRowClick={(r) => setDetailId(r.id)}
            maxHeight="480px"
            columns={[
              { key: "name", header: "Rule", render: (r) => (
                <div className="min-w-[220px]">
                  <p className="font-medium text-slate-800">{r.name}</p>
                  {r.description && <p className="text-xs text-slate-500 truncate max-w-md">{r.description}</p>}
                </div>
              ) },
              { key: "triggerType", header: "Trigger", render: (r) => <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-normal">{r.triggerType}</Badge> },
              { key: "isActive", header: "Status", render: (r) => (
                <Switch checked={r.isActive} onCheckedChange={(v) => toggleActive(r, v)} aria-label={`Toggle ${r.name}`} />
              ) },
              { key: "executionCount", header: "Executions", className: "tabular-nums", render: (r) => (
                <span>{r.executionCount}{r.failureCount > 0 && <span className="text-red-600 ml-1.5 text-xs">({r.failureCount} failed)</span>}</span>
              ) },
              { key: "lastRunAt", header: "Last run", render: (r) => <span className="tabular-nums text-slate-500">{r.lastRunAt ? fmtDateTime(r.lastRunAt) : "never"}</span> },
              { key: "actions", header: "", render: (r) => (
                <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runNow(r)} disabled={runningId === r.id || !r.isActive} title={!r.isActive ? "Activate the rule to run it" : "Run this rule now"}>
                    {runningId === r.id ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />} Run now
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}><Pencil className="h-3.5 w-3.5 text-slate-500" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (window.confirm(`Delete rule "${r.name}"? This cannot be undone.`)) removeRule(r); }} aria-label={`Delete ${r.name}`}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                </div>
              ) },
            ] as Column<AutomationRule & Record<string, unknown>>[]}
          />
        </SectionCard>
      )}

      <RuleDetailDrawer
        rule={rules.find((r) => r.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
      <RuleFormDialog
        open={creating || editing !== null}
        rule={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { list.refetch(); }}
      />
    </div>
  );
}

// ---------- detail drawer ----------
function RuleDetailDrawer({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  if (!rule) return null;
  const conditions = fromJson<Array<{ field: string; op: string; value: unknown }>>(rule.conditionsJson, []);
  const actions = fromJson<Array<{ type: string; params?: Record<string, unknown> }>>(rule.actionsJson, []);
  return (
    <Drawer open={rule !== null} onOpenChange={(v) => { if (!v) onClose(); }} title={rule.name} description={`Trigger: ${rule.triggerType}`} wide>
      <DrawerSection title="Rule definition">
        {rule.description && <p className="text-xs text-slate-600 mb-3">{rule.description}</p>}
        <KV label="Trigger"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-normal">{rule.triggerType}</Badge></KV>
        <KV label="Priority">{rule.priority}</KV>
        <KV label="Status"><StatusChip status={rule.isActive ? "ACTIVE" : "PAUSED"} /></KV>
        <KV label="Executions">{rule.executionCount} ({rule.failureCount} failed)</KV>
        <KV label="Last run">{rule.lastRunAt ? fmtDateTime(rule.lastRunAt) : "never"}</KV>
      </DrawerSection>

      <DrawerSection title="Conditions">
        {conditions.length === 0 ? <p className="text-xs text-slate-400">No conditions — fires on every trigger event.</p> : conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs rounded-md bg-slate-50 border border-slate-100 px-2.5 py-1.5 mb-1.5 font-mono">
            <span className="font-semibold text-slate-700">{c.field}</span>
            <span className="text-blue-600">{c.op}</span>
            <span className="text-slate-700">{c.op === "EXISTS" ? "" : String(c.value ?? "")}</span>
          </div>
        ))}
      </DrawerSection>

      <DrawerSection title="Actions">
        {actions.map((a, i) => (
          <div key={i} className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 mb-1.5">
            <p className="text-xs font-semibold text-slate-700">{a.type.replace(/_/g, " ")}</p>
            {a.params && Object.keys(a.params).length > 0 && (
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 break-all">{toJson(a.params)}</p>
            )}
          </div>
        ))}
      </DrawerSection>

      <DrawerSection title="Recent executions">
        {rule.executions.length === 0 ? <p className="text-xs text-slate-400">No executions recorded.</p> : rule.executions.map((ex) => (
          <ExecutionRow key={ex.id} ex={ex} />
        ))}
      </DrawerSection>
    </Drawer>
  );
}

function ExecutionRow({ ex }: { ex: AutomationExecution }) {
  const Icon = ex.status === "SUCCESS" ? CheckCircle2 : ex.status === "FAILED" ? XCircle : MinusCircle;
  const color = ex.status === "SUCCESS" ? "text-emerald-600" : ex.status === "FAILED" ? "text-red-600" : "text-slate-400";
  return (
    <div className="rounded-md border border-slate-100 px-3 py-2 mb-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", color)}>
          <Icon className="h-3.5 w-3.5" /> {ex.status}
        </span>
        <span className="text-[10px] text-slate-400 tabular-nums">{fmtDateTime(ex.createdAt)} · {ex.durationMs}ms · attempt {ex.attempts}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-1 break-all">
        <span className="text-slate-400">{ex.triggeredBy} on {ex.entityType}</span>
        {outputSummary(ex) !== "—" && <> · {outputSummary(ex)}</>}
      </p>
    </div>
  );
}

// ---------- create / edit dialog ----------
function RuleFormDialog({ open, rule, onClose, onSaved }: {
  open: boolean; rule: AutomationRule | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [trigger, setTrigger] = useState<string>(rule?.triggerType ?? "MANUAL");
  const [conditions, setConditions] = useState<Condition[]>([{ field: "severity", op: "EQ", value: "CRITICAL" }]);
  const [selectedActions, setSelectedActions] = useState<ActionSel[]>([]);
  const [priority, setPriority] = useState(5);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState("");

  // Re-seed the form when switching between create/edit targets
  const formKey = rule?.id ?? "new";
  if (open && key !== formKey) {
    setKey(formKey);
    setName(rule?.name ?? "");
    setDescription(rule?.description ?? "");
    setTrigger(rule?.triggerType ?? "MANUAL");
    const conds = fromJson<Array<{ field: string; op: string; value: unknown }>>(rule?.conditionsJson ?? null, []);
    setConditions(conds.length ? conds.map((c) => ({ field: c.field, op: c.op, value: c.op === "EXISTS" ? "" : String(c.value ?? "") })) : [{ field: "severity", op: "EQ", value: "CRITICAL" }]);
    const acts = fromJson<Array<{ type: string; params?: Record<string, unknown> }>>(rule?.actionsJson ?? null, []);
    setSelectedActions(acts.map((a) => ({
      type: a.type,
      title: String(a.params?.title ?? ""),
      message: String(a.params?.message ?? ""),
    })));
    setPriority(rule?.priority ?? 5);
  }

  const toggleAction = (t: string, checked: boolean) => {
    setSelectedActions((prev) => checked
      ? [...prev, { type: t, title: "", message: "" }]
      : prev.filter((a) => a.type !== t));
  };
  const patchAction = (t: string, patch: Partial<ActionSel>) => {
    setSelectedActions((prev) => prev.map((a) => (a.type === t ? { ...a, ...patch } : a)));
  };

  const submit = async () => {
    if (name.trim().length < 2) { toast.error("Rule name is required (2+ characters)"); return; }
    if (selectedActions.length === 0) { toast.error("Select at least one action"); return; }
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      triggerType: trigger,
      conditions: conditions
        .filter((c) => c.field.trim())
        .map((c) => (c.op === "EXISTS" ? { field: c.field.trim(), op: c.op } : { field: c.field.trim(), op: c.op, value: c.value })),
      actions: selectedActions.map((a) => {
        const params: Record<string, string> = {};
        if (a.title.trim()) params.title = a.title.trim();
        if (a.message.trim()) params.message = a.message.trim();
        return PARAM_ACTIONS.has(a.type) && Object.keys(params).length ? { type: a.type, params } : { type: a.type };
      }),
      priority,
    };
    setSaving(true);
    try {
      if (rule) {
        await api.patch(`/api/automations/${rule.id}`, payload);
        toast.success("Rule updated");
      } else {
        await api.post("/api/automations", payload);
        toast.success("Automation rule created", { description: "It is active immediately and will fire on the next matching event." });
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(rule ? "Could not update rule" : "Could not create rule", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit automation rule" : "New automation rule"}</DialogTitle>
          <DialogDescription>
            WHEN the trigger fires AND all conditions match, THEN run the selected actions. Conditions and actions are validated by the automation engine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Rule name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" placeholder="e.g. Escalate critical issues to PMO" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Trigger</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1" placeholder="What does this rule automate?" />
          </div>

          {/* Conditions builder */}
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-slate-700">Conditions (all must match)</Label>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConditions((c) => [...c, { field: "", op: "EQ", value: "" }])}>
                <Plus className="h-3 w-3 mr-1" /> Add condition
              </Button>
            </div>
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <Input value={c.field} onChange={(e) => setConditions((arr) => arr.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} placeholder="field e.g. severity" className="h-8 flex-1 text-xs" />
                <Select value={c.op} onValueChange={(v) => setConditions((arr) => arr.map((x, j) => (j === i ? { ...x, op: v } : x)))}>
                  <SelectTrigger className="h-8 w-24 bg-white text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={c.value} onChange={(e) => setConditions((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder={c.op === "EXISTS" ? "—" : "value"} disabled={c.op === "EXISTS"} className="h-8 flex-1 text-xs" />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setConditions((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove condition">
                  <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </div>
            ))}
            <p className="text-[10px] text-slate-400">Leave zero conditions to fire on every trigger event. Operators: EQ, NEQ, GT, GTE, LT, LTE, CONTAINS, EXISTS.</p>
          </div>

          {/* Actions multi-check */}
          <div className="rounded-lg border border-slate-200 p-3">
            <Label className="text-xs font-semibold text-slate-700">Actions (at least one)</Label>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {AUTOMATION_ACTIONS.map((t) => {
                const sel = selectedActions.find((a) => a.type === t);
                return (
                  <div key={t} className={cn("rounded-md border px-2.5 py-2 transition-colors", sel ? "border-blue-300 bg-blue-50/50" : "border-slate-200 bg-slate-50/60")}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={Boolean(sel)} onCheckedChange={(v) => toggleAction(t, v === true)} />
                      <span className="text-xs font-medium text-slate-700">{t.replace(/_/g, " ")}</span>
                    </label>
                    {sel && PARAM_ACTIONS.has(t) && (
                      <div className="mt-1.5 space-y-1.5">
                        <Input value={sel.title} onChange={(e) => patchAction(t, { title: e.target.value })} placeholder="title (optional)" className="h-7 text-xs" />
                        <Input value={sel.message} onChange={(e) => patchAction(t, { message: e.target.value })} placeholder="message (optional)" className="h-7 text-xs" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sm:w-40">
            <Label className="text-xs text-slate-600">Priority (1–10)</Label>
            <Input type="number" min={1} max={10} value={priority} onChange={(e) => setPriority(Math.max(1, Math.min(10, Number(e.target.value) || 5)))} className="mt-1 h-9" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : rule ? "Save changes" : "Create rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
