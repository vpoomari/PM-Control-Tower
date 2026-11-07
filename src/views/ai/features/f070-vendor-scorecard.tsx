"use client";
// PM CONTROL TOWER — AI Feature f070 · Vendor Evaluation Scorecard
// Category: Strategy & Stakeholders · importance rank 70. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListChecks } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "vendors", label: "Vendors", type: "textarea", rows: 3, required: true, placeholder: "One per line:\nNorthwind Systems\nAcme Cloud Ltd", hint: "At least two — a scorecard needs something to compare." },
  { key: "criteria", label: "Evaluation criteria", type: "textarea", rows: 4, required: true, placeholder: "One per line:\n3-year licence cost\nDelivery experience in our sector\nData residency & security\nSupport model" },
  { key: "weightNote", label: "Weight notes", type: "text", placeholder: "e.g. Cost 30, delivery 25, security 25, support 20 (must total 100)", hint: "Weights are taken only from here — missing ones come back as NEEDS DATA." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build a weighted vendor evaluation scorecard as a plain-text table using pipe separators — no markdown fences, no bold, no HTML.",
  "Use these headings exactly: WEIGHTED SCORECARD, SCORING GUIDANCE, DECIDING QUESTION PER VENDOR, COMMERCIAL LEVER, GROUNDING NOTES.",
  "WEIGHTED SCORECARD has one row per supplied criterion: criterion · weight · one column per vendor · evidence to collect; vendor cells contain '--' because no scores were supplied — you never score the vendors yourself.",
  "Take weights only from the weight notes: give each criterion the weight stated there and the weights must total 100 — where a weight is missing write 'NEEDS DATA: weight for <criterion>', and where the supplied weights do not sum to 100 state the actual total and flag the mismatch instead of silently rescaling.",
  "SCORING GUIDANCE gives a 1–5 anchored descriptor per criterion — what a 1 and a 5 look like for that criterion in this evaluation — derived from the criterion wording only.",
  "DECIDING QUESTION PER VENDOR asks the one question that would expose that vendor's biggest weakness against the criteria, and COMMERCIAL LEVER names what to negotiate on with each vendor. Never invent prices, references, certifications or dates — write 'NEEDS DATA: <fact>'. Total under 500 words.",
].join(" ");

export default function VendorEvaluationScorecard() {
  const [values, setValues] = useState<Record<string, string>>({
    vendors: "", criteria: "", weightNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const vendors = values.vendors.split("\n").filter((line) => line.trim()).length;
    if (vendors < 2) {
      setError("Add at least two vendors so the scorecard has something to compare.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Vendors (one per line)", values.vendors),
        promptLine("Criteria (one per line)", values.criteria),
        promptLine("Weight notes", values.weightNote),
        "",
        "Build the weighted scorecard now.",
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
      id="f070"
      rank={70}
      name="Vendor Evaluation Scorecard"
      tagline="A weighted vendor scorecard with scoring guidance, deciding questions and the lever to negotiate on."
      category="Strategy & Stakeholders"
      icon={ListChecks}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build scorecard"
    />
  );
}
