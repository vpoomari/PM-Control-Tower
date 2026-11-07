"use client";
// PM CONTROL TOWER — AI Feature f064 · Strategy Alignment Checker
// Category: Strategy & Stakeholders · importance rank 64. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Crosshair } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "initiative", label: "Initiative", type: "textarea", rows: 4, required: true, placeholder: "What it is and what it changes, e.g.\nReplace the legacy CRM with a configured SaaS platform — 9 months, one migration wave, retires 3 old tools", hint: "Plain description; include scope, timing and cost only if known." },
  { key: "objectives", label: "Company objectives", type: "textarea", rows: 4, required: true, placeholder: "One per line, exactly as written in the strategy:\nO1 Grow enterprise revenue 20% by FY27\nO2 Cut cost to serve by 15%\nO3 Be audit-ready in every market", hint: "Paste the real wording — alignment is judged against these words only." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Judge the initiative against every company objective supplied — you know nothing about the strategy beyond that input.",
  "Use these plain-text headings (no markdown fences, no bold): ALIGNMENT RATINGS, THE STRATEGIC SENTENCE, UNFUNDED OBJECTIVE, GROUNDING NOTES.",
  "ALIGNMENT RATINGS is a pipe-separated table: objective (quoted exactly as supplied) · rating Strong/Partial/None · reasoning in one sentence tied to the wording of both inputs — rate every objective and keep the order given.",
  "Strong means the initiative demonstrably moves that objective on the facts given; Partial means an indirect or partial contribution; None means no visible link — never inflate a rating to look positive, and never reward vague wording.",
  "THE STRATEGIC SENTENCE is one sentence to paste into the initiative description that ties it to its strongest objective; UNFUNDED OBJECTIVE names the objective with the weakest connection, says what funding or work would be needed to move it, or states 'none — every objective is covered'.",
  "If either input is too vague to judge, list exactly what you need under NEEDS DATA and give no rating you cannot defend — no invented market facts, targets or dates. Total under 350 words.",
].join(" ");

export default function StrategyAlignmentChecker() {
  const [values, setValues] = useState<Record<string, string>>({
    initiative: "", objectives: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const objectives = values.objectives.split("\n").filter((line) => line.trim()).length;
    if (objectives < 1) {
      setError("Paste at least one company objective to check alignment against.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Initiative", values.initiative),
        promptLine("Company objectives (one per line)", values.objectives),
        "",
        "Check the strategic alignment now.",
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
      id="f064"
      rank={64}
      name="Strategy Alignment Checker"
      tagline="Rates the initiative against every company objective and names the objective nobody is funding."
      category="Strategy & Stakeholders"
      icon={Crosshair}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Check alignment"
    />
  );
}
