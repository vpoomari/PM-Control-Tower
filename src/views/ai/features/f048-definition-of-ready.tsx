"use client";
// PM CONTROL TOWER — AI Feature f048 · Definition of Ready Checklist
// Category: Agile & Delivery · importance rank 48. Studio protocol: embedded
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
    key: "story",
    label: "Story to assess",
    type: "textarea",
    rows: 5,
    required: true,
    placeholder: "As a planner I want to see delayed drops highlighted so that I can call the site before it escalates.",
    hint: "Paste the story exactly as it would appear in the backlog.",
  },
  {
    key: "checklist",
    label: "Current Definition of Ready",
    type: "textarea",
    rows: 4,
    placeholder: "Optional — paste your team's DoR, one item per line:\n- story has clear user value\n- acceptance criteria agreed\n- dependencies identified\n- estimable by the team",
    hint: "Without one, the standard DoR criteria are used.",
  },
  { key: "sprintNote", label: "Sprint & team context", type: "text", placeholder: "e.g. 2-week sprint, no spare capacity, design sign-off pending" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You assess one user story against a Definition of Ready the way a scrum team does in backlog refinement.",
  "Use exactly these headings in plain text: VERDICT (READY or NOT READY plus one sentence of reason), FAILING ITEMS (each missing or weak item, why it fails and what evidence is absent), MAKE IT READY (3 to 6 '-' bullets of exact text the team can paste into the story to close each gap), DOR RULE TO ADD (one sentence the team should add to its checklist so this gap is caught next time).",
  "Judge against the operator's own DoR when one was pasted; otherwise judge against the standard criteria — clear value, small enough for one sprint, testable acceptance criteria, dependencies and blockers identified, data and UX known, and estimable by the team.",
  "Verdict rule: NOT READY if any must-have item fails — do not soften the verdict — but list exactly what it takes to clear each failing item; if only optional items fail, say so and return READY WITH NOTES.",
  "Never invent stakeholder names, dates, system names or acceptance thresholds that the story does not contain; write 'NEEDS DETAIL: <what is missing>' instead of assuming it.",
  "Plain text output, no markdown fences, total under 350 words.",
].join(" ");

export default function DefinitionOfReadyChecklist() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", story: "", checklist: "", sprintNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.story.trim()) {
      setError("Paste the story you want assessed against the Definition of Ready.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Story to assess", values.story),
        promptLine("Current Definition of Ready", values.checklist),
        promptLine("Sprint & team context", values.sprintNote),
        "",
        "Assess this story against the Definition of Ready now: verdict, failing items, the text to add and the DoR rule to add.",
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
      id="f048"
      rank={48}
      name="Definition of Ready Checklist"
      tagline="Judges a story against the DoR, lists exactly what fails and hands back the text to make it ready."
      category="Agile & Delivery"
      icon={ClipboardCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Check readiness"
    />
  );
}
