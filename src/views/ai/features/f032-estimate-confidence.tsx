"use client";
// PM CONTROL TOWER — AI Feature f032 · Estimate Confidence Review
// Category: Cost & Finance · importance rank 32. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gauge } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "estimate", label: "The estimate", type: "text", required: true, placeholder: "e.g. £480,000 over 9 months (or 120 working days)", hint: "The figure being reviewed — it is never changed by this tool." },
  { key: "basis", label: "How it was built", type: "textarea", rows: 5, required: true, placeholder: "Basis of estimate — e.g. 42 line items bottom-up, 3 supplier quotes, historic rate from the 2025 delivery, 15% allowance for migration…", hint: "Method, sources, who signed it off, what it is built from." },
  { key: "unknowns", label: "Known unknowns", type: "textarea", rows: 3, placeholder: "Optional: scope still being cut, no quote for the data migration, rates may rise…\nOne per line." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Review one cost or duration estimate and judge how much confidence the operator should place in it — the supplied estimate stands as given and you may not replace it with your own figure.",
  "Use these headings in plain text: CONFIDENCE (Low / Medium / High, then 2–3 sentences of reasoning tied line by line to the stated basis), BIGGEST SINGLE UNCERTAINTY (the one item that could move the number most, why it dominates, and what evidence would retire it), DEFENSIBLE RANGE (a ± percentage around the supplied estimate with the reason for that width, and the one assumption the width depends on), DE-RISKING ACTIONS (exactly 3, each as: action · owner role · evidence it buys · by when).",
  "Judge on method, not optimism: a bottom-up build backed by quotes and comparable history can reach High; an expert opinion with no supporting build never exceeds Medium; a basis that is not described at all must be reported as a data gap instead of receiving a rating.",
  "Never quote a figure that was not supplied or derived from the supplied basis; a range wider than ±30% must be labelled Low confidence and state what would narrow it.",
  "Total length under 350 words.",
].join(" ");

export default function EstimateConfidenceReview() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", estimate: "", basis: "", unknowns: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.basis.trim().length < 20) {
      setError("Describe how the estimate was built — the review needs its basis.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Estimate under review", values.estimate),
        promptLine("Basis of estimate", values.basis),
        promptLine("Known unknowns", values.unknowns),
        "",
        "Review the confidence of this estimate now.",
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
      id="f032"
      rank={32}
      name="Estimate Confidence Review"
      tagline="Rates estimate confidence, sizes a defensible range and lists three ways to de-risk it."
      category="Cost & Finance"
      icon={Gauge}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Review estimate"
    />
  );
}
