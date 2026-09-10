// PM CONTROL TOWER — AI PM Assistant
// POST /api/assistant — governed natural-language Q&A over the control-tower data.
// Flow: active AI connector → compact governed context → LLM → persisted AIExecution.
// GET  /api/assistant — last 20 AI executions (own, or all for admins).
// The z-ai-web-dev-sdk is imported ONLY here, server-side, never on the client.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { round2 } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const askSchema = z.object({ question: z.string().min(3).max(2000) });

const DATA_SCOPE = "projects,risks,issues,alerts,capacity,health,evm";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

interface ConnectorSelection {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  temperature: number;
  maxTokens: number;
}

async function buildGovernedContext(): Promise<Record<string, unknown>> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const fourWeeksAgo = new Date(now.getTime() - 4 * 7 * 86_400_000);

  const [projects, evmPeriods, topRisks, criticalIssues, alerts, allocationSums, timesheets, milestones] = await Promise.all([
    db.project.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true, code: true, name: true, status: true, ragStatus: true, healthScore: true,
        progress: true, currentBudget: true, baselineBudget: true, actualCost: true, forecastCost: true,
      },
    }),
    db.evmPeriod.findMany({ orderBy: { statusDate: "desc" }, select: { projectId: true, cpi: true, spi: true } }),
    db.risk.findMany({
      where: { status: { in: ["OPEN", "MITIGATING", "ESCALATED"] } },
      orderBy: { score: "desc" }, take: 8,
      select: { code: true, title: true, score: true, severity: true, status: true, project: { select: { code: true } } },
    }),
    db.issue.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, severity: { in: ["HIGH", "CRITICAL"] } },
      orderBy: { raisedAt: "desc" }, take: 8,
      select: { code: true, title: true, severity: true, status: true, project: { select: { code: true } } },
    }),
    db.alertEvent.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" }, take: 8,
      select: { severity: true, title: true, message: true, createdAt: true, project: { select: { code: true } } },
    }),
    db.assignment.groupBy({
      by: ["resourceId"],
      where: { status: "ACTIVE" },
      _sum: { allocationPercent: true },
      orderBy: { _sum: { allocationPercent: "desc" } },
    }),
    db.timesheet.aggregate({
      where: { weekStart: { gte: fourWeeksAgo }, status: { in: ["APPROVED", "LOCKED", "SUBMITTED", "UNDER_REVIEW"] } },
      _sum: { totalHours: true, billableHours: true },
      _count: { id: true },
    }),
    db.milestone.findMany({
      where: { dueDate: { gte: now, lte: in30 }, status: { not: "COMPLETED" } },
      orderBy: { dueDate: "asc" }, take: 8,
      select: { name: true, dueDate: true, project: { select: { code: true } } },
    }),
  ]);

  const latestEvm = new Map<string, { cpi: number; spi: number }>();
  for (const e of evmPeriods) {
    if (!latestEvm.has(e.projectId)) latestEvm.set(e.projectId, { cpi: e.cpi, spi: e.spi });
  }

  const overAllocated = allocationSums
    .filter((a) => (a._sum.allocationPercent ?? 0) > 100)
    .slice(0, 5);
  const hotSpotUsers = overAllocated.length
    ? await db.resource.findMany({
        where: { id: { in: overAllocated.map((a) => a.resourceId) } },
        select: { id: true, name: true, title: true },
      })
    : [];
  const capacityHotSpots = overAllocated.map((a) => {
    const r = hotSpotUsers.find((x) => x.id === a.resourceId);
    return { name: r?.name ?? "Unknown", title: r?.title ?? null, allocatedPercent: round2(a._sum.allocationPercent ?? 0) };
  });

  return {
    asOf: now.toISOString(),
    projects: projects.map((p) => ({
      code: p.code, name: p.name, status: p.status, rag: p.ragStatus, healthScore: p.healthScore,
      progress: p.progress, budget: p.currentBudget, baselineBudget: p.baselineBudget,
      actualCost: p.actualCost, forecastCost: p.forecastCost,
      evm: latestEvm.get(p.id) ?? null,
    })),
    topRisks: topRisks.map((r) => ({ code: r.code, title: r.title, score: r.score, severity: r.severity, status: r.status, project: r.project.code })),
    criticalIssues: criticalIssues.map((i) => ({ code: i.code, title: i.title, severity: i.severity, status: i.status, project: i.project.code })),
    newAlerts: alerts.map((a) => ({ severity: a.severity, title: a.title, project: a.project?.code ?? null, createdAt: a.createdAt })),
    capacityHotSpots,
    timesheetTotals: { windowDays: 28, totalHours: round2(timesheets._sum.totalHours ?? 0), billableHours: round2(timesheets._sum.billableHours ?? 0), timesheets: timesheets._count.id },
    upcomingMilestones: milestones.map((m) => ({ name: m.name, dueDate: m.dueDate, project: m.project.code })),
  };
}

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, askSchema);

  // 1) Active AI connector first
  const connector: ConnectorSelection | null = await db.aIConnector.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, provider: true, model: true, temperature: true, maxTokens: true },
  });
  if (!connector) throw new ApiError(502, "No active AI connector configured — contact the PMO administrator");

  // 2) Governed data context (compact, row-capped)
  const context = await buildGovernedContext();

  // 3) LLM call
  const started = Date.now();
  let answer = "";
  let tokens = 0;
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = (await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are the PM Control Tower AI PM Assistant for an enterprise Project/Program/Portfolio Management platform. " +
            "Answer executive-ready: concise, structured, action-oriented. Always cite real project codes from the context. " +
            "Never invent data that is not present in the context; if the context lacks the answer, say what data would be needed. " +
            "Use short paragraphs or bullet lists, flag RAG risks explicitly, and finish with a one-line recommendation when relevant.",
        },
        {
          role: "user",
          content: `Context (live PM Control Tower data, capped extract):\n${JSON.stringify(context)}\n\nQuestion: ${body.question}`,
        },
      ],
      temperature: connector.temperature,
      max_tokens: connector.maxTokens,
    })) as unknown as ChatCompletionResponse;

    answer = completion.choices?.[0]?.message?.content ?? "No answer";
    tokens = completion.usage?.total_tokens ?? 0;
    const durationMs = Date.now() - started;

    // 4) Persist successful execution + usage
    await db.aIExecution.create({
      data: {
        connectorId: connector.id, userId: ctx.session.id,
        prompt: body.question, response: answer, tokens, durationMs,
        status: "SUCCESS", dataScopeUsed: DATA_SCOPE,
      },
    });
    await db.aIConnector.update({ where: { id: connector.id }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } });
    await writeAudit({
      userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
      action: "EXECUTE", entityType: "AIExecution", entityId: connector.id, entityName: connector.name,
      after: { status: "SUCCESS", tokens, durationMs, dataScope: DATA_SCOPE },
      ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    });

    return ok({
      answer,
      meta: { connector: connector.name, provider: connector.provider, tokens, durationMs, dataScopeUsed: DATA_SCOPE },
    });
  } catch (err) {
    // 5) Honest failure: persist FAILED execution, surface 502
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    await db.aIExecution.create({
      data: {
        connectorId: connector.id, userId: ctx.session.id,
        prompt: body.question, response: `[ERROR] ${message}`, durationMs,
        status: "FAILED", dataScopeUsed: DATA_SCOPE,
      },
    }).catch(() => undefined);
    await writeAudit({
      userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
      action: "EXECUTE", entityType: "AIExecution", entityId: connector.id, entityName: connector.name,
      after: { status: "FAILED", durationMs, error: message },
      ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
      severity: "WARNING",
    });
    throw new ApiError(502, `AI assistant unavailable: ${message}`);
  }
}, { permission: "ai.use", rateLimit: { limit: 10, windowMs: 60_000 } });

export const GET = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const isAdmin = ctx.session.isSuperAdmin || ctx.session.permissions.includes("*") || ctx.session.permissions.includes("admin.audit");
  const executions = await db.aIExecution.findMany({
    where: isAdmin ? {} : { userId: ctx.session.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });
  return ok({
    executions: executions.map((e) => ({
      id: e.id, prompt: e.prompt, response: e.response, tokens: e.tokens, durationMs: e.durationMs,
      status: e.status, dataScopeUsed: e.dataScopeUsed, createdAt: e.createdAt, userName: e.user?.name ?? null,
    })),
    scope: isAdmin ? "ALL" : "OWN",
  });
}, { permission: "ai.use", rateLimit: { limit: 120, windowMs: 60_000 } });
