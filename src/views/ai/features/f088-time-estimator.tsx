"use client";
// PM CONTROL TOWER — AI Feature f088 · Time Estimate Calibrator
// Category: Personal & Data · importance rank 88. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gauge } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "task", label: "Task to estimate", type: "textarea", rows: 3, required: true, placeholder: "e.g. Migrate the billing module — done when the reconciled reports pass UAT", hint: "Describe the work and its done-state, not just the name." },
  { key: "history", label: "History of similar work", type: "text", placeholder: "e.g. comparable migrations took 4, 6 and 9 days" },
  { key: "confidence", label: "Confidence today", type: "select", options: [
    { value: "High", label: "High" },
    { value: "Medium", label: "Medium" },
    { value: "Low", label: "Low" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Calibrate a realistic duration for the task from the history supplied — that history is your only anchor.",
  "Use exactly these headings in plain text (no markdown fences): ESTIMATE, INFLATION FACTOR, RANGE, RE-ESTIMATE CHECKPOINT.",
  "ESTIMATE gives one recommended duration in the unit used by the history (days if none was given) plus the padding as a percentage; if no history was supplied, state plainly that the estimate is unanchored and name the one piece of history needed first.",
  "Honour the stated confidence: High keeps padding tight, Medium applies a normal review allowance, Low must widen the range and list what has to be validated before committing to it.",
  "INFLATION FACTOR names the single factor that most often inflates estimates for this kind of work (review cycles, hand-offs, environment waits, approvals) and ties it to the task description in one line.",
  "RANGE gives a low–high pair with the assumption behind each end, both derived only from the supplied history.",
  "RE-ESTIMATE CHECKPOINT is an observable event, not an invented date — the moment at which the estimate must be recomputed, such as the first working build or the first review round.",
  "Never invent completion dates, throughput figures or team capacity that were not supplied.",
].join(" ");

export default function TimeEstimateCalibrator() {
  const [values, setValues] = useState<Record<string, string>>({
    task: "", history: "", confidence: "Medium",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.task.trim().length < 20) {
      setError("Describe the task and its done-state in at least a sentence so the estimate has substance.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Task to estimate", values.task),
        promptLine("History of similar work", values.history),
        promptLine("Confidence today", values.confidence),
        "",
        "Calibrate the estimate now.",
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
      id="f088"
      rank={88}
      name="Time Estimate Calibrator"
      tagline="Anchors a task estimate to real history, names the inflation factor, and sets the re-estimate point."
      category="Personal & Data"
      icon={Gauge}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Calibrate the estimate"
    />
  );
}
