"use client";
// PM CONTROL TOWER — AI Feature f010 · Decision Brief Builder
// Category: Governance & Quality · importance rank 10. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Scale } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "decision", label: "The decision", type: "textarea", rows: 3, required: true, placeholder: "e.g. Which integration approach to take for the finance platform" },
  { key: "options", label: "Options", type: "textarea", rows: 4, required: true, placeholder: "One per line, e.g.\nA — Build in-house\nB — Buy and configure\nC — Hybrid" },
  { key: "criteria", label: "Decision criteria", type: "text", placeholder: "e.g. cost, time to value, supplier risk" },
  { key: "deadline", label: "Decide by", type: "date" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build a decision brief that a governance board could approve on the spot.",
  "Use these headings in plain text: DECISION (one sentence), OPTIONS SCORED (a plain-text table: option × criteria, each cell a short judgement, using default criteria — cost, speed, risk, reversibility — when none were supplied), RECOMMENDED (the chosen option plus a 2-sentence rationale tied to the criteria), WHY NOT THE OTHERS (one line per rejected option, its fatal flaw), RISKS OF THE RECOMMENDATION (max 3), DECISION RECORD (ready to paste: decision · date · deciding body · owner · review point).",
  "Never give every option the same score — if the inputs are too thin to separate them, say exactly which information would separate them instead of hedging.",
].join(" ");

export default function DecisionBriefBuilder() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", decision: "", options: "", criteria: "", deadline: "",
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
        promptLine("Decision", values.decision),
        promptLine("Options (one per line)", values.options),
        promptLine("Decision criteria", values.criteria),
        promptLine("Decide by", values.deadline),
        "",
        "Build the decision brief now.",
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
      id="f010"
      rank={10}
      name="Decision Brief Builder"
      tagline="Scores options against the criteria, picks one, and hands back a paste-ready decision record."
      category="Governance & Quality"
      icon={Scale}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build decision brief"
    />
  );
}
