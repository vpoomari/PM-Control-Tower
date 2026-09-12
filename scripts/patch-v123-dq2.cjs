const fs = require("fs");
// 1) Fix field names in the data-quality route
let q = fs.readFileSync("src/app/api/integrity/data-quality/route.ts", "utf8");
q = q.replace("sponsor: true, ", "sponsorName: true, ").replace("!p.sponsor)", "!p.sponsorName)");
q = q.replace("db.task.findMany({ where: { projectId: { not: undefined }, status:", "db.task.findMany({ where: { status:");
q = q.replace("db.resource.findMany({ select: { id: true, projectId: undefined, skills: true, name: true } })", "db.resource.findMany({ select: { id: true, skills: true, name: true } })");
q = q.replace(/    const pResources = resources\.filter\(\(r\) => \(r as \{ projectId\?: string \}\)\.projectId === undefined\); \/\/ resources are enterprise-wide\n    void pResources;\n/, "");
fs.writeFileSync("src/app/api/integrity/data-quality/route.ts", q);

// 2) Data Quality tab in the Integrity hub (render block spliced from plain text)
let v = fs.readFileSync("src/views/integrity/integrity.tsx", "utf8");
if (!v.includes('"Data Quality"')) {
  v = v.replace(
    'const TABS = ["Freshness", "Evidence", "Simulations", "Calibration", "Scenarios", "AI Actions", "Benefits"] as const;',
    'const TABS = ["Freshness", "Evidence", "Simulations", "Calibration", "Scenarios", "AI Actions", "Benefits", "Data Quality"] as const;'
  );
}
if (!v.includes("interface DqRow")) {
  v = v.replace(
    "interface ScenarioDiff",
    `interface DqRow { project: { id: string; code: string; name: string; ragStatus: string; healthScore: number }; score: number; issues: { check: string; detail: string }[]; riskTotals: { open: number; noOwner: number; noMitigation: number }; unassignedTasks: number }
interface ScenarioDiff`
  );
}
if (!v.includes('"/api/integrity/data-quality"')) {
  v = v.replace(
    'const benefits = useApi<{ projects: BenefitProjectRow[]; totals: { promised: number; delivered: number; realizationPct: number } }>(tab === "Benefits" ? "/api/integrity/benefits" : null);',
    `const benefits = useApi<{ projects: BenefitProjectRow[]; totals: { promised: number; delivered: number; realizationPct: number } }>(tab === "Benefits" ? "/api/integrity/benefits" : null);
  const dq = useApi<{ projects: DqRow[]; averageScore: number; resourceIssues: { total: number; withoutSkills: number; names: string[] } }>(tab === "Data Quality" ? "/api/integrity/data-quality" : null);`
  );
}
if (!v.includes("DATA QUALITY")) {
  const tail = "      ))}\n    </div>\n  );\n}";
  if (!v.includes(tail)) throw new Error("tail anchor missing");
  const render = fs.readFileSync("scripts/dq-render.txt", "utf8");
  v = v.replace(tail, render);
}
fs.writeFileSync("src/views/integrity/integrity.tsx", v);
console.log("dq tab wired:", v.includes('"Data Quality"'), v.includes("interface DqRow"), v.includes("DATA QUALITY"));
