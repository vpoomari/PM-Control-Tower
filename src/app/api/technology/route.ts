// PM CONTROL TOWER — Technology & Architecture API (CTO tower)
// GET /api/technology — computed technology portfolio: apps, lifecycle, debt, releases,
// legacy exposure %, cloud adoption %, unsupported technologies, DevOps metrics.
// POST /api/technology — register an application (integration.manage).

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export const GET = withApi(async () => {
  const [apps, techs, debts, releases] = await Promise.all([
    db.techApplication.findMany({ orderBy: { name: "asc" }, include: { debts: true, releases: { orderBy: { releasedAt: "desc" }, take: 3 } } }),
    db.techTechnology.findMany({ orderBy: { name: "asc" } }),
    db.technicalDebt.findMany({ where: { status: { in: ["OPEN", "PLANNED"] } }, orderBy: { severity: "desc" } }),
    db.techRelease.findMany({ orderBy: { releasedAt: "desc" }, take: 50 }),
  ]);

  const total = apps.length || 1;
  const legacy = apps.filter((a) => a.lifecycleStatus === "LEGACY" || a.lifecycleStatus === "SUNSET").length;
  const cloud = apps.filter((a) => a.cloudHosted).length;
  const missionCritical = apps.filter((a) => a.businessCriticality === "MISSION_CRITICAL").length;
  const openDebt = debts.filter((d) => d.status === "OPEN");
  const debtHours = round1(openDebt.reduce((s, d) => s + d.estimateHours, 0));
  const now = Date.now();
  const rel90 = releases.filter((r) => now - r.releasedAt.getTime() <= 90 * 86_400_000);
  const deployments90 = rel90.reduce((s, r) => s + r.deployments, 0);
  const depFreq = Math.round((deployments90 / 13) * 10) / 10; // per week over ~13 weeks
  const avgLead = rel90.length ? round1(rel90.reduce((s, r) => s + r.leadTimeDays, 0) / rel90.length) : 0;
  const rollbacks = rel90.filter((r) => r.status === "ROLLED_BACK").length;
  const unsupported = techs.filter((t) => t.lifecycleStatus === "UNSUPPORTED");

  return ok({
    apps, technologies: techs, debt: debts, releases: releases.slice(0, 15),
    kpis: {
      totalApps: apps.length, missionCritical, legacyApps: legacy,
      legacyExposurePct: Math.round((legacy / total) * 1000) / 10,
      cloudAdoptionPct: Math.round((cloud / total) * 1000) / 10,
      openDebtItems: openDebt.length, debtHours,
      criticalDebt: openDebt.filter((d) => d.severity === "CRITICAL").length,
      unsupportedTech: unsupported.length, unsupportedNames: unsupported.map((t) => t.name),
      releases90d: rel90.length, deploymentsPerWeek: depFreq, avgLeadTimeDays: avgLead,
      rollbacks90d: rollbacks,
      architectureHealth: Math.round(Math.max(0, 100 - (legacy / total) * 60 - (openDebt.filter((d) => d.severity === "CRITICAL" || d.severity === "HIGH").length / Math.max(openDebt.length, 1)) * 30 - (unsupported.length * 5))),
    },
  });
}, { permission: "integration.view", rateLimit: { limit: 240, windowMs: 60_000 } });

const postSchema = z.object({
  name: z.string().min(2),
  category: z.enum(["APPLICATION", "PLATFORM", "INFRASTRUCTURE", "API"]).default("APPLICATION"),
  businessCriticality: z.enum(["LOW", "MEDIUM", "HIGH", "MISSION_CRITICAL"]).default("MEDIUM"),
  lifecycleStatus: z.enum(["PLANNED", "ACTIVE", "LEGACY", "SUNSET", "RETIRED"]).default("ACTIVE"),
  cloudHosted: z.boolean().default(false),
  owner: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
  healthScore: z.number().int().min(0).max(100).default(80),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, postSchema);
  const app = await db.techApplication.create({ data: body });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "TechApplication", entityId: app.id, entityName: app.name, after: { lifecycleStatus: app.lifecycleStatus, criticality: app.businessCriticality } });
  return ok({ app }, 201);
}, { permission: "integration.manage", rateLimit: { limit: 60, windowMs: 60_000 } });

function round1(n: number) { return Math.round(n * 10) / 10; }
