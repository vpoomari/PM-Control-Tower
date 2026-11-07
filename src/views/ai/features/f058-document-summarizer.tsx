"use client";
// PM CONTROL TOWER — AI Feature f058 · Document Summarizer
// Category: Documents & Knowledge · importance rank 58. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileSearch } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "document", label: "Document", type: "textarea", rows: 8, required: true, placeholder: "Paste the document — minutes, report, paper, email thread…", hint: "Pasted text only; nothing is fetched or read from elsewhere." },
  { key: "depth", label: "Depth", type: "select", options: [
    { value: "5 bullets", label: "5 bullets" },
    { value: "1 page", label: "1 page" },
    { value: "Detailed", label: "Detailed" },
  ] },
  { key: "purpose", label: "Why you need it", type: "text", placeholder: "e.g. Brief the sponsor before Friday's steering" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Summarise the pasted document in plain text (no markdown fences) at the chosen depth: '5 bullets' = exactly 5 '-' bullets and nothing before them; '1 page' = headings SUMMARY (120 words max), KEY POINTS (8 '-' bullets max), DECISIONS, OPEN QUESTIONS; 'Detailed' = those headings plus SECTION NOTES covering the document's parts in their original order.",
  "Then add a heading HUMAN READ REQUIRED listing the passages that are ambiguous, contradictory or load-bearing, located by heading, quoted phrase or paragraph number so a person can find them fast.",
  "DECISIONS lists only decisions the document states — write 'none stated' rather than inferring one; OPEN QUESTIONS lists what the document leaves unresolved.",
  "FIDELITY RULE: every number, date, currency amount and proper name you quote must match the source character for character — never round, convert or reformat — and every name or number you leave out must be listed under a final 'NOT CARRIED OVER:' line so nothing disappears silently.",
  "Add nothing that is not in the document; any inference must be labelled 'inference' and kept out of the summary sections.",
  "If a purpose was supplied, weight the summary towards it; otherwise write for a PMO reader who needs facts, decisions and gaps — not a general recap.",
].join(" ");

export default function DocumentSummarizer() {
  const [values, setValues] = useState<Record<string, string>>({
    document: "", depth: "1 page", purpose: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.document.trim().length < 60) {
      setError("Paste at least a few sentences — 60 characters is the minimum worth summarising.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Document", values.document),
        promptLine("Depth", values.depth),
        promptLine("Why I need it", values.purpose),
        "",
        "Summarise the document now at the chosen depth, then decisions, open questions, the human-read sections and the NOT CARRIED OVER line.",
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
      id="f058"
      rank={58}
      name="Document Summarizer"
      tagline="Summary at the depth you choose, plus decisions, open questions and the parts only a human should read."
      category="Documents & Knowledge"
      icon={FileSearch}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Summarise document"
    />
  );
}
