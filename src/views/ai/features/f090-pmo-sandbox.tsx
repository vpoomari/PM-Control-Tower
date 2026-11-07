"use client";
// PM CONTROL TOWER — AI Feature f090 · PMO Sandbox (ask anything)
// Category: Personal & Data · importance rank 90. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { MessageCircleQuestion } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "question", label: "Question", type: "textarea", rows: 4, required: true, placeholder: "e.g. How should we split RAID ownership across a programme with three delivery leads?" },
  { key: "context", label: "Context to use", type: "textarea", rows: 4, placeholder: "Paste any facts the answer should rely on — names, dates, numbers, constraints. The more you give, the more concrete the answer." },
  { key: "style", label: "Answer style", type: "select", options: [
    { value: "Short answer", label: "Short answer" },
    { value: "Detailed", label: "Detailed" },
    { value: "Checklist", label: "Checklist" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are answering a free-form PMO question under the strictest grounding rules of the studio: answer from PMO practice and from the supplied context only, and never imply that you have seen the workspace, the registers, the dashboards or any live project data.",
  "Always structure the reply with these headings in this order, in plain text (no markdown fences): ANSWER, ASSUMPTIONS, WHAT DATA WOULD SHARPEN IT.",
  "Match the chosen style: Short answer = ANSWER as one paragraph of 80 words or fewer with the two closing sections as single bullets; Detailed = ANSWER in up to 3 paragraphs with 3–6 bullets per section; Checklist = a numbered checklist under ANSWER with the two closing sections as bullets.",
  "ASSUMPTIONS lists every assumption you had to make to answer at all, each one line beginning 'Assumed:'.",
  "WHAT DATA WOULD SHARPEN IT lists the exact project facts that would turn the general answer into a specific one — budget, dates, headcount, statuses, register rows — each with one line on why it matters.",
  "If the question calls for a project figure — budget, date, percentage, headcount, status or person — that was not supplied, refuse to fabricate it: write 'NEEDS DATA: <the exact figure>' instead of estimating or recalling one.",
  "Be direct: give a clear recommendation rather than a survey of schools of thought, and keep the whole reply under 450 words.",
].join(" ");

export default function PmoSandbox() {
  const [values, setValues] = useState<Record<string, string>>({
    question: "", context: "", style: "Detailed",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.question.trim().length < 8) {
      setError("Ask a full question — at least a sentence — so it can be answered properly.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Question", values.question),
        promptLine("Context to use", values.context),
        promptLine("Answer style", values.style),
        "",
        "Answer the question now under the standing grounding rules.",
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
      id="f090"
      rank={90}
      name="PMO Sandbox (ask anything)"
      tagline="Free-form PMO Q&A that answers, declares its assumptions, and refuses to invent project figures."
      category="Personal & Data"
      icon={MessageCircleQuestion}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Answer the question"
    />
  );
}
