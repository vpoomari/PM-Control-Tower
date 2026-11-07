"use client";
// PM CONTROL TOWER — AI Feature f004 · EVM Variance Explainer
// Category: Cost & Finance · importance rank 4. The arithmetic happens here
// (deterministic, client-side) and the model only explains what the numbers
// mean — EVM figures are never left to the LLM to invent.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ChartLine } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "bac", label: "BAC — budget at completion", type: "number", required: true, placeholder: "e.g. 500000" },
  { key: "pv", label: "PV — planned value", type: "number", required: true, placeholder: "e.g. 240000" },
  { key: "ev", label: "EV — earned value", type: "number", required: true, placeholder: "e.g. 210000" },
  { key: "ac", label: "AC — actual cost", type: "number", required: true, placeholder: "e.g. 245000" },
  { key: "method", label: "EAC method", type: "select", options: [
    { value: "Composite (BAC / CPI)", label: "Composite (BAC / CPI)" },
    { value: "Atypical (BAC - EV + AC)", label: "Atypical (BAC - EV + AC)" },
    { value: "Continuous (AC + (BAC - EV) / CPI)", label: "Continuous (AC + (BAC - EV) / CPI)" },
  ] },
  { key: "context", label: "What is driving it", type: "textarea", rows: 3, placeholder: "Optional: rework, rate rises, a re-scope, resource gaps…", wide: true },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The client has already computed every EVM figure you receive — treat them as fact, do not re-derive them and do not introduce any number that was not supplied or computed for you.",
  "Use these headings in plain text: POSITION (CPI, SPI, CV, SV, EAC, VAC, TCPI with the formula used for each), WHAT MOVED (why performance moved, max 4 bullets, grounded in the supplied drivers), AT COMPLETION (what the forecast means for the budget and the finish), ACTIONS (exactly 3, each with an owner role and the measurable effect it should have), CONFIDENCE (HIGH/MEDIUM/LOW with one reason).",
  "Interpretation rules: CPI or SPI below 0.95 is a problem, above 1.05 is favourable — say so explicitly; if a driver was not supplied, state that the cause is unknown rather than speculating.",
].join(" ");

const toNum = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number | null): string => (n === null ? "n/a" : n.toFixed(2));

export default function EvmVarianceExplainer() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", bac: "", pv: "", ev: "", ac: "",
    method: "Composite (BAC / CPI)", context: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const bac = toNum(values.bac);
    const pv = toNum(values.pv);
    const ev = toNum(values.ev);
    const ac = toNum(values.ac);
    if (bac === null || pv === null || ev === null || ac === null) {
      setError("BAC, PV, EV and AC must all be numbers.");
      return;
    }
    if (ac <= 0 || pv <= 0 || bac <= 0) {
      setError("BAC, PV and AC must be greater than zero to compute indexes.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const cpi = ev / ac;
      const spi = ev / pv;
      const cv = ev - ac;
      const sv = ev - pv;
      const eac =
        values.method.startsWith("Atypical")
          ? bac - ev + ac
          : values.method.startsWith("Continuous")
            ? ac + (bac - ev) / cpi
            : cpi > 0
              ? bac / cpi
              : null;
      const vac = eac === null ? null : bac - eac;
      const tcpiDen = bac - ac;
      const tcpi = tcpiDen > 0 ? (bac - ev) / tcpiDen : null;

      const prompt = [
        promptLine("Project", values.project),
        promptLine("Supplied figures", `BAC ${bac} · PV ${pv} · EV ${ev} · AC ${ac}`),
        promptLine("Computed for you", `CPI ${fmt(cpi)} · SPI ${fmt(spi)} · CV ${fmt(cv)} · SV ${fmt(sv)} · EAC ${fmt(eac)} (${values.method}) · VAC ${fmt(vac)} · TCPI ${fmt(tcpi)}`),
        promptLine("Drivers", values.context),
        "",
        "Explain the variance and recommend actions now.",
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const res = await askAIResult(prompt, SYSTEM_PROMPT);
      setResult(res);
    } catch (e) {
      setResult({
        status: "server",
        fallback: true,
        text: e instanceof Error ? e.message : "The AI request failed unexpectedly.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FeatureFrame
      id="f004"
      rank={4}
      name="EVM Variance Explainer"
      tagline="Computes CPI/SPI/EAC/TCPI deterministically, then explains the variance and the corrective actions."
      category="Cost & Finance"
      icon={ChartLine}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Explain variance"
    />
  );
}
