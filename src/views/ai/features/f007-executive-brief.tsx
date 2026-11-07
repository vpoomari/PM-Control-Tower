"use client";
// PM CONTROL TOWER — AI Feature f007 · Executive Brief (150 words)
// Category: Status & Reporting · importance rank 7. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Crown } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "situation", label: "Situation in your words", type: "textarea", rows: 5, required: true, placeholder: "The facts a leader needs — what happened, what it means, what you want…" },
  { key: "audience", label: "Audience", type: "select", options: [
    { value: "Board", label: "Board" },
    { value: "Executive sponsor", label: "Executive sponsor" },
    { value: "Steering committee", label: "Steering committee" },
    { value: "Client executive", label: "Client executive" },
  ] },
  { key: "outcome", label: "What you need from them", type: "text", placeholder: "e.g. Approve 3 additional weeks of testing" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write an executive brief of at most 150 words for the stated audience — leaders read this standing up, between meetings.",
  "Structure in plain text: line 1 is a single-sentence HEADLINE that states the situation, then exactly 3 '-' bullets of fact, then RECOMMENDATION (one sentence), then ASK (what is needed and by when, using the requested outcome if supplied).",
  "No preamble, no restating the brief to yourself, no 'certainly'. The word count must be 150 or fewer — count it.",
].join(" ");

export default function ExecutiveBrief() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", situation: "", audience: "Executive sponsor", outcome: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Situation", values.situation),
        promptLine("Audience", values.audience),
        promptLine("What is needed from them", values.outcome),
        "",
        "Write the executive brief now — 150 words maximum.",
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
      id="f007"
      rank={7}
      name="Executive Brief (150 words)"
      tagline="Compresses any situation into a headline, three facts, a recommendation and one clear ask."
      category="Status & Reporting"
      icon={Crown}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write brief"
    />
  );
}
