"use client";
// PM CONTROL TOWER — AI Feature f076 · Document Quality Reviewer
// Category: Governance & Quality · importance rank 76. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileSearch } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "document", label: "Document", type: "textarea", rows: 7, required: true, placeholder: "Paste the document or its key sections — headings and body text:\n1. Purpose\nThis procedure defines how change requests are logged…", hint: "The review quotes your own lines back, so paste the real text." },
  { key: "standard", label: "Document type", type: "select", options: [
    { value: "Internal policy", label: "Internal policy" },
    { value: "Report", label: "Report" },
    { value: "Procedure", label: "Procedure" },
    { value: "Specification", label: "Specification" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Review the pasted document against the supplied document type and return a scored quality review. Plain text only: no markdown fences, no bold.",
  "Use exactly these headings, in this order: SCORES, LINE-LEVEL ISSUES, THE 5 EDITS THAT MATTER MOST, VERDICT.",
  "SCORES gives five scores out of 10 — Structure, Clarity, Completeness, Testability, Consistency — each followed by a one-line reason grounded in a quoted or paraphrased part of the document, then an overall total out of 50. Adapt Testability to the type: Procedure and Specification need every step or requirement to be checkable; Internal policy needs every rule to say who does what; Report needs every claim to trace to supplied data.",
  "LINE-LEVEL ISSUES quotes the exact sentence or heading verbatim in double quotes, then states the defect and the fix on the next line; maximum 8 issues ordered by severity; use 'Issue 1', 'Issue 2' … as refs.",
  "THE 5 EDITS THAT MATTER MOST is numbered 1 to 5, each with the original fragment in quotes and replacement wording that can be pasted straight into the document.",
  "VERDICT is exactly one of PUBLISH, REVISE or REWRITE, followed by a two-line justification tied to the scores. If the pasted text is too short to review, say so and stop instead of scoring it.",
  "Never add facts, dates, owners, figures or requirements the document does not contain; where a needed element is absent write 'MISSING: <element>'. Total under 600 words.",
].join(" ");

export default function DocumentQualityReviewer() {
  const [values, setValues] = useState<Record<string, string>>({
    document: "", standard: "Internal policy",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.document.trim()) {
      setError("Document is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Document type", values.standard),
        "",
        "Document to review:",
        values.document.trim(),
        "",
        "Review the document and return the scored quality review now.",
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
      id="f076"
      rank={76}
      name="Document Quality Reviewer"
      tagline="Scores a document five ways, quotes the line-level issues and returns a publish verdict."
      category="Governance & Quality"
      icon={FileSearch}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Review the document"
    />
  );
}
