// PM CONTROL TOWER — Evidence Bundle verification
// POST /api/integrity/evidence/[id]/verify — re-derive the hash chain against CURRENT
// records; tampering with any stored row flips the result to FAIL + pinpointed doc.

import { withApi, ok, ApiError } from "@/lib/api";
import { verifyEvidenceBundle } from "@/lib/services/integrity";

export const POST = withApi(async (ctx) => {
  const { id } = ctx.params as { id: string };
  if (!id) throw new ApiError(400, "Bundle id required");
  const res = await verifyEvidenceBundle(id);
  return ok(res);
}, { permission: "integrity.view", rateLimit: { limit: 60, windowMs: 60_000 } });
