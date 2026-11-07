"use client";
// PM CONTROL TOWER — AI Feature f022 · Cost Variance Narrative
// Category: Cost & Finance · importance rank 22. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Receipt } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "budget", label: "Budget by line", type: "textarea", rows: 4, required: true, placeholder: "Labour 240000\nHardware 80000\nTravel 20000", hint: "One line per budget line — 'name amount'." },
  { key: "actual", label: "Actual by line", type: "textarea", rows: 4, required: true, placeholder: "Labour 268500\nHardware 74200\nTravel 26400", hint: "Same line names where possible, one per line." },
  { key: "drivers", label: "Known drivers", type: "textarea", rows: 3, placeholder: "Optional: contractor rates rose, hardware bought early, extra site visits", wide: true },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are writing a cost variance narrative from a pasted budget and pasted actuals; every line and amount supplied is a fact.",
  "Use exactly these headings in plain text (no markdown fences, no bold): VARIANCE BY LINE, DOMINANT DRIVERS, CORRECTIVE ACTIONS, WHAT TO CONFIRM.",
  "VARIANCE BY LINE is a plain-text table with one row per line: line · budget · actual · variance (actual minus budget) · verdict (OVER / UNDER / ON BUDGET). Only compare lines that appear in both lists; a line present in just one list shows 'MISSING FROM BUDGET' or 'MISSING FROM ACTUAL' in the other columns.",
  "Show amounts exactly as supplied — no currency conversion, no invented precision; totals are the sum of the lines you were given and nothing else.",
  "DOMINANT DRIVERS are exactly the 3 largest absolute variances from your own table, each with one sentence of cause (use the supplied drivers, otherwise 'cause not supplied') and a verdict of TIMING or TRUE OVERSPEND with the reason.",
  "CORRECTIVE ACTIONS are exactly 3, each with an owner role (a person's name only if one was supplied) and the expected effect stated in money terms taken only from the variance table.",
  "WHAT TO CONFIRM lists every figure you needed but did not receive as 'NEEDS DATA: <line and metric>' — for example a line that exists in budget but not in actual.",
].join(" ");

export default function CostVarianceNarrative() {
  const [values, setValues] = useState<Record<string, string>>({
    budget: "", actual: "", drivers: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.budget.trim() || !values.actual.trim()) {
      setError("Both the budget lines and the actual lines are needed to compute a variance.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Budget by line", values.budget),
        promptLine("Actual by line", values.actual),
        promptLine("Known drivers", values.drivers),
        "",
        "Write the cost variance narrative now with the four sections in order.",
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
      id="f022"
      rank={22}
      name="Cost Variance Narrative"
      tagline="Budget vs actual line by line, with the top drivers split into timing versus true overspend."
      category="Cost & Finance"
      icon={Receipt}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Explain the variance"
    />
  );
}
