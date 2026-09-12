// PM CONTROL TOWER — Evidence bundle ZIP download (audit-grade export)
// GET /api/integrity/evidence/[id]/download → INDEX.txt + manifest.json + docs/*.json in a zip.

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fail } from "@/lib/api";
import { buildEvidenceZip } from "@/lib/services/integrity";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(_req);
    if (!user || !hasPermission(user, "integrity.view")) return fail(401, "Authentication required");
    const { id } = await params;
    const { zip, projectCode } = await buildEvidenceZip(id);
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="evidence-${projectCode}-${id.slice(-6)}.zip"`,
      },
    });
  } catch (e) {
    return fail(e instanceof Error && e.message.includes("not found") ? 404 : 500, e instanceof Error ? e.message : "Export failed");
  }
}
