"use client";
// PM CONTROL TOWER — AI Feature f068 · Training Outline Designer
// Category: Strategy & Stakeholders · importance rank 68. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { GraduationCap } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "skill", label: "Skill to train", type: "text", required: true, placeholder: "e.g. Running the new expense approval workflow end to end" },
  { key: "audience", label: "Audience", type: "text", required: true, placeholder: "e.g. 14 office managers, mixed IT confidence, no prior use of the tool", hint: "Size and current level shape the exercise and timings." },
  { key: "hours", label: "Session length (hours)", type: "number", placeholder: "e.g. 3" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Design a training session outline for the stated skill and audience in the voice of an experienced corporate trainer.",
  "Use these plain-text headings (no markdown fences, no bold): LEARNING OBJECTIVES, SESSION OUTLINE, HANDS-ON EXERCISE, COMMON MISTAKES TO PRE-EMPT, 1-WEEK RETENTION CHECK, NEEDS DATA.",
  "SESSION OUTLINE is a pipe-separated table: minutes · segment · what happens · objective, opening with a 5-minute opener and closing with a recap; the minutes must sum exactly to hours × 60 and the arithmetic must be shown in a final row — if hours were not supplied, write 'NEEDS DATA: total training hours' and give the sequence without minute values.",
  "LEARNING OBJECTIVES are 3–5 statements a participant can demonstrate by the end, phrased for the stated audience and their stated prior level.",
  "HANDS-ON EXERCISE is a step-by-step task that practises the skill itself, sized to the session length; COMMON MISTAKES lists the 4–6 errors this audience is likely to make, each with the guard to teach.",
  "The 1-WEEK RETENTION CHECK states what is tested, how, and the pass bar — all derived from the inputs; never invent pass rates, dates, tool versions or attendee names. Total under 500 words.",
].join(" ");

export default function TrainingOutlineDesigner() {
  const [values, setValues] = useState<Record<string, string>>({
    skill: "", audience: "", hours: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.hours && (!Number.isFinite(Number(values.hours)) || Number(values.hours) <= 0)) {
      setError("Session length must be a positive number of hours.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Skill to train", values.skill),
        promptLine("Audience", values.audience),
        promptLine("Session length (hours)", values.hours),
        "",
        "Design the training outline now.",
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
      id="f068"
      rank={68}
      name="Training Outline Designer"
      tagline="A timed session outline with objectives, an exercise, common mistakes and a one-week retention check."
      category="Strategy & Stakeholders"
      icon={GraduationCap}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Design training outline"
    />
  );
}
