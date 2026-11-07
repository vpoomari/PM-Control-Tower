"use client";
// PM CONTROL TOWER — AI Feature f016 · Cost Forecast (EAC / ETC / VAC)
// Category: Cost & Finance · importance rank 16. The arithmetic happens here
// (deterministic, client-side): EAC for all three methods, ETC and VAC are
// computed and passed in — the model compares and explains, never calculates.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ChartColumn } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "bac", label: "BAC — budget at completion", type: "number", required: true, placeholder: "e.g. 500000" },
  { key: "ac", label: "AC — actual cost to date", type: "number", required: true, placeholder: "e.g. 245000" },
  { key: "ev", label: "EV — earned value to date", type: "number", required: true, placeholder: "e.g. 210000" },
  {
    key: "method",
    label: "EAC method",
    type: "select",
    options: [
      { value: "Composite", label: "Composite — BAC / CPI" },
      { value: "Atypical", label: "Atypical — BAC - EV + AC" },
      { value: "Continuous", label: "Continuous — AC + (BAC - EV) / CPI" },
    ],
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The client has already computed CPI, the EAC under all three methods, plus ETC and VAC for the selected method — treat every one of those figures as fact: never re-derive, re-round, correct or introduce any other number.",
  "Use exactly these plain-text headings: FORECAST, METHOD COMPARISON, CONFIDENCE, DATA TO TRUST IT, CORRECTION LEVER.",
  "FORECAST states the selected method, spells its formula in words, and reports the supplied EAC, ETC and VAC — explicitly saying that ETC = EAC − AC, that a negative VAC is a forecast overspend and a positive VAC is an underrun.",
  "METHOD COMPARISON gives one line per method: the assumption it makes about the remaining work, when it is the honest choice, and the spread against the selected method using only the three EAC figures supplied.",
  "CONFIDENCE is HIGH/MEDIUM/LOW with one reason drawn from how far apart the three EACs are — a narrow spread earns higher confidence, a wide one earns LOW.",
  "DATA TO TRUST IT is exactly 3 data points to collect next, each with the role that owns it.",
  "CORRECTION LEVER gives up to 2 corrective actions when VAC is negative, each with the measurable effect it should have on ETC; when VAC is positive, say what must not be quietly re-spent.",
  "Never invent dates, burn rates, contingency percentages, currency symbols or spend curves that were not supplied; write DATA NEEDED for anything else and keep the whole answer to 350 words.",
].join(" ");

const toNum = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number | null): string => (n === null ? "n/a" : n.toFixed(2));

export default function CostForecast() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    bac: "",
    ac: "",
    ev: "",
    method: "Composite",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const bac = toNum(values.bac);
    const ac = toNum(values.ac);
    const ev = toNum(values.ev);
    if (bac === null || ac === null || ev === null) {
      setError("BAC, AC and EV must all be numbers.");
      return;
    }
    if (bac <= 0 || ac <= 0 || ev <= 0) {
      setError("BAC, AC and EV must be greater than zero — zero makes CPI and the forecast formulas undefined.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      // Deterministic forecast maths — the model only compares and explains.
      const cpi = ev / ac;
      const composite = bac / cpi;
      const atypical = bac - ev + ac;
      const continuous = ac + (bac - ev) / cpi;
      const eac =
        values.method === "Atypical" ? atypical : values.method === "Continuous" ? continuous : composite;
      const etc = eac - ac;
      const vac = bac - eac;

      const prompt = [
        promptLine("Project", values.project),
        promptLine("Supplied figures", `BAC ${bac} · AC ${ac} · EV ${ev}`),
        promptLine("Selected method", values.method),
        promptLine(
          "Computed for you",
          `CPI ${fmt(cpi)} · EAC ${fmt(eac)} · ETC ${fmt(etc)} · VAC ${fmt(vac)} · EAC by method: Composite ${fmt(composite)} · Atypical ${fmt(atypical)} · Continuous ${fmt(continuous)}`,
        ),
        "",
        "Explain the forecast, compare the three methods and state what would make it trustworthy now.",
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
      id="f016"
      rank={16}
      name="Cost Forecast (EAC / ETC / VAC)"
      tagline="Computes EAC, ETC and VAC for all three methods locally, then explains confidence and data gaps."
      category="Cost & Finance"
      icon={ChartColumn}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Forecast cost"
    />
  );
}
