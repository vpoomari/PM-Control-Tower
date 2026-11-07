"use client";
// PM CONTROL TOWER — AI Feature f079 · Decision Record Writer
// Category: Governance & Quality · importance rank 79. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gavel } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "context", label: "Context", type: "textarea", rows: 4, required: true, placeholder: "The situation the decision sits in: constraints, drivers, pressures, what forced the choice…", hint: "This becomes the record's CONTEXT — no facts will be added to it." },
  { key: "decision", label: "Decision", type: "textarea", rows: 3, required: true, placeholder: "'Adopt the supplier's hosted reporting platform instead of building in-house.'" },
  { key: "status", label: "Status", type: "select", options: [
    { value: "Proposed", label: "Proposed" },
    { value: "Accepted", label: "Accepted" },
    { value: "Deprecated", label: "Deprecated" },
    { value: "Superseded", label: "Superseded" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write a decision record ready to paste into the project decision log. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: STATUS, CONTEXT, DECISION, RATIONALE, ALTERNATIVES CONSIDERED, CONSEQUENCES, REVIEW DATE.",
  "STATUS repeats the supplied status. CONTEXT restates the supplied context in tight prose without adding a single fact. DECISION restates the supplied decision in the active voice, one paragraph.",
  "RATIONALE explains why this decision over the alternatives, using only reasons the supplied context supports; each reason on its own line, maximum 4.",
  "ALTERNATIVES CONSIDERED lists 2–4 options with the reason each was rejected — only options implied by the supplied context. If the input names no alternatives, write 'ALTERNATIVES CONSIDERED: NEEDS DATA: the options that were evaluated'.",
  "CONSEQUENCES uses three labelled lines — 'Positive:', 'Negative:', 'Risks:' — with at most 3 bullets each, all derivable from the inputs.",
  "REVIEW DATE: write 'REVIEW DATE: NEEDS DATE' unless a review or expiry date appears in the supplied context — never propose a calendar date yourself.",
  "Use past tense for Accepted, Deprecated or Superseded and present-tense proposal wording for Proposed. Total under 400 words; never invent people, dates, systems, costs or figures — list anything missing as 'NEEDS DATA: <fact>'.",
].join(" ");

export default function DecisionRecordWriter() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", context: "", decision: "", status: "Accepted",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const missing = [
      !values.context.trim() ? "Context" : null,
      !values.decision.trim() ? "Decision" : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      setError(`Required: ${missing.join(", ")}.`);
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Status", values.status),
        promptLine("Context", values.context),
        promptLine("Decision", values.decision),
        "",
        "Write the decision record now.",
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
      id="f079"
      rank={79}
      name="Decision Record Writer"
      tagline="Context, decision, rationale, rejected alternatives and consequences — paste-ready for the log."
      category="Governance & Quality"
      icon={Gavel}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write decision record"
    />
  );
}
