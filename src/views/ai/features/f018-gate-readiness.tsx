"use client";
// PM CONTROL TOWER — AI Feature f018 · Stage Gate Readiness Review
// Category: Governance & Quality · importance rank 18. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ClipboardCheck } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "gate",
    label: "Gate",
    type: "select",
    options: [
      { value: "Initiation", label: "Initiation" },
      { value: "Planning", label: "Planning" },
      { value: "Execution", label: "Execution" },
      { value: "Close", label: "Close" },
      { value: "Benefits", label: "Benefits" },
    ],
  },
  {
    key: "evidence",
    label: "Evidence that exists today",
    type: "textarea",
    rows: 5,
    required: true,
    placeholder: "One artefact or fact per line: charter v2 signed 12 Oct · schedule baseline loaded · benefits map still a draft · no cost report since Sep",
    hint: "Only what genuinely exists — gaps are as useful as strengths.",
  },
  {
    key: "criteria",
    label: "Gate criteria (optional)",
    type: "textarea",
    rows: 3,
    placeholder: "Paste your gate checklist if you have one. Leave empty to use standard PMO criteria.",
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Assess readiness for the stated gate. The first line must read exactly: VERDICT: GO, VERDICT: CONDITIONAL GO or VERDICT: NO-GO.",
  "Use exactly these headings after the verdict line: REASONS, MISSING EVIDENCE, CONDITIONS TO CLEAR, BOARD QUESTIONS.",
  "REASONS is 2–5 bullets, each pointing at a specific item from the supplied evidence — never credit an approval, document or metric that was not listed.",
  "MISSING EVIDENCE is a checklist split MUST-HAVE (blocks the gate) and NICE-TO-HAVE (does not block), built from the supplied criteria when given; when no criteria were supplied, apply standard PMO criteria for this gate and say so in one sentence.",
  "CONDITIONS TO CLEAR is a numbered list where every condition is testable as written ('signed schedule baseline exists'), with a by-when only if a date was supplied.",
  "BOARD QUESTIONS gives exactly 3 hard questions the gate panel will ask, ordered by how likely each is to stop the gate.",
  "A CONDITIONAL GO must name the conditions that turn it into GO, and every verdict must state what evidence would flip it; never invent sign-offs, dates, owners or evidence.",
  "Maximum 400 words.",
].join(" ");

export default function StageGateReadinessReview() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    gate: "Planning",
    evidence: "",
    criteria: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.evidence.trim().length < 30) {
      setError("List what genuinely exists today — a gate cannot be judged from a line or two.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Gate", values.gate),
        promptLine("Evidence that exists today", values.evidence),
        promptLine("Gate criteria", values.criteria),
        "",
        "Run the stage gate readiness review and give the verdict now.",
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
      id="f018"
      rank={18}
      name="Stage Gate Readiness Review"
      tagline="Returns GO / CONDITIONAL GO / NO-GO with the missing evidence and the questions the board will ask."
      category="Governance & Quality"
      icon={ClipboardCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Assess gate"
    />
  );
}
