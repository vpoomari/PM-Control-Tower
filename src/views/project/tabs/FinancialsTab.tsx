"use client";
// PM CONTROL TOWER — Workspace Financials tab: budget lines by category, variance, stacked bars
// Budget lines are editable in place: double-click a row (requires financial.manage).

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatCard, Button, cn } from "@/components/pmct/kit";
import { money, num, pct, BUDGET_CATEGORIES } from "@/lib/constants";
import { useMe, hasPerm } from "@/views/execute/shared/pickers";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Legend, CartesianGrid,
} from "recharts";
import { Wallet, Receipt, TrendingUp, Scale, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface FinCategory {
  category: string;
  lineCount: number;
  baselineAmount: number;
  currentAmount: number;
  actualAmount: number;
  forecastAmount: number;
  variancePct: number;
}
interface FinBundle {
  budget: number;
  totals: { baselineAmount: number; currentAmount: number; actualAmount: number; forecastAmount: number };
  categories: FinCategory[];
  project: { baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number; currency: string };
}
interface BudgetLine {
  id: string; category: string; name: string;
  baselineAmount: number; currentAmount: number; actualAmount: number; forecastAmount: number; notes: string | null;
}
interface LinesBundle { budgetLines: BudgetLine[]; total: number }

interface LineForm { category: string; name: string; baselineAmount: string; currentAmount: string; actualAmount: string; forecastAmount: string }

const SERIES = [
  { key: "baselineAmount", label: "Baseline", color: "#94a3b8" },
  { key: "currentAmount", label: "Current", color: "#2563eb" },
  { key: "actualAmount", label: "Actual", color: "#0ea5e9" },
  { key: "forecastAmount", label: "Forecast", color: "#f59e0b" },
] as const;

export default function FinancialsTab({ projectId }: { projectId: string }) {
  const me = useMe();
  const canManage = hasPerm(me, "financial.manage");
  const fin = useApi<FinBundle>(`/api/financials?projectId=${projectId}`);
  const lines = useApi<LinesBundle>(`/api/financials/budget-lines?projectId=${projectId}`);

  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [form, setForm] = useState<LineForm>({ category: "LABOR", name: "", baselineAmount: "0", currentAmount: "0", actualAmount: "0", forecastAmount: "0" });
  const [saving, setSaving] = useState(false);

  const openEdit = (l: BudgetLine) => {
    if (!canManage) { toast.error("Editing budget lines requires the “financial.manage” permission."); return; }
    setEditing(l);
    setForm({
      category: l.category, name: l.name,
      baselineAmount: String(l.baselineAmount), currentAmount: String(l.currentAmount),
      actualAmount: String(l.actualAmount), forecastAmount: String(l.forecastAmount),
    });
  };

  const saveLine = async () => {
    if (!editing) return;
    if (form.name.trim().length < 2) { toast.error("Line name is required"); return; }
    const nums = [form.baselineAmount, form.currentAmount, form.actualAmount, form.forecastAmount].map(Number);
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) { toast.error("Amounts must be non-zero-or-positive numbers"); return; }
    setSaving(true);
    try {
      await api.patch(`/api/financials/budget-lines/${editing.id}`, {
        category: form.category, name: form.name.trim(),
        baselineAmount: nums[0], currentAmount: nums[1], actualAmount: nums[2], forecastAmount: nums[3],
      });
      toast.success(`Budget line “${form.name.trim()}” updated`);
      setEditing(null);
      await Promise.all([lines.refetch(), fin.refetch()]);
    } catch (e) {
      toast.error("Could not update the budget line", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  if (fin.loading) return <LoadingBlock label="Loading financials…" />;
  if (fin.error || !fin.data) return <ErrorBlock message={fin.error || "Financials unavailable"} onRetry={fin.refetch} />;

  const d = fin.data;
  const cats = d.categories || [];
  const chartData = cats.map((c) => ({
    category: c.category,
    Baseline: c.baselineAmount,
    Current: c.currentAmount,
    Actual: c.actualAmount,
    Forecast: c.forecastAmount,
  }));
  const t = d.totals;
  const costVar = t.forecastAmount - t.currentAmount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Baseline Budget" value={money(d.project.baselineBudget)} sub="Approved at activation" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Current Budget" value={money(d.project.currentBudget)} sub={`${num(d.budget ? (t.currentAmount / d.budget) * 100 : 0, 1)}% in lines`} icon={<Scale className="h-4 w-4" />} />
        <StatCard label="Actual Cost" value={money(d.project.actualCost)} sub={`${num(d.project.currentBudget ? (d.project.actualCost / d.project.currentBudget) * 100 : 0, 1)}% consumed`} tone={d.project.actualCost > d.project.currentBudget ? "bad" : "default"} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Forecast EAC" value={money(d.project.forecastCost)} sub={costVar > 0 ? `${money(costVar)} over budget` : `${money(-costVar)} under budget`} tone={costVar > 0 ? "bad" : "good"} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Category breakdown" description="Stacked budget composition per category">
          {chartData.length === 0 ? <p className="text-sm text-slate-400 py-10 text-center">No budget lines recorded.</p> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <RTooltip formatter={(v: number | string) => money(Number(v))} labelFormatter={(l) => String(l)} />
                  <Legend iconType="circle" iconSize={8} />
                  {SERIES.map((s) => (
                    <Bar key={s.key} dataKey={s.label} stackId="a" fill={s.color} radius={s === SERIES[SERIES.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Budget lines by category" description={`${lines.data?.total ?? 0} lines · baseline / current / actual / forecast${canManage ? " · double-click a row to edit" : ""}`}>
          {lines.loading ? <LoadingBlock label="Loading budget lines…" /> : lines.error ? <ErrorBlock message={lines.error} onRetry={lines.refetch} /> : (
            <div className="rounded-lg border border-slate-200 overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[1]">
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium text-right">Baseline</th>
                    <th className="px-3 py-2 font-medium text-right">Current</th>
                    <th className="px-3 py-2 font-medium text-right">Actual</th>
                    <th className="px-3 py-2 font-medium text-right">Forecast</th>
                  </tr>
                </thead>
                <tbody>
                  {(lines.data?.budgetLines || []).map((l) => (
                    <tr
                      key={l.id}
                      onDoubleClick={() => openEdit(l)}
                      title={canManage ? "Double-click to edit" : "View only — editing requires financial.manage"}
                      className={cn("border-b border-slate-100 last:border-0 hover:bg-blue-50/40", canManage && "cursor-pointer")}
                    >
                      <td className="px-3 py-2 text-xs font-medium text-slate-600">{l.category}</td>
                      <td className="px-3 py-2 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          {l.name}
                          {canManage && <Pencil className="h-3 w-3 text-slate-300" aria-hidden="true" />}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-500">{money(l.baselineAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-blue-700">{money(l.currentAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-sky-700">{money(l.actualAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-amber-700">{money(l.forecastAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Category variance" description="Forecast vs current budget per category">
        <div className="rounded-lg border border-slate-200 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium text-right">Lines</th>
                <th className="px-3 py-2.5 font-medium text-right">Baseline</th>
                <th className="px-3 py-2.5 font-medium text-right">Current</th>
                <th className="px-3 py-2.5 font-medium text-right">Actual</th>
                <th className="px-3 py-2.5 font-medium text-right">Forecast</th>
                <th className="px-3 py-2.5 font-medium text-right">Variance %</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                  <td className="px-3 py-2.5 font-medium text-slate-700">{c.category}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{c.lineCount}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(c.baselineAmount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(c.currentAmount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(c.actualAmount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(c.forecastAmount)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${c.variancePct > 0 ? "text-red-600" : "text-emerald-600"}`}>{pct(c.variancePct)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                <td className="px-3 py-2.5 text-slate-800">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{cats.reduce((a, c) => a + c.lineCount, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.baselineAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.currentAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.actualAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.forecastAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {pct(t.currentAmount ? ((t.forecastAmount - t.currentAmount) / t.currentAmount) * 100 : 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Double-click edit dialog for a budget line */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit budget line{editing ? ` — ${editing.name}` : ""}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUDGET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Line name</Label>
                  <Input className="h-9 mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["baselineAmount", "currentAmount", "actualAmount", "forecastAmount"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-xs text-slate-600 capitalize">{k.replace("Amount", " amount")}</Label>
                    <Input
                      type="number" min={0} step="0.01" className="h-9 mt-1 tabular-nums"
                      value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">Changes recalculate category variance immediately; EVM/health figures refresh on the next actuals event. Updates are audited.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveLine} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
