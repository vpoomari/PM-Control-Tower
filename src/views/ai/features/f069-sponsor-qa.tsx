"use client";
// PM CONTROL TOWER — AI Feature f069 · Sponsor Q&A Prep
// Category: Strategy & Stakeholders · importance rank 69. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { MessageCircleQuestion } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "sponsor", label: "Sponsor", type: "text", placeholder: "e.g. Group COO — detail-oriented, financially driven, hates surprises" },
  { key: "situation", label: "Situation (facts only)", type: "textarea", rows: 6, required: true, placeholder: "Everything the sponsor knows or will probe: status, spend to date, forecast, dates at risk, decisions pending, team changes…", hint: "Answers are built only from these facts — gaps come back as NEEDS DATA." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Prepare the project lead for a hard session with the sponsor: the 10 toughest questions this situation attracts.",
  "Use these plain-text headings (no markdown fences, no bold): HARD QUESTIONS & ANSWERS, QUESTIONS TO VOLUNTEER, THE NUMBER TO HAVE READY, GROUNDING NOTES.",
  "HARD QUESTIONS & ANSWERS is a numbered list of exactly 10 questions grouped by theme (delivery, money, risk, people, decisions), each immediately followed by its answer — a real sceptical sponsor's question, never a softball.",
  "Each answer is at most 45 words and uses only facts from the situation input; where those facts do not support an answer, write 'NEEDS DATA: <the missing fact>' rather than filling the gap with plausible-sounding figures.",
  "QUESTIONS TO VOLUNTEER is the 3 topics to raise before the sponsor does, each with a one-line reason; THE NUMBER TO HAVE READY names the single figure the sponsor will demand and where it comes from — if no figure exists in the inputs, write 'NEEDS DATA: headline figure (e.g. budget consumed, days to milestone, variance)'.",
  "Never invent spend, dates, names, percentages or personality traits beyond the sponsor input, and use the sponsor's role rather than a first name unless one was supplied. Total under 550 words.",
].join(" ");

export default function SponsorQaPrep() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", sponsor: "", situation: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.situation.trim()) {
      setError("Lay out the situation first — the questions must come from real facts.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Sponsor", values.sponsor),
        promptLine("Situation (facts only)", values.situation),
        "",
        "Prepare the sponsor Q&A brief now.",
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
      id="f069"
      rank={69}
      name="Sponsor Q&A Prep"
      tagline="Ten hard sponsor questions with grounded answers, three to volunteer, and the one number to have ready."
      category="Strategy & Stakeholders"
      icon={MessageCircleQuestion}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Prepare sponsor Q&A"
    />
  );
}
