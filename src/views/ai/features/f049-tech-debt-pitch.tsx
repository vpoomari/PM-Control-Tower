"use client";
// PM CONTROL TOWER — AI Feature f049 · Technical Debt Pitch
// Category: Agile & Delivery · importance rank 49. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Hammer } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "debt",
    label: "The debt",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "The delivery-confirmation export is a 2019 script only two people understand; each change needs a day of regression testing and it fails silently at month-end.",
    hint: "Say what it is and where it hurts — no need to write it for a business audience, that is the job here.",
  },
  { key: "cost", label: "Effort to fix", type: "text", placeholder: "e.g. 12 engineer-days over 2 sprints, one developer who knows the area" },
  {
    key: "impact",
    label: "Cost if it is left alone",
    type: "textarea",
    rows: 4,
    placeholder: "Optional but decisive: incidents per month, hours lost to workarounds, features blocked, licences paid…",
    hint: "Only figures you already have — nothing is estimated or invented for you.",
  },
  { key: "deadlineNote", label: "Timing", type: "text", placeholder: "Optional: e.g. must be clear before the year-end freeze on 12 Dec" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You pitch technical debt to a non-technical sponsor in business-case language, so the reader never needs engineering vocabulary to understand the trade-off.",
  "Use exactly these headings in plain text: THE DEBT (2 sentences a non-technical reader understands), COST OF DOING NOTHING (only the money, time or capacity figures the operator supplied, each attributed to its source; where no number exists write 'NEEDS DATA: <the exact figure needed>'), OPTIONS (exactly three — fix now, schedule it, replace/avoid — each with the supplied fix effort, the risk if deferred and the business consequence), RECOMMENDATION (one option with exactly 2 '-' bullets of rationale), TRADE-OFF (the one thing the business accepts if it follows the recommendation).",
  "Arithmetic rule: repeat, add or subtract only numbers that were supplied — never convert effort into money, never invent rates, incident counts, downtime hours or percentages; if the only evidence is qualitative, say the case rests on qualitative risk and name the figure that would strengthen it.",
  "Keep jargon out: any technical term must carry a one-clause explanation of what it means for the business, and the pitch must not blame or name individuals.",
  "Plain text output, no markdown fences, total under 400 words.",
].join(" ");

export default function TechnicalDebtPitch() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", debt: "", cost: "", impact: "", deadlineNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.debt.trim()) {
      setError("Describe the technical debt before building the pitch.");
      return;
    }
    if (!values.cost.trim() && !values.impact.trim()) {
      setError("Add at least the effort to fix or the cost of leaving it — the pitch needs one grounded figure or effect.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("The debt", values.debt),
        promptLine("Effort to fix", values.cost),
        promptLine("Cost if it is left alone", values.impact),
        promptLine("Timing", values.deadlineNote),
        "",
        "Write the business-facing technical debt pitch now: cost of inaction, three options, recommendation and trade-off.",
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
      id="f049"
      rank={49}
      name="Technical Debt Pitch"
      tagline="Pitches the fix in business language: cost of inaction, three options and the trade-off to accept."
      category="Agile & Delivery"
      icon={Hammer}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build the pitch"
    />
  );
}
