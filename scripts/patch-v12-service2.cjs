const fs = require("fs");
let s = fs.readFileSync("src/lib/services/integrity.ts", "utf8");

// 1) Replace the mangled collectEvidenceDocs (from its declaration to EOF) with a clean one
const start = s.indexOf("async function collectEvidenceDocs");
if (start < 0) throw new Error("collectEvidenceDocs not found");
s = s.slice(0, s.lastIndexOf("\n\n// ---------- Evidence ZIP export", start)) + `

// ---------- Evidence ZIP export (human-readable index + manifest + docs) ----------
import { buildZip } from "@/lib/engines/zip";

async function collectEvidenceDocs(projectId: string): Promise<EvidenceDoc[]> {
  const [project, baselines, crs, gates, timesheets, entries, health, audits] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, status: true, baselineBudget: true, currentBudget: true, actualCost: true, healthScore: true, ragStatus: true } }),
    db.baseline.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.changeRequest.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.stageGate.findMany({ where: { projectId }, orderBy: { sequence: "asc" } }),
    db.timesheet.findMany({ where: { resource: { assignments: { some: { projectId } } } }, orderBy: { weekStart: "asc" } }),
    db.timesheetEntry.findMany({ where: { task: { projectId } }, orderBy: { createdAt: "asc" }, take: 500 }),
    db.projectHealthSnapshot.findMany({ where: { projectId }, orderBy: { capturedAt: "asc" } }),
    db.auditEvent.findMany({ where: { entityType: { in: ["Project", "ChangeRequest", "StageGate", "Baseline", "Timesheet"] }, entityId: projectId }, orderBy: { createdAt: "asc" }, take: 300 }),
  ]);
  if (!project) throw new Error("Project not found");
  return [
    { ref: "project:" + project.id, kind: "PROJECT_RECORD", content: JSON.stringify(project) },
    ...baselines.map((b) => ({ ref: "baseline:" + b.id, kind: "BASELINE", content: JSON.stringify(b) })),
    ...crs.map((c) => ({ ref: "change:" + c.id, kind: "CHANGE_REQUEST", content: JSON.stringify(c) })),
    ...gates.map((g) => ({ ref: "gate:" + g.id, kind: "GATE_DECISION", content: JSON.stringify(g) })),
    ...timesheets.map((t) => ({ ref: "timesheet:" + t.id, kind: "TIMESHEET", content: JSON.stringify(t) })),
    ...entries.map((e) => ({ ref: "entry:" + e.id, kind: "TIMESHEET_ENTRY", content: JSON.stringify(e) })),
    ...health.map((h) => ({ ref: "health:" + h.id, kind: "HEALTH_SNAPSHOT", content: JSON.stringify(h) })),
    ...audits.map((a) => ({ ref: "audit:" + a.id, kind: "AUDIT", content: JSON.stringify(a) })),
  ];
}

export async function buildEvidenceZip(bundleId: string): Promise<{ zip: Uint8Array; projectCode: string }> {
  const bundle = await db.evidenceBundle.findUnique({ where: { id: bundleId }, include: { project: { select: { code: true } } } });
  if (!bundle) throw new Error("Bundle not found");
  const manifest = JSON.parse(bundle.manifestJson);
  const docs = await collectEvidenceDocs(bundle.projectId);
  const lines = [
    "PM CONTROL TOWER - EVIDENCE BUNDLE",
    "==================================",
    "Project:  " + bundle.project.code,
    "Exported: " + bundle.createdAt.toISOString() + " by " + bundle.createdByName,
    "Documents: " + bundle.docCount,
    "Chain:    SHA-256 (each hash includes the previous hash)",
    "Manifest: " + bundle.manifestHash,
    "",
    ...manifest.entries.map((e: { index: number; kind: string; ref: string }) => String(e.index + 1).padStart(3, " ") + ". [" + e.kind + "] " + e.ref),
    "",
    "Verify with: POST /api/integrity/evidence/" + bundle.id + "/verify",
    "Any alteration to a stored record breaks the chain visibly.",
  ];
  const entries = [
    { name: "INDEX.txt", content: lines.join("\\n") },
    { name: "manifest.json", content: JSON.stringify(manifest, null, 2) },
    ...docs.map((d) => ({ name: "docs/" + d.ref.replace(/[^a-zA-Z0-9._-]/g, "_") + ".json", content: d.content })),
  ];
  return { zip: buildZip(entries), projectCode: bundle.project.code };
}
`;

// 2) Deduplicate: buildEvidenceBundle + verifyEvidenceBundle now use collectEvidenceDocs
const inline1 = /const docs: EvidenceDoc\[\] = \[\]\n    \{ ref: `project:\$\{project\.id\}`[\s\S]*?JSON\.stringify\(a\) \}\),\n  \];/;
if (inline1.test(s)) {
  s = s.replace(inline1, "const docs: EvidenceDoc[] = await collectEvidenceDocs(projectId);");
}
const inline2 = /const docs: EvidenceDoc\[\] = \[\]\n    \{ ref: `project:\$\{project!\.id\}`[\s\S]*?JSON\.stringify\(a\) \}\),\n  \];/;
if (inline2.test(s)) {
  s = s.replace(inline2, "const docs: EvidenceDoc[] = await collectEvidenceDocs(bundle.projectId);");
}
fs.writeFileSync("src/lib/services/integrity.ts", s);
console.log("dedup1:", s.includes("await collectEvidenceDocs(projectId);"), "| dedup2:", s.includes("await collectEvidenceDocs(bundle.projectId);"), "| leftover refs:", (s.match(/ref: ,/g) || []).length);
