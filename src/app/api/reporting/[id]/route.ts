// PM CONTROL TOWER — Generated report viewer + printable download
// GET /api/reporting/[id]                 — full report JSON
// GET /api/reporting/[id]?format=html     — print-friendly HTML (browser Print -> PDF)

import { db } from "@/lib/db";
import { ok, ApiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user, "reports.view")) {
    return new Response(JSON.stringify({ success: false, error: "Authentication required" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const { id } = await params;
  const r = await db.generatedReport.findUnique({ where: { id } });
  if (!r) throw new ApiError(404, "Report not found");
  const data = JSON.parse(r.dataJson);
  const kpis = (data.kpis ?? {}) as Record<string, unknown>;

  if (new URL(req.url).searchParams.get("format") === "html") {
    const fmt = (v: unknown) => (typeof v === "number" ? (v > 1000 ? "$" + Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100)) : String(v ?? "—"));
    const kpiRows = Object.entries(kpis).map(([k, v]) => `<tr><td>${k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</td><td class="v">${fmt(v)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${r.templateName}</title><style>
    body{font-family:'Segoe UI',sans-serif;margin:0;color:#1e2a3b}
    .head{background:#0a1c33;color:#fff;padding:24px 32px}
    .head h1{margin:0;font-size:22px}.head p{margin:4px 0 0;color:#9fb3ce;font-size:12px}
    .wrap{padding:24px 32px}
    .conf{margin-top:24px;padding-top:12px;border-top:1px solid #dde;text-align:center;color:#889;font-size:10px;letter-spacing:1px}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    td,th{border:1px solid #e2e8f0;padding:8px 12px;font-size:13px;text-align:left}
    td.v{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
    .narr{background:#f2f6fb;border-left:4px solid #1d4ed8;padding:12px 16px;font-size:13px;margin:16px 0}
    .ai{color:#889;font-size:10px;margin-top:4px}
    </style></head><body>
    <div class="head"><h1>${r.templateName}</h1><p>Category: ${r.category} · Period: ${r.period.replace(/_/g, " ").toLowerCase()} · Generated ${new Date(r.createdAt).toLocaleString()} by ${r.generatedBy} · PM Control Tower</p></div>
    <div class="wrap">
    <div class="narr"><b>Executive commentary</b><br/>${r.narrative ?? ""}<div class="ai">AI commentary generated deterministically from the system data below.</div></div>
    <h3>Key figures</h3>
    <table>${kpiRows}</table>
    <div class="conf">CONFIDENTIAL — INTERNAL MANAGEMENT USE ONLY · PM CONTROL TOWER</div>
    </div></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  return ok({
    id: r.id, templateName: r.templateName, category: r.category, period: r.period,
    generatedBy: r.generatedBy, generatedAt: r.createdAt, createdAt: r.createdAt, narrative: r.narrative,
    data,
  });
}
