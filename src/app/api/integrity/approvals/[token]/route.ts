// PM CONTROL TOWER — Signed approval deep link execution.
// GET  /api/integrity/approvals/[token]  → decision page (HTML, human-readable)
// POST /api/integrity/approvals/[token] {decision} → performs the approval/rejection.

import { z } from "zod";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { ok, ApiError, parseBody } from "@/lib/api";
import { approveTimesheet } from "@/lib/engines/timesheet";
import { writeAudit } from "@/lib/audit";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "pmct-sandbox-dev-secret-change-in-production-0f4a9b");
const HTML = (title: string, body: string) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Segoe UI,sans-serif;background:#0a1c33;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{background:#13294a;padding:2rem;border-radius:12px;max-width:30rem}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#9fb3ce;font-size:.9rem}a,button{display:inline-block;margin-top:1rem;margin-right:.5rem;padding:.6rem 1.2rem;border-radius:8px;border:0;background:#1d4ed8;color:#fff;font-size:.95rem;cursor:pointer;text-decoration:none}button.r{background:#dc2626}</style></head><body><div><h1>PM Control Tower — Signed Approval</h1>${body}</div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);

async function decode(token: string) {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    throw new ApiError(410, "This approval link has expired or is invalid");
  }
  if (payload.typ !== "pmct-approval") throw new ApiError(400, "Not an approval token");
  return { entityType: String(payload.et), entityId: String(payload.eid) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const { entityType, entityId } = await decode(token);
    let title = entityType;
    if (entityType === "timesheet") {
      const ts = await db.timesheet.findUnique({ where: { id: entityId }, select: { resource: { select: { name: true } }, status: true } });
      title = ts ? `Timesheet of ${ts.resource.name} (status: ${ts.status})` : "Timesheet";
    } else if (entityType === "gate") {
      const g = await db.stageGate.findUnique({ where: { id: entityId }, select: { code: true, name: true } });
      title = g ? `Gate ${g.code} — ${g.name}` : "Gate";
    } else if (entityType === "change") {
      const c = await db.changeRequest.findUnique({ where: { id: entityId }, select: { code: true, title: true } });
      title = c ? `Change ${c.code} — ${c.title}` : "Change request";
    }
    return HTML("Signed approval", `<p>${title}</p><p>This link is cryptographically signed and time-limited. Your decision is audited.</p><form method="post" action=""><input type="hidden" name="decision" value="APPROVED"/><button type="submit">Approve</button></form><form method="post" action="" style="display:inline"><input type="hidden" name="decision" value="REJECTED"/><button type="submit" class="r">Reject</button></form>`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "Invalid link";
    return HTML("Link invalid", `<p>${msg}</p>`);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await req.formData().catch(() => null);
  const decision = form ? String(form.get("decision") ?? "") : "";
  try {
    const { entityType, entityId } = await decode(token);
    if (!["APPROVED", "REJECTED"].includes(decision)) throw new ApiError(400, "decision must be APPROVED or REJECTED");
    const actor = ((await db.user.findFirst({ where: { userRoles: { some: { role: { code: "PMO_ADMIN" } } } }, select: { id: true, name: true } })) ?? { id: "system", name: "Signed link" }) as { id: string; name: string };

    if (entityType === "timesheet") {
      if (decision === "APPROVED") await approveTimesheet(entityId, { id: actor.id, name: actor.name, role: "PMO_ADMIN" }, "Approved via signed deep link");
      else await db.timesheet.update({ where: { id: entityId }, data: { status: "REJECTED", reviewedAt: new Date(), comments: "Rejected via signed deep link" } });
    } else if (entityType === "gate") {
      await db.stageGate.update({ where: { id: entityId }, data: { decisionStatus: decision === "APPROVED" ? "PASSED" : "FAILED", decisionDate: new Date(), approverName: "Signed deep link" } });
    } else {
      await db.changeRequest.update({ where: { id: entityId }, data: { status: decision === "APPROVED" ? "APPROVED" : "REJECTED", decidedBy: "Signed deep link" } });
    }
    await writeAudit({ userId: actor.id, userName: "Signed deep link", action: decision, entityType: entityType === "change" ? "ChangeRequest" : entityType === "gate" ? "StageGate" : "Timesheet", entityId, entityName: `${entityType}:${entityId}`, after: { channel: "signed-deep-link", decision }, severity: "WARNING" });
    return HTML("Decision recorded", `<p><b>${decision}</b> recorded for this ${entityType}. The action is now in the audit trail.</p><p style="font-size:.75rem">You can close this window.</p>`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed";
    return HTML("Not processed", `<p>${msg}</p>`);
  }
}
