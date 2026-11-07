"use client";
// PM CONTROL TOWER — AI Feature f063 · OKR Drafting Assistant
// Category: Strategy & Stakeholders · importance rank 63. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Target } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "theme", label: "Theme or outcome", type: "text", required: true, placeholder: "e.g. Make onboarding the fastest in our market", hint: "One line — the result these OKRs should serve." },
  { key: "period", label: "Period", type: "select", options: [
    { value: "Quarter", label: "Quarter" },
    { value: "Half year", label: "Half year" },
    { value: "Year", label: "Year" },
  ] },
  { key: "baseline", label: "Baseline figures", type: "textarea", rows: 4, placeholder: "Known starting numbers, one per line:\nsign-ups 1,200/month\nchurn 4.2%\nNPS 31", hint: "Only numbers you actually have — the key results use these and nothing else." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Draft a set of OKRs for the stated theme and period in the voice of a strategy office that will be held to these numbers.",
  "Use these plain-text headings (no markdown fences, no bold): OBJECTIVE 1, OBJECTIVE 2, OBJECTIVE 3 — each followed by KEY RESULTS (numbered 1–3) and a MONTHLY LEADING INDICATOR line — then a closing NEEDS DATA section.",
  "Each objective is one qualitative, inspiring sentence with no numbers in it; each key result is measurable and states a target, its baseline and its deadline inside the chosen period.",
  "Take every baseline value only from the baseline input; when a key result needs a starting figure that was not supplied, write it as 'NEEDS DATA: baseline for <metric>' and never estimate it.",
  "Never invent percentages, revenue, headcount or dates: a target percentage you propose is a recommendation, so label it '(proposed target — confirm)'.",
  "Make the three objectives cover distinct facets of the theme, deliver exactly nine key results in total, and end with the monthly leading indicators worth reviewing. Total under 500 words.",
].join(" ");

export default function OKRDraftingAssistant() {
  const [values, setValues] = useState<Record<string, string>>({
    theme: "", period: "Quarter", baseline: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.theme.trim()) {
      setError("Name the theme or outcome these OKRs should serve.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Theme or outcome", values.theme),
        promptLine("Period", values.period),
        promptLine("Baseline figures (one per line)", values.baseline),
        "",
        "Draft the three objectives and their key results now.",
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
      id="f063"
      rank={63}
      name="OKR Drafting Assistant"
      tagline="Three objectives and nine key results drafted from your theme and baseline — never invented numbers."
      category="Strategy & Stakeholders"
      icon={Target}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft OKRs"
    />
  );
}
