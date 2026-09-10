"use client";
// PM CONTROL TOWER — Financial control: portfolio roll-up, project table, budget-line drilldown.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { money, num, BUDGET_CATEGORIES } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Input,
} from "@/components/pmct/kit";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Legend } from "recharts";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";

interface FinProject {
  id: string; code: string; name: string; status: string; currency: string;
  baselineBudget: number; budget: number; actual: number; forecast: number;
  variancePct: number; actualVariancePct: number;
  categoryBreakdown: Record<string, number>;
}
interface FinList {
  projects: FinProject[];
  totals: { budget: number; baselineBudget: number; actual: number; forecast: number; actualVariancePct: number; forecastVariancePct: number; marginVsBudgetPct: number };
  categories: string[];
}
interface FinProjectDetail {
  project: { id: string; code: string; name: string; currency: string; baselineBudget: number; currentBudget: number; actualCost: number; forecastCost: number };
  budget: number;
  totals: { baselineAmount: number; currentAmount: number; actualAmount: number; forecastAmount: number };
  categories: { category: string; lineCount: number; baselineAmount: number; currentAmount: number; actualAmount: number; forecastAmount: number; variancePct: number }[];
  labor: { hours: number; cost: number; costShareOfBudgetPct: number; entriesCounted: number };
  variance: { actualVsBudgetPct: number; forecastVsBudgetPct: number; marginVsBudgetPct: number };
}
interface BudgetLine {
  id: string; projectId: string; category: string; name: string;
  baselineAmount: number; currentAmount: number; actualAmount: number; forecastAmount: number;
  notes: string | null; project: { id: string; code: string; name: string };
}

const CHART_COLORS: Record<string, string> = {
  baselineAmount: "#94a3b8", currentAmount: "#2563eb", actualAmount: "#0ea5e9", forecastAmount: "#f59e0b",
};

export default function FinancialsView() {
  const route = useRoute();
  const portfolios = useApi<{ id: string; code: string; name: string }[]>("/api/portfolios");
  const fin = useApi<FinList>("/api/financials");
  useRealtimeRefetch(fin.refetch, ["actuals:changed", "evm:changed"]);

  const [portfolioId, setPortfolioId] = useState("all");
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // Deep link: #/financials?projectId=… opens the drilldown
  useEffect(() => {
    const qp = route.query.get("projectId");
    if (qp) setDrawerId(qp);
  }, [route.query]);

  const closeDrawer = () => {
    setDrawerId(null);
    if (route.query.get("projectId")) window.location.hash = "/financials";
  };

  // project → portfolio mapping (financials rows do not carry portfolioId)
  const projPortfolio = useApi<{ items: { id: string; portfolioId: string | null }[] }>(portfolios.data ? "/api/projects" : null);
  const pMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    (projPortfolio.data?.items ?? []).forEach((p) => { m[p.id] = p.portfolioId; });
    return m;
  }, [projPortfolio.data]);

  const rows = useMemo(() => {
    const all = fin.data?.projects ?? [];
    if (portfolioId === "all") return all;
    return all.filter((p) => pMap[p.id] === portfolioId || pMap[p.id] === undefined);
  }, [fin.data, portfolioId, pMap]);

  const sums = useMemo(() => {
    return rows.reduce(
      (acc, p) => ({
        baseline: acc.baseline + p.baselineBudget,
        budget: acc.budget + p.budget,
        actual: acc.actual + p.actual,
        forecast: acc.forecast + p.forecast,
      }),
      { baseline: 0, budget: 0, actual: 0, forecast: 0 },
    );
  }, [rows]);
  const forecastVarPct = sums.budget ? num(((sums.forecast - sums.budget) / sums.budget) * 100, 1) : "0";

  // Drawer data
  const detail = useApi<FinProjectDetail>(drawerId ? `/api/financials?projectId=${drawerId}` : null);
  const lines = useApi<{ budgetLines: BudgetLine[]; total: number }>(drawerId ? `/api/financials/budget-lines?projectId=${drawerId}` : null);
  const [addOpen, setAddOpen] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [lineForm, setLineForm] = useState({ category: "LABOR", name: "", baselineAmount: "0", currentAmount: "0", actualAmount: "0", forecastAmount: "0", notes: "" });

  const groupedLines = useMemo(() => {
    const all = lines.data?.budgetLines ?? [];
    const groups: Record<string, BudgetLine[]> = {};
    all.forEach((l) => {
      if (!groups[l.category]) groups[l.category] = [];
      groups[l.category].push(l);
    });
    return BUDGET_CATEGORIES.map((c) => ({ category: c, lines: groups[c] ?? [] })).filter((g) => g.lines.length > 0);
  }, [lines.data]);

  const addLine = async () => {
    if (!drawerId) return;
    if (lineForm.name.trim().length < 2) { toast.error("Line name is required"); return; }
    setSavingLine(true);
    try {
      await api.post("/api/financials/budget-lines", {
        projectId: drawerId,
        category: lineForm.category,
        name: lineForm.name.trim(),
        baselineAmount: Number(lineForm.baselineAmount) || 0,
        currentAmount: Number(lineForm.currentAmount) || 0,
        actualAmount: Number(lineForm.actualAmount) || 0,
        forecastAmount: Number(lineForm.forecastAmount) || 0,
        notes: lineForm.notes || null,
      });
      toast.success("Budget line added");
      setAddOpen(false);
      setLineForm({ category: "LABOR", name: "", baselineAmount: "0", currentAmount: "0", actualAmount: "0", forecastAmount: "0", notes: "" });
      await Promise.all([detail.refetch(), lines.refetch(), fin.refetch()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add budget line");
    } finally {
      setSavingLine(false);
    }
  };

  if (fin.loading && !fin.data) return <LoadingBlock label="Consolidating financials…" />;
  if (fin.error && !fin.data) return <ErrorBlock message={fin.error} onRetry={fin.refetch} />;

  const varianceTone = (v: number) => (v > 0.5 ? "text-red-600" : v < -0.5 ? "text-emerald-600" : "text-slate-600");

  return (
    <div className="space-y-5">
      <PageHeader
        io="budget-lines"
        title="Financials"
        subtitle="Budget vs actual vs forecast across the portfolio — drill into any project's budget lines."
        breadcrumb={["Home", "Control", "Financials"]}
        actions={
          <Select value={portfolioId} onValueChange={setPortfolioId}>
            <SelectTrigger className="bg-white h-9 w-full sm:w-72" aria-label="Portfolio selector">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {(portfolios.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Baseline budget" value={money(sums.baseline)} sub={`${rows.length} projects`} />
        <StatCard label="Current budget" value={money(sums.budget)} sub="Approved changes included" />
        <StatCard label="Actual cost" value={money(sums.actual)} tone="info" sub={`${sums.budget ? num((sums.actual / sums.budget) * 100, 1) : 0}% consumed`} />
        <StatCard label="Forecast (EAC)" value={money(sums.forecast)} tone={sums.forecast > sums.budget ? "bad" : "good"} sub={`at completion`} />
        <StatCard label="Forecast variance" value={
          <span className={varianceTone(Number(forecastVarPct))}>
            {sums.forecast - sums.budget > 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
            {forecastVarPct}%
          </span>
        } sub={`${money(Math.abs(sums.forecast - sums.budget))} ${sums.forecast > sums.budget ? "over" : "under"} budget`} tone={sums.forecast > sums.budget ? "bad" : "good"} />
      </div>

      <SectionCard title="Project financials" description="Click a project for budget-line detail" bodyClass="p-0">
        {rows.length === 0 ? <EmptyState title="No projects in this portfolio" /> : (
          <div className="overflow-auto rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Project", "Status", "Budget", "Actual", "Forecast", "Variance vs budget", "% consumed"].map((h) => (
                    <th key={h} className="text-left font-medium text-slate-500 px-4 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setDrawerId(p.id)} className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-blue-50/40">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.code}</p>
                    </td>
                    <td className="px-4 py-2.5"><StatusChip status={p.status} /></td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{money(p.budget, p.currency)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{money(p.actual, p.currency)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{money(p.forecast, p.currency)}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-medium ${varianceTone(p.variancePct)}`}>
                      {p.variancePct > 0 ? "+" : ""}{num(p.variancePct, 1)}%
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                          <div className={p.budget && p.actual / p.budget > 0.9 ? "h-full bg-red-500 rounded-full" : "h-full bg-blue-500 rounded-full"} style={{ width: `${Math.min(100, p.budget ? (p.actual / p.budget) * 100 : 0)}%` }} />
                        </div>
                        {num(p.budget ? (p.actual / p.budget) * 100 : 0, 1)}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Project drilldown drawer */}
      <Sheet open={Boolean(drawerId)} onOpenChange={(o) => { if (!o) closeDrawer(); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail.data ? `${detail.data.project.code} — ${detail.data.project.name}` : "Project financials"}</SheetTitle>
            <SheetDescription>Budget lines by category with baseline, current, actual and forecast positions.</SheetDescription>
          </SheetHeader>
          {detail.loading && !detail.data ? <LoadingBlock /> : detail.error ? <ErrorBlock message={detail.error} onRetry={detail.refetch} /> : detail.data ? (
            <div className="px-4 pb-8 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([["Baseline", detail.data.totals.baselineAmount], ["Current", detail.data.totals.currentAmount], ["Actual", detail.data.totals.actualAmount], ["Forecast", detail.data.totals.forecastAmount]] as const).map(([label, v]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] uppercase text-slate-400">{label}</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-800">{money(v, detail.data!.project.currency)}</p>
                  </div>
                ))}
              </div>

              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detail.data.categories} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <XAxis dataKey="category" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                    <RTooltip formatter={(v: number | string) => money(Number(v))} />
                    <Legend iconType="circle" iconSize={8} formatter={(v: string) => v.replace("Amount", "")} />
                    <Bar dataKey="baselineAmount" name="Baseline" fill={CHART_COLORS.baselineAmount} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="currentAmount" name="Current" fill={CHART_COLORS.currentAmount} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="actualAmount" name="Actual" fill={CHART_COLORS.actualAmount} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="forecastAmount" name="Forecast" fill={CHART_COLORS.forecastAmount} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Budget lines by category</h4>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add budget line</Button>
              </div>

              {lines.loading && !lines.data ? <LoadingBlock label="Loading lines…" /> : groupedLines.length === 0 ? (
                <EmptyState title="No budget lines yet" description="Add the first budget line for this project." />
              ) : (
                <div className="space-y-4">
                  {groupedLines.map((g) => {
                    const cat = detail.data!.categories.find((c) => c.category === g.category);
                    const lineVar = cat ? cat.forecastAmount - cat.currentAmount : g.lines.reduce((s, l) => s + l.forecastAmount - l.currentAmount, 0);
                    return (
                      <div key={g.category} className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-200">
                          <span className="text-xs font-semibold text-slate-700">{g.category} <span className="text-slate-400 font-normal">· {g.lines.length} line{g.lines.length === 1 ? "" : "s"}</span></span>
                          <span className={`text-xs tabular-nums font-medium ${varianceTone((lineVar / (cat?.currentAmount || 1)) * 100)}`}>
                            var {lineVar >= 0 ? "+" : ""}{money(lineVar, detail.data!.project.currency)}
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400">
                              {["Line", "Baseline", "Current", "Actual", "Forecast"].map((h) => (
                                <th key={h} className="text-left font-medium px-3 py-1.5 uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.lines.map((l) => (
                              <tr key={l.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-700 font-medium">{l.name}</td>
                                <td className="px-3 py-2 tabular-nums text-slate-500">{money(l.baselineAmount)}</td>
                                <td className="px-3 py-2 tabular-nums text-slate-700">{money(l.currentAmount)}</td>
                                <td className="px-3 py-2 tabular-nums text-blue-600">{money(l.actualAmount)}</td>
                                <td className="px-3 py-2 tabular-nums text-amber-600">{money(l.forecastAmount)}</td>
                              </tr>
                            ))}
                            {cat && (
                              <tr className="border-t border-slate-200 bg-slate-50/60">
                                <td className="px-3 py-2 font-semibold text-slate-600">Category total</td>
                                <td className="px-3 py-2 tabular-nums font-semibold text-slate-600">{money(cat.baselineAmount)}</td>
                                <td className="px-3 py-2 tabular-nums font-semibold text-slate-700">{money(cat.currentAmount)}</td>
                                <td className="px-3 py-2 tabular-nums font-semibold text-blue-700">{money(cat.actualAmount)}</td>
                                <td className="px-3 py-2 tabular-nums font-semibold text-amber-700">{money(cat.forecastAmount)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}

              {detail.data.labor.entriesCounted > 0 && (
                <p className="text-xs text-slate-400">
                  Approved timesheet labor: {num(detail.data.labor.hours)}h / {money(detail.data.labor.cost)} ({num(detail.data.labor.costShareOfBudgetPct, 2)}% of budget, {detail.data.labor.entriesCounted} entries counted).
                </p>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Add budget line */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add budget line</DialogTitle>
            <DialogDescription>{detail.data ? `New line on ${detail.data.project.code}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={lineForm.category} onValueChange={(v) => setLineForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{BUDGET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bl-name">Line name *</Label>
              <Input id="bl-name" value={lineForm.name} onChange={(e) => setLineForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Integration services — phase 2" />
            </div>
            {([["baselineAmount", "Baseline"], ["currentAmount", "Current"], ["actualAmount", "Actual"], ["forecastAmount", "Forecast"]] as const).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`bl-${k}`}>{label} amount</Label>
                <Input id={`bl-${k}`} type="number" min={0} value={lineForm[k]} onChange={(e) => setLineForm((p) => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1 col-span-2">
              <Label htmlFor="bl-notes">Notes</Label>
              <Input id="bl-notes" value={lineForm.notes} onChange={(e) => setLineForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional context" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={savingLine} onClick={() => void addLine()}>{savingLine ? "Adding…" : "Add line"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
