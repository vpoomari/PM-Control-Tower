"use client";
// PM CONTROL TOWER — AI Feature f001 · Status Report Draft Generator
// Category: Status & Reporting · importance rank 1. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileBarChart } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "period", label: "Reporting period", type: "text", placeholder: "e.g. 20–26 Oct 2026" },
  { key: "progress", label: "What happened this period", type: "textarea", rows: 4, required: true, placeholder: "Deliverables completed, key movements, stakeholder news…", hint: "Facts only — the draft can only be as good as these." },
  { key: "blockers", label: "Blockers & issues", type: "textarea", rows: 3, placeholder: "One per line. Leave empty if none." },
  { key: "next", label: "Planned next period", type: "textarea", rows: 3, placeholder: "What the team will deliver next…" },
  { key: "rating", label: "Self-assessed RAG", type: "select", options: [
    { value: "GREEN", label: "GREEN" },
    { value: "AMBER", label: "AMBER" },
    { value: "RED", label: "RED" },
    { value: "Not assessed", label: "Not assessed" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write a weekly project status report in the voice of an experienced project manager reporting to a steering audience.",
  "Use exactly these headings in plain text (no markdown fences, no bold): SUMMARY, RATING, ACCOMPLISHMENTS, BLOCKERS & ISSUES, NEXT PERIOD, ASKS.",
  "SUMMARY is at most 90 words. ACCOMPLISHMENTS, BLOCKERS and NEXT PERIOD use '-' bullets (max 6 each). ASKS lists what needs a decision, each with a by-when if a date was supplied.",
  "Recommend GREEN/AMBER/RED from the evidence only. If a self-assessed rating was supplied, test it: agree or challenge it in one sentence and say why.",
  "Never quote a completion percentage, budget figure or date that was not supplied — write 'NEEDS DATA: <specific fact>' instead.",
  "Total length under 300 words.",
].join(" ");

export default function StatusReportDraftGenerator() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", period: "", progress: "", blockers: "", next: "", rating: "Not assessed",
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
        promptLine("Reporting period", values.period),
        promptLine("What happened this period", values.progress),
        promptLine("Blockers & issues", values.blockers),
        promptLine("Planned next period", values.next),
        promptLine("Self-assessed RAG", values.rating),
        "",
        "Draft the weekly project status report now.",
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
      id="f001"
      rank={1}
      name="Status Report Draft Generator"
      tagline="Turns this week's facts into a steering-ready status report with a defensible RAG rating."
      category="Status & Reporting"
      icon={FileBarChart}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft status report"
    />
  );
}
