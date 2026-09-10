// PM CONTROL TOWER — Template Application Engine
// POST /api/templates/[id]/apply — instantiate a real Project from a PMO template:
// project row + WBS (summary + work packages) + tasks with dependencies + milestones
// + stage gates + default budget lines, then bump template usage.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { fromJson, addDays, DAY_MS } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";

const applySchema = z.object({
  projectCode: z.string().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "Code may contain letters, digits, dots, dashes, underscores"),
  projectName: z.string().min(2).max(160),
  programId: z.string().optional(),
  ownerId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().min(0).optional(),
});

interface TemplateStructure {
  phases?: string[];
  artifacts?: string[];
  [k: string]: unknown;
}

// Budget share model for default lines (must sum to 1)
const BUDGET_SHARES: { category: string; name: string; share: number }[] = [
  { category: "LABOR", name: "Labor & internal effort", share: 0.6 },
  { category: "SOFTWARE", name: "Software & licences", share: 0.15 },
  { category: "SERVICES", name: "External services", share: 0.2 },
  { category: "CONTINGENCY", name: "Contingency reserve", share: 0.05 },
];

const TASK_DURATION_DAYS = 20;
const CROSS_PHASE_LAG_DAYS = 5;

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const body = await parseBody(ctx.req, applySchema);

  const template = await db.template.findUnique({
    where: { id },
    include: { versions: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!template) throw new ApiError(404, "Template not found");
  const version = template.versions[0] ?? (await db.templateVersion.findFirst({ where: { templateId: id }, orderBy: { createdAt: "desc" } }));
  if (!version) throw new ApiError(409, "Template has no version to apply");

  const structure = fromJson<TemplateStructure>(version.structureJson, {});
  const phases = (structure.phases ?? []).filter((p) => typeof p === "string" && p.trim().length > 0);
  if (phases.length === 0) throw new ApiError(400, "Template structure does not define phases — cannot apply");

  const codeExists = await db.project.findUnique({ where: { code: body.projectCode }, select: { id: true } });
  if (codeExists) throw new ApiError(409, `Project code ${body.projectCode} already exists`);

  if (body.programId) {
    const program = await db.program.findUnique({ where: { id: body.programId }, select: { id: true } });
    if (!program) throw new ApiError(400, "programId does not reference an existing program");
  }
  if (body.ownerId) {
    const owner = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
    if (!owner) throw new ApiError(400, "ownerId does not reference an existing user");
  }

  const start = body.startDate ? new Date(body.startDate) : new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = body.endDate ? new Date(body.endDate) : addDays(start, 180);
  const budget = body.budget ?? 0;

  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        code: body.projectCode,
        name: body.projectName,
        description: `Created from PMO template "${template.name}" (v${template.version})`,
        programId: body.programId ?? null,
        ownerId: body.ownerId ?? ctx.session?.id ?? null,
        managerId: body.ownerId ?? ctx.session?.id ?? null,
        status: "DRAFT",
        phase: "INITIATION",
        methodology: template.methodology || "HYBRID",
        startDate: start,
        endDate: end,
        baselineStart: start,
        baselineFinish: end,
        baselineBudget: budget,
        currentBudget: budget,
      },
    });

    // ---- WBS: one summary node per phase, 2 work packages per phase ----
    const wbsSummaryIds: string[] = [];
    const wbsLeafIds: string[] = [];
    for (let p = 0; p < phases.length; p++) {
      const summary = await tx.wBSNode.create({
        data: {
          projectId: project.id,
          code: `${p + 1}`,
          name: phases[p],
          nodeType: "SUMMARY",
          level: 1,
          orderIndex: p,
        },
      });
      wbsSummaryIds.push(summary.id);
      for (let w = 0; w < 2; w++) {
        const leaf = await tx.wBSNode.create({
          data: {
            projectId: project.id,
            parentId: summary.id,
            code: `${p + 1}.${w + 1}`,
            name: `${phases[p]} — Work Package ${w + 1}`,
            nodeType: "WORK_PACKAGE",
            level: 2,
            orderIndex: w,
            plannedHours: 160,
            plannedCost: 160 * 100,
          },
        });
        wbsLeafIds.push(leaf.id);
      }
    }

    // ---- Tasks: 2 per work package; FS chain within phase, SS+5 across phases ----
    const dependencyRows: { predecessorId: string; successorId: string; depType: string; lagDays: number }[] = [];
    const phaseFirstTaskIds: string[] = [];
    const phaseLastTaskEndDates: Date[] = [];
    let taskSeq = 0;
    for (let p = 0; p < phases.length; p++) {
      const phaseTaskIds: string[] = [];
      let chainStart = addDays(start, p * CROSS_PHASE_LAG_DAYS);
      for (let w = 0; w < 2; w++) {
        const leafId = wbsLeafIds[p * 2 + w];
        for (let t = 0; t < 2; t++) {
          taskSeq += 1;
          const tStart = chainStart;
          const tEnd = addDays(tStart, TASK_DURATION_DAYS);
          const task = await tx.task.create({
            data: {
              projectId: project.id,
              wbsId: leafId,
              code: `${project.code}-T-${String(taskSeq).padStart(3, "0")}`,
              name: `${phases[p]} · WP${w + 1} · Task ${t + 1}`,
              status: "NOT_STARTED",
              startDate: tStart,
              endDate: tEnd,
              durationDays: TASK_DURATION_DAYS,
              plannedHours: 80,
              plannedCost: 8000,
            },
          });
          phaseTaskIds.push(task.id);
          if (phaseTaskIds.length > 1) {
            dependencyRows.push({ predecessorId: phaseTaskIds[phaseTaskIds.length - 2], successorId: task.id, depType: "FS", lagDays: 0 });
          }
          chainStart = tEnd; // sequential FS chain inside the phase
        }
      }
      phaseFirstTaskIds.push(phaseTaskIds[0]);
      phaseLastTaskEndDates.push(chainStart); // chainStart now equals last task finish
      if (p > 0) {
        dependencyRows.push({ predecessorId: phaseFirstTaskIds[p - 1], successorId: phaseFirstTaskIds[p], depType: "SS", lagDays: CROSS_PHASE_LAG_DAYS });
      }
    }
    for (const d of dependencyRows) {
      await tx.dependency.create({ data: { projectId: project.id, ...d } });
    }

    // ---- Milestones: Kickoff, one per phase completion, Go-live, Closure ----
    const goLive = phaseLastTaskEndDates[phaseLastTaskEndDates.length - 1] ?? end;
    const closure = addDays(goLive, 14);
    await tx.milestone.create({ data: { projectId: project.id, code: "MS-KO", name: "Kickoff", dueDate: start, baselineDate: start, isCritical: true } });
    for (let p = 0; p < phases.length; p++) {
      await tx.milestone.create({
        data: { projectId: project.id, code: `MS-P${p + 1}`, name: `${phases[p]} complete`, dueDate: phaseLastTaskEndDates[p], baselineDate: phaseLastTaskEndDates[p] },
      });
    }
    await tx.milestone.create({ data: { projectId: project.id, code: "MS-GL", name: "Go-live", dueDate: goLive, baselineDate: goLive, isCritical: true } });
    await tx.milestone.create({ data: { projectId: project.id, code: "MS-CL", name: "Closure", dueDate: closure, baselineDate: closure } });

    // ---- Stage gates: Gate 0..3, PENDING ----
    const gateDates = [start, ...phaseLastTaskEndDates.slice(0, Math.max(0, phases.length - 1)), goLive];
    for (let g = 0; g < 4; g++) {
      await tx.stageGate.create({
        data: {
          projectId: project.id,
          code: `GATE-${g}`,
          sequence: g,
          name: `Gate ${g}`,
          description: ["Initiation approved", "Design approved", "Build validated", "Deployment readiness"][g],
          plannedDate: gateDates[Math.min(g, gateDates.length - 1)],
          decisionStatus: "PENDING",
        },
      });
    }

    // ---- Budget lines from template share model (when budget provided) ----
    let budgetLineCount = 0;
    if (budget > 0) {
      for (const line of BUDGET_SHARES) {
        await tx.budgetLine.create({
          data: {
            projectId: project.id,
            category: line.category,
            name: line.name,
            baselineAmount: Math.round(budget * line.share * 100) / 100,
            currentAmount: Math.round(budget * line.share * 100) / 100,
          },
        });
        budgetLineCount += 1;
      }
    }

    // ---- Project planned hours = Σ work package hours ----
    const plannedHours = wbsLeafIds.length * 160;
    await tx.project.update({ where: { id: project.id }, data: { plannedHours } });

    return { projectId: project.id, code: project.code, wbsNodes: wbsSummaryIds.length + wbsLeafIds.length, workPackages: wbsLeafIds.length, tasks: taskSeq, dependencies: dependencyRows.length, milestones: phases.length + 3, budgetLines: budgetLineCount };
  });

  await db.template.update({ where: { id }, data: { usageCount: { increment: 1 } } });

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "Project", entityId: result.projectId, entityName: body.projectName,
    after: { code: body.projectCode, source: "TEMPLATE", templateId: template.id, templateName: template.name, templateVersion: template.version },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    context: `Applied template ${template.name} v${template.version}`,
  });

  emitRealtime("project:created", { projectId: result.projectId, code: result.code, name: body.projectName });

  return ok({
    projectId: result.projectId,
    projectCode: result.code,
    template: { id: template.id, name: template.name, version: template.version },
    counts: { wbsNodes: result.wbsNodes, tasks: result.tasks, dependencies: result.dependencies, milestones: result.milestones, stageGates: 4, budgetLines: result.budgetLines },
    window: { start: start.toISOString(), end: end.toISOString(), days: Math.round((end.getTime() - start.getTime()) / DAY_MS) },
  }, 201);
}, { permission: "project.manage", rateLimit: { limit: 30, windowMs: 60_000 } });
