"use client";
// PM CONTROL TOWER — AI Feature f091 · FAQ Builder
// Category: Documents & Knowledge · importance rank 91. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { HelpCircle } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "topic", label: "FAQ topic", type: "text", required: true, placeholder: "e.g. Expense claims for subcontractors", hint: "Who asks, and about what." },
  { key: "facts", label: "Source facts", type: "textarea", rows: 6, required: true, placeholder: "Paste the policy, help-text or runbook facts the answers must come from — one fact per line.", hint: "Every answer must trace back to a line here." },
  { key: "count", label: "Number of Q&A pairs", type: "number", placeholder: "e.g. 10", hint: "Whole number 1–50; treated as 10 when cleared." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build an FAQ for the stated topic using only the supplied source facts — nothing from general knowledge may become an answer.",
  "Output plain text only (no markdown fences, no bold): line 1 is 'FAQ — <topic>', then exactly the requested number of pairs as 'Q1.' with its answer on the next line starting 'A: ', then a final line starting 'UNANSWERABLE: '.",
  "Order the pairs from the question users ask most often to least often in a typical organisation, keep every answer at most 40 words, and make each answer self-contained (no 'see above').",
  "Every answer must be traceable to a supplied fact; if users will obviously ask something the facts do not cover, put that question on the UNANSWERABLE line as the exact question plus the specific fact needed to answer it.",
  "If two supplied facts conflict, do not pick one — quote both lines and flag the conflict inside the answer.",
  "No greetings, no disclaimers, no advice that is not in the facts. Total output under 700 words.",
].join(" ");

export default function FaqBuilder() {
  const [values, setValues] = useState<Record<string, string>>({
    topic: "", facts: "", count: "10",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const rawCount = values.count.trim();
    let count = 10;
    if (rawCount !== "") {
      const parsed = Number(rawCount);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
        setError("Number of Q&A pairs must be a whole number between 1 and 50.");
        return;
      }
      count = parsed;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("FAQ topic", values.topic),
        promptLine("Source facts", values.facts),
        promptLine("Number of Q&A pairs", String(count)),
        "",
        `Write the FAQ now: exactly ${count} numbered Q&A pairs, most-asked first, each answer at most 40 words, closing with the one question these facts cannot answer.`,
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
      id="f091"
      rank={91}
      name="FAQ Builder"
      tagline="Turns a pile of facts into ordered, source-true Q&A pairs — plus the one question the facts cannot answer."
      category="Documents & Knowledge"
      icon={HelpCircle}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build FAQ pairs"
    />
  );
}
