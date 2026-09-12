const fs = require("fs");
let v = fs.readFileSync("src/views/control/evm.tsx", "utf8");
const NL = "\r\n";
if (v.includes("EvmFormTab")) { console.log("already patched"); process.exit(0); }

v = v.replace('import { Camera } from "lucide-react";', 'import { Camera, Info, FileText, Gauge } from "lucide-react";' + NL + 'import { Input } from "@/components/pmct/kit";' + NL + 'import { Label } from "@/components/ui/label";');
v = v.replace("const [snapshotting, setSnapshotting] = useState(false);", "const [snapshotting, setSnapshotting] = useState(false);" + NL + `  const [tab, setTab] = useState<"cockpit" | "form" | "about">("cockpit");`);

const anchor1 = "        }" + NL + "      />" + NL + NL + "      {!projectId ? (";
if (!v.includes(anchor1)) throw new Error("anchor1 missing");
const tabBar =
  "        }" + NL + "      />" + NL + NL +
  '      <div className="flex flex-wrap items-center gap-2">' + NL +
  '        {([["cockpit", "Cockpit", Gauge], ["form", "Full form — all fields", FileText], ["about", "What is EVM?", Info]] as const).map(([key, label, Icon]) => (' + NL +
  '          <button key={key} onClick={() => setTab(key)}' + NL +
  '            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${tab === key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>' + NL +
  '            <Icon className="h-4 w-4" />{label}' + NL +
  "          </button>" + NL +
  "        ))}" + NL +
  "      </div>" + NL + NL +
  '      {tab === "form" ? <EvmFormTab projectId={projectId} onSaved={() => void evm.refetch()} /> : tab === "about" ? <EvmAboutTab /> : !projectId ? (';
v = v.replace(anchor1, tabBar);

const anchor2 = "      ) : null}" + NL + "    </div>" + NL + "  );" + NL + "}";
if (!v.includes(anchor2)) throw new Error("anchor2 missing");
const tail =
  "      ) : null}" + NL + "    </div>" + NL + "  );" + NL + "}" + NL + NL +
  "// ================= FULL FORM — every EVM field =================" + NL +
  'function EvmFormTab({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {' + NL +
  `  const [f, setF] = useState({ statusDate: new Date().toISOString().slice(0, 10), periodStart: "", periodEnd: "", bac: "", pv: "", ev: "", ac: "", cpi: "", spi: "", eac: "", etc: "", vac: "", tcpi: "", costVariance: "", scheduleVariance: "", percentComplete: "" });` + NL +
  "  const [saving, setSaving] = useState(false);" + NL +
  '  const n = (x: string) => (x === "" ? undefined : Number(x));' + NL +
  "  const bac = n(f.bac) ?? 0, pv = n(f.pv) ?? 0, ev = n(f.ev) ?? 0, ac = n(f.ac) ?? 0;" + NL +
  "  const eacCalc = ac > 0 && ev / ac > 0 ? bac / (ev / ac) : bac;" + NL +
  "  const d = {" + NL +
  "    cpi: n(f.cpi) ?? (ac > 0 ? ev / ac : 1)," + NL +
  "    spi: n(f.spi) ?? (pv > 0 ? ev / pv : 1)," + NL +
  "    eac: n(f.eac) ?? eacCalc," + NL +
  "    etc: n(f.etc) ?? Math.max(0, eacCalc - ac)," + NL +
  "    vac: n(f.vac) ?? bac - eacCalc," + NL +
  "    tcpi: n(f.tcpi) ?? (bac - ac !== 0 ? (bac - ev) / (bac - ac) : 1)," + NL +
  "    costVariance: n(f.costVariance) ?? ev - ac," + NL +
  "    scheduleVariance: n(f.scheduleVariance) ?? ev - pv," + NL +
  "    percentComplete: n(f.percentComplete) ?? (bac > 0 ? (ev / bac) * 100 : 0)," + NL +
  "  };" + NL +
  '  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));' + NL + NL +
  "  const save = async () => {" + NL +
  '    if (!bac && !pv && !ev && !ac) { toast.error("Enter at least one of BAC, PV, EV or AC"); return; }' + NL +
  "    setSaving(true);" + NL +
  "    try {" + NL +
  '      await api.post("/api/evm", {' + NL +
  "        projectId, statusDate: f.statusDate || undefined," + NL +
  '        periodStart: f.periodStart || undefined, periodEnd: f.periodEnd || undefined,' + NL +
  "        bac: n(f.bac), pv: n(f.pv), ev: n(f.ev), ac: n(f.ac)," + NL +
  "        cpi: n(f.cpi), spi: n(f.spi), eac: n(f.eac), etc: n(f.etc), vac: n(f.vac), tcpi: n(f.tcpi)," + NL +
  '        costVariance: n(f.costVariance), scheduleVariance: n(f.scheduleVariance), percentComplete: n(f.percentComplete),' + NL +
  "      });" + NL +
  '      toast.success("Manual EVM period saved (source: MANUAL_PERIOD, audited) — health recalculated");' + NL +
  "      onSaved();" + NL +
  '    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }' + NL +
  "  };" + NL + NL +
  '  const field = (label: string, k: keyof typeof f, hint?: string, type = "number") => (' + NL +
  '    <div className="space-y-1" title={hint}>' + NL +
  '      <Label className="text-xs">{label}</Label>' + NL +
  '      <Input type={type} step="any" className="h-9" value={f[k]} onChange={set(k)} />' + NL +
  "    </div>" + NL +
  "  );" + NL +
  '  const derived = (label: string, value: number, hint: string) => (' + NL +
  '    <div className="space-y-1" title={hint}>' + NL +
  '      <Label className="text-xs text-slate-500">{label} (computed)</Label>' + NL +
  '      <div className="h-9 rounded-md border bg-slate-50 px-3 flex items-center text-sm tabular-nums text-slate-700">{num(value, 2)}</div>' + NL +
  "    </div>" + NL +
  "  );" + NL + NL +
  "  return (" + NL +
  '    <div className="space-y-4">' + NL +
  '      <SectionCard title="Period-close form — every EVM field" description="Enter the reporting period and the four base inputs; every derived metric computes live. Override a derived field only if you can defend it — the snapshot is tagged MANUAL_PERIOD and audited.">' + NL +
  '        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reporting period</p>' + NL +
  '        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">' + NL +
  '          {field("Status date *", "statusDate", "The as-of date for this snapshot", "date")}' + NL +
  '          {field("Period start", "periodStart", "Optional reporting window start", "date")}' + NL +
  '          {field("Period end", "periodEnd", "Optional reporting window end", "date")}' + NL +
  "        </div>" + NL +
  '        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Base inputs (from your baseline and cost ledger)</p>' + NL +
  '        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">' + NL +
  '          {field("BAC - budget at completion", "bac", "Total approved budget for the work")}' + NL +
  '          {field("PV - planned value", "pv", "Budgeted cost of work scheduled to date")}' + NL +
  '          {field("EV - earned value", "ev", "Budgeted cost of work actually performed")}' + NL +
  '          {field("AC - actual cost", "ac", "Real cost incurred to date")}' + NL +
  "        </div>" + NL +
  '        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Derived metrics (live-computed - override only deliberately)</p>' + NL +
  '        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">' + NL +
  '          {derived("CPI - cost performance", d.cpi, "EV / AC - value earned per dollar spent")}' + NL +
  '          {derived("SPI - schedule performance", d.spi, "EV / PV - progress vs plan")}' + NL +
  '          {derived("EAC - estimate at completion", d.eac, "BAC / CPI (assuming current efficiency continues)")}' + NL +
  '          {derived("ETC - estimate to complete", d.etc, "EAC - AC")}' + NL +
  '          {derived("VAC - variance at completion", d.vac, "BAC - EAC (negative = forecast overrun)")}' + NL +
  '          {derived("TCPI", d.tcpi, "Efficiency needed on remaining work to land on budget")}' + NL +
  '          {derived("CV - cost variance", d.costVariance, "EV - AC")}' + NL +
  '          {derived("SV - schedule variance", d.scheduleVariance, "EV - PV")}' + NL +
  '          {derived("% complete", d.percentComplete, "EV / BAC")}' + NL +
  "        </div>" + NL +
  '        <div className="flex items-center gap-3">' + NL +
  '          <Button disabled={saving} onClick={() => void save()}><Camera className="h-4 w-4 mr-1.5" />{saving ? "Saving…" : "Save EVM period"}</Button>' + NL +
  '          <p className="text-xs text-slate-400">Saving triggers the cascade: EVM → health recalc → realtime refresh. Manual periods are flagged in the audit trail.</p>' + NL +
  "        </div>" + NL +
  "      </SectionCard>" + NL +
  "    </div>" + NL +
  "  );" + NL +
  "}" + NL + NL +
  "// ================= WHAT IS EVM =================" + NL +
  "function EvmAboutTab() {" + NL +
  "  return (" + NL +
  '    <div className="space-y-4">' + NL +
  '      <SectionCard title="What is Earned Value Management?" description="The one method that answers all three questions at once: where did the plan say we should be, where are we really, and what does that mean for the end date and budget?">' + NL +
  '        <p className="text-sm text-slate-600">EVM compares three curves: the <b>planned value (PV)</b> you budgeted for the work scheduled so far, the <b>earned value (EV)</b> of the work actually finished, and the <b>actual cost (AC)</b> you really paid. Together they expose what raw spend and percent-complete never can: whether you are behind, over cost, or both — and what the numbers say about the finish.</p>' + NL +
  "      </SectionCard>" + NL +
  '      <SectionCard title="The four base inputs" description="Everything else is math — never an opinion">' + NL +
  '        <div className="grid sm:grid-cols-2 gap-3 text-sm text-slate-600">' + NL +
  "          <p><b>BAC — Budget at Completion.</b> The approved total budget for the project. Comes from the financial baseline.</p>" + NL +
  "          <p><b>PV — Planned Value.</b> How much work the schedule says should be done by the status date, valued at budgeted rates.</p>" + NL +
  "          <p><b>EV — Earned Value.</b> How much work is actually done, valued at the same budgeted rates. In this platform EV flows from approved timesheets through the signature cascade.</p>" + NL +
  "          <p><b>AC — Actual Cost.</b> What the work really cost — the labour cost ledger plus other actuals.</p>" + NL +
  "        </div>" + NL +
  "      </SectionCard>" + NL +
  '      <SectionCard title="The derived metrics and their formulas" description="Computed, never typed (unless a MANUAL_PERIOD override is deliberately taken — and then it is audited)">' + NL +
  '        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">' + NL +
  "          <p><b>CPI = EV / AC.</b> Value per dollar spent. Below 1.00 = over cost.</p>" + NL +
  "          <p><b>SPI = EV / PV.</b> Progress vs schedule. Below 1.00 = behind.</p>" + NL +
  "          <p><b>EAC = BAC / CPI.</b> Expected total cost if current efficiency holds.</p>" + NL +
  "          <p><b>ETC = EAC - AC.</b> Budget still needed from today.</p>" + NL +
  "          <p><b>VAC = BAC - EAC.</b> Forecast surplus (positive) or overrun (negative) at completion.</p>" + NL +
  "          <p><b>TCPI = (BAC - EV) / (BAC - AC).</b> The efficiency the remaining work must achieve to still land on budget — above ~1.1 is a warning.</p>" + NL +
  "          <p><b>CV = EV - AC.</b> Cost variance in currency.</p>" + NL +
  "          <p><b>SV = EV - PV.</b> Schedule variance in currency.</p>" + NL +
  "          <p><b>% complete = EV / BAC.</b> Objective progress measured in earned dollars, not optimism.</p>" + NL +
  "        </div>" + NL +
  "      </SectionCard>" + NL +
  '      <SectionCard title="How this platform keeps EVM honest" description="Integrity Layer rules apply here too">' + NL +
  '        <div className="space-y-2 text-sm text-slate-600">' + NL +
  "          <p>• The <b>Cockpit tab</b> always computes EVM live from tasks, actuals and the baseline — the same numbers the executive tower uses.</p>" + NL +
  "          <p>• The <b>Full form tab</b> exists for governed period closes where the finance-recognised figures differ from the live computation: the snapshot is tagged <b>MANUAL_PERIOD</b>, audited with your identity, and health recalculates through the normal cascade.</p>" + NL +
  "          <p>• Every snapshot feeds the trend lines, the governance thresholds (CPI/SPI rules raise alerts), and the P80 Monte Carlo cost model.</p>" + NL +
  "        </div>" + NL +
  "      </SectionCard>" + NL +
  "    </div>" + NL +
  "  );" + NL +
  "}";
v = v.replace(anchor2, tail);
fs.writeFileSync("src/views/control/evm.tsx", v);
console.log("patched:", v.includes("EvmFormTab") && v.includes("EvmAboutTab"));
