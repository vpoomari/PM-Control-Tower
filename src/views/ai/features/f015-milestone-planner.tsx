"use client";
// PM CONTROL TOWER — AI Feature f015 · Milestone & Gate Planner
// Category: Plan & Schedule · importance rank 15. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Milestone } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "goal", label: "Goal to reach", type: "text", required: true, placeholder: "e.g. Billing platform live in all 3 regions" },
  { key: "months", label: "Horizon (months)", type: "number", placeholder: "e.g. 12", hint: "Whole number of months from Month 1." },
  {
    key: "phase",
    label: "Current phase",
    type: "select",
    options: [
      { value: "Concept", label: "Concept" },
      { value: "Planning", label: "Planning" },
      { value: "Execution", label: "Execution" },
      { value: "Closure", label: "Closure" },
    ],
  },
  {
    key: "gates",
    label: "Formal gates",
    type: "select",
    options: [
      { value: "Yes", label: "Yes" },
      { value: "No", label: "No" },
    ],
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Produce a milestone and gate plan for the stated phase and horizon with exactly these plain-text headings: MILESTONES, GATES, AT-RISK DEPENDENCY, DATA NEEDED.",
  "MILESTONES is a table — MONTH · MILESTONE · EXIT CRITERIA — in order from Month 1 to the end of the horizon, where every milestone is a verifiable event (a signed-off artefact or a deployed capability), never an activity, and every exit criterion can be tested yes/no.",
  "Count months from Month 1 of the horizon and never invent calendar dates; if no start date was supplied, say so under DATA NEEDED instead of anchoring to today.",
  "Keep the count realistic: roughly one milestone per month, at most two per month when the horizon is under 6 months, and always end on the supplied goal.",
  "If formal gates were requested, GATES lists exactly 3 gates in sequence, each with the evidence required (document, approval, metric) and the milestone it guards; if gates were declined, write 'No formal gates requested — milestone exit criteria still apply.' and stop.",
  "AT-RISK DEPENDENCY names the single dependency most likely to break the sequence, why it bites, and the earliest observable signal.",
  "Let the current phase shape the sequence — Concept opens with a decision artefact, Closure ends with handover and benefits tracking — and never fabricate approvals, owners or dates.",
  "Maximum 400 words.",
].join(" ");

export default function MilestoneGatePlanner() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    goal: "",
    months: "",
    phase: "Execution",
    gates: "Yes",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const months = values.months.trim();
    if (months) {
      const n = Number(months);
      if (!Number.isInteger(n) || n < 1) {
        setError("Horizon must be a whole number of months (1 or more).");
        return;
      }
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Goal", values.goal),
        promptLine("Horizon (months)", months),
        promptLine("Current phase", values.phase),
        promptLine("Formal gates", values.gates),
        "",
        "Build the ordered milestone list and gate plan now.",
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
      id="f015"
      rank={15}
      name="Milestone & Gate Planner"
      tagline="Orders milestones and gates with testable exit criteria and flags the dependency most likely to break."
      category="Plan & Schedule"
      icon={Milestone}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Plan milestones"
    />
  );
}
