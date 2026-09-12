// PM CONTROL TOWER — Integrity Layer seed (non-destructive, idempotent)
// Upserts the new permissions/role grants, computes freshness + calibration from
// live data, and creates demo evidence/simulation/scenario/AI-action/benefits data.
// Run: npx tsx scripts/seed-integrity.ts   (safe to re-run)

import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { PERMISSION_CATALOG, ROLE_TEMPLATES } from "../src/lib/rbac";
import { recomputeCalibration, computeProjectFreshness, runAndStoreSimulation, buildEvidenceBundle, buildScenarioSnapshot, simulateScenario } from "../src/lib/services/integrity";
import { composeSteeringPack } from "../src/lib/engines/steering";
import { computeEVM } from "../src/lib/engines/evm";

const NEW_PERMS = ["integrity.view", "integrity.manage", "scenario.manage", "benefits.manage"];

async function main() {
  console.log("◈ PM Control Tower — Integrity Layer seed…");

  // 1) Permissions + role grants (idempotent)
  for (const code of NEW_PERMS) {
    const def = PERMISSION_CATALOG.find((p) => p.code === code)!;
    await db.permission.upsert({ where: { code }, create: def, update: def });
  }
  for (const t of ROLE_TEMPLATES) {
    const role = await db.role.findUnique({ where: { code: t.code } });
    if (!role || t.permissions.includes("*")) continue;
    for (const code of NEW_PERMS) {
      if (!t.permissions.includes(code)) continue;
      const [perm, ...rest] = await Promise.all([
        db.permission.findUnique({ where: { code } }),
        Promise.resolve(null),
      ]);
      if (!perm) continue;
      void rest;
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
  }
  console.log("  ✓ RBAC: integrity permissions provisioned");

  const pmo = await db.user.findUnique({ where: { email: "pmo@pmct.io" } });
  const session = pmo ? { id: pmo.id, name: pmo.name } : { id: "system", name: "System" };

  const projects = await db.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { createdAt: "asc" } });

  // 2) Freshness for every project (computed from live feeds)
  for (const p of projects) await computeProjectFreshness(p.id);
  console.log("  ✓ Freshness computed for", projects.length, "projects");

  // 3) Calibration factors from completed task history
  const factors = await recomputeCalibration();
  console.log("  ✓ Calibration:", factors.length, "factors computed");

  const demo = projects[0];
  if (demo) {
    // 4) A seeded Monte Carlo run (deterministic seed)
    const sim = await runAndStoreSimulation(demo.id, { seed: 20260912, iterations: 1000 });
    console.log(`  ✓ Simulation seeded for ${demo.code}: P50 day ${sim.result.finish.p50}, P80 day ${sim.result.finish.p80}`);

    // 5) An evidence bundle
    const bundle = await buildEvidenceBundle(demo.id, session);
    console.log(`  ✓ Evidence bundle: ${bundle.docCount} documents chained for ${demo.code}`);

    // 6) A sandbox scenario (left unmerged for the demo moment)
    const existing = await db.scenario.findFirst({ where: { projectId: demo.id, status: "SANDBOX" } });
    if (!existing) {
      const snapshot = await buildScenarioSnapshot(demo.id);
      const longest = [...snapshot.tasks].sort((a, b) => b.durationDays - a.durationDays)[0];
      const overrides = longest ? { durationChanges: { [longest.id]: Math.round(longest.durationDays * 1.5) } } : {};
      const { diff } = simulateScenario(snapshot, overrides);
      await db.scenario.create({
        data: {
          name: "Stretch critical task 1.5×", projectId: demo.id, createdBy: session.id, createdByName: session.name,
          snapshotJson: JSON.stringify(snapshot), overridesJson: JSON.stringify(overrides), diffJson: JSON.stringify(diff),
        },
      });
      console.log(`  ✓ Scenario sandbox: finish ${diff.baseFinishDay}d → ${diff.simulatedFinishDay}d (${diff.finishDeltaDays >= 0 ? "+" : ""}${diff.finishDeltaDays}d)`);
    }

    // 7) A drafted steering pack (AI drafts; awaits human decision)
    const existingAction = await db.aiAction.findFirst({ where: { projectId: demo.id, status: "DRAFTED" } });
    if (!existingAction) {
      const full = await db.project.findUnique({
        where: { id: demo.id },
        include: {
          tasks: true,
          risks: { where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } } }, milestones: true,
          stageGates: { where: { decisionStatus: "PENDING" }, orderBy: { sequence: "asc" } },
          changeRequests: { where: { status: { in: ["DRAFT", "SUBMITTED", "ASSESSMENT"] } } },
          evmPeriods: { orderBy: { statusDate: "asc" } },
        },
      });
      if (full) {
        const evm = computeEVM(full.tasks, full.actualCost, full.currentBudget || full.baselineBudget || null, full.statusDate || new Date());
        const prev = full.evmPeriods.length >= 2 ? full.evmPeriods[full.evmPeriods.length - 2] : null;
        const freshness = await computeProjectFreshness(demo.id);
        const pack = composeSteeringPack({
          project: { code: full.code, name: full.name, rag: full.ragStatus, healthScore: full.healthScore },
          kpis: { cpi: evm.cpi, spi: evm.spi, eac: evm.eac, bac: evm.bac, percentComplete: evm.percentComplete, prevCpi: prev?.cpi ?? null, prevSpi: prev?.spi ?? null },
          freshness: { score: freshness?.score ?? 100, level: freshness?.level ?? "CURRENT", worstFeed: freshness?.worstFeed ?? "none" },
          topRisks: full.risks.sort((a, b) => b.score - a.score).slice(0, 5).map((r) => ({ title: r.title, severity: r.severity, score: r.score })),
          overdueMilestones: full.milestones.filter((m) => m.dueDate && m.dueDate < new Date() && m.status !== "COMPLETED").map((m) => m.name),
          pendingDecisions: [...full.stageGates.map((g) => `Gate decision — ${g.code} ${g.name}`), ...full.changeRequests.map((c) => `Change request — ${c.code} ${c.title}`)],
          spiTrend: full.evmPeriods.slice(-4).map((p) => p.spi),
        });
        await db.aiAction.create({ data: { type: "STEERING_PACK", projectId: demo.id, title: pack.title, contentJson: JSON.stringify(pack), status: "DRAFTED", trigger: pack.needsRePlan ? "SPI_BELOW_090_3WEEKS" : "MANUAL" } });
        console.log("  ✓ Steering pack drafted — awaiting human approval");
      }
    }

    // 8) Benefits profiles (activate automatically once the final gate has passed)
    const benefitCount = await db.benefitProfile.count({ where: { projectId: demo.id } });
    if (benefitCount === 0) {
      await db.benefitProfile.create({ data: { projectId: demo.id, name: "Manual processing hours avoided", type: "COST_SAVING", baselineValue: 40000, targetValue: 1200000, timeframeMonths: 12, owner: "Finance Controller" } });
      await db.benefitProfile.create({ data: { projectId: demo.id, name: "Faster client onboarding", type: "REVENUE", baselineValue: 0, targetValue: 800000, timeframeMonths: 9, owner: "Head of Operations" } });
      console.log("  ✓ Benefits profiles created (activate when the final gate passes)");
    }
  }

  // 9) Ensure the seed users still authenticate (password untouched — verify hash exists)
  const bad = await db.user.count({ where: { passwordHash: "" } });
  if (bad > 0) {
    const hash = await bcrypt.hash("Pmct@2026", 10);
    await db.user.updateMany({ where: { passwordHash: "" }, data: { passwordHash: hash } });
  }

  console.log("◈ Integrity Layer seed complete.");
  await db.$disconnect();
}

main().catch((e) => { console.error("Seed failed:", e.message); process.exit(1); });
