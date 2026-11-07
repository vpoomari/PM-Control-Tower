// PM CONTROL TOWER — AI Agents API (roster + activation/config).
// GET   /api/agents — catalogue roster with org profiles, kill switch, pending approvals
// PATCH /api/agents — activate/pause an agent, tune thresholds, cadence, budget
//
// Everything here is admin.config: agents are configured in Administration →
// Settings → AI Agents, never by ordinary users.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { listRoster, saveProfile } from "@/lib/agents/registry";
import { agentsRuntimeEnabled } from "@/lib/agents/runner";
import { AGENTS } from "@/lib/agents/catalog";

const CADENCES = ["MANUAL", "HOURLY", "DAILY", "WEEKLY"] as const;

export const GET = withApi(async (ctx) => {
  const [agents, runtimeEnabled] = await Promise.all([listRoster(), agentsRuntimeEnabled()]);
  const pending = await db.agentRun.count({ where: { status: "PENDING_APPROVAL" } });
  return ok({
    agents,
    runtimeEnabled,
    pendingApprovals: pending,
    phases: {
      1: AGENTS.filter((a) => a.phase === 1).length,
      2: AGENTS.filter((a) => a.phase === 2).length,
      3: AGENTS.filter((a) => a.phase === 3).length,
    },
  });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });

const patchSchema = z.object({
  key: z.string().min(1).max(80),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  cadence: z.enum(CADENCES).optional(),
  budgetTokens: z.number().int().min(0).max(10_000_000).optional(),
});

export const PATCH = withApi(async (ctx) => {
  const body = await parseBody(ctx.req, patchSchema);
  const exists = AGENTS.some((a) => a.key === body.key);
  if (!exists) throw new ApiError(404, `Unknown agent "${body.key}"`);

  const updated = await saveProfile(body.key, {
    status: body.status,
    config: body.config,
    cadence: body.cadence,
    budgetTokens: body.budgetTokens,
  });
  if (!updated) throw new ApiError(500, "Could not persist the agent profile");

  await writeAudit({
    userId: ctx.session?.id ?? null,
    userName: ctx.session?.name ?? null,
    role: ctx.session?.roles[0] ?? null,
    action: "CONFIGURE",
    entityType: "AgentProfile",
    entityId: body.key,
    entityName: updated.name,
    after: { status: updated.status, config: updated.config, budgetTokens: updated.budgetTokens },
    ipAddress: ctx.ip,
  });
  emitRealtime("agent:run", { agentKey: body.key, event: "configured", status: updated.status });
  return ok(updated);
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });
