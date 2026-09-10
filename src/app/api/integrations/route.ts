// PM CONTROL TOWER — Integration Hub API
// GET  /api/integrations — catalog grouped by category (credential + recent event counts)
// POST /api/integrations — register a new integration (honest initial state)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { INTEGRATION_CATEGORIES } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.string().refine((c) => (INTEGRATION_CATEGORIES as readonly string[]).includes(c), "Unknown integration category"),
  provider: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  authType: z.string().max(40).default("API_KEY"),
  syncDirection: z.string().max(20).default("OUTBOUND"),
  syncFrequency: z.string().max(20).default("HOURLY"),
});

export const GET = withApi(async () => {
  const [integrations, recentEvents] = await Promise.all([
    db.integration.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { _count: { select: { credentials: true, events: true } } },
    }),
    db.integrationEvent.groupBy({
      by: ["integrationId"],
      where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      _count: { id: true },
    }),
  ]);
  const recentMap = new Map(recentEvents.map((e) => [e.integrationId, e._count.id]));
  const rows = integrations.map((i) => ({
    ...i,
    credentialCount: i._count.credentials,
    recentEventCount: recentMap.get(i.id) ?? 0,
    _count: undefined,
  }));

  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    (grouped[row.category] ??= []).push(row);
  }
  return ok({
    categories: Object.keys(grouped).sort().map((category) => ({ category, integrations: grouped[category] })),
    total: rows.length,
  });
}, { permission: "integration.view", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);
  const integration = await db.integration.create({
    data: {
      name: body.name,
      category: body.category,
      provider: body.provider,
      description: body.description,
      // Honest initial state — an integration is never CONNECTED until real credentials
      // are registered and a live connectivity test proves the link.
      status: "DISCONNECTED",
      authType: body.authType,
      authStatus: "NOT_CONFIGURED",
      syncDirection: body.syncDirection,
      syncFrequency: body.syncFrequency,
      createdBy: ctx.session.id,
    },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "Integration", entityId: integration.id, entityName: integration.name,
    after: { category: integration.category, status: integration.status, authStatus: integration.authStatus },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(integration, 201);
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
