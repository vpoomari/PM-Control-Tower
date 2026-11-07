"use client";
// PM CONTROL TOWER — AI Feature f028 · Business Case Drafter
// Category: Cost & Finance · importance rank 28. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Landmark } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "problem", label: "Problem & cost of inaction", type: "textarea", rows: 4, required: true, placeholder: "Invoice queries take 6 days to answer; 1 in 5 escalates to a late-payment dispute…", hint: "Facts only — the case may not go beyond them." },
  { key: "options", label: "Options to compare", type: "textarea", rows: 4, placeholder: "Do nothing\nBuy the SaaS tool\nBuild in-house with two contractors", hint: "One option per line — 'Do nothing' is usually worth listing." },
  { key: "cost", label: "Cost of the preferred option", type: "text", placeholder: "e.g. 480000 over 18 months" },
  { key: "benefit", label: "Expected benefit", type: "text", placeholder: "e.g. 150000 per year from year 2" },
  { key: "horizon", label: "Appraisal horizon", type: "text", placeholder: "e.g. 3 years" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are drafting an investment business case for approval; the problem statement, options, cost, benefit and horizon supplied are the entire evidence base.",
  "Use exactly these headings in plain text (no markdown fences, no bold): PROBLEM & COST OF INACTION, OPTIONS COMPARED, RECOMMENDED OPTION, COSTS VS BENEFITS, PAYBACK COMMENTARY, KEY RISKS, THE APPROVAL ASK.",
  "PROBLEM & COST OF INACTION restates only the supplied problem; quantify the inaction cost only if the inputs quantify it, otherwise write 'quantification not supplied'.",
  "OPTIONS COMPARED is a plain-text table: option · cost · benefit · effort/risk, where every cell comes from the inputs and any cell not supplied reads 'not given' — do not estimate figures for options.",
  "RECOMMENDED OPTION picks one of the supplied options (or 'do nothing') in a maximum of 4 sentences; if the inputs cannot discriminate between them, say exactly which data would decide it.",
  "COSTS VS BENEFITS quotes the supplied cost and benefit verbatim and, if both are numeric with a horizon, shows the simple arithmetic you used (cost ÷ annual benefit = payback in years) with the calculation written out.",
  "PAYBACK COMMENTARY is permitted only on the numbers given: no inflation, discount rate, escalation or year-by-year cash flow may be introduced; if cost or benefit is missing or non-numeric, write 'NEEDS DATA: <cost or benefit figure>' instead of a payback.",
  "KEY RISKS are 3–5 bullets tied to the supplied problem and options only. THE APPROVAL ASK names what is being approved, the amount if given, who approves (use the sponsor only if supplied, otherwise 'approver: NEEDS DATA') and a by-when only if a date was supplied.",
  "Total length under 500 words.",
].join(" ");

export default function BusinessCaseDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    problem: "", options: "", cost: "", benefit: "", horizon: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.problem.trim()) {
      setError("Describe the problem first — the business case is built from it.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Problem & cost of inaction", values.problem),
        promptLine("Options to compare", values.options),
        promptLine("Cost of the preferred option", values.cost),
        promptLine("Expected benefit", values.benefit),
        promptLine("Appraisal horizon", values.horizon),
        "",
        "Draft the business case now with the seven sections in order.",
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
      id="f028"
      rank={28}
      name="Business Case Drafter"
      tagline="Compares the options you give, comments on payback only from your numbers, and states the ask."
      category="Cost & Finance"
      icon={Landmark}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft business case"
    />
  );
}
