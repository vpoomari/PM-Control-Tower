const fs = require("fs");

// ============ API: full-field manual EVM period ============
let api = `// PM CONTROL TOWER — EVM API
// GET  /api/evm?projectId= — live EVM block + snapshot history
// POST /api/evm — period close: either fully computed from live rows (PERIOD_CLOSE)
//                 or a full-field manual period (MANUAL_PERIOD) with base inputs
//                 (statusDate, BAC, PV, EV, AC) and optional derived overrides.
//                 Derived metrics are always computed unless explicitly overridden.
//                 Every manual period is audited and recalc.projectHealth runs.

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, ApiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { emitRealtime } from "@/lib/realtime";
import { computeEVM } from "@/lib/engines/evm";
import { recalcProjectHealth } from "@/lib/engines/health";

export const GET = withApi(async (ctx) => {
  const projectId = ctx.searchParams.get("projectId");
  if (!projectId) throw new ApiError(400, "projectId required");
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { tasks: true, evmPeriods: { orderBy: { statusDate: "asc" } } },
  });
  if (!project) throw new ApiError(404, "Project not found");
  const evm = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, project.statusDate || new Date());
  return ok({ evm, history: project.evmPeriods, latestSnapshot: project.evmPeriods[project.evmPeriods.length - 1] ?? null });
}, { permission: "evm.view", rateLimit: { limit: 300, windowMs: 60_000 } });

const postSchema = z.object({
  projectId: z.string().min(1),
  statusDate: z.coerce.date().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  bac: z.number().min(0).optional(),
  pv: z.number().min(0).optional(),
  ev: z.number().min(0).optional(),
  ac: z.number().min(0).optional(),
  cpi: z.number().optional(),
  spi: z.number().optional(),
  eac: z.number().min(0).optional(),
  etc: z.number().min(0).optional(),
  vac: z.number().optional(),
  tcpi: z.number().optional(),
  costVariance: z.number().optional(),
  scheduleVariance: z.number().optional(),
  percentComplete: z.number().min(0).max(100).optional(),
});

export const POST = withApi(async (ctx) => {
  const session = ctx.session;
  if (!session) throw new ApiError(401, "Authentication required");
  const body = await parseBody(ctx.req, postSchema);

  const project = await db.project.findUnique({ where: { id: body.projectId }, include: { tasks: true } });
  if (!project) throw new ApiError(404, "Project not found");

  const statusDate = body.statusDate ?? project.statusDate ?? new Date();
  const live = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, statusDate);
  const manual = body.bac != null || body.pv != null || body.ev != null || body.ac != null;

  const bac = body.bac ?? live.bac;
  const pv = body.pv ?? live.pv;
  const ev = body.ev ?? live.ev;
  const ac = body.ac ?? live.ac;
  const cpi = body.cpi ?? (ac > 0 ? ev / ac : 1);
  const spi = body.spi ?? (pv > 0 ? ev / pv : 1);
  const eac = body.eac ?? (cpi > 0 ? bac / cpi : bac);
  const etc = body.etc ?? Math.max(0, eac - ac);
  const vac = body.vac ?? bac - eac;
  const tcpi = body.tcpi ?? (bac - ac !== 0 ? (bac - ev) / (bac - ac) : 1);
  const costVariance = body.costVariance ?? ev - ac;
  const scheduleVariance = body.scheduleVariance ?? ev - pv;
  const percentComplete = body.percentComplete ?? (bac > 0 ? (ev / bac) * 100 : 0);
  const source = manual ? "MANUAL_PERIOD" : "PERIOD_CLOSE";

  const period = await db.evmPeriod.create({
    data: {
      projectId: project.id,
      statusDate,
      periodStart: body.periodStart ?? project.startDate,
      periodEnd: body.periodEnd ?? project.endDate,
      bac, pv, ev, ac, cpi, spi, eac, etc, vac, tcpi, costVariance, scheduleVariance, percentComplete,
      source,
    },
  });

  await writeAudit({
    userId: session.id, userName: session.name, action: "CREATE", entityType: "EvmPeriod", entityId: period.id,
    entityName: \`EVM period — \${project.code} @ \${statusDate.toISOString().slice(0, 10)}\`,
    after: { source, bac, pv, ev, ac, cpi, spi, eac }, severity: manual ? "WARNING" : "NOTICE",
  });
  emitRealtime("evm:changed", { projectId: project.id, periodId: period.id, source }, \`project:\${project.id}\`);
  await recalcProjectHealth(project.id, source);

  return ok({ period }, 201);
}, { permission: "evm.manage", rateLimit: { limit: 60, windowMs: 60_000 } });
`;
fs.writeFileSync("src/app/api/evm/route.ts", api);

// ============ VIEW: tabs + form + about ============
let v = fs.readFileSync("src/views/control/evm.tsx", "utf8");

// imports
v = v.replace(
  'import { Camera } from "lucide-react";',
  'import { Camera, Info, FileText } from "lucide-react";\nimport { Input } from "@/components/pmct/kit";\nimport { Label } from "@/components/ui/label";'
);

// tab state after snapshotting state
v = v.replace(
  /const \[snapshotting, setSnapshotting\] = useState\(false\);/,
  `const [snapshotting, setSnapshotting] = useState(false);
  const [tab, setTab] = useState<"cockpit" | "form" | "about">("cockpit");`
);

// tab bar after PageHeader close
v = v.replace(
  `        }
      />

      {!projectId ? (`,
  `        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {([["cockpit", "Cockpit", Gauge], ["form", "Full form — all fields", FileText], ["about", "What is EVM?", Info]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={\`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors inline-flex items-center gap-1.5 \${tab === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}\`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === "form" ? <EvmFormTab projectId={projectId} onSaved={() => void evm.refetch()} /> : tab === "about" ? <EvmAboutTab /> : !projectId ? (`
);

// wrap the tail: close the conditional ternary
v = v.replace(
  `      ) : null}
    </div>
  );
}`,
  `      ) : null}
    </div>
  );
}

// ================= FULL FORM — every EVM field =================
function EvmFormTab({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [f, setF] = useState({ statusDate: new Date().toISOString().slice(0, 10), periodStart: "", periodEnd: "", bac: "", pv: "", ev: "", ac: "", cpi: "", spi: "", eac: "", etc: "", vac: "", tcpi: "", costVariance: "", scheduleVariance: "", percentComplete: "" });
  const [saving, setSaving] = useState(false);
  const n = (x: string) => (x === "" ? undefined : Number(x));
  const bac = n(f.bac) ?? 0, pv = n(f.pv) ?? 0, ev = n(f.ev) ?? 0, ac = n(f.ac) ?? 0;
  const d = {
    cpi: n(f.cpi) ?? (ac > 0 ? ev / ac : 1),
    spi: n(f.spi) ?? (pv > 0 ? ev / pv : 1),
    eac: n(f.eac) ?? (ac > 0 && ev > 0 && ac > 0 && ev / ac > 0 ? bac / (ev / ac) : bac),
    etc: n(f.etc) ?? Math.max(0, (n(f.eac) ?? (ac > 0 && ev / ac > 0 ? bac / (ev / ac) : bac)) - ac),
    vac: n(f.vac) ?? bac - (n(f.eac) ?? (ac > 0 && ev / ac > 0 ? bac / (ev / ac) : bac)),
    tcpi: n(f.tcpi) ?? (bac - ac !== 0 ? (bac - ev) / (bac - ac) : 1),
    costVariance: n(f.costVariance) ?? ev - ac,
    scheduleVariance: n(f.scheduleVariance) ?? ev - pv,
    percentComplete: n(f.percentComplete) ?? (bac > 0 ? (ev / bac) * 100 : 0),
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!bac && !pv && !ev && !ac) { toast.error("Enter at least one of BAC, PV, EV or AC"); return; }
    setSaving(true);
    try {
      await api.post("/api/evm", {
        projectId, statusDate: f.statusDate || undefined,
        periodStart: f.periodStart || undefined, periodEnd: f.periodEnd || undefined,
        bac: n(f.bac), pv: n(f.pv), ev: n(f.ev), ac: n(f.ac),
        cpi: n(f.cpi), spi: n(f.spi), eac: n(f.eac), etc: n(f.etc), vac: n(f.vac), tcpi: n(f.tcpi),
        costVariance: n(f.costVariance), scheduleVariance: n(f.scheduleVariance), percentComplete: n(f.percentComplete),
      });
      toast.success("Manual EVM period saved (source: MANUAL_PERIOD, audited) — health recalculated");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };

  const field = (label: string, k: keyof typeof f, hint?: string, type = "number") => (
    <div className="space-y-1" title={hint}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} step="any" className="h-9" value={f[k]} onChange={set(k)} />
    </div>
  );
  const derived = (label: string, value: number | string, hint: string) => (
    <div className="space-y-1" title={hint}>
      <Label className="text-xs text-slate-500">{label} (computed)</Label>
      <div className="h-9 rounded-md border bg-slate-50 px-3 flex items-center text-sm tabular-nums text-slate-700">{typeof value === "number" ? num(value, 2) : value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard title="Period-close form — every EVM field" description="Enter the reporting period and the four base inputs; every derived metric computes live. Override any derived field only if you can defend it — the snapshot is tagged MANUAL_PERIOD and audited.">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reporting period</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {field("Status date *", "statusDate", "The as-of date for this snapshot", "date")}
          {field("Period start", "periodStart", "Optional reporting window start", "date")}
          {field("Period end", "periodEnd", "Optional reporting window end", "date")}
        </div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Base inputs (from your baseline and cost ledger)</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {field("BAC — budget at completion", "bac", "Total approved budget for the work")}
          {field("PV — planned value", "pv", "Budgeted cost of work scheduled to date")}
          {field("EV — earned value", "ev", "Budgeted cost of work actually performed")}
          {field("AC — actual cost", "ac", "Real cost incurred to date")}
        </div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Derived metrics (live-computed — leave untouched unless overriding deliberately)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          {derived("CPI — cost performance", d.cpi, "EV ÷ AC — value earned per dollar spent")}
          {derived("SPI — schedule performance", d.spi, "EV ÷ PV — progress vs plan")}
          {derived("EAC — estimate at completion", d.eac, "BAC ÷ CPI (assuming current efficiency continues)")}
          {derived("ETC — estimate to complete", d.etc, "EAC − AC")}
          {derived("VAC — variance at completion", d.vac, "BAC − EAC (negative = forecast overrun)")}
          {derived("TCPI", d.tcpi, "Efficiency needed on remaining work to land on budget")}
          {derived("CV — cost variance", d.costVariance, "EV − AC")}
          {derived("SV — schedule variance", d.scheduleVariance, "EV − PV")}
          {derived("% complete", d.percentComplete, "EV ÷ BAC")}
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={saving} onClick={() => void save()}><Camera className="h-4 w-4 mr-1.5" />{saving ? "Saving…" : "Save EVM period"}</Button>
          <p className="text-xs text-slate-400">Saving triggers the cascade: EVM → health recalc → realtime refresh. Manual periods are flagged in the audit trail.</p>
        </div>
      </SectionCard>
    </div>
  );
}

// ================= WHAT IS EVM =================
function EvmAboutTab() {
  return (
    <div className="space-y-4">
      <SectionCard title="What is Earned Value Management?" description="The one method that answers all three questions at once: where did the plan say we should be, where are we really, and what does that mean for the end date and budget?">
        <p className="text-sm text-slate-600">EVM compares three curves: the <b>planned value (PV)</b> you budgeted for the work scheduled so far, the <b>earned value (EV)</b> of the work actually finished, and the <b>actual cost (AC)</b> you really paid. Together they expose what raw spend and percent-complete never can: whether you are behind, over cost, or both — and what the numbers say about the finish.</p>
      </SectionCard>
      <SectionCard title="The four base inputs" description="Everything else is math — never an opinion">
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-600">
          <p><b>BAC — Budget at Completion.</b> The approved total budget for the project. Comes from the financial baseline.</p>
          <p><b>PV — Planned Value.</b> How much work the schedule says should be done by the status date, valued at budgeted rates.</p>
          <p><b>EV — Earned Value.</b> How much work is actually done, valued at the same budgeted rates. In this platform EV flows from approved timesheets and task progress through the signature cascade.</p>
          <p><b>AC — Actual Cost.</b> What the work really cost — labour ledger plus other actuals.</p>
        </div>
      </SectionCard>
      <SectionCard title="The derived metrics and their formulas" description="Computed, never typed (unless a MANUAL_PERIOD override is deliberately taken — and then it is audited)">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">
          <p><b>CPI = EV ÷ AC.</b> Value per dollar spent. Below 1.00 = over cost.</p>
          <p><b>SPI = EV ÷ PV.</b> Progress vs schedule. Below 1.00 = behind.</p>
          <p><b>EAC = BAC ÷ CPI.</b> Expected total cost if current efficiency holds.</p>
          <p><b>ETC = EAC − AC.</b> Budget still needed from today.</p>
          <p><b>VAC = BAC − EAC.</b> Forecast surplus (positive) or overrun (negative) at completion.</p>
          <p><b>TCPI = (BAC − EV) ÷ (BAC − AC).</b> The efficiency the remaining work must achieve to still land on budget — above ~1.1 is a warning.</p>
          <p><b>CV = EV − AC.</b> Cost variance in currency.</p>
          <p><b>SV = EV − PV.</b> Schedule variance in currency.</p>
          <p><b>% complete = EV ÷ BAC.</b> Objective progress measured in earned dollars, not optimism.</p>
        </div>
      </SectionCard>
      <SectionCard title="How this platform keeps EVM honest" description="Integrity Layer rules apply here too">
        <div className="space-y-2 text-sm text-slate-600">
          <p>• The <b>Cockpit tab</b> always computes EVM live from tasks, actuals and the baseline — the same numbers the executive tower uses.</p>
          <p>• The <b>Full form tab</b> exists for governed period closes where the finance-recognised figures differ from the live computation: the snapshot is tagged <b>MANUAL_PERIOD</b>, audited with your identity, and health recalculates through the normal cascade.</p>
          <p>• Every snapshot feeds the trend lines, the governance thresholds (CPI/SPI rules raise alerts), and the P80 Monte Carlo cost model.</p>
        </div>
      </SectionCard>
    </div>
  );
}
`);
fs.writeFileSync("src/views/control/evm.tsx", v);
console.log("view patched:", v.includes("EvmFormTab") && v.includes("EvmAboutTab") && v.includes("tab === \"form\""));
