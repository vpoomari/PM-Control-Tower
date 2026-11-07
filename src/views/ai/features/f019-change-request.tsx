"use client";
// PM CONTROL TOWER — AI Feature f019 · Change Request Narrative
// Category: Governance & Quality · importance rank 19. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileCog } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "change",
    label: "What is changing",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "e.g. Replace the legacy nightly batch with streaming ingestion for the order feed",
    hint: "State what changes — and what explicitly does not.",
  },
  {
    key: "reason",
    label: "Why it is needed",
    type: "textarea",
    rows: 3,
    required: true,
    placeholder: "e.g. The batch misses the 06:00 cut-off in 3 regions since the October release; 2 escalations open",
  },
  {
    key: "impact",
    label: "Known impact & numbers",
    type: "textarea",
    rows: 3,
    placeholder: "Any cost, schedule or scope figures you already have. Leave empty if none are known.",
  },
  {
    key: "baseline",
    label: "Baseline(s) in scope",
    type: "select",
    options: [
      { value: "Schedule", label: "Schedule" },
      { value: "Cost", label: "Cost" },
      { value: "Scope", label: "Scope" },
      { value: "All", label: "All" },
    ],
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Draft a formal change request narrative a sponsor can approve without edits, in plain text with exactly these headings: DESCRIPTION, ORIGIN, JUSTIFICATION, IMPACT ANALYSIS, OPTIONS, RECOMMENDATION, EXECUTIVE SUMMARY.",
  "DESCRIPTION states what changes and what does not change; ORIGIN says where the request came from using only supplied facts; JUSTIFICATION states the consequence of not doing it, without dramatising.",
  "IMPACT ANALYSIS covers every baseline named in the selection — schedule, cost, scope (or the single chosen one) — one line per baseline; where no number was supplied write 'NOT QUANTIFIED — need <specific figure>' rather than estimating.",
  "OPTIONS gives Approve, Reject and Defer with the concrete consequence of each, then RECOMMENDATION picks one in 1–2 lines and names the trade-off accepted.",
  "EXECUTIVE SUMMARY is exactly one paragraph of 90 words or fewer to paste at the top of the CR form.",
  "Never invent a revised budget, date, scope statement, requester name, approval route or percentage change — list missing inputs under DATA NEEDED.",
  "Maximum 450 words in total.",
].join(" ");

export default function ChangeRequestNarrative() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    change: "",
    reason: "",
    impact: "",
    baseline: "All",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.change.trim().length < 15 || values.reason.trim().length < 15) {
      setError("Describe both the change and why it is needed in a full sentence each.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("What is changing", values.change),
        promptLine("Why it is needed", values.reason),
        promptLine("Known impact & numbers", values.impact),
        promptLine("Baseline(s) in scope", values.baseline),
        "",
        "Write the change request narrative now.",
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
      id="f019"
      rank={19}
      name="Change Request Narrative"
      tagline="Shapes a change request narrative with baseline impact, options and a paste-ready executive summary."
      category="Governance & Quality"
      icon={FileCog}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write CR narrative"
    />
  );
}
