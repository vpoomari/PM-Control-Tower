"use client";
// PM CONTROL TOWER — AI Feature f060 · Plain English Rewriter
// Category: Documents & Knowledge · importance rank 60. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Languages } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "text", label: "Original text", type: "textarea", rows: 8, required: true, placeholder: "Paste the dense paragraph, policy clause, email or report section…", hint: "Pasted text only — every number and name in it must survive the rewrite." },
  { key: "length", label: "Target length", type: "select", options: [
    { value: "Same", label: "Same" },
    { value: "Shorter", label: "Shorter" },
    { value: "Much shorter", label: "Much shorter" },
  ] },
  { key: "keepFacts", label: "Fact retention", type: "select", options: [
    { value: "All numbers/names preserved", label: "All numbers/names preserved" },
    { value: "Drop ambiguous items (flag them)", label: "Drop ambiguous items — flag them" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Rewrite the pasted text in plain English at roughly a grade-9 reading level and return, in plain text (no markdown fences): PLAIN VERSION (the full rewrite), TERMS REPLACED (a list of 'original → plain' for every notable term you changed), FACT CHECK.",
  "FACT CHECK must be true: list every number, date, currency amount and proper name from the source and confirm it appears verbatim in the PLAIN VERSION; any you could not carry over must be listed by name with the reason — never drop one silently.",
  "Length rules: Same = roughly the original length; Shorter = about a quarter fewer words; Much shorter = about half — in every case all facts stay, only repetition, hedging and filler go.",
  "Style: sentences of 20 words or fewer, active voice, everyday verbs, one idea per sentence; keep technical terms the reader genuinely needs but gloss them in parentheses at first use.",
  "Never change meaning, never add a claim, never round or restyle a figure, and never replace a name with a description.",
  "The fact-retention choice governs FACT CHECK: 'All numbers/names preserved' allows zero drops; 'Drop ambiguous items (flag them)' allows only items whose meaning is genuinely unclear, each listed with its reason.",
].join(" ");

export default function PlainEnglishRewriter() {
  const [values, setValues] = useState<Record<string, string>>({
    text: "", length: "Same", keepFacts: "All numbers/names preserved",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.text.trim().length < 30) {
      setError("Paste at least a short paragraph — 30 characters is the minimum worth rewriting.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Original text", values.text),
        promptLine("Target length", values.length),
        promptLine("Fact retention", values.keepFacts),
        "",
        "Rewrite the text in plain English now — plain version, terms replaced, then the fact check.",
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
      id="f060"
      rank={60}
      name="Plain English Rewriter"
      tagline="Rewrites dense text as plain English while every number and name survives — or is explicitly flagged."
      category="Documents & Knowledge"
      icon={Languages}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Rewrite in plain English"
    />
  );
}
