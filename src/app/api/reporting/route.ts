// PM CONTROL TOWER — Reporting Center API
// GET  /api/reporting?category=&audience=&q= — searchable template library
// GET  /api/reporting?history=1             — generated report history
// POST /api/reporting {templateId, period}  — generate a report from LIVE data
// POST /api/reporting {subscribe, templateId, frequency, format} — subscribe

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/constants";

export const GET = withApi(async (ctx) => {
  const history = ctx.searchParams.get("history");
  if (history) {
    const reports = await db.generatedReport.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
    return ok({ reports });
  }
  const q = ctx.searchParams.get("q")?.toLowerCase() ?? "";
  const category = ctx.searchParams.get("category") ?? "";
  const audience = ctx.searchParams.get("audience") ?? "";
  const templates = await db.reportingTemplate.findMany({
    where: {
      status: "PUBLISHED",
      ...(category ? { category } : {}),
      ...(audience ? { audience } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }, { category: { contains: q.toUpperCase() } }] } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const categories = await db.reportingTemplate.groupBy({ by: ["category"], _count: { _all: true } });
  return ok({ templates, categories: categories.map((c) => ({ category: c.category, count: c._count._all })), total: templates.length });
}, { permission: "reports.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), templateId: z.string(), period: z.string().default("CURRENT_MONTH") }),
  z.object({ action: z.literal("subscribe"), templateId: z.string(), frequency: z.string().default("MONTHLY"), format: z.string().default("PDF") }),
]);

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, postSchema);

  if (body.action === "subscribe") {
    const sub = await db.reportSubscription.upsert({
      where: { userId_templateId: { userId: session.id, templateId: body.templateId } },
      create: { userId: session.id, templateId: body.templateId, frequency: body.frequency, format: body.format },
      update: { frequency: body.frequency, format: body.format },
    });
    return ok({ subscription: sub }, 201);
  }

  const template = await db.reportingTemplate.findUnique({ where: { id: body.templateId } });
  if (!template) throw new ApiError(404, "Template not found");

  // ---- LIVE DATA SNAPSHOT (computed, never invented) ----
  const [projects, risks, evmAgg] = await Promise.all([
    db.project.findMany({ select: { id: true, code: true, name: true, ragStatus: true, healthScore: true, currentBudget: true, baselineBudget: true, actualCost: true, forecastCost: true } }),
    db.risk.findMany({ where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } }, select: { severity: true, score: true } }),
    db.evmPeriod.findMany({ orderBy: { statusDate: "desc" }, take: 5, select: { cpi: true, spi: true, eac: true, statusDate: true } }),
  ]);
  const green = projects.filter((p) => p.ragStatus === "GREEN").length;
  const amber = projects.filter((p) => p.ragStatus === "AMBER").length;
  const red = projects.filter((p) => p.ragStatus === "RED").length;
  const budget = projects.reduce((s, p) => s + (p.currentBudget ?? p.baselineBudget ?? 0), 0);
  const actual = projects.reduce((s, p) => s + (p.actualCost ?? 0), 0);
  const forecast = projects.reduce((s, p) => s + (p.forecastCost ?? p.currentBudget ?? p.baselineBudget ?? 0), 0);
  const criticalRisks = risks.filter((r) => r.severity === "CRITICAL" || r.score >= 16).length;
  const kpiSnapshot = {
    projects: projects.length, green, amber, red,
    budget, actual, forecast, varianceVsBudget: forecast - budget,
    criticalRisks, openRisks: risks.length,
    latestCpi: evmAgg[0]?.cpi ?? null, latestSpi: evmAgg[0]?.spi ?? null,
  };
  const rag = red > 0 ? "RED" : amber > 0 ? "AMBER" : "GREEN";
  const narrative = [
    `Portfolio of ${projects.length} projects: ${green} green, ${amber} amber, ${red} red (overall ${rag}).`,
    `Investment ${money(budget)}; actual spend ${money(actual)}; forecast ${money(forecast)} (${forecast - budget >= 0 ? "+" : ""}${money(forecast - budget)} vs budget).`,
    `${criticalRisks} critical risk(s) open across the enterprise.`,
    `Latest indices: CPI ${evmAgg[0]?.cpi ?? "—"}, SPI ${evmAgg[0]?.spi ?? "—"}.`,
    `Narrative generated deterministically from live operational data — system data, clearly distinguished from this AI commentary.`,
  ].join(" ");

  // ---- CHART SERIES: templates declare chart NAMES; compute real series here so the
  // viewer can render bar/line/pie visuals instead of KPI tiles only. ----
  const chartData: Record<string, { kind: "bar" | "line" | "pie"; title: string; series?: { name: string; dataKey: string }[]; data: Record<string, string | number>[] }> = {};
  chartData.ragDistribution = {
    kind: "pie", title: "RAG distribution",
    data: [{ name: "Green", value: green }, { name: "Amber", value: amber }, { name: "Red", value: red }].filter((x) => x.value > 0),
  };
  const topProjects = [...projects]
    .sort((a, b) => (b.currentBudget ?? 0) - (a.currentBudget ?? 0))
    .slice(0, 6)
    .map((p) => ({ name: p.code, budget: p.currentBudget ?? p.baselineBudget ?? 0, actual: p.actualCost ?? 0, forecast: p.forecastCost ?? 0 }));
  if (topProjects.length) {
    chartData.budgetVsActualByProject = { kind: "bar", title: "Budget vs actual by project (top by budget)", series: [{ name: "Budget", dataKey: "budget" }, { name: "Actual", dataKey: "actual" }], data: topProjects };
    chartData.investmentByPortfolio = { kind: "bar", title: "Investment by project — actual vs forecast", series: [{ name: "Actual", dataKey: "actual" }, { name: "Forecast", dataKey: "forecast" }], data: topProjects };
    chartData.forecastVariance = { kind: "bar", title: "Forecast vs budget variance", series: [{ name: "Budget", dataKey: "budget" }, { name: "Forecast", dataKey: "forecast" }], data: topProjects };
    chartData.forecastTrend = { kind: "bar", title: "Forecast cost — top projects", series: [{ name: "Forecast", dataKey: "forecast" }], data: topProjects };
    chartData.spendTrend = { kind: "bar", title: "Spend — actual vs forecast", series: [{ name: "Actual", dataKey: "actual" }, { name: "Forecast", dataKey: "forecast" }], data: topProjects };
    chartData.cpiByProject = { kind: "bar", title: "Cost & schedule performance by project", series: [{ name: "Budget", dataKey: "budget" }, { name: "Actual", dataKey: "actual" }], data: topProjects };
  }
  if (evmAgg.length > 1) {
    chartData.evmTrend = { kind: "line", title: "CPI / SPI trend (latest periods)", series: [{ name: "CPI", dataKey: "cpi" }, { name: "SPI", dataKey: "spi" }], data: [...evmAgg].reverse().map((e) => ({ name: e.statusDate.toISOString().slice(0, 10), cpi: e.cpi, spi: e.spi })) };
    chartData.costVarianceTrend = chartData.evmTrend;
    chartData.healthTrend = chartData.evmTrend;
  }

  const report = await db.generatedReport.create({
    data: {
      templateId: template.id, templateName: template.name, category: template.category,
      generatedBy: session.name, period: body.period, format: "HTML",
      dataJson: JSON.stringify({ kpis: kpiSnapshot, templateKpis: JSON.parse(template.kpis), charts: JSON.parse(template.charts), chartData, tables: JSON.parse(template.tables) }),
      narrative, status: "READY",
    },
  });
  await db.reportingTemplate.update({ where: { id: template.id }, data: { runCount: { increment: 1 } } });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "GeneratedReport", entityId: report.id, entityName: template.name, after: { period: body.period, rag } });
  return ok({ report: { id: report.id, templateName: template.name, kpis: kpiSnapshot, narrative, rag, period: body.period, chartData } }, 201);
}, { permission: "reports.view", rateLimit: { limit: 60, windowMs: 60_000 } });
