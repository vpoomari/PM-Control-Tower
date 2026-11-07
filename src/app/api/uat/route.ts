// PM CONTROL TOWER — UAT Cycles + Cases + Hard Gate Lock
// GET  /api/uat?projectId=        — cycles + cases + pass rate
// POST /api/uat {action:"create",projectId,name} — new cycle
// POST /api/uat {action:"case",cycleId,title,severity} — add case
// POST /api/uat {action:"execute",caseId,status,executedBy,notes} — record result
// Hard gate lock: when a "Go-Live" gate is evaluated, any ACTIVE UAT cycle with
// FAIL or BLOCKED CRITICAL cases blocks the gate decision server-side.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "projectId required");
  const cycles = await db.uatCycle.findMany({
    where: { projectId },
    include: { cases: true },
    orderBy: { startDate: "desc" },
  });
  const allCases = cycles.flatMap((c) => c.cases);
  const passed = allCases.filter((c) => c.status === "PASS").length;
  const failed = allCases.filter((c) => c.status === "FAIL").length;
  const criticalFailed = allCases.filter((c) => c.status === "FAIL" && c.severity === "CRITICAL").length;
  const executed = passed + failed;
  return ok({
    cycles, executed, passed, failed, criticalFailed,
    passRate: executed > 0 ? Math.round((passed / executed) * 100) : 0,
    hardLock: criticalFailed > 0,
  });
}, { permission: "project.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.discriminatedUnion("action", [
    z.object({ action: z.literal("create"), projectId: z.string(), name: z.string().min(2) }),
    z.object({ action: z.literal("case"), cycleId: z.string(), title: z.string().min(2), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM") }),
    z.object({ action: z.literal("execute"), caseId: z.string(), status: z.enum(["PASS", "FAIL", "BLOCKED", "NOT_RUN"]), executedBy: z.string().optional(), notes: z.string().optional().nullable(), defectRef: z.string().optional().nullable() }),
  ]));
  if (body.action === "create") {
    const cycle = await db.uatCycle.create({ data: { projectId: body.projectId, name: body.name } });
    await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "UatCycle", entityId: cycle.id, entityName: cycle.name });
    return ok({ cycle }, 201);
  }
  if (body.action === "case") {
    const uatCase = await db.uatCase.create({ data: { cycleId: body.cycleId, title: body.title, severity: body.severity } });
    return ok({ uatCase }, 201);
  }
  const uatCase = await db.uatCase.update({
    where: { id: body.caseId },
    data: { status: body.status, executedBy: body.executedBy ?? session.name, executedAt: new Date(), defectRef: body.defectRef ?? null, notes: body.notes ?? null },
  });
  // Room must be the PROJECT id — cycleId is a UatCycle id, so this event used to
  // target a nonexistent room and no project view ever saw it.
  const cycle = await db.uatCycle.findUnique({ where: { id: uatCase.cycleId }, select: { projectId: true } });
  emitRealtime("project:updated", { uatCaseId: uatCase.id, status: uatCase.status }, cycle ? projectRoom(cycle.projectId) : undefined);
  return ok({ uatCase });
}, { permission: "wbs.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
