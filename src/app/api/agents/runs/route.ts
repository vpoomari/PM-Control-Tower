// PM CONTROL TOWER — agent run ledger (append-only).
// GET /api/agents/runs?agentKey&status&take — run history for Settings.

import { db } from "@/lib/db";
import { withApi, ok } from "@/lib/api";

export const GET = withApi(async (ctx) => {
  const agentKey = ctx.searchParams.get("agentKey")?.trim();
  const status = ctx.searchParams.get("status")?.trim();
  const take = Math.min(200, Math.max(1, Number(ctx.searchParams.get("take")) || 50));

  const runs = await db.agentRun.findMany({
    where: {
      ...(agentKey ? { agentKey } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  const parsed = runs.map((r) => {
    let findings: unknown[] = [];
    let action: { type?: string; label?: string } | null = null;
    try { findings = JSON.parse(r.findingsJson) as unknown[]; } catch { findings = []; }
    try { action = r.actionJson ? (JSON.parse(r.actionJson) as { type?: string; label?: string }) : null; } catch { action = null; }
    return {
      id: r.id,
      agentKey: r.agentKey,
      trigger: r.trigger,
      status: r.status,
      summary: r.summary,
      findings,
      findingCount: Array.isArray(findings) ? findings.length : 0,
      actionType: r.actionType,
      actionLabel: action?.label ?? null,
      narrationSource: r.narrationSource,
      tokens: r.tokens,
      durationMs: r.durationMs,
      actorName: r.actorName,
      errorMessage: r.errorMessage,
      approvedBy: r.approvedBy,
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
      rejectedReason: r.rejectedReason,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return ok({ items: parsed });
}, { permission: "admin.config", rateLimit: { limit: 300, windowMs: 60_000 } });
