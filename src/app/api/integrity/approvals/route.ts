// PM CONTROL TOWER — Chat-native approvals: signed, expiring deep links.
// POST /api/integrity/approvals {entityType, entityId, ttlMinutes} → one-time URL.
// GET  .../{token}  → human-readable decision page (Approve / Reject).
// POST .../{token} {decision} → executes the approval and audits it.
// HONEST STATUS: the link mechanism is Implemented in-app; external chat channels
// (Teams/WhatsApp) remain "Configured", not "Connected", until tested live.

import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "pmct-sandbox-dev-secret-change-in-production-0f4a9b");
const TTL_MIN = z.number().int().min(5).max(20160).default(720);

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, z.object({
    projectId: z.string().optional(),
    entityType: z.enum(["timesheet", "gate", "change"]).optional(),
    entityId: z.string().optional(),
    ttlMinutes: TTL_MIN,
  }));
  // Resolve entity: explicit id wins; otherwise pick the first pending entity of the project
  let entityType = body.entityType;
  let entityId = body.entityId;
  if ((!entityType || !entityId) && body.projectId) {
    const ts = await db.timesheet.findFirst({ where: { status: "PENDING", resource: { assignments: { some: { projectId: body.projectId } } } }, orderBy: { weekStart: "asc" }, select: { id: true } });
    if (ts) { entityType = "timesheet"; entityId = ts.id; }
    else {
      const g = await db.stageGate.findFirst({ where: { projectId: body.projectId, decisionStatus: "PENDING" }, orderBy: { sequence: "asc" }, select: { id: true } });
      if (g) { entityType = "gate"; entityId = g.id; }
      else {
        const cr = await db.changeRequest.findFirst({ where: { projectId: body.projectId, status: { in: ["DRAFT", "SUBMITTED", "ASSESSMENT"] } }, orderBy: { createdAt: "desc" }, select: { id: true } });
        if (cr) { entityType = "change"; entityId = cr.id; }
      }
    }
  }
  if (!entityType || !entityId) throw new ApiError(404, "No pending approval entity found for this project");
  let entityTitle: string = entityType;
  if (entityType === "timesheet") {
    const ts = await db.timesheet.findUnique({ where: { id: entityId }, select: { resource: { select: { name: true } }, weekStart: true } });
    if (!ts) throw new ApiError(404, "Timesheet not found");
    entityTitle = `Timesheet — ${ts.resource.name} (week of ${ts.weekStart.toISOString().slice(0, 10)})`;
  } else if (entityType === "gate") {
    const g = await db.stageGate.findUnique({ where: { id: entityId }, select: { code: true, name: true } });
    if (!g) throw new ApiError(404, "Gate not found");
    entityTitle = `Gate ${g.code} — ${g.name}`;
  } else {
    const c = await db.changeRequest.findUnique({ where: { id: entityId }, select: { code: true, title: true } });
    if (!c) throw new ApiError(404, "Change request not found");
    entityTitle = `Change ${c.code} — ${c.title}`;
  }
  const token = await new SignJWT({ typ: "pmct-approval", et: entityType, eid: entityId })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${body.ttlMinutes}m`).sign(secret());
  await writeAudit({ userId: session.id, userName: session.name, action: "CREATE", entityType: "ApprovalLink", entityId, entityName: entityTitle, after: { ttlMinutes: body.ttlMinutes, channel: "signed-deep-link" }, severity: "NOTICE" });
  const expiresAt = new Date(Date.now() + body.ttlMinutes * 60_000);
  return ok({ url: `/api/integrity/approvals/${token}`, expiresAt, title: entityTitle, status: "CONFIGURED" }, 201);
}, { permission: "integrity.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
