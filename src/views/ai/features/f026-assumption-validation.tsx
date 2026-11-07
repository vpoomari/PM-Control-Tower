"use client";
// PM CONTROL TOWER — AI Feature f026 · Assumption Validation Sprint
// Category: Risk & RAID · importance rank 26. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FlaskConical } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "assumptions", label: "Assumptions", type: "textarea", rows: 6, required: true, placeholder: "The billing API supports bulk updates\nData migration can run without freezing the ledger\nTwo contractors are available from January", hint: "One assumption per line — keep them verbatim." },
  { key: "budget", label: "Validation budget", type: "text", placeholder: "e.g. 3 person-weeks, no external spend" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are planning a two-week assumption validation sprint; the pasted assumptions and the validation budget are the only facts you have.",
  "Use exactly these headings in plain text (no markdown fences, no bold): RANKED ASSUMPTIONS, TWO-WEEK VALIDATION PLAN, IF NOTHING IS TESTED.",
  "RANKED ASSUMPTIONS numbers every assumption in descending exposure and keeps the original wording verbatim, then gives one line each: why it matters · cheapest validation test · owner role · by when.",
  "Rank by exposure = impact if wrong (HIGH/MEDIUM/LOW) × how unproven it is (HIGH/MEDIUM/LOW); show both ratings in the line as 'impact H · unproven M'.",
  "The validation test must be the cheapest credible check (a spike, a 30-minute expert call, a sample query, a prototype) and its effort must fit inside the supplied validation budget — if no budget was given, write 'NEEDS DATA: validation budget'.",
  "'By when' is expressed in sprint days only (Week 1 Day 1 … Week 2 Day 5) unless a calendar date was supplied in the inputs; never invent a calendar date.",
  "TWO-WEEK VALIDATION PLAN lays the top tests across ten working days as 'Day · assumption # · test · owner role', keeping total effort within the budget and front-loading the highest-exposure items.",
  "IF NOTHING IS TESTED states, in 3 bullets, the decision exposure the programme keeps — phrased as consequences of the assumption being wrong, with no invented numbers or dates.",
  "Total length under 450 words.",
].join(" ");

export default function AssumptionValidationSprint() {
  const [values, setValues] = useState<Record<string, string>>({
    assumptions: "", budget: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.assumptions.trim()) {
      setError("Paste at least one assumption — one per line — before running.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Assumptions", values.assumptions),
        promptLine("Validation budget", values.budget),
        "",
        "Plan the two-week validation sprint now with the three sections in order.",
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
      id="f026"
      rank={26}
      name="Assumption Validation Sprint"
      tagline="Ranks pasted assumptions by exposure and returns the cheapest test for each within two weeks."
      category="Risk & RAID"
      icon={FlaskConical}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Plan validation sprint"
    />
  );
}
