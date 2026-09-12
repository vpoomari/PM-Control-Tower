const fs = require("fs");
const f = "src/views/dashboard.tsx";
let d = fs.readFileSync(f, "utf8");
if (!d.includes("FreshnessRail")) {
  d += `
// ---- Integrity Layer: live data-freshness rail (worst feed dominates) ----
function FreshnessRail() {
  const fresh = useApi<{ projects: { project: { id: string; code: string; name: string }; score: number; level: string; worstFeed: string }[]>("/api/integrity/freshness");
  useRealtimeRefetch(fresh.refetch, ["freshness:changed", "timesheet:approved"]);
  if (fresh.error || !fresh.data) return null;
  const rows = [...fresh.data.projects].sort((a, b) => a.score - b.score).slice(0, 6);
  return (
    <SectionCard title="Data freshness" description="Live staleness per project — the tower flags when figures may not reflect reality" actions={<a href="#/integrity" className="text-xs text-blue-600 hover:underline">Open Integrity Layer</a>}>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.project.id} className="flex items-center gap-3 text-sm">
            <span className="w-28 truncate text-slate-600 font-medium">{r.project.code}</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={"h-full rounded-full " + (r.level === "CRITICAL" ? "bg-red-500" : r.level === "DEGRADE" ? "bg-orange-400" : r.level === "WARN" ? "bg-amber-400" : "bg-emerald-500")} style={{ width: Math.max(4, r.score) + "%" }} />
            </div>
            <span className={"text-xs tabular-nums w-10 text-right " + (r.score < 40 ? "text-red-600 font-semibold" : "text-slate-500")}>{r.score}</span>
            <span className="text-[11px] text-slate-400 w-24 truncate">{r.worstFeed}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
`;
  const anchor = '          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 mt-4">One Platform';
  if (!d.includes(anchor)) throw new Error("anchor missing");
  d = d.replace(anchor, "          <div className=\"mt-6\">\n            <FreshnessRail />\n          </div>\n" + anchor);
}
fs.writeFileSync(f, d);
console.log("rail wired:", d.includes("<FreshnessRail />"));
