// PM CONTROL TOWER — Document upload/list (uses existing Document model fields)
// GET  /api/documents?projectId= — list
// POST /api/documents {projectId, name, content, entityRef?} — upload doc with version increment

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  const docs = await db.document.findMany({
    where: projectId ? { projectId } : {},
    orderBy: { uploadedAt: "desc" },
    take: 50,
    select: { id: true, name: true, projectId: true, uploadedBy: true, sizeKb: true, version: true, uploadedAt: true },
  });
  return ok({ documents: docs });
}, { permission: "project.view", rateLimit: { limit: 240, windowMs: 60_000 } });

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({
    projectId: z.string(), name: z.string().min(1),
    content: z.string(), entityRef: z.string().optional().nullable(),
    docType: z.string().optional().nullable(), category: z.string().optional().nullable(),
  }));
  const existing = await db.document.findFirst({ where: { projectId: body.projectId, name: body.name }, orderBy: { uploadedAt: "desc" } });
  const nextVer = existing ? String(Number(existing.version) + 1) : "1.0";
  const doc = await db.document.create({
    data: {
      projectId: body.projectId, name: body.name,
      docType: body.docType ?? null, category: body.category ?? null,
      uploadedBy: session.name, sizeKb: Math.round(body.content.length / 1024 * 10) / 10, version: nextVer,
    },
  });
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "Document", entityId: doc.id, entityName: body.name, after: { version: nextVer, sizeKb: doc.sizeKb } });
  return ok({ document: doc }, 201);
}, { permission: "wbs.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
