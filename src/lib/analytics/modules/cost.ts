// PM CONTROL TOWER — Analytics Engine: Budgeting & Cost module (DELIVER pillar).
// 12 reports: CPI dashboard, budget variance, gross margin, EAC, ETC, CapEx/OpEx,
// cash flow, contingency depletion, vendor spend, WBS cost, AP/AR aging,
// revenue forecast accuracy.

import { round2 } from "../../constants";
import { AnalyticsContext } from "../context";
import { RawPayload, BRAND, SERIES_COLORS } from "../types";
import { agingBucket, AGING_BUCKETS, bucketize, mape, ratePct, variancePct } from "../formulas";
import { projectEvm, evmTotals } from "../evm";

// 29. CPI DASHBOARD — cost performance index portfolio + per project.
export function cpiDashboard(ctx: AnalyticsContext): RawPayload {
  const rows = projectEvm(ctx);
  const tot = evmTotals(rows);
  const cpi = tot.ac > 0 ? round2(tot.ev / tot.ac) : 1;
  const bands = bucketize(rows.map((r) => r.cpi), [
    { label: "< 0.90", min: 0, max: 0.9 },
    { label: "0.90–1.00", min: 0.9, max: 1 },
    { label: "≥ 1.00", min: 1 },
  ]);
  return {
    kpis: [
      { label: "Portfolio CPI", value: cpi, format: "ratio", tone: cpi >= 1 ? "good" : cpi >= 0.9 ? "warn" : "bad" },
      { label: "CV", value: tot.costVariance, format: "money", tone: tot.costVariance >= 0 ? "good" : "warn", sub: "EV − AC" },
      { label: "AC", value: tot.ac, format: "money" },
      { label: "EV", value: tot.ev, format: "money" },
    ],
    charts: [
      { kind: "gauge", title: "Portfolio CPI", value: cpi, max: 1.3, goodAt: 1, format: "ratio", sublabel: cpi >= 1 ? "Under budget" : "Over budget" },
      rows.length
        ? { kind: "bar", title: "CPI by project", series: [{ label: "CPI", color: BRAND.blue }], groups: rows.map((r) => ({ label: r.name, values: [r.cpi] })), format: "ratio", yMax: 1.5 }
        : null,
      Object.values(bands).some((v) => v > 0)
        ? { kind: "bar", title: "CPI distribution", series: [{ label: "Projects", color: BRAND.purple }], groups: Object.entries(bands).map(([label, value]) => ({ label, values: [value] })), format: "count" }
        : null,
    ].filter(Boolean) as RawPayload["charts"],
    tables: [],
    notes: ["CPI = EV ÷ AC. If actual costs are unrecorded, AC falls back to Σ task actualCost."],
  };
}

// 30. BUDGET VARIANCE — budget lines baseline vs current vs actual by category.
export function budgetVariance(ctx: AnalyticsContext): RawPayload {
  const byCategory = new Map<string, { baseline: number; current: number; actual: number }>();
  for (const l of ctx.budgetLines) {
    const c = byCategory.get(l.category) ?? { baseline: 0, current: 0, actual: 0 };
    c.baseline += l.baselineAmount; c.current += l.currentAmount; c.actual += l.actualAmount;
    byCategory.set(l.category, c);
  }
  const total = [...byCategory.values()].reduce((s, c) => ({
    baseline: s.baseline + c.baseline, current: s.current + c.current, actual: s.actual + c.actual,
  }), { baseline: 0, current: 0, actual: 0 });
  const varPct = variancePct(total.current, total.baseline);
  const rows = [...byCategory.entries()].map(([category, c]) => ({
    category, baseline: c.baseline, current: c.current, actual: c.actual,
    variance: variancePct(c.current, c.baseline), burn: ratePct(c.actual, c.current),
  })).sort((a, b) => b.current - a.current);
  return {
    kpis: [
      { label: "Baseline budget", value: total.baseline, format: "money" },
      { label: "Current budget", value: total.current, format: "money", sub: `variance ${varPct > 0 ? "+" : ""}${varPct}%` },
      { label: "Actual spend", value: total.actual, format: "money" },
      { label: "Burn rate", value: ratePct(total.actual, total.current), format: "pct", tone: "info" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Baseline vs actual by category", series: [
          { label: "Baseline", color: BRAND.slate },
          { label: "Current", color: BRAND.blue },
          { label: "Actual", color: BRAND.magenta },
        ], groups: rows.map((r) => ({ label: r.category, values: [r.baseline, r.current, r.actual] })), format: "money" }]
      : [],
    tables: rows.length
      ? [{ title: "Variance detail", columns: [
          { key: "category", header: "Category" },
          { key: "baseline", header: "Baseline", format: "money", align: "right" },
          { key: "current", header: "Current", format: "money", align: "right" },
          { key: "actual", header: "Actual", format: "money", align: "right" },
          { key: "variance", header: "Variance", format: "pct", align: "right" },
          { key: "burn", header: "Burn", format: "pct", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Variance = (current − baseline) ÷ baseline. Burn = actual ÷ current."],
    emptyHints: ctx.budgetLines.length === 0
      ? ["No Budget Lines captured yet — define the budget breakdown in Financials (Budget tab) per project."]
      : undefined,
  };
}

// 31. PROJECT GROSS MARGIN — revenue (invoices) vs delivery cost per project.
export function grossMargin(ctx: AnalyticsContext): RawPayload {
  const revenueByProject = new Map<string, number>();
  let unbilledRevenue = 0;
  for (const i of ctx.invoices) {
    if (!["VOID", "CANCELLED"].includes(i.status)) {
      if (i.projectId) revenueByProject.set(i.projectId, (revenueByProject.get(i.projectId) ?? 0) + i.subtotal);
      else unbilledRevenue += i.subtotal;
    }
  }
  const rows = ctx.projects.map((p) => {
    const revenue = revenueByProject.get(p.id) ?? 0;
    const expenses = ctx.expenses.filter((e) => e.projectId === p.id && e.status !== "VOID").reduce((s, e) => s + e.amount, 0);
    const cost = p.actualCost || expenses;
    return { project: p.name, revenue, cost, margin: round2(revenue - cost), marginPct: ratePct(revenue - cost, revenue) };
  }).filter((r) => r.revenue > 0 || r.cost > 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  return {
    kpis: [
      { label: "Revenue", value: revenue, format: "money", sub: "invoiced (ex-tax)" },
      { label: "Delivery cost", value: cost, format: "money" },
      { label: "Gross margin", value: round2(revenue - cost), format: "money", tone: revenue - cost >= 0 ? "good" : "bad" },
      { label: "Margin %", value: ratePct(revenue - cost, revenue), format: "pct", tone: revenue === 0 ? "default" : revenue - cost >= 0 ? "good" : "bad" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Revenue vs cost by project", series: [
          { label: "Revenue", color: BRAND.emerald },
          { label: "Cost", color: BRAND.coral },
        ], groups: rows.map((r) => ({ label: r.project, values: [r.revenue, r.cost] })), format: "money" }]
      : [],
    tables: rows.length
      ? [{ title: "Margin by project", columns: [
          { key: "project", header: "Project" },
          { key: "revenue", header: "Revenue", format: "money", align: "right" },
          { key: "cost", header: "Cost", format: "money", align: "right" },
          { key: "margin", header: "Margin", format: "money", align: "right" },
          { key: "marginPct", header: "Margin %", format: "pct", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: [
      "Margin = invoiced revenue − project actual cost (expenses fallback).",
      unbilledRevenue > 0 ? `${unbilledRevenue.toFixed(0)} invoiced outside project linkage excluded.` : "",
    ].filter(Boolean),
    emptyHints: ctx.invoices.length === 0
      ? ["No Invoices captured yet — revenue is recorded in Finance → Invoicing; margin appears once invoices and costs exist."]
      : undefined,
  };
}

// 32. EAC FORECAST — estimate at completion + VAC per project.
export function eacForecast(ctx: AnalyticsContext): RawPayload {
  const rows = projectEvm(ctx);
  const tot = evmTotals(rows);
  const eac = tot.ac > 0 ? round2(tot.bac > 0 ? tot.bac / (tot.ev / (tot.ac || 1) || 1) : 0) : tot.bac;
  const vac = round2(tot.bac - eac);
  return {
    kpis: [
      { label: "BAC", value: tot.bac, format: "money" },
      { label: "EAC (portfolio)", value: tot.eac || eac, format: "money", tone: vac >= 0 ? "good" : "bad" },
      { label: "VAC", value: tot.vac || vac, format: "money", tone: (tot.vac || vac) >= 0 ? "good" : "bad", sub: "BAC − EAC" },
      { label: "EAC / BAC", value: tot.bac > 0 ? round2((tot.eac || eac) / tot.bac) : 1, format: "ratio", tone: "info" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "BAC vs EAC by project", series: [
          { label: "BAC", color: BRAND.slate },
          { label: "EAC", color: BRAND.orange },
        ], groups: rows.map((r) => ({ label: r.name, values: [r.bac, r.eac] })), format: "money" }]
      : [],
    tables: rows.length
      ? [{ title: "Forecast detail", columns: [
          { key: "project", header: "Project" },
          { key: "bac", header: "BAC", format: "money", align: "right" },
          { key: "ac", header: "AC", format: "money", align: "right" },
          { key: "eac", header: "EAC", format: "money", align: "right" },
          { key: "vac", header: "VAC", format: "money", align: "right" },
          { key: "tcpi", header: "TCPI", format: "ratio", align: "right" },
        ], rows: rows.map((r) => ({ project: r.name, bac: r.bac, ac: r.ac, eac: r.eac, vac: r.vac, tcpi: r.tcpi })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["EAC = BAC ÷ CPI per project (stored EvmPeriod when captured, else live compute). TCPI = efficiency still needed to finish at BAC."],
  };
}

// 33. ETC REPORT — estimate to complete + burn outlook.
export function etcReport(ctx: AnalyticsContext): RawPayload {
  const rows = projectEvm(ctx);
  const totalEtc = rows.reduce((s, r) => s + r.etc, 0);
  const totalAc = rows.reduce((s, r) => s + r.ac, 0);
  const spentPct = ratePct(totalAc, totalAc + totalEtc);
  return {
    kpis: [
      { label: "ETC", value: totalEtc, format: "money", sub: "to finish remaining work" },
      { label: "Spent to date", value: totalAc, format: "money" },
      { label: "Spent share", value: spentPct, format: "pct", tone: spentPct > 90 ? "warn" : "info" },
      { label: "Projects with ETC > 0", value: rows.filter((r) => r.etc > 0).length, format: "count" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "ETC by project", series: [{ label: "ETC", color: BRAND.blue }], groups: rows.map((r) => ({ label: r.name, values: [r.etc] })), format: "money" }]
      : [],
    tables: [],
    notes: ["ETC = EAC − AC from each project's latest EVM state."],
  };
}

// 34. CAPEX VS OPEX — capital vs operating split from business cases + expenses.
export function capexOpex(ctx: AnalyticsContext): RawPayload {
  let capex = 0, opex = 0, caseCount = 0;
  for (const bc of ctx.businessCases) {
    caseCount += 1;
    const items = (json: string): number => {
      try {
        const arr = JSON.parse(json || "[]") as { amount?: number; annualAmount?: number }[];
        return arr.reduce((s, i) => s + (i.amount ?? i.annualAmount ?? 0), 0);
      } catch { return 0; }
    };
    capex += items(bc.capexItemsJson);
    opex += items(bc.opexItemsJson);
  }
  // Expense fallback: CAPEX/OPEX inferred by category keyword until Finance tags are used.
  const capexCats = /capital|equipment|asset|software licence|license/i;
  let expCapex = 0, expOpex = 0;
  for (const e of ctx.expenses) {
    if (e.status === "VOID") continue;
    if (capexCats.test(e.category)) expCapex += e.amount; else expOpex += e.amount;
  }
  const capexTotal = capex + expCapex, opexTotal = opex + expOpex;
  return {
    kpis: [
      { label: "CapEx", value: capexTotal, format: "money", sub: capex > 0 ? "business cases" : "expense inferred" },
      { label: "OpEx", value: opexTotal, format: "money" },
      { label: "CapEx share", value: ratePct(capexTotal, capexTotal + opexTotal), format: "pct", tone: "info" },
      { label: "Cases analyzed", value: caseCount, format: "count" },
    ],
    charts: capexTotal + opexTotal > 0
      ? [{ kind: "donut", title: "CapEx vs OpEx", centerLabel: "Spend", slices: [
          { label: "CapEx", value: capexTotal, color: BRAND.blue },
          { label: "OpEx", value: opexTotal, color: BRAND.purple },
        ].filter((s) => s.value > 0) }]
      : [],
    tables: [],
    notes: ["CapEx/OpEx from business-case item arrays; expenses categorized by keyword when no case exists."],
    emptyHints: capexTotal + opexTotal === 0
      ? ["No CapEx/OpEx captured — create a Business Case (Plan → Feasibility) with CapEx/OpEx items, or log expenses in Finance."]
      : undefined,
  };
}

// 35. CASH FLOW FORECAST — monthly forecast outflow from budgets + forecasts + ETC.
export function cashFlowForecast(ctx: AnalyticsContext): RawPayload {
  const byMonth = new Map<string, number>();
  const add = (iso: Date | string, amount: number) => {
    const k = new Date(iso).toISOString().slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + amount);
  };
  for (const l of ctx.budgetLines) if (l.period) add(l.period, l.forecastAmount || l.currentAmount);
  for (const f of ctx.forecasts) if (f.period) add(f.period, f.forecastCost);
  const rows = projectEvm(ctx);
  const etc = rows.reduce((s, r) => s + r.etc, 0);
  const months = [...byMonth.entries()].sort().map(([label, value]) => ({ label, value: round2(value) }));
  const next90 = months.filter((m) => m.label >= ctx.now.toISOString().slice(0, 7) && m.label <= new Date(ctx.now.getTime() + 90 * 86_400_000).toISOString().slice(0, 7)).reduce((s, m) => s + m.value, 0);
  const arDue = ctx.invoices.filter((i) => !["PAID", "VOID"].includes(i.status) && i.dueDate).reduce((s, i) => s + i.total, 0);
  return {
    kpis: [
      { label: "Forecast outflow (90d)", value: next90, format: "money" },
      { label: "ETC (unspent)", value: etc, format: "money", sub: "across projects" },
      { label: "Receivables due", value: arDue, format: "money", tone: arDue > 0 ? "info" : "default" },
      { label: "Forecast points", value: months.length, format: "count" },
    ],
    charts: months.length > 1
      ? [{ kind: "area", title: "Forecast outflow by month", points: months, color: BRAND.blue, format: "money" }]
      : [],
    tables: [],
    notes: ["Monthly buckets from budget-line periods and project forecast periods; ETC shown as unspent runway."],
    emptyHints: months.length === 0
      ? ["No forecast periods captured — add budget-line periods (Financials) or project forecasts (Cost control) to build the cash-flow curve."]
      : undefined,
  };
}

// 36. CONTINGENCY RESERVE DEPLETION — contingency line burn.
export function contingencyDepletion(ctx: AnalyticsContext): RawPayload {
  const lines = ctx.budgetLines.filter((l) => /contingenc/i.test(l.category) || /contingenc/i.test(l.name));
  const baseline = lines.reduce((s, l) => s + l.baselineAmount, 0);
  const actual = lines.reduce((s, l) => s + l.actualAmount, 0);
  const current = lines.reduce((s, l) => s + l.currentAmount, baseline);
  const depletion = ratePct(actual, current || baseline);
  const rows = lines.map((l) => ({ line: l.name, category: l.category, baseline: l.baselineAmount, actual: l.actualAmount, burn: ratePct(l.actualAmount, l.baselineAmount) }));
  return {
    kpis: [
      { label: "Reserve baseline", value: baseline, format: "money" },
      { label: "Consumed", value: actual, format: "money" },
      { label: "Remaining", value: round2(Math.max(0, (current || baseline) - actual)), format: "money", tone: depletion > 80 ? "bad" : depletion > 50 ? "warn" : "good" },
      { label: "Depletion", value: depletion, format: "pct", tone: depletion > 80 ? "bad" : depletion > 50 ? "warn" : "good" },
    ],
    charts: depletion > 0
      ? [{ kind: "gauge", title: "Reserve depletion", value: depletion, max: 100, goodAt: 40, format: "pct", sublabel: depletion > 80 ? "Critically low" : depletion > 50 ? "Watch closely" : "Healthy" }]
      : [],
    tables: rows.length
      ? [{ title: "Contingency lines", columns: [
          { key: "line", header: "Line" },
          { key: "category", header: "Category" },
          { key: "baseline", header: "Baseline", format: "money", align: "right" },
          { key: "actual", header: "Consumed", format: "money", align: "right" },
          { key: "burn", header: "Burn", format: "pct", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: ["Contingency lines matched by category/name containing 'contingency'."],
    emptyHints: lines.length === 0
      ? ["No contingency budget line captured — add a CONTINGENCY line in Financials (Budget tab) to track reserve burn."]
      : undefined,
  };
}

// 37. VENDOR SPEND ANALYTICS — spend by vendor from expenses + budget lines.
export function vendorSpend(ctx: AnalyticsContext): RawPayload {
  const byVendor = new Map<string, number>();
  for (const e of ctx.expenses) {
    if (e.status === "VOID" || !e.vendorName) continue;
    byVendor.set(e.vendorName, (byVendor.get(e.vendorName) ?? 0) + e.amount);
  }
  const vendorById = new Map(ctx.vendors.map((v) => [v.id, v.name]));
  for (const l of ctx.budgetLines) {
    if (!l.vendorId) continue;
    const name = vendorById.get(l.vendorId) ?? `Vendor ${l.vendorId.slice(0, 6)}`;
    byVendor.set(name, (byVendor.get(name) ?? 0) + (l.actualAmount || l.currentAmount));
  }
  const rows = [...byVendor.entries()].map(([vendor, spend]) => ({ vendor, spend })).sort((a, b) => b.spend - a.spend);
  const total = rows.reduce((s, r) => s + r.spend, 0);
  return {
    kpis: [
      { label: "Vendor spend", value: total, format: "money" },
      { label: "Vendors paid", value: rows.length, format: "count" },
      { label: "Top vendor share", value: ratePct(rows[0]?.spend ?? 0, total), format: "pct", tone: "info", sub: rows[0]?.vendor ?? "—" },
      { label: "Avg per vendor", value: rows.length ? round2(total / rows.length) : 0, format: "money" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Spend by vendor", series: [{ label: "Spend", color: BRAND.orange }], groups: rows.slice(0, 10).map((r) => ({ label: r.vendor, values: [r.spend] })), format: "money" }]
      : [],
    tables: rows.length > 1
      ? [{ title: "Vendor detail", columns: [
          { key: "vendor", header: "Vendor" },
          { key: "spend", header: "Spend", format: "money", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[], maxRows: 20 }]
      : [],
    notes: ["Spend = expenses tagged with a vendor name + budget-line actuals linked to a vendor."],
    emptyHints: rows.length === 0
      ? ["No vendor spend captured — log expenses with a vendor name (Finance → Expenses) and/or link budget lines to vendors."]
      : undefined,
  };
}

// 38. WBS COST ANALYTICS — planned vs actual cost by WBS control account.
export function wbsCostAnalytics(ctx: AnalyticsContext): RawPayload {
  const roots = ctx.wbsNodes.filter((n) => n.level <= 1);
  const rows = roots.map((n) => ({
    wbs: n.code, name: n.name, planned: n.plannedCost, actual: n.actualCost,
    variance: variancePct(n.actualCost, n.plannedCost), progress: n.progress,
  })).sort((a, b) => b.planned - a.planned);
  const planned = rows.reduce((s, r) => s + r.planned, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const overBudget = rows.filter((r) => r.planned > 0 && r.actual > r.planned).length;
  return {
    kpis: [
      { label: "Planned (WBS)", value: planned, format: "money" },
      { label: "Actual (WBS)", value: actual, format: "money" },
      { label: "Cost variance", value: variancePct(actual, planned), format: "pct", tone: actual <= planned ? "good" : "warn" },
      { label: "Accounts over budget", value: overBudget, format: "count", tone: overBudget > 0 ? "warn" : "good" },
    ],
    charts: rows.length
      ? [{ kind: "bar", title: "Planned vs actual by control account", series: [
          { label: "Planned", color: BRAND.slate },
          { label: "Actual", color: BRAND.magenta },
        ], groups: rows.slice(0, 12).map((r) => ({ label: r.wbs, values: [r.planned, r.actual] })), format: "money" }]
      : [],
    tables: rows.length
      ? [{ title: "Control accounts", columns: [
          { key: "wbs", header: "WBS" },
          { key: "name", header: "Name" },
          { key: "planned", header: "Planned", format: "money", align: "right" },
          { key: "actual", header: "Actual", format: "money", align: "right" },
          { key: "variance", header: "Variance", format: "pct", align: "right" },
        ], rows: rows as unknown as Record<string, string | number | null>[], maxRows: 30 }]
      : [],
    notes: ["Level-1 WBS nodes treated as control accounts (WBSNode plannedCost/actualCost)."],
    emptyHints: ctx.wbsNodes.length === 0
      ? ["No WBS captured yet — the WBS is built in Plan → WBS (or arrives with the schedule import); cost per node needs planned/actual cost fields."]
      : undefined,
  };
}

// 39. AP/AR AGING — receivables by invoice age bucket + payables (unpaid expenses).
export function apArAging(ctx: AnalyticsContext): RawPayload {
  const receivables = ctx.invoices.filter((i) => !["PAID", "VOID", "CANCELLED"].includes(i.status));
  const payables = ctx.expenses.filter((e) => !["PAID", "VOID", "SETTLED"].includes(e.status));
  const nowMs = ctx.now.getTime();
  const arBuckets = bucketize(receivables.map((i) => Math.max(0, (nowMs - new Date(i.dueDate ?? i.issueDate ?? nowMs).getTime()) / 86_400_000)), AGING_BUCKETS.map((b) => ({
    label: b,
    min: b === "0-7" ? 0 : b === "8-14" ? 8 : b === "15-30" ? 15 : b === "31-60" ? 31 : 61,
    max: b === "0-7" ? 8 : b === "8-14" ? 15 : b === "15-30" ? 31 : b === "31-60" ? 61 : undefined,
  })));
  const arTotal = receivables.reduce((s, i) => s + i.total, 0);
  const apTotal = payables.reduce((s, e) => s + e.amount, 0);
  const overdueAr = receivables.filter((i) => i.dueDate && new Date(i.dueDate).getTime() < nowMs).reduce((s, i) => s + i.total, 0);
  return {
    kpis: [
      { label: "AR outstanding", value: arTotal, format: "money", sub: `${receivables.length} invoice(s)` },
      { label: "AR overdue", value: overdueAr, format: "money", tone: overdueAr > 0 ? "bad" : "good" },
      { label: "AP pending", value: apTotal, format: "money", sub: `${payables.length} expense(s)` },
      { label: "Net position", value: round2(arTotal - apTotal), format: "money", tone: arTotal - apTotal >= 0 ? "good" : "warn" },
    ],
    charts: [
      receivables.length
        ? { kind: "bar", title: "AR aging (days past due)", series: [{ label: "Invoices", color: BRAND.cyan }], groups: Object.entries(arBuckets).map(([label, value]) => ({ label, values: [value] })), format: "count" }
        : null,
      arTotal + apTotal > 0
        ? { kind: "donut", title: "Receivables vs payables", centerLabel: "Open", slices: [
            { label: "Receivable", value: arTotal, color: BRAND.emerald },
            { label: "Payable", value: apTotal, color: BRAND.coral },
          ].filter((s) => s.value > 0) }
        : null,
    ].filter(Boolean) as RawPayload["charts"],
    tables: receivables.length
      ? [{ title: "Open invoices", columns: [
          { key: "number", header: "Invoice" },
          { key: "due", header: "Due" },
          { key: "total", header: "Amount", format: "money", align: "right" },
          { key: "age", header: "Age (d)", format: "days", align: "right" },
          { key: "status", header: "Status" },
        ], rows: receivables.map((i) => ({
          number: i.number, due: i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : "—",
          total: i.total,
          age: Math.max(0, Math.round((nowMs - new Date(i.dueDate ?? i.issueDate ?? nowMs).getTime()) / 86_400_000)),
          status: i.status,
        })) as unknown as Record<string, string | number | null>[] }]
      : [],
    notes: [
      "AR = unpaid invoices bucketed by days past due; AP = expenses not yet paid (Expense has no AP register yet).",
      `Bucket of oldest open item: ${receivables.length ? agingBucket(Math.max(0, (nowMs - new Date(receivables[0].dueDate ?? ctx.now).getTime()) / 86_400_000)) : "—"}.`,
    ],
    emptyHints: receivables.length === 0 && payables.length === 0
      ? ["No invoices or expenses captured yet — record revenue in Finance → Invoicing and spend in Finance → Expenses."]
      : undefined,
  };
}

// 40. REVENUE FORECAST ACCURACY — forecast vs actual (MAPE) per project/period.
export function revenueForecastAccuracy(ctx: AnalyticsContext): RawPayload {
  const actualByProject = new Map<string, number>();
  for (const i of ctx.invoices) {
    if (i.projectId && !["VOID", "CANCELLED"].includes(i.status)) actualByProject.set(i.projectId, (actualByProject.get(i.projectId) ?? 0) + i.subtotal);
  }
  const pairs = ctx.forecasts
    .filter((f) => actualByProject.has(f.projectId))
    .map((f) => ({ project: ctx.projects.find((p) => p.id === f.projectId)?.name ?? f.projectId, period: f.period, forecast: f.forecastCost, actual: actualByProject.get(f.projectId)! }))
    .filter((p, i, arr) => arr.findIndex((x) => x.project === p.project && x.period === p.period) === i);
  const accuracy = mape(pairs.map((p) => ({ forecast: p.forecast, actual: p.actual })));
  const forecastTotal = pairs.reduce((s, p) => s + p.forecast, 0);
  const actualTotal = pairs.reduce((s, p) => s + p.actual, 0);
  const bias = ratePct(forecastTotal - actualTotal, actualTotal);
  return {
    kpis: [
      { label: "MAPE", value: accuracy ?? 0, format: "pct", tone: accuracy === null ? "default" : accuracy <= 10 ? "good" : accuracy <= 20 ? "warn" : "bad", sub: accuracy === null ? "needs forecast + actual pairs" : "forecast error" },
      { label: "Forecast total", value: forecastTotal, format: "money" },
      { label: "Actual total", value: actualTotal, format: "money" },
      { label: "Bias", value: bias, format: "pct", tone: Math.abs(bias) <= 10 ? "good" : "warn", sub: "over/under-forecast" },
    ],
    charts: pairs.length
      ? [{ kind: "bar", title: "Forecast vs actual", series: [
          { label: "Forecast", color: BRAND.slate },
          { label: "Actual", color: BRAND.emerald },
        ], groups: pairs.map((p) => ({ label: `${p.project} ${p.period}`, values: [p.forecast, p.actual] })), format: "money" }]
      : [],
    tables: [],
    notes: ["MAPE = mean(|forecast − actual| ÷ actual) across forecast periods that have invoiced revenue."],
    emptyHints: pairs.length === 0
      ? ["Needs ProjectForecasts and Invoices for the same projects — capture forecasts in Cost control and revenue in Finance."]
      : undefined,
  };
}
