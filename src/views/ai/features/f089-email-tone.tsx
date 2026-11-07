"use client";
// PM CONTROL TOWER — AI Feature f089 · Email Tone Check
// Category: Personal & Data · importance rank 89. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Mail } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "draft", label: "Email draft", type: "textarea", rows: 6, required: true, placeholder: "Paste the full draft including the subject line, exactly as you would send it…" },
  { key: "recipient", label: "Recipient", type: "text", placeholder: "e.g. client procurement lead, relationship at risk" },
  { key: "goal", label: "Goal of the email", type: "select", options: [
    { value: "Persuade", label: "Persuade" },
    { value: "Apologise", label: "Apologise" },
    { value: "Inform", label: "Inform" },
    { value: "Decline", label: "Decline" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Rewrite the draft in a register that serves the stated goal, keeping every fact, name, date, number and commitment from the original — add nothing that is not there.",
  "Use exactly these headings in plain text (no markdown fences): REVISED EMAIL, PHRASES THAT UNDERMINE THE GOAL, SUBJECT LINE.",
  "REVISED EMAIL prints the subject line first, then the body at roughly the draft's length — never more than 20% longer.",
  "Goal registers: Persuade leads with the recipient's benefit and one clear ask; Apologise states the fact first, makes no excuses and offers a remedy; Inform is neutral and structured; Decline is a clear no with the reason and any alternative already present in the draft.",
  "PHRASES THAT UNDERMINE THE GOAL quotes exactly three phrases taken from the draft, each with one line on why it works against the goal and the replacement wording.",
  "SUBJECT LINE is one line of 10 words or fewer that fits the goal.",
  "Never add a commitment, date, apology or offer that is not in the draft — where the goal needs a date the draft lacks, write 'NEEDS DATE: <what is missing>'.",
].join(" ");

export default function EmailToneCheck() {
  const [values, setValues] = useState<Record<string, string>>({
    draft: "", recipient: "", goal: "Inform",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.draft.trim().length < 30) {
      setError("Paste the full draft (at least a short paragraph) so the tone can actually be assessed.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Email draft", values.draft),
        promptLine("Recipient", values.recipient),
        promptLine("Goal of the email", values.goal),
        "",
        "Check the tone and rewrite it for the goal now.",
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
      id="f089"
      rank={89}
      name="Email Tone Check"
      tagline="Rewrites the draft in the register your goal needs and flags the three phrases that undercut it."
      category="Personal & Data"
      icon={Mail}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Check the tone"
    />
  );
}
