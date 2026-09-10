// PM CONTROL TOWER — Template detail
// GET    /api/templates/[id] — template + all versions
// PATCH  /api/templates/[id] — update metadata, optionally publish a new version
// DELETE /api/templates/[id] — soft delete (isActive = false)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { toJson } from "@/lib/constants";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  methodology: z.string().max(40).nullable().optional(),
  industry: z.string().max(60).nullable().optional(),
  templateType: z.string().max(60).nullable().optional(),
  tags: z.string().max(400).nullable().optional(),
  isActive: z.boolean().optional(),
  // Optional new version publication
  version: z.string().max(20).optional(),
  changelog: z.string().max(1000).optional(),
  structure: z.record(z.string(), z.unknown()).optional(),
});

export const GET = withApi(async (ctx) => {
  const id = ctx.params.id;
  const template = await db.template.findUnique({
    where: { id },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  if (!template) throw new ApiError(404, "Template not found");
  return ok(template);
}, { permission: "admin.templates", rateLimit: { limit: 300, windowMs: 60_000 } });

export const PATCH = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const template = await db.template.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Template not found");
  const body = await parseBody(ctx.req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No fields to update");

  const before = { name: template.name, version: template.version, description: template.description, isActive: template.isActive };

  // New version publication: requires version + structure
  const wantsNewVersion = body.version !== undefined && body.structure !== undefined;
  if (body.version !== undefined && !wantsNewVersion) {
    throw new ApiError(400, "Publishing a version requires both `version` and `structure`");
  }

  const updated = await db.template.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.methodology !== undefined ? { methodology: body.methodology } : {}),
      ...(body.industry !== undefined ? { industry: body.industry } : {}),
      ...(body.templateType !== undefined ? { templateType: body.templateType } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(wantsNewVersion ? { version: body.version as string } : {}),
    },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  let newVersionCreated = false;
  if (wantsNewVersion) {
    await db.templateVersion.create({
      data: {
        templateId: id,
        version: body.version as string,
        changelog: body.changelog ?? "Updated structure",
        structureJson: toJson(body.structure),
        status: "ACTIVE",
        createdBy: ctx.session.id,
      },
    });
    newVersionCreated = true;
  }

  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "UPDATE", entityType: "Template", entityId: id, entityName: updated.name,
    before,
    after: { name: updated.name, version: updated.version, isActive: updated.isActive, newVersionCreated },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
  });
  return ok({ ...updated, newVersionCreated });
}, { permission: "admin.templates", rateLimit: { limit: 120, windowMs: 60_000 } });

export const DELETE = withApi(async (ctx) => {
  if (!ctx.session) throw new ApiError(401, "Authentication required");
  const id = ctx.params.id;
  const template = await db.template.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Template not found");
  const updated = await db.template.update({ where: { id }, data: { isActive: false } });
  await writeAudit({
    userId: ctx.session.id, userName: ctx.session.name, role: ctx.session.roles[0],
    action: "DELETE", entityType: "Template", entityId: id, entityName: template.name,
    before: { isActive: template.isActive }, after: { isActive: updated.isActive },
    ipAddress: ctx.ip, userAgent: ctx.req.headers.get("user-agent"),
    context: "Soft delete — template deactivated",
  });
  return ok({ deactivated: true, id });
}, { permission: "admin.templates", rateLimit: { limit: 60, windowMs: 60_000 } });
