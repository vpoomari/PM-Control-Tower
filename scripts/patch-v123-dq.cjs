const fs = require("fs");
// 1) Fix a sloppy field in the data-quality route (sponsor field may be named differently)
let q = fs.readFileSync("src/app/api/integrity/data-quality/route.ts", "utf8");
q = q.replace("sponsor: true, ", "sponsorName: true, ").replace("!p.sponsor)", "!p.sponsorName)");
q = q.replace("db.task.findMany({ where: { projectId: { not: undefined },", "db.task.findMany({ where: { status: { in:");
q = q.replace("db.resource.findMany({ select: { id: true, projectId: undefined, skills: true, name: true } })", "db.resource.findMany({ select: { id: true, skills: true, name: true } })");
q = q.replace(/    const pResources = resources\.filter\(\(r\) => \(r as \{ projectId\?: string \}\)\.projectId === undefined\); \/\/ resources are enterprise-wide\n    void pResources;\n    const noSkills/, "    const noSkills");
fs.writeFileSync("src/app/api/integrity/data-quality/route.ts", q);

// 2) Add the Data Quality tab to the Integrity hub
let v = fs.readFileSync("src/views/integrity/integrity.tsx", "utf8");
v = v.replace('const TABS = ["Freshness", "Evidence", "Simulations", "Calibration", "Scenarios", "AI Actions", "Benefits"] as const;',
  'const TABS = ["Freshness", "Evidence", "Simulations", "Calibration", "Scenarios", "AI Actions", "Benefits", "Data Quality"] as const;');
v = v.replace('interface ScenarioDiff',
  `interface DqRow { project: { id: string; code: string; name: string; ragStatus: string; healthScore: number }; score: number; issues: { check: string; detail: string }[]; riskTotals: { open: number; noOwner: number; noMitigation: number }; unassignedTasks: number }
interface ScenarioDiff`);
v = v.replace(
  'const benefits = useApi<{ projects: BenefitProjectRow[]; totals: { promised: number; delivered: number; realizationPct: number } }>(tab === "Benefits" ? "/api/integrity/benefits" : null);',
  `const benefits = useApi<{ projects: BenefitProjectRow[]; totals: { promised: number; delivered: number; realizationPct: number } }>(tab === "Benefits" ? "/api/integrity/benefits" : null);
  const dq = useApi<{ projects: DqRow[]; averageScore: number; resourceIssues: { total: number; withoutSkills: number; names: string[] } }>(tab === "Data Quality" ? "/api/integrity/data-quality" : null);`
);
// Render block before the final closing of Benefits section
v = v.replace(
  `      ))}
    </div>
  );
}`,
  `      ))}

      {/* DATA QUALITY */}
      {tab === "Data Quality" && (dq.loading && !dq.data ? <LoadingBlock /> : dq.error ? <ErrorBlock message={dq.error} onRetry={dq.refetch} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Average data quality" value={dq.data!.averageScore + "/100"} tone={dq.data!.averageScore >= 80 ? "good" : dq.data!.averageScore >= 60 ? "warn" : "bad"} />
            <StatCard label="Projects audited" value={dq.data!.projects.length} />
            <StatCard label="Projects with gaps" value={dq.data!.projects.filter((p) => p.issues.length > 0).length} tone="warn" />
            <StatCard label="Resources without skills" value={dq.data!.resourceIssues.withoutSkills + "/" + dq.data!.resourceIssues.total} tone={dq.data!.resourceIssues.withoutSkills > 0 ? "warn" : "good"} sub={dq.data!.resourceIssues.names.slice(0, 3).join(", ")} />
          </div>
          {dq.data!.projects.map((row) => (
            <SectionCard key={row.project.id} title={`${row.project.code} — ${row.project.name}`}
              description={`delivery health ${row.project.ragStatus} · ${row.riskTotals.open} open risk(s) · ${row.unassignedTasks} unassigned task(s)`}
              actions={<span className={cn("px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums", row.score >= 80 ? "border-emerald-200 text-emerald-700 bg-emerald-50" : row.score >= 60 ? "border-amber-200 text-amber-700 bg-amber-50" : "border-red-200 text-red-700 bg-red-50")}>DQ {row.score}/100</span>}>
              {row.issues.length === 0 ? (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />No data-quality gaps — owner, sponsor, dates, budget and RAID hygiene all present.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {row.issues.map((iss, i) => (
                    <span key={i} title={iss.detail} className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">{iss.check}</span>
                  ))}
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      ))}
    </div>
  );
}`);
fs.writeFileSync("src/views/integrity/integrity.tsx", v);
console.log("dq tab:", v.includes("Data Quality") && v.includes("DqRow"));
