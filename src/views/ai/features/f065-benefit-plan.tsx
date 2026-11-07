"use client";
// PM CONTROL TOWER — AI Feature f065 · Benefit Realisation Plan
// Category: Strategy & Stakeholders · importance rank 65. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Coins } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "benefit", label: "Benefit(s)", type: "textarea", rows: 4, required: true, placeholder: "One per line, e.g.\nCut manual invoice handling from 18 to 12 FTE-days per month\nFreeze licence spend by consolidating to one tool", hint: "State the value, not the activity." },
  { key: "baseline", label: "Baseline today", type: "text", placeholder: "e.g. 18 FTE-days/month (Apr–Jun 2026)" },
  { key: "target", label: "Target", type: "text", placeholder: "e.g. 12 FTE-days/month by Mar 2027" },
  { key: "measure", label: "Measurement method", type: "text", placeholder: "e.g. Monthly AP timesheet export, signed off by Finance Ops" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Turn the supplied benefit into a benefit realisation plan a finance business partner would accept at a benefits review.",
  "Use these plain-text headings (no markdown fences, no bold): BENEFIT STATEMENT, MEASUREMENT, OWNERSHIP & CAPTURE, CONFIDENCE, FRAGILE ASSUMPTION, NEEDS DATA.",
  "BENEFIT STATEMENT states baseline → target in one sentence using only the supplied figures; if the baseline, target or measure is missing, write 'NEEDS DATA: <which one>' instead of inventing numbers, ranges or dates.",
  "MEASUREMENT restates the supplied method, how often it is sampled and who signs it off — introduce no new metric that was not asked for.",
  "OWNERSHIP & CAPTURE gives an owner role marked '(proposed — confirm)' and the capture date; if no date was supplied, write 'NEEDS DATA: benefit capture date' and anchor the review to a relative milestone rather than a made-up date.",
  "CONFIDENCE is High/Medium/Low with 2–3 reasons drawn from the inputs, and FRAGILE ASSUMPTION names the single assumption that would make the benefit vanish plus the earliest check that would disprove it. Total under 300 words.",
].join(" ");

export default function BenefitRealisationPlan() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", benefit: "", baseline: "", target: "", measure: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.benefit.trim()) {
      setError("Describe the benefit to plan — the plan has nothing to measure without it.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Benefit(s) (one per line)", values.benefit),
        promptLine("Baseline today", values.baseline),
        promptLine("Target", values.target),
        promptLine("Measurement method", values.measure),
        "",
        "Build the benefit realisation plan now.",
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
      id="f065"
      rank={65}
      name="Benefit Realisation Plan"
      tagline="Baseline-to-target benefit statement with method, owner, capture date and the fragile assumption."
      category="Strategy & Stakeholders"
      icon={Coins}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build benefit plan"
    />
  );
}
