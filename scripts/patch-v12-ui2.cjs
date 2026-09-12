const fs = require("fs");
let v = fs.readFileSync("src/views/integrity/integrity.tsx", "utf8");

// --- Simulations: async run() with polling + dates + fan chart
const oldRun = `  const run = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const res = await api.post<SimResult>("/api/integrity/simulate", { projectId: effProjectId, iterations: 1000 });
      setSim(res); toast.success(\`Simulation complete — P50 day \${res.finish.p50}, P80 day \${res.finish.p80}\`);
      runs.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Simulation failed"); } finally { setBusy(false); }
  };`;
const newRun = `  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const run = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const res = await api.post<{ runId: string; status: string }>("/api/integrity/simulate", { projectId: effProjectId, iterations: 1000 });
      toast.success("Simulation queued — the async worker will complete it shortly");
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const r = await api.get<{ runs: SimRun[] }>(\`/api/integrity/simulate?projectId=\${effProjectId}\`);
        runs.refetch();
        const done = r.runs.find((x) => x.id === res.runId);
        if (done && done.status === "COMPLETE" && done.result) {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
          setSim({ runId: done.id, seed: done.result.seed ?? done.seed, iterations: done.result.iterations ?? done.iterations, prng: done.result.prng ?? "mulberry32", deterministicFinishDay: done.result.deterministicFinishDay, finish: done.result.finish, cost: done.result.cost, criticality: done.result.criticality ?? {}, milestones: done.result.milestones ?? {}, projectName: "", projectCode: "", projectStart: done.result.projectStart });
          toast.success(\`Simulation complete — P50 \${done.result.finish.p50}, P80 \${done.result.finish.p80}\`);
        }
        if (done && done.status === "FAILED") { if (pollRef.current) clearInterval(pollRef.current); setBusy(false); toast.error("Simulation failed: " + (done.result as unknown as string) ); }
      }, 2000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Queueing failed"); setBusy(false); }
  };`;
if (!v.includes(oldRun)) throw new Error("run() anchor missing");
v = v.replace(oldRun, newRun);

// SimRun interface: result + projectStart
v = v.replace(
  "interface SimRun { id: string; seed: number; iterations: number; stale: boolean; createdAt: string }",
  "interface SimRun { id: string; seed: number; iterations: number; stale: boolean; createdAt: string; status: string; error?: string | null; result: SimResult | null }"
);
v = v.replace(
  "  criticality: Record<string, number>;\n  projectName: string; projectCode: string;\n}",
  "  criticality: Record<string, number>;\n  projectName: string; projectCode: string;\n  projectStart?: string;\n}"
);

// Result header: P50–P80 calendar dates
v = v.replace(
  `<StatCard label="P50 finish" value={\`day \${sim.finish.p50}\`} tone="good" />`,
  `<StatCard label="P50 finish" value={sim.projectStart ? dayToDate(sim.projectStart, sim.finish.p50) : \`day \${sim.finish.p50}\`} sub="P50" tone="good" />`
);
v = v.replace(
  `<StatCard label="P80 finish" value={\`day \${sim.finish.p80}\`} tone="warn" sub="plan for this date" />`,
  `<StatCard label="P80 finish" value={sim.projectStart ? dayToDate(sim.projectStart, sim.finish.p80) : \`day \${sim.finish.p80}\`} tone="warn" sub="plan for this date" />`
);
v = v.replace(
  `<StatCard label="Deterministic finish" value={\`day \${sim.deterministicFinishDay}\`} sub="assumes everything goes to plan" />`,
  `<StatCard label="Deterministic finish" value={sim.projectStart ? dayToDate(sim.projectStart, sim.deterministicFinishDay) : \`day \${sim.deterministicFinishDay}\`} sub="assumes everything goes to plan" />`
);

// Fan chart card after the grid
v = v.replace(
  `              <div className="grid sm:grid-cols-2 gap-3 text-sm">`,
  `              {(() => {
                const fan = [
                  { name: "P10", p10: sim.finish.p10, band: 0, p50: sim.finish.p10 },
                  { name: "P50", p10: sim.finish.p10, band: sim.finish.p80 - sim.finish.p10, p50: sim.finish.p50 },
                  { name: "P80", p10: sim.finish.p10, band: sim.finish.p80 - sim.finish.p10, p50: sim.finish.p50 },
                  { name: "P90", p10: sim.finish.p10, band: sim.finish.p90 - sim.finish.p10, p50: sim.finish.p50 },
                ];
                return (
                  <div className="rounded-lg border border-slate-200 p-3 mb-3">
                    <p className="font-semibold text-slate-700 text-sm mb-1">Confidence band (P10–P90 envelope, P50 line)</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <AreaChart data={fan} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <ChartTooltip formatter={(val: number | string) => String(val)} />
                        <Area dataKey="p10" stackId="band" stroke="none" fill="transparent" />
                        <Area dataKey="band" stackId="band" stroke="none" fill="#1d4ed8" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="p50" stroke="#1d4ed8" fill="none" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
              <div className="grid sm:grid-cols-2 gap-3 text-sm">`
);

// --- Approvals block in AI Actions tab (before SectionCard title text) ---
v = v.replace(
  `<SectionCard title="Agentic work products — drafted by AI, decided by humans" description="Every draft records its trigger; every decision records its reviewer. Nothing auto-executes.">`,
  `<SectionCard title="Agentic work products — drafted by AI, decided by humans" description="Every draft records its trigger; every decision records its reviewer. Nothing auto-executes."
        actions={canManage && effProjectId && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void createApprovalLink()}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" />Create signed approval link
          </Button>
        )}>
        {approvalLink && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">Signed approval link (HMAC-SHA256, expiring) — status: CONFIGURED</p>
            <p className="text-xs text-amber-700 break-all mt-1">{approvalLink.title} · expires {new Date(approvalLink.expiresAt).toLocaleString()}</p>
            <a className="text-xs text-blue-700 underline break-all" href={approvalLink.url} target="_blank" rel="noreferrer">{approvalLink.url.slice(0, 72)}…</a>
          </div>
        )}`
);
v = v.replace('from "lucide-react";', 'from "lucide-react";\nimport { ExternalLink } from "lucide-react";');
v = v.replace(
  "  const decide = async (id: string, status: \"APPROVED\" | \"REJECTED\") => {",
  `  const [approvalLink, setApprovalLink] = useState<{ url: string; expiresAt: string; title: string } | null>(null);
  const createApprovalLink = async () => {
    if (!effProjectId) return;
    setBusy(true);
    try {
      const res = await api.post<{ url: string; expiresAt: string; title: string }>("/api/integrity/approvals", { projectId: effProjectId });
      setApprovalLink(res); toast.success("Signed link created — decision via the link is audited");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Link failed"); } finally { setBusy(false); }
  };
  const decide = async (id: string, status: "APPROVED" | "REJECTED") => {`
);

// --- Benefits waterfall after the totals stat cards ---
v = v.replace(
  `          {benefits.data!.projects.length === 0 ?`,
  `          {benefits.data!.totals.promised > 0 && (
            <SectionCard title="Value waterfall — promised vs delivered vs remaining">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[
                  { name: "Promised", base: 0, value: benefits.data!.totals.promised, fill: "#1d4ed8" },
                  { name: "Delivered", base: 0, value: benefits.data!.totals.delivered, fill: "#0e9f6e" },
                  { name: "Remaining", base: benefits.data!.totals.delivered, value: Math.max(0, benefits.data!.totals.promised - benefits.data!.totals.delivered), fill: "#f59e0b" },
                ]} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <ChartTooltip formatter={(val: number | string) => "$" + Number(val).toLocaleString()} />
                  <Bar dataKey="base" stackId="w" fill="transparent" />
                  <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]}>
                    {benefits.data && [[0, "#1d4ed8"], [1, "#0e9f6e"], [2, "#f59e0b"]].map(([i, c]) => <BarCell key={i} fill={c as string} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
          {benefits.data!.projects.length === 0 ?`
);

fs.writeFileSync("src/views/integrity/integrity.tsx", v);
console.log("part2:", v.includes("pollRef"), v.includes("approvalLink"), v.includes("Value waterfall"), v.includes("dayToDate(sim.projectStart"));
