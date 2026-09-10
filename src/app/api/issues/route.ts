// PM CONTROL TOWER — Issue Register API
// GET  /api/issues?projectId&status&severity&q — issue log
// POST /api/issues — create issue (auto code ISS-###; CRITICAL severity ⇒ priority CRITICAL)

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime, projectRoom } from "@/lib/realtime";
import { runAutomations } from "@/lib/engines/automations";

const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const ISSUE_CATEGORIES = ["TECHNICAL", "COMMERCIAL", "FINANCIAL", "OPERATIONAL", "REGULATORY", "RESOURCE", "QUALITY", "VENDOR", "OTHER"] as const;

async function nextIssueCode(): Promise<string> {
  const count = await db.issue.count();
  for (let n = count + 1; n < count + 1000; n++) {
    const code = `ISS-${String(n).padStart(3, "0")}`;
    const dup = await db.issue.findFirst({ where: { code }, select: { id: true } });
    if (!dup) return code;
  }
  throw new ApiError(500, "Unable to allocate an issue code");
}

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId")?.trim();
  const status = ctx.searchParams.get("status")?.trim();
  const severity = ctx.searchParams.get("severity")?.trim();
  const q = ctx.searchParams.get("q")?.trim();

  if (status && !ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number])) {
    throw new ApiError(400, `Invalid status. Use one of: ${ISSUE_STATUSES.join(", ")}`);
  }

  const issues = await db.issue.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }, { code: { contains: q } }] } : {}),
    },
    include: { project: { select: { id: true, code: true, name: true } } },
    orderBy: [{ severity: "asc" }, { raisedAt: "desc" }],
    take: 200,
  });

  const open = issues.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS");
  return ok({
    issues,
    total: issues.length,
    summary: {
      open: open.length,
      critical: open.filter((i) => i.severity === "CRITICAL").length,
      resolved: issues.filter((i) => i.status === "RESOLVED" || i.status === "CLOSED").length,
    },
  });
}, { permission: "project.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().optional().nullable(),
  category: z.enum(ISSUE_CATEGORIES).default("TECHNICAL"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  ownerName: z.string().optional().nullable(),
  raisedBy: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  escalationLevel: z.enum(["NONE", "PROJECT", "PROGRAM", "PORTFOLIO"]).default("NONE"),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, createSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new ApiError(404, "Project not found");

  // Severity auto-propagates to priority: CRITICAL issue ⇒ CRITICAL priority
  const priority = body.severity === "CRITICAL" ? "CRITICAL" : body.severity === "HIGH" ? "HIGH" : "MEDIUM";
  const code = await nextIssueCode();

  const created = await db.issue.create({
    data: {
      projectId: body.projectId,
      code,
      title: body.title,
      description: body.description ?? null,
      category: body.category,
      priority,
      severity: body.severity,
      status: "OPEN",
      ownerName: body.ownerName ?? null,
      raisedBy: body.raisedBy ?? session.name,
      impact: body.impact ?? null,
      escalationLevel: body.escalationLevel,
      raisedAt: new Date(),
      dueDate: body.dueDate ?? null,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, role: session.roles[0],
    action: "CREATE", entityType: "Issue", entityId: created.id, entityName: `${created.code} — ${created.title}`,
    after: { severity: created.severity, priority, status: "OPEN" },
    ipAddress: ctx.ip,
  });
  emitRealtime("raid:changed", { projectId: body.projectId, type: "issue", issueId: created.id, code, severity: created.severity, action: "CREATED" }, projectRoom(body.projectId));
  await runAutomations("RAID_CREATED", { entityType: "Issue", entityId: created.id, projectId: body.projectId, severity: created.severity });
  return ok({ issue: created }, 201);
}, { permission: "raid.manage", rateLimit: { limit: 120, windowMs: 60_000 } });
