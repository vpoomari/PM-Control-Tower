const fs = require("fs");
let v = fs.readFileSync("src/views/integrity/integrity.tsx", "utf8");

// --- imports: recharts + RefreshCw already; add realtime refetch + useEffect/interval
v = v.replace('import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";');
v = v.replace('import { api, useApi } from "@/lib/client";', 'import { api, useApi, useRealtimeRefetch } from "@/lib/client";');
v = v.replace(
  'from "lucide-react";',
  'from "lucide-react";\nimport { AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, Cell as BarCell } from "recharts";'
);

// --- hatch style helper (module scope)
v = v.replace(
  "const LEVEL_TONE:",
  `const HATCH = { backgroundImage: "repeating-linear-gradient(45deg, rgba(15,23,42,0.07) 0 6px, transparent 6px 12px)" };
const dayToDate = (startISO: string, day: number) => new Date(new Date(startISO).getTime() + day * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const LEVEL_TONE:`
);

// --- Freshness: config editor state + hatched feed cards
v = v.replace(
  'const fresh = useApi<{ projects: FreshnessRow[] }>(tab === "Freshness" ? "/api/integrity/freshness" : null);',
  `const fresh = useApi<{ projects: FreshnessRow[] }>(tab === "Freshness" ? "/api/integrity/freshness" : null);
  const cfg = useApi<{ freshnessWarn: number; freshnessDegrade: number; freshnessCritical: number; freshnessGraceHours: number }>(tab === "Freshness" ? "/api/integrity/config" : null);
  const [cfgForm, setCfgForm] = useState<{ warn: string; degrade: string; critical: string; grace: string } | null>(null);
  useEffect(() => { if (cfg.data && !cfgForm) setCfgForm({ warn: String(cfg.data.freshnessWarn), degrade: String(cfg.data.freshnessDegrade), critical: String(cfg.data.freshnessCritical), grace: String(cfg.data.freshnessGraceHours) }); }, [cfg.data, cfgForm]);
  const saveCfg = async () => {
    if (!cfgForm) return;
    try {
      await api.post("/api/integrity/config", { freshnessWarn: Number(cfgForm.warn), freshnessDegrade: Number(cfgForm.degrade), freshnessCritical: Number(cfgForm.critical), freshnessGraceHours: Number(cfgForm.grace) });
      toast.success("Freshness thresholds + grace window saved"); cfg.refetch(); fresh.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };`
);
v = v.replace(
  `<p className="text-xs text-slate-400 mt-2">Hatching rule: tiles degrade visually when a feed breaches 1.5× its cadence — staleness is never silent.</p>
            </SectionCard>`,
  `<p className="text-xs text-slate-400 mt-2">Hatching rule: tiles render hatched + translucent when a feed breaches the degrade threshold (past the grace window) — staleness is never silent.</p>
              {canManage && cfgForm && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div><Label>Warn ≥</Label><Input className="w-20 h-8" value={cfgForm.warn} onChange={(e) => setCfgForm({ ...cfgForm, warn: e.target.value })} /></div>
                  <div><Label>Degrade ≥</Label><Input className="w-20 h-8" value={cfgForm.degrade} onChange={(e) => setCfgForm({ ...cfgForm, degrade: e.target.value })} /></div>
                  <div><Label>Critical ≥</Label><Input className="w-20 h-8" value={cfgForm.critical} onChange={(e) => setCfgForm({ ...cfgForm, critical: e.target.value })} /></div>
                  <div><Label>Grace (h)</Label><Input className="w-20 h-8" value={cfgForm.grace} onChange={(e) => setCfgForm({ ...cfgForm, grace: e.target.value })} /></div>
                  <Button size="sm" variant="outline" onClick={() => void saveCfg()}>Save thresholds</Button>
                </div>
              )}
            </SectionCard>`
);
v = v.replace(
  `<div key={f.feed} className={cn("rounded-lg border p-2.5", f.level === "CURRENT" ? "border-slate-200 bg-white" : f.level === "WARN" ? "border-amber-200 bg-amber-50" : f.level === "DEGRADE" ? "border-orange-300 bg-orange-50" : "border-red-300 bg-red-50")}>`,
  `<div key={f.feed} title={f.level === "DEGRADE" || f.level === "CRITICAL" ? f.feed + " last updated " + f.ageDays + " days ago — figures may not reflect reality" : f.feed + " freshness OK"}
                    className={cn("rounded-lg border p-2.5", f.level === "CURRENT" ? "border-slate-200 bg-white" : f.level === "WARN" ? "border-amber-200 bg-amber-50" : f.level === "DEGRADE" ? "border-orange-300 bg-orange-50" : "border-red-300 bg-red-50")}
                    style={(f.level === "DEGRADE" || f.level === "CRITICAL") ? HATCH : undefined}>`
);
// degraded card translucent
v = v.replace(
  `<p className="text-sm font-semibold text-slate-700 tabular-nums">{f.ageDays}d old</p>`,
  `<p className={cn("text-sm font-semibold text-slate-700 tabular-nums", (f.level === "DEGRADE" || f.level === "CRITICAL") && "opacity-70")}>{f.ageDays}d old</p>`
);

fs.writeFileSync("src/views/integrity/integrity.tsx", v);
console.log("part1:", v.includes("HATCH"), v.includes("saveCfg"));
