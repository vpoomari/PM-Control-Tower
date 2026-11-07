"use client";
// PM CONTROL TOWER — AI Feature f008 · What-If Scenario Analyst
// Category: Plan & Schedule · importance rank 8. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Split } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "baseline", label: "Current plan (a few lines)", type: "textarea", rows: 4, required: true, placeholder: "Scope, dates, team, budget, key dependencies as they stand today…" },
  { key: "scenario", label: "The what-if", type: "textarea", rows: 3, required: true, placeholder: "e.g. The vendor delivers 6 weeks late; or: we must cut 15% of the budget" },
  { key: "type", label: "Scenario type", type: "select", options: [
    { value: "Schedule delay", label: "Schedule delay" },
    { value: "Cost increase", label: "Cost increase" },
    { value: "Scope cut", label: "Scope cut" },
    { value: "Scope increase", label: "Scope increase" },
    { value: "Resource loss", label: "Resource loss" },
  ] },
  { key: "horizon", label: "Horizon", type: "text", placeholder: "e.g. next 8 weeks" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Analyse one what-if scenario against the supplied baseline. Reason in effects and knock-on effects, not in invented numbers.",
  "Use these headings in plain text: IMPACT (schedule · cost · scope · resource · quality — one line each, quantify only with supplied figures, otherwise state the direction and the reason), RIPPLE EFFECTS (max 4 '-' bullets on what this breaks elsewhere), OPTIONS (3 options, each: what it takes, upside, downside, effort), RECOMMENDATION (which option to take and the single condition that would change that advice), DECISION NEEDED (who decides, what exactly, and by when if a date is implied).",
  "If the horizon supplied is shorter than the effect of the scenario, say the horizon is too short and what a realistic one is.",
].join(" ");

export default function WhatIfScenarioAnalyst() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", baseline: "", scenario: "", type: "Schedule delay", horizon: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Current plan", values.baseline),
        promptLine("Scenario type", values.type),
        promptLine("The what-if", values.scenario),
        promptLine("Horizon", values.horizon),
        "",
        "Analyse the scenario now.",
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
      id="f008"
      rank={8}
      name="What-If Scenario Analyst"
      tagline="Stress-tests the plan against a delay, cost shock or scope change and returns ranked options."
      category="Plan & Schedule"
      icon={Split}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Analyse scenario"
    />
  );
}
