"use client";
// PM CONTROL TOWER — AI Feature f074 · Onboarding 30/60/90 Plan
// Category: Resources & Teams · importance rank 74. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Route } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "role", label: "Role", type: "text", required: true, placeholder: "e.g. Business Analyst · joining from the incumbent supplier" },
  { key: "team", label: "Team", type: "text", placeholder: "e.g. Change & Data team · reports to Delivery Manager · buddy: Sam (week 1)" },
  { key: "context", label: "Context", type: "textarea", rows: 4, placeholder: "What they will work on, systems they touch, key stakeholders, prior experience, start date if known…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build a week-by-week onboarding plan for a new joiner across their first 90 days. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: DAYS 1–30, DAYS 31–60, DAYS 61–90, CHECKPOINTS, RISKS TO RAMP-UP.",
  "Under each phase heading give one line per week — Week 1 to Week 4, Week 5 to Week 8, Week 9 to Week 12 — in the form 'Week n: goal · activity · who is involved'. Every line must be actionable in the week it sits in; no generic 'learn the tools' filler.",
  "Phase goals: DAYS 1–30 must name the first deliverable and who reviews it; DAYS 31–60 the first deliverable done independently; DAYS 61–90 a piece of the team's steady-state work owned end to end by the joiner.",
  "CHECKPOINTS gives exactly three checkpoints at day 30, day 60 and day 90, each with the evidence that proves ramp-up (what the joiner can do unaided) and the role that confirms it. RISKS TO RAMP-UP lists at most 3 risks that slow ramp-up, drawn only from the supplied context.",
  "When a buddy, reviewer or stakeholder is not named, write 'buddy: NEEDS OWNER', 'reviewer: NEEDS OWNER' — never invent a person; when a date is missing write 'start: NEEDS DATE'.",
  "Tone: practical and encouraging, aimed at the manager running the onboarding. Total under 500 words; use only the role, team and context supplied — never invent system names, headcount, dates or project metrics.",
].join(" ");

export default function Onboarding306090Plan() {
  const [values, setValues] = useState<Record<string, string>>({
    role: "", team: "", context: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.role.trim()) {
      setError("Role is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Role", values.role),
        promptLine("Team", values.team),
        promptLine("Context", values.context),
        "",
        "Build the week-by-week 30/60/90 onboarding plan now.",
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
      id="f074"
      rank={74}
      name="Onboarding 30/60/90 Plan"
      tagline="A week-by-week ramp plan with goals, buddies and the checkpoints that prove ramp-up."
      category="Resources & Teams"
      icon={Route}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build onboarding plan"
    />
  );
}
