"use client";
// PM CONTROL TOWER — AI Feature f075 · Performance Feedback Drafter (SBI)
// Category: Resources & Teams · importance rank 75. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { MessageCircle } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "situation", label: "Situation", type: "textarea", rows: 3, required: true, placeholder: "When and where — 'Tuesday's client call, 10:15, in the room…'" },
  { key: "behaviour", label: "Behaviour", type: "textarea", rows: 3, required: true, placeholder: "Observable only — 'interrupted the client twice and closed the deck before Q&A…'" },
  { key: "impact", label: "Impact", type: "textarea", rows: 3, required: true, placeholder: "Effect on work, team or customer — 'two client questions went unanswered…'" },
  { key: "intent", label: "Intent", type: "select", options: [
    { value: "Corrective", label: "Corrective" },
    { value: "Recognition", label: "Recognition" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write a spoken feedback script using the Situation–Behaviour–Impact (SBI) model for the chosen intent. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: SITUATION, BEHAVIOUR, IMPACT, THE SCRIPT, QUESTION TO ASK, WHAT NOT TO SAY, FOLLOW-UP COMMITMENT.",
  "SITUATION is one sentence naming when and where, taken only from the supplied situation. BEHAVIOUR describes only observable behaviour in one or two sentences — never a motive, trait or assumed intent. IMPACT states the effect on the work, team or customer using only the supplied impact.",
  "THE SCRIPT is the whole thing as one spoken paragraph of 60–90 words the manager can read verbatim. For Corrective: direct and respectful, assumes positive intent, names the specific change wanted. For Recognition: specific and warm, says why the impact mattered and what to repeat.",
  "QUESTION TO ASK is one open question that invites the other person's view first (for example 'How did you see it?'). WHAT NOT TO SAY lists exactly 3 phrasings to avoid, each with a reason of 10 words or fewer.",
  "FOLLOW-UP COMMITMENT is one line: what will change, how it will be visible, and when it is checked — write NEEDS DATE for the check-in when no date was supplied.",
  "Tone: neutral and non-judgemental throughout — describe, do not judge. Never use labels such as 'lazy', 'brilliant', 'difficult' or 'always/never'. Never invent dates, witnesses, ratings or prior feedback. Total under 350 words.",
].join(" ");

export default function PerformanceFeedbackDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    situation: "", behaviour: "", impact: "", intent: "Corrective",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const missing = [
      !values.situation.trim() ? "Situation" : null,
      !values.behaviour.trim() ? "Behaviour" : null,
      !values.impact.trim() ? "Impact" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      setError(`Required: ${missing.join(", ")}.`);
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Situation", values.situation),
        promptLine("Behaviour", values.behaviour),
        promptLine("Impact", values.impact),
        promptLine("Intent", values.intent),
        "",
        "Draft the SBI feedback script now.",
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
      id="f075"
      rank={75}
      name="Performance Feedback Drafter (SBI)"
      tagline="SBI-structured feedback script with the question to ask, what to avoid and the follow-up."
      category="Resources & Teams"
      icon={MessageCircle}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft SBI feedback"
    />
  );
}
