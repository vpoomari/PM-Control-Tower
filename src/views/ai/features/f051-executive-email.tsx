"use client";
// PM CONTROL TOWER — AI Feature f051 · Executive Email Drafter
// Category: Status & Reporting · importance rank 51. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Mail } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "subject", label: "Subject (if you have one)", type: "text", placeholder: "e.g. UAT slip — decision needed by 30 Oct" },
  { key: "situation", label: "Situation", type: "textarea", rows: 4, required: true, placeholder: "What happened, in plain sentences — dates and figures only if you actually have them…", hint: "The email can only state what you give it." },
  { key: "ask", label: "The ask", type: "textarea", rows: 3, required: true, placeholder: "e.g. Approve the revised go-live of 14 Nov so the team can re-plan.", hint: "One thing you need, with a by-when if you have it." },
  { key: "tone", label: "Tone", type: "select", options: [
    { value: "Neutral", label: "Neutral" },
    { value: "Urgent", label: "Urgent" },
    { value: "Reassuring", label: "Reassuring" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Draft exactly one executive email in plain text (no markdown fences): first line SUBJECT:, then the body in four labelled parts — CONTEXT: one sentence stating the situation; WHAT CHANGED: one or two sentences; ASK: the single thing needed, with the by-date; NEXT UPDATE: one sentence naming when the recipient next hears from you.",
  "The body must be 150 words or fewer excluding the subject line — count it before you answer and do not overrun.",
  "Tone rules: Neutral = factual and direct; Urgent = short declarative sentences with the deadline inside the first sentence; Reassuring = calm, shows control and the next checkpoint without softening the facts.",
  "No filler openers ('I hope this email finds you well'), no apology for writing, no 'circling back', no jargon or acronyms that were not in the input, and no sentence that carries no information.",
  "Lead with the fact, never with yourself; one ask only — if the input holds two asks, take the decision-critical one and list the other under a final NEEDS DATA line.",
  "Never invent a metric, date, name or figure: if the ask has no by-date or the situation lacks a key fact, write 'NEEDS DATA: <exact fact>' on the final line instead of guessing.",
].join(" ");

export default function ExecutiveEmailDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", subject: "", situation: "", ask: "", tone: "Neutral",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.situation.trim().length < 15) {
      setError("Describe the situation in at least one full sentence — the email needs context to lead with.");
      return;
    }
    if (values.ask.trim().length < 5) {
      setError("State the ask as one full sentence, with a by-when if you have one.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Subject", values.subject),
        promptLine("Situation", values.situation),
        promptLine("The ask", values.ask),
        promptLine("Tone", values.tone),
        "",
        "Write the executive email now — subject line plus a body of 150 words or fewer.",
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
      id="f051"
      rank={51}
      name="Executive Email Drafter"
      tagline="Subject plus a 150-word email that leads with the fact and asks for one thing by a date."
      category="Status & Reporting"
      icon={Mail}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft executive email"
    />
  );
}
