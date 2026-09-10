// PM CONTROL TOWER — Template Library API
// GET  /api/templates?category=PROJECT|PMO|DELIVERY&q= — list with versions count + usage
// POST /api/templates — create template + initial version

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { toJson } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const TEMPLATE_CATEGORIES = ["PROJECT", "PMO", "DELIVERY"] as const;

const createTemplateSchema = z.object({
  name: z.string().min(2).max(160),
  category: z.enum(TEMPLATE_CATEGORIES).default("PROJECT"),
  templateType: z.string().max(60).optional(),
  description: z.string().max(2000).optional(),
  methodology: z.string().max(40).optional(),
  industry: z.string().max(60).optional(),
  version: z.string().max(20).default("1.0"),
  tags: z.string().max(400).optional(),
  structure: z.record(z.string(), z.unknown()).optional(),
});

export const GET = withApi(async (ctx) => {
  const category = ctx.searchParams.get("category");
  const q = ctx.searchParams.get("q");
  if (category && !(TEMPLATE_CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError(400, `Invalid category — use one of ${TEMPLATE_CATEGORIES.join(", ")}`);
  }
  const templates = await db.template.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }, { tags: { contains: q } }] } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { versions: true } } },
  });
  return ok({ templates: templates.map((t) => ({ ...t, versionsCount: t._count.versions })) });
}, { permission: "admin.templates", rateLimit: { limit: 300, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createTemplateSchema);
  const template = await db.template.create({
    data: {
      name: body.name,
      category: body.category,
      templateType: body.templateType,
      description: body.description,
      methodology: body.methodology,
      industry: body.industry,
      version: body.version,
      tags: body.tags,
      isActive: true,
      createdBy: ctx.session.id,
      versions: {
        create: {
          version: body.version,
          changelog: "Initial version",
          structureJson: body.structure ? toJson(body.structure) : null,
          status: "ACTIVE",
          createdBy: ctx.session.id,
        },
      },
    },
    include: { versions: true },
  });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "CREATE", entityType: "Template", entityId: template.id, entityName: template.name,
    after: { category: template.category, version: template.version },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok(template, 201);
}, { permission: "admin.templates", rateLimit: { limit: 60, windowMs: 60_000 } });
