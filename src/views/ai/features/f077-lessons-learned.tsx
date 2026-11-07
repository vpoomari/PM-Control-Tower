"use client";
// PM CONTROL TOWER — AI Feature f077 · Lessons Learned Capture
// Category: Governance & Quality · importance rank 77. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { History } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "experience", label: "What happened", type: "textarea", rows: 6, required: true, placeholder: "Describe the experience: what occurred, the sequence of events, who was involved by role, and the outcome…", hint: "Facts only — lessons are written from these, nothing else." },
  { key: "phase", label: "Project phase", type: "select", options: [
    { value: "Planning", label: "Planning" },
    { value: "Execution", label: "Execution" },
    { value: "Closure", label: "Closure" },
  ] },
  { key: "outcome", label: "Outcome", type: "select", options: [
    { value: "Good", label: "Good" },
    { value: "Bad", label: "Bad" },
    { value: "Mixed", label: "Mixed" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Turn the pasted experience into a lessons-learned entry ready to paste into a project lessons register. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: LESSONS, PROCESS AREA MAP, STANDARDISE THIS.",
  "Write 4–6 lessons, each as three labelled lines: 'What happened:' (a fact from the input only, under 30 words), 'Why it happened:' (the cause; if the input does not state one, write 'Why it happened: NEEDS DATA'), 'Next time:' (one concrete practice change the team can adopt). Number them Lesson 1, Lesson 2 …",
  "Rank the lessons by the cost or delay they could cause if repeated, worst first, and match their count to the supplied outcome (Good still yields 4 lessons about what to repeat; Bad and Mixed focus on prevention).",
  "PROCESS AREA MAP lists one line per lesson mapping it to exactly one area from: Integration, Scope, Schedule, Cost, Quality, Resource, Communications, Risk, Procurement, Stakeholder.",
  "STANDARDISE THIS names the single change to add to the organisation's standard way of working in one sentence, naming the artefact it changes (checklist, template, gate or report) — only if the experience supports it, otherwise write 'STANDARDISE THIS: NEEDS DATA'.",
  "Tone: factual and blameless — describe the system and the process, not the person; use role labels, never personal names. Never invent dates, quantities, costs or outcomes not present in the experience. Total under 450 words.",
].join(" ");

export default function LessonsLearnedCapture() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", experience: "", phase: "Execution", outcome: "Mixed",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.experience.trim()) {
      setError("What happened is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Project phase", values.phase),
        promptLine("Outcome", values.outcome),
        "",
        "Experience:",
        values.experience.trim(),
        "",
        "Capture the lessons-learned entry now.",
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
      id="f077"
      rank={77}
      name="Lessons Learned Capture"
      tagline="Turns one experience into 4–6 blameless lessons mapped to process areas and practice changes."
      category="Governance & Quality"
      icon={History}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Capture lessons"
    />
  );
}
