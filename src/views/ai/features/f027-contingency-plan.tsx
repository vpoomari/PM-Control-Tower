"use client";
// PM CONTROL TOWER — AI Feature f027 · Contingency Plan Builder
// Category: Risk & RAID · importance rank 27. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { LifeBuoy } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "risk", label: "Risk to plan for", type: "textarea", rows: 4, required: true, placeholder: "The third-party identity provider misses the 15 Jan 2027 certification date, blocking go-live." },
  { key: "trigger", label: "Known trigger", type: "text", placeholder: "e.g. no written confirmation by 10 Dec 2026" },
  { key: "reserve", label: "Available reserve", type: "text", placeholder: "e.g. 40 days float, 60000 contingency, one spare integrator" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are writing a contingency (fallback) plan for one supplied risk; the risk statement, any known trigger and the available reserve are the only facts you have.",
  "Use exactly these headings in plain text (no markdown fences, no bold): TRIGGER DEFINITIONS, RESPONSE STEPS, FALLBACK PLAN, CONTINGENCY RESERVE, ABANDON POINT.",
  "TRIGGER DEFINITIONS gives one leading indicator and one lagging indicator, each as 'indicator · measurable threshold · who checks · how often'. If the supplied trigger can be made measurable, use it; otherwise write 'NEEDS DATA: measurable threshold' rather than inventing one.",
  "RESPONSE STEPS is a numbered sequence of 5–7 steps, each with an owner role (never a personal name unless supplied) and a relative timing ('within 1 day of the trigger', 'week 2'), ordered so the cheapest stabilising action comes first.",
  "FALLBACK PLAN is what executes if the primary response fails: 3–4 steps plus the degraded outcome the project accepts, using only the supplied reserve.",
  "CONTINGENCY RESERVE states a recommendation only from what was supplied (days, money or people) and shows the split across the response steps; if no reserve was given, write 'NEEDS DATA: available reserve' instead of proposing a figure.",
  "ABANDON POINT is one paragraph defining the observable condition at which this plan is dropped and the issue escalates — a date or threshold must come from the inputs, otherwise write 'NEEDS DATA: escalation threshold'.",
  "Never introduce a date, amount, headcount or SLA that was not supplied. Total length under 400 words.",
].join(" ");

export default function ContingencyPlanBuilder() {
  const [values, setValues] = useState<Record<string, string>>({
    risk: "", trigger: "", reserve: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.risk.trim()) {
      setError("Describe the risk first — the contingency plan is built from it.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Risk to plan for", values.risk),
        promptLine("Known trigger", values.trigger),
        promptLine("Available reserve", values.reserve),
        "",
        "Build the contingency plan now with the five sections in order.",
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
      id="f027"
      rank={27}
      name="Contingency Plan Builder"
      tagline="Turns one risk into measurable triggers, ordered response steps, fallback and a reserve call."
      category="Risk & RAID"
      icon={LifeBuoy}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build contingency plan"
    />
  );
}
