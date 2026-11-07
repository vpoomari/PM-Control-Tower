"use client";
// PM CONTROL TOWER — AI Feature f039 · Requirements Quality Reviewer
// Category: Documents & Knowledge · importance rank 39. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileSearch } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "requirement", label: "Requirement text", type: "textarea", rows: 5, required: true, placeholder: "Paste one requirement at a time, e.g.\nThe system should allow authorised users to upload large files quickly and handle errors gracefully.", hint: "One requirement per run gives the sharpest rewrite." },
  { key: "source", label: "Source", type: "text", placeholder: "e.g. US-142, clause 7.2 of the contract, or the client email of 12 Mar" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Quality-review one written requirement against exactly five defect classes: ambiguous, untestable, compound, missing threshold, no source.",
  "Use these headings in plain text: ISSUES FOUND (one line per defect: class · the exact words that trigger it · why it fails — write 'none found' for a class that does not apply), REWRITTEN REQUIREMENT (one single-idea, measurable sentence carrying a number, threshold or observable condition wherever the inputs allow one; if a value is needed but not supplied, write 'NEEDS THRESHOLD: <the value the business must decide>' instead of choosing it yourself), ACCEPTANCE TEST (one test in Given / When / Then form that would prove the rewritten version), SOURCE (the supplied source, or 'NEEDS SOURCE — cite the story, clause or regulation this comes from').",
  "Quote the original wording for every issue — never criticise a sentence you have not quoted — and keep the rewritten requirement within the intent of the original: tighten the wording, do not add scope.",
  "Never invent a threshold, a performance figure, a standard or a regulation; if the requirement cannot be made measurable without a value that was not supplied, name that value. Total length under 350 words.",
].join(" ");

export default function RequirementsQualityReviewer() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", requirement: "", source: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.requirement.trim().length < 15) {
      setError("Paste the requirement to review — at least one full sentence.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Source", values.source),
        "",
        "Requirement under review:",
        values.requirement.trim(),
        "",
        "Review its quality, rewrite it measurably and draft the acceptance test now.",
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
      id="f039"
      rank={39}
      name="Requirements Quality Reviewer"
      tagline="Flags ambiguous or untestable requirements, rewrites them measurably and drafts the test."
      category="Documents & Knowledge"
      icon={FileSearch}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Review requirement"
    />
  );
}
