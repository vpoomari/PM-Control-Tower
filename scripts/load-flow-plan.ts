// PM CONTROL TOWER — Load the FLOW planning workbook (Q4 2026 edition) into the tool.
// Replaces PRJ-CZR-FLOW's plan (WBS + tasks + schedule dependencies + milestones) and
// RAID (risks, issues, assumptions) with the converted document produced by
// scripts/xlsx-to-flow-plan.py, deletes the CSVIMP test projects, then runs the same
// engine cascade the seeder uses (CPM reschedule → health → governance).
//
//   python scripts/xlsx-to-flow-plan.py            # → examples/flow-plan-q4-2026.json
//   npx tsx scripts/load-flow-plan.ts              # load + clean
//
// RAID rows of type "Dependency" are filed as Issues (code DEP-xxx) — the schedule
// Dependency model requires task FKs — matching how the previous load handled them.

import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { rescheduleProject } from "../src/lib/engines/rollup";
import { recalcProjectHealth } from "../src/lib/engines/health";
import { evaluateGovernance } from "../src/lib/engines/governance";

interface Activity {
  id: number | null; ws: string | null; sub: string | null; name: string;
  owner: string | null; start: string | null; end: string | null;
  depends: string | null; comments: string | null; pct: number; status: string | null;
}
interface RaidRow {
  id: number | null; type: string | null; ws: string | null; title: string;
  description: string | null; impact: string | null; likelihood: string | null;
  severity: string | null; owner: string | null; mitigation: string | null;
  due: string | null; status: string | null; escalation: string | null; updated: string | null;
}
interface Doc { source: string; activities: Activity[]; raid: RaidRow[] }

const PROJECT_CODE = "PRJ-CZR-FLOW";
const DAY = 86_400_000;
const toDate = (iso: string | null | undefined) => (iso ? new Date(`${iso}T09:00:00.000Z`) : null);
const level = (v: string | null | undefined): number =>
  v ? ({ low: 2, medium: 3, high: 4 } as Record<string, number>)[v.trim().toLowerCase()] ?? 3 : 3;
const sev = (v: string | null | undefined): string =>
  v ? v.trim().toUpperCase() : "MEDIUM";
const CATEGORY_BY_WS: Record<string, string> = {
  technology: "TECHNICAL", data: "TECHNICAL", process: "OPERATIONAL",
  people: "RESOURCE", "transformation/pmo": "OTHER",
};
const taskStatus = (a: Activity): string => {
  const s = (a.status ?? "").trim().toLowerCase();
  if (s.startsWith("complet")) return "COMPLETED";
  if (s === "ongoing" || s === "in progress") return "IN_PROGRESS";
  if (s === "blocked") return "BLOCKED";
  if (a.pct >= 100) return "COMPLETED";
  if (a.pct > 0) return "IN_PROGRESS";
  return "NOT_STARTED";
};

async function main() {
  const doc: Doc = JSON.parse(readFileSync("examples/flow-plan-q4-2026.json", "utf-8"));
  const project = await db.project.findUnique({ where: { code: PROJECT_CODE } });
  if (!project) throw new Error(`Project ${PROJECT_CODE} not found`);
  const pid = project.id;

  // Owners → platform users (exact full-name match first, then first token).
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const byName = new Map<string, string>();
  for (const u of users) {
    const first = u.name.trim().split(/\s+/)[0].toLowerCase();
    if (!byName.has(first)) byName.set(first, u.id);
    if (u.name.trim().toLowerCase() === first) byName.set(u.name.trim().toLowerCase(), u.id);
  }
  const ownerToUser = (owner: string | null): string | null => {
    if (!owner) return null;
    const key = owner.trim().toLowerCase();
    return byName.get(key) ?? byName.get(key.split(/\s+/)[0]) ?? null;
  };

  // Distinct workstreams / sub-workstreams in workbook order.
  const wsOrder: string[] = [];
  const subOrder = new Map<string, string[]>();
  for (const a of doc.activities) {
    const ws = a.ws ?? "Unassigned";
    if (!wsOrder.includes(ws)) { wsOrder.push(ws); subOrder.set(ws, []); }
    const subs = subOrder.get(ws)!;
    const sub = a.sub ?? "";
    if (sub && !subs.includes(sub)) subs.push(sub);
  }

  const result = await db.$transaction(async (tx) => {
    // ---------- 1) remove the previous plan + RAID ----------
    const taskIds = (await tx.task.findMany({ where: { projectId: pid }, select: { id: true } })).map((t) => t.id);
    await tx.taskEstimate.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.timesheetEntry.deleteMany({ where: { OR: [{ projectId: pid }, { taskId: { in: taskIds } }] } });
    await tx.plannerEntry.updateMany({ where: { taskId: { in: taskIds } }, data: { taskId: null } });
    await tx.assignment.deleteMany({ where: { projectId: pid } });
    await tx.dependency.deleteMany({ where: { projectId: pid } });
    await tx.task.deleteMany({ where: { projectId: pid } });
    await tx.wBSNode.deleteMany({ where: { projectId: pid } });
    await tx.risk.deleteMany({ where: { projectId: pid } });
    await tx.issue.deleteMany({ where: { projectId: pid } });
    await tx.assumption.deleteMany({ where: { projectId: pid } });
    await tx.milestone.deleteMany({ where: { projectId: pid } });

    // ---------- 2) WBS: workstream → sub-workstream ----------
    const phaseIds = new Map<string, string>();
    const subIds = new Map<string, string>();
    for (let i = 0; i < wsOrder.length; i += 1) {
      const ws = wsOrder[i];
      const phase = await tx.wBSNode.create({
        data: {
          projectId: pid, code: `WS-${String(i + 1).padStart(2, "0")}`, name: ws,
          nodeType: "PHASE", level: 1, orderIndex: (i + 1) * 10,
          description: `${ws} workstream from the integrated FLOW plan (Q4 2026 workbook).`,
        },
      });
      phaseIds.set(ws, phase.id);
      for (let j = 0; j < (subOrder.get(ws) ?? []).length; j += 1) {
        const sub = (subOrder.get(ws) ?? [])[j];
        const node = await tx.wBSNode.create({
          data: {
            projectId: pid, parentId: phase.id, code: `WS-${String(i + 1).padStart(2, "0")}.${j + 1}`,
            name: sub, nodeType: "WORK_PACKAGE", level: 2, orderIndex: (j + 1) * 10,
          },
        });
        subIds.set(`${ws}||${sub}`, node.id);
      }
    }

    // ---------- 3) tasks ----------
    const taskIdByNum = new Map<number, string>();
    for (const a of doc.activities) {
      if (a.id === null) continue;
      const code = `A-${String(a.id).padStart(3, "0")}`;
      const start = toDate(a.start);
      const end = toDate(a.end);
      const duration = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) + DAY) / DAY) : 1;
      const notes = [
        a.comments ? `Comments: ${a.comments}` : null,
        a.owner ? `Owner: ${a.owner}` : null,
        "Source: 202601020 - Project Flow - Planning Q4 2026 - MA - offline copy.xlsx",
      ].filter(Boolean).join(" · ");
      const wbsId = a.ws && a.sub ? subIds.get(`${a.ws}||${a.sub}`) ?? phaseIds.get(a.ws) : a.ws ? phaseIds.get(a.ws) : null;
      const task = await tx.task.create({
        data: {
          projectId: pid, code, name: a.name || `Activity ${a.id}`,
          description: null, notes: notes || null,
          status: taskStatus(a), progress: a.pct,
          startDate: start, endDate: end, durationDays: duration,
          assigneeId: ownerToUser(a.owner), wbsId,
        },
      });
      taskIdByNum.set(a.id, task.id);
    }

    // ---------- 4) schedule dependencies (FS) ----------
    let depCount = 0;
    const seenDep = new Set<string>();
    for (const a of doc.activities) {
      if (a.id === null || !a.depends) continue;
      const succId = taskIdByNum.get(a.id)!;
      for (const tok of a.depends.split(/[,;\s]+/)) {
        if (!tok) continue;
        const n = Number(tok);
        if (!Number.isInteger(n) || n === a.id) continue;
        const predId = taskIdByNum.get(n);
        if (!predId) continue;
        const key = `${predId}->${succId}`;
        if (seenDep.has(key)) continue;
        seenDep.add(key);
        await tx.dependency.create({ data: { projectId: pid, predecessorId: predId, successorId: succId, depType: "FS" } });
        depCount += 1;
      }
    }

    // ---------- 5) milestones from checkpoint activities ----------
    const CHECKPOINT_RE = /sign-?off|go-?live|go\s*\/?\s*no-?go|mobilisation readiness|readiness baseline/i;
    const checkpoints = doc.activities
      .filter((a) => a.id !== null && CHECKPOINT_RE.test(a.name))
      .sort((x, y) => (x.end ?? "9999").localeCompare(y.end ?? "9999") || (x.id ?? 0) - (y.id ?? 0));
    for (let i = 0; i < checkpoints.length; i += 1) {
      const c = checkpoints[i];
      await tx.milestone.create({
        data: {
          projectId: pid, code: `FLOW-CP-${String(i + 1).padStart(2, "0")}`, name: c.name,
          description: `Checkpoint from activity A-${String(c.id).padStart(3, "0")} (${c.ws ?? "—"}).`,
          dueDate: toDate(c.end), status: c.pct >= 100 ? "ACHIEVED" : "PENDING",
          isCritical: /go-?live|go\s*\/?\s*no-?go/i.test(c.name),
        },
      });
    }

    // ---------- 6) RAID ----------
    for (const r of doc.raid) {
      const category = CATEGORY_BY_WS[(r.ws ?? "").toLowerCase()] ?? "OTHER";
      const code = String(r.id ?? 0).padStart(3, "0");
      const escalationSuffix = r.escalation ? ` — Decision needed: ${r.escalation}` : "";
      if ((r.type ?? "").toLowerCase() === "risk") {
        const p = level(r.likelihood);
        const im = level(r.impact);
        await tx.risk.create({
          data: {
            projectId: pid, code: `RSK-${code}`, title: r.title,
            description: [r.description, r.ws ? `[${r.ws}]` : null].filter(Boolean).join(" ") + escalationSuffix,
            category, probability: p, impact: im, score: p * im, severity: sev(r.severity),
            status: (r.status ?? "Open").toLowerCase() === "to validate" ? "OPEN" : "OPEN",
            ownerName: r.owner, responseStrategy: "MITIGATE", mitigation: r.mitigation,
            identifiedAt: toDate(r.updated) ?? new Date(), dueDate: toDate(r.due),
          },
        });
      } else if ((r.type ?? "").toLowerCase() === "assumption") {
        await tx.assumption.create({
          data: {
            projectId: pid, code: `ASM-${code}`, description: r.title,
            rationale: r.description ?? null, impactIfFalse: null,
            status: (r.status ?? "").toLowerCase() === "to validate" ? "TO_VALIDATE" : "VALID",
            ownerName: r.owner, dueDate: toDate(r.due),
          },
        });
      } else if ((r.type ?? "").toLowerCase() === "dependency") {
        await tx.issue.create({
          data: {
            projectId: pid, code: `DEP-${code}`, title: `Dependency — ${r.title}`,
            description: [r.description, r.ws ? `[${r.ws}]` : null, "Filed from the RAID register (dependency type)."].filter(Boolean).join(" ") + escalationSuffix,
            category, priority: sev(r.severity) === "CRITICAL" ? "HIGH" : sev(r.severity),
            severity: sev(r.severity), status: "OPEN", ownerName: r.owner,
            raisedAt: toDate(r.updated) ?? new Date(), dueDate: toDate(r.due), impact: r.impact,
          },
        });
      } else {
        await tx.issue.create({
          data: {
            projectId: pid, code: `ISS-${code}`, title: r.title,
            description: [r.description, r.ws ? `[${r.ws}]` : null].filter(Boolean).join(" ") + escalationSuffix,
            category, priority: sev(r.severity) === "CRITICAL" ? "HIGH" : sev(r.severity),
            severity: sev(r.severity), status: "OPEN", ownerName: r.owner,
            raisedAt: toDate(r.updated) ?? new Date(), dueDate: toDate(r.due), impact: r.impact,
          },
        });
      }
    }

    // ---------- 7) remove the CSVIMP test projects ----------
    const csvimp = await tx.project.findMany({ where: { code: { startsWith: "CSVIMP" } }, select: { id: true, code: true } });
    for (const p of csvimp) {
      await tx.dependency.deleteMany({ where: { projectId: p.id } });
      await tx.task.deleteMany({ where: { projectId: p.id } });
      await tx.wBSNode.deleteMany({ where: { projectId: p.id } });
      await tx.risk.deleteMany({ where: { projectId: p.id } });
      await tx.issue.deleteMany({ where: { projectId: p.id } });
      await tx.assumption.deleteMany({ where: { projectId: p.id } });
      await tx.milestone.deleteMany({ where: { projectId: p.id } });
      await tx.projectHealthSnapshot.deleteMany({ where: { projectId: p.id } });
      await tx.evmPeriod.deleteMany({ where: { projectId: p.id } });
      await tx.alertEvent.deleteMany({ where: { projectId: p.id } });
      await tx.project.delete({ where: { id: p.id } });
    }
    return { csvimpRemoved: csvimp.map((p) => p.code) };
  });

  console.log(`◈ Loaded workbook plan: ${doc.activities.length} activities, ${result.csvimpRemoved.length} test project(s) removed (${result.csvimpRemoved.join(", ") || "none"})`);

  // ---------- 8) engine cascade (same as the seeder) ----------
  await rescheduleProject(pid);
  await recalcProjectHealth(pid, "WORKBOOK_IMPORT");
  const gov = await evaluateGovernance();
  console.log(`◈ Engines: CPM rescheduled, health recalculated, governance evaluated (${gov.evaluated} checks, ${gov.breaches.length} breaches)`);

  const counts = {
    tasks: await db.task.count({ where: { projectId: pid } }),
    wbs: await db.wBSNode.count({ where: { projectId: pid } }),
    deps: await db.dependency.count({ where: { projectId: pid } }),
    milestones: await db.milestone.count({ where: { projectId: pid } }),
    risks: await db.risk.count({ where: { projectId: pid } }),
    issues: await db.issue.count({ where: { projectId: pid } }),
    assumptions: await db.assumption.count({ where: { projectId: pid } }),
    projects: await db.project.count(),
  };
  console.log("◈ Final state:", counts);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
