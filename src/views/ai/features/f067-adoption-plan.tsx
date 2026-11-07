"use client";
// PM CONTROL TOWER — AI Feature f067 · Adoption Plan
// Category: Strategy & Stakeholders · importance rank 67. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Rocket } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "capability", label: "Capability", type: "text", required: true, placeholder: "e.g. Self-serve reporting in Power BI for all team leads", hint: "What people must start using." },
  { key: "users", label: "User groups", type: "text", placeholder: "e.g. 120 team leads, 30 analysts, 40% remote — mixed confidence" },
  { key: "deadline", label: "Deadline", type: "text", placeholder: "e.g. Go-live 15 Feb 2027, full adoption by end of Q2 2027" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build an adoption plan that moves the named users from unaware to habitual use of the capability.",
  "Use these plain-text headings (no markdown fences, no bold): PHASE PLAN, WEEKLY METRIC, RESISTANCE HOTSPOT, GROUNDING NOTES — the phases are AWARENESS, TRIAL, ADOPTION, HABIT, in that order.",
  "Each phase gives actions (max 4, concrete verbs), an owner role, its measure of completion, and timing anchored to the deadline input; if no deadline was supplied write 'NEEDS DATA: adoption deadline' and use relative weeks instead of dates.",
  "The WEEKLY METRIC is one number the team can collect every week with numerator, denominator and source stated — if the source was not supplied, write 'NEEDS DATA: measurement source' rather than assuming a system exists.",
  "RESISTANCE HOTSPOT names the user group most likely to resist, why (from the users input), and the move that wins them over; if the users input gives no groups, write 'NEEDS DATA: user groups' instead of guessing who they are.",
  "Never invent adoption percentages, headcounts or dates beyond the inputs — every figure either comes from them or is flagged NEEDS DATA. Total under 450 words.",
].join(" ");

export default function AdoptionPlan() {
  const [values, setValues] = useState<Record<string, string>>({
    capability: "", users: "", deadline: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.capability.trim()) {
      setError("Name the capability to drive adoption for.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Capability", values.capability),
        promptLine("User groups", values.users),
        promptLine("Deadline", values.deadline),
        "",
        "Build the adoption plan now.",
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
      id="f067"
      rank={67}
      name="Adoption Plan"
      tagline="Awareness-to-habit plan with owners, measures, a weekly metric and the group that will resist hardest."
      category="Strategy & Stakeholders"
      icon={Rocket}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build adoption plan"
    />
  );
}
