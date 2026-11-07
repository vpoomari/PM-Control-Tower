"use client";
// PM CONTROL TOWER — Enterprise Reporting Center (v1.6.0)
// Library (177 searchable templates) · Generated reports · Subscriptions · History.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { money, num } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Badge, Input, LiveBadge, cn,
} from "@/components/pmct/kit";
import { Label } from "@/components/ui/label";
import { BookOpen, Save, Trash2, Play, Star, Clock, FileBarChart, Mail } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Tpl { id: string; code: string; name: string; description: string; category: string; audience: string; kpis: string; charts: string; tables: string; frequency: string; runCount: number }
interface LibraryData { templates: Tpl[]; categories: { category: string; count: number }[]; total: number }
interface GenReport { id: string; templateName: string; category: string; generatedBy: string; period: string; createdAt: string; narrative: string | null; dataJson: string }

/** Chart series computed at generation time (reporting API chartData). */
type ChartSpec = { kind: "bar" | "line" | "pie"; title: string; series?: { name: string; dataKey: string }[]; data: Record<string, string | number>[] };
const PIE_COLORS = ["#059669", "#d97706", "#dc2626", "#2563eb", "#64748b", "#0e7490"];

function ReportChart({ spec }: { spec: ChartSpec }) {
  if (!spec?.data?.length) return null;
  const tip = { fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" };
  if (spec.kind === "pie") {
    return (
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-600 mb-1">{spec.title}</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={spec.data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={74} paddingAngle={3} strokeWidth={0}>
                {spec.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tip} />
              <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span className="text-xs text-slate-600">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  const axis = { tick: { fontSize: 10, fill: "#64748b" }, axisLine: false, tickLine: false };
  const grid = <CartesianGrid stroke="#e2e8f0" vertical={false} />;
  const isLine = spec.kind === "line";
  const Cmp = isLine ? LineChart : BarChart;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-600 mb-1">{spec.title}</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <Cmp data={spec.data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            {grid}
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} width={44} />
            <Tooltip contentStyle={tip} />
            <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span className="text-xs text-slate-600">{v}</span>} />
            {(spec.series ?? [{ name: "Value", dataKey: "value" }]).map((s, i) =>
              isLine
                ? <Line key={s.dataKey} name={s.name} dataKey={s.dataKey} type="monotone" stroke={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} />
                : <Bar key={s.dataKey} name={s.name} dataKey={s.dataKey} fill={PIE_COLORS[i % PIE_COLORS.length]} radius={[3, 3, 0, 0]} />,
            )}
          </Cmp>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const SECTIONS = ["Library", "My Reports", "Report Builder", "Board Packs", "Scheduled", "Subscriptions", "History", "Administration"] as const;

export default function ReportingCenterView() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Library");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [period, setPeriod] = useState("CURRENT_MONTH");
  const [lastReport, setLastReport] = useState<{ id?: string; templateName: string; kpis: Record<string, unknown>; narrative: string; rag: string; chartData?: Record<string, ChartSpec> } | null>(null);
  const [viewReport, setViewReport] = useState<{ id: string; templateName: string; period: string; generatedBy: string; createdAt: string; narrative: string | null; data: { kpis: Record<string, unknown>; chartData?: Record<string, ChartSpec> } } | null>(null);
  const openReport = async (id: string) => {
    try { setViewReport(await api.get("/api/reporting/" + id)); } catch (e) { toast.error(e instanceof Error ? e.message : "Open failed"); }
  };
  const [busy, setBusy] = useState(false);
  const [newComponents, setNewComponents] = useState<{ type: string; title: string; dataSource?: string }[]>([]);
  const [newRptName, setNewRptName] = useState("");
  const [favs, setFavs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return JSON.parse(window.localStorage.getItem("pmct.report.favs") || "[]");
  });

  const query = `/api/reporting?${q ? `q=${encodeURIComponent(q)}&` : ""}${cat ? `category=${cat}&` : ""}`;
  const lib = useApi<LibraryData>(query);
  const history = useApi<{ reports: GenReport[] }>(section === "History" || section === "My Reports" || section === "Administration" ? "/api/reporting?history=1" : null);
  const packData = useApi<{ packs: { id: string; name: string; createdAt: string; pages: { title: string }[] }[] }>("/api/reporting/boardpacks");
  const customRpts = useApi<{ customReports: { id: string; name: string; category: string; componentsJson: string }[] }>("/api/reporting/custom");
  const subsData = useApi<{ subscriptions: { id: string; templateId: string; frequency: string; format: string }[]; templates: { id: string; name: string; category: string }[] }>("/api/reporting/subs");
  const schedData = useApi<{ schedules: { id: string; templateId: string; frequency: string; active: boolean; lastRunAt: string | null }[] }>("/api/reporting/boardpacks");
  // Live: history refreshes whenever a report is generated elsewhere in the org.
  useRealtimeRefetch(history.refetch, ["report:generated"]);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    window.localStorage.setItem("pmct.report.favs", JSON.stringify(next));
  };

  // Narrowed locals — TS can't follow subsData.data / lib.data property accesses
  // through the map/filter callbacks in the Subscriptions & Administration blocks.
  const subs = subsData.data;
  const libStats = lib.data;

  const generate = async (tpl: Tpl) => {
    setBusy(true);
    try {
      const res = await api.post<{ report: { id: string; templateName: string; kpis: Record<string, unknown>; narrative: string; rag: string; period: string; chartData?: Record<string, ChartSpec> } }>("/api/reporting", { action: "generate", templateId: tpl.id, period });
      setLastReport(res.report);
      setViewReport({ id: res.report.id || "", templateName: res.report.templateName, period: res.report.period || period, generatedBy: "", createdAt: new Date().toISOString(), narrative: res.report.narrative, data: { kpis: res.report.kpis, chartData: res.report.chartData } });
      toast.success(`${tpl.name} generated from live data`);
      history.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); } finally { setBusy(false); }
  };

  const shown = useMemo(() => lib.data?.templates ?? [], [lib.data]);

  const saveCustomReport = async () => {
    if (!newRptName.trim() || newComponents.length === 0) { toast.error("Name and at least one component required"); return; }
    setBusy(true);
    try {
      await api.post("/api/reporting/custom", { name: newRptName.trim(), components: newComponents });
      toast.success("Custom report created"); setNewRptName(""); setNewComponents([]); customRpts.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setBusy(false); }
  };
  const deleteCustom = async (id: string) => {
    try { await api.del("/api/reporting/custom?id=" + id); toast.success("Deleted"); customRpts.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };
  const subscribe = async (templateId: string) => {
    try { await api.post("/api/reporting/subs", { templateId }); toast.success("Subscribed"); subsData.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Subscribe failed"); }
  };
  const unsubscribe = async (id: string) => {
    try { await api.del("/api/reporting/subs?id=" + id); toast.success("Unsubscribed"); subsData.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        io="reports"
        title="Reporting Center"
        subtitle="177 enterprise report templates across 7 categories — every report computed from live operational data."
        breadcrumb={["Home", "Intelligence", "Reporting Center"]}
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-500 shrink-0">Period</Label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700"
            >
              <option value="CURRENT_MONTH">Current month</option>
              <option value="CURRENT_QUARTER">Current quarter</option>
              <option value="CURRENT_YEAR">Current year</option>
              <option value="LAST_30_DAYS">Last 30 days</option>
              <option value="LAST_90_DAYS">Last 90 days</option>
              <option value="YEAR_TO_DATE">Year to date</option>
            </select>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <button key={s} onClick={() => setSection(s)}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
              section === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
            {s}
          </button>
        ))}
      </div>

      {viewReport && (
        <SectionCard title={`Report — ${viewReport.templateName}`} description={`Period: ${viewReport.period.replace(/_/g, " ").toLowerCase()} · computed from live operational data`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open("/api/reporting/" + viewReport.id + "?format=html", "_blank")}>
                <FileBarChart className="h-3.5 w-3.5 mr-1" />Print / Save PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setViewReport(null)}>Close</Button>
            </div>
          }>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
            {Object.entries(viewReport.data.kpis).slice(0, 12).map(([k, val]) => (
              <div key={k} className="rounded-md border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase text-slate-400 truncate">{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{typeof val === "number" ? (val > 1000 ? money(val) : num(val, 2)) : String(val ?? "—")}</p>
              </div>
            ))}
          </div>
          {viewReport.data.chartData && Object.keys(viewReport.data.chartData).length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 mb-3">
              {Object.entries(viewReport.data.chartData).slice(0, 6).map(([key, spec]) => (
                <ReportChart key={key} spec={spec} />
              ))}
            </div>
          )}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-[10px] uppercase text-slate-400 mb-1">Executive commentary — from actual report data</p>
            <p className="text-sm text-slate-700">{viewReport.narrative}</p>
          </div>
        </SectionCard>
      )}

      {/* LIBRARY */}
      {section === "Library" && (
        !lib.data ? <LoadingBlock label="Loading template library…" /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Templates" value={177} sub="7 categories · all audiences" />
              <StatCard label="Executive" value={lib.data.categories.find((c) => c.category === "EXECUTIVE")?.count ?? 0} sub="CEO/board" />
              <StatCard label="Finance" value={lib.data.categories.find((c) => c.category === "FINANCE")?.count ?? 0} sub="CFO" />
              <StatCard label="PMO" value={lib.data.categories.find((c) => c.category === "PMO")?.count ?? 0} sub="governance" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Input className="h-9 w-full sm:w-72 bg-white" placeholder="Search reports — 'budget', 'risk', 'CEO'…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setCat("")} className={cn("px-2.5 py-1 rounded-md text-xs font-medium border", cat === "" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}>All</button>
                {lib.data.categories.map((c) => (
                  <button key={c.category} onClick={() => setCat(c.category)} className={cn("px-2.5 py-1 rounded-md text-xs font-medium border", cat === c.category ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}>
                    {c.category} ({c.count})
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? <EmptyState title="No templates match" description="Adjust search or category." /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {shown.slice(0, 60).map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm flex flex-col">
                    <div className="flex items-start gap-2">
                      <FileBarChart className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="font-medium text-slate-800 text-sm leading-snug flex-1">{t.name}</p>
                      <button onClick={() => toggleFav(t.id)} aria-label="Favorite">
                        <Star className={cn("h-4 w-4", favs.includes(t.id) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 flex-1">{t.description}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <Badge variant="outline" className="border-slate-200 text-slate-500">{t.category}</Badge>
                      <Badge variant="outline" className="border-slate-200 text-slate-500">{t.audience}</Badge>
                      <Badge variant="outline" className="border-slate-200 text-slate-400">{t.frequency.toLowerCase()}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Button size="sm" disabled={busy} onClick={() => void generate(t)}><Play className="h-3.5 w-3.5 mr-1" />Generate</Button>
                      <span className="text-[11px] text-slate-400">{t.runCount} run{t.runCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {shown.length > 60 && <p className="text-xs text-slate-400 text-center">Showing 60 of {shown.length} — refine the search to narrow.</p>}
          </div>
        )
      )}

      {/* MY REPORTS / HISTORY */}
      {(section === "My Reports" || section === "History") && (
        !history.data ? <LoadingBlock /> : (
          <SectionCard title={section === "History" ? "Report history" : "My generated reports"} description="Every generation is recorded with period, generator and narrative.">
            {history.data.reports.length === 0 ? <EmptyState title="No reports generated yet" description="Generate one from the Library." /> : (
              <div className="space-y-2">
                {history.data.reports.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 flex-1">{r.templateName}</p>
                      <Badge variant="outline" className="border-slate-200 text-slate-500">{r.category}</Badge>
                      <span className="text-xs text-slate-400">{r.period.replace(/_/g, " ").toLowerCase()} · {new Date(r.createdAt).toLocaleString("en-US")} · by {r.generatedBy}</span>
                      <Button size="sm" variant="outline" onClick={() => void openReport(r.id)}>Open</Button>
                      <Button size="sm" variant="ghost" onClick={() => window.open("/api/reporting/" + r.id + "?format=html", "_blank")}>Print / PDF</Button>
                    </div>
                    {r.narrative && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{r.narrative}</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )
      )}

      {/* LAST GENERATED — live result panel */}
      {lastReport && (
        <SectionCard title={`Last generated — ${lastReport.templateName}`} description="Computed from live operational data just now" actions={<StatusChip status={lastReport.rag} />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
            {Object.entries(lastReport.kpis).slice(0, 12).map(([k, v]) => (
              <div key={k} className="rounded-md border border-slate-200 p-2.5">
                <p className="text-[10px] uppercase text-slate-400 truncate">{k}</p>
                <p className="text-sm font-semibold text-slate-800 tabular-nums">{typeof v === "number" ? (v > 1000 ? money(v) : num(v, 2)) : String(v ?? "—")}</p>
              </div>
            ))}
          </div>
          {lastReport.chartData && Object.keys(lastReport.chartData).length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 mb-3">
              {Object.entries(lastReport.chartData).slice(0, 6).map(([key, spec]) => (
                <ReportChart key={key} spec={spec} />
              ))}
            </div>
          )}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-[10px] uppercase text-slate-400 mb-1">AI Executive Commentary — from actual report data</p>
            <p className="text-sm text-slate-700">{lastReport.narrative}</p>
          </div>
        </SectionCard>
      )}

      {/* OTHER SECTIONS — honest status */}
      {section === "Board Packs" && (
        !packData.data ? <LoadingBlock /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Packs" value={packData.data.packs.length} />
            </div>
            {packData.data.packs.length === 0 ? <EmptyState title="No board packs yet" description="Generate reports first, then combine them into a pack." /> : (
              <div className="space-y-2">
                {packData.data.packs.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 flex-1">{p.name}</p>
                      <span className="text-xs text-slate-400">{p.pages.length} pages · {new Date(p.createdAt).toLocaleDateString("en-US")}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{p.pages.map((pg) => pg.title).join(" → ")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
      {section === "Scheduled" && (
        !schedData.data ? <LoadingBlock /> : (
          <SectionCard title="Scheduled reports" description="Recurring report generation and delivery">
            {schedData.data.schedules.length === 0 ? <EmptyState title="No scheduled reports" /> : (
              <div className="space-y-1.5">
                {schedData.data.schedules.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="flex-1 font-medium text-slate-700">{s.templateId.slice(0,8)}…</span>
                    <Badge variant="outline" className="border-slate-200 text-slate-500">{s.frequency}</Badge>
                    <StatusChip status={s.active ? "ACTIVE" : "PAUSED"} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )
      )}
            {section === "Report Builder" && (
        <div className="space-y-4">
          <SectionCard title="Report Builder — create custom reports" description="Add components to build your report. Each component pulls from live operational data.">
            <div className="space-y-3 mb-4">
              <div className="space-y-1"><Label>Report name *</Label><Input className="h-9 w-64" value={newRptName} onChange={(e) => setNewRptName(e.target.value)} placeholder="My Custom Report" /></div>
              <div className="space-y-2">
                {newComponents.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm rounded-md border border-slate-200 px-3 py-2">
                    <Badge variant="outline" className="border-blue-200 text-blue-700">{c.type}</Badge>
                    <span className="flex-1 text-slate-700">{c.title}</span>
                    <Button variant="ghost" size="sm" onClick={() => setNewComponents(newComponents.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["kpi", "bar", "line", "pie", "table", "text", "rag", "waterfall"].map((type) => (
                  <Button key={type} size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => setNewComponents([...newComponents, { type, title: type.toUpperCase() + " component" }])}>
                    + {type}
                  </Button>
                ))}
              </div>
              <Button disabled={busy || !newRptName.trim() || newComponents.length === 0} onClick={() => void saveCustomReport()}>
                <Save className="h-4 w-4 mr-1.5" />Save custom report
              </Button>
            </div>
          </SectionCard>
          {customRpts.data && customRpts.data.customReports.length > 0 && (
            <SectionCard title="My custom reports" description="Reports you created with the builder">
              <div className="space-y-1.5">
                {customRpts.data.customReports.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <span className="flex-1 font-medium text-slate-700">{c.name}</span>
                    <Badge variant="outline" className="border-slate-200 text-slate-500">{c.category}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => void deleteCustom(c.id)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* SUBSCRIPTIONS */}
      {section === "Subscriptions" && (
        !subs ? <LoadingBlock label="Loading subscriptions…" /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="My subscriptions" value={subs.subscriptions.length} sub="Reports delivered on a schedule" icon={<Mail className="h-4 w-4" />} />
              <StatCard label="Available templates" value={subs.templates.length} sub="Subscribe to any published template" />
            </div>
            <SectionCard title="My subscriptions" description="Reports generated and delivered automatically at the chosen frequency.">
              {subs.subscriptions.length === 0 ? (
                <EmptyState title="No subscriptions yet" description="Subscribe to a template below to receive it on a schedule." />
              ) : (
                <div className="space-y-1.5">
                  {subs.subscriptions.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="flex-1 font-medium text-slate-700">
                        {subs.templates.find((t) => t.id === s.templateId)?.name ?? s.templateId.slice(0, 8) + "…"}
                      </span>
                      <Badge variant="outline" className="border-slate-200 text-slate-500">{s.frequency}</Badge>
                      <Badge variant="outline" className="border-slate-200 text-slate-500">{s.format}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => void unsubscribe(s.id)} title="Unsubscribe">
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Subscribe to a report" description="Pick any published template to receive on a recurring basis.">
              {subs.templates.filter((t) => !subs.subscriptions.some((s) => s.templateId === t.id)).length === 0 ? (
                <EmptyState title="All available templates are subscribed" />
              ) : (
                <div className="grid gap-1.5 md:grid-cols-2">
                  {subs.templates
                    .filter((t) => !subs.subscriptions.some((s) => s.templateId === t.id))
                    .slice(0, 40)
                    .map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-slate-700 truncate">{t.name}</span>
                          <span className="block text-xs text-slate-400">{t.category}</span>
                        </span>
                        <Button size="sm" variant="outline" onClick={() => void subscribe(t.id)}>Subscribe</Button>
                      </div>
                    ))}
                </div>
              )}
            </SectionCard>
          </div>
        )
      )}

      {/* ADMINISTRATION */}
      {section === "Administration" && (
        !libStats ? <LoadingBlock label="Loading library stats…" /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Published templates" value={libStats.total} sub="Across all categories" icon={<BookOpen className="h-4 w-4" />} />
              <StatCard label="Categories" value={libStats.categories.length} sub="Executive · Finance · PMO · …" />
              <StatCard label="Generated reports" value={history.data?.reports.length ?? 0} sub="Last 30 generations" />
              <StatCard label="Custom reports" value={customRpts.data?.customReports.length ?? 0} sub="Created in the builder" />
            </div>
            <SectionCard title="Template distribution" description="Published templates by category — the governed catalogue behind every generated report.">
              <div className="space-y-2">
                {libStats.categories.map((c) => (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="w-28 text-xs font-semibold text-slate-600 shrink-0">{c.category}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.round((c.count / Math.max(1, libStats.total)) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-xs tabular-nums text-slate-500">{c.count} ({Math.round((c.count / Math.max(1, libStats.total)) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Governance" description="Reporting administration facts.">
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                <li>All templates are PUBLISHED and versioned — draft templates never render.</li>
                <li>Every generation is recorded in History with generator, period and narrative.</li>
                <li>Chart series and KPIs are computed from live operational data at generation time.</li>
                <li>Subscriptions deliver at the template&apos;s configured frequency; unsubscribe anytime.</li>
              </ul>
            </SectionCard>
          </div>
        )
      )}
    </div>
  );
}
