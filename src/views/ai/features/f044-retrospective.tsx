"use client";
// PM CONTROL TOWER — AI Feature f044 · Retrospective Facilitator
// Category: Agile & Delivery · importance rank 44. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Repeat } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "sprint", label: "Sprint / period", type: "text", placeholder: "e.g. Sprint 14 · 12–23 Oct 2026" },
  {
    key: "facts",
    label: "What happened",
    type: "textarea",
    rows: 6,
    required: true,
    placeholder: "Two stories carried over after the API slipped; deploys ran long on Thursday; the team asked for fewer status meetings; demo feedback was positive; one engineer was on call all week.",
    hint: "Facts and quotes only — the retro output must cite these, nothing else.",
  },
  {
    key: "mood",
    label: "Team mood",
    type: "select",
    options: [
      { value: "Neutral", label: "Neutral" },
      { value: "Tense", label: "Tense" },
      { value: "Fatigued", label: "Fatigued" },
      { value: "Celebratory", label: "Celebratory" },
    ],
  },
  { key: "actionsOpen", label: "Carried-over actions", type: "textarea", rows: 3, placeholder: "Optional: last retro's actions still open — they belong in this retro too…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You facilitate a sprint retrospective that is honest about what happened, focused on the system rather than individuals, and ends with experiments the team can actually run.",
  "Use exactly these headings in plain text: START, STOP, CONTINUE (each 2 to 4 '-' bullets, every bullet citing or directly paraphrasing a fact the operator supplied — no generic agile advice), ROOT THEME (exactly one, 1–2 sentences, explaining why these facts cluster together), NEXT SPRINT EXPERIMENTS (exactly 3, each written as 'Experiment: <what> | Owner: <role> | Measure: <observable signal>'), FACILITATION PROMPTS (exactly 4 questions to ask in the room).",
  "Tailor the 4 facilitation prompts to the stated mood: Tense → separate people from problems and surface disagreement safely; Fatigued → load, recovery and what to stop doing; Celebratory → lock in the gains and guard against complacency; Neutral → challenge one assumption and raise the hard topic nobody named.",
  "If the supplied facts do not support an item under START, STOP or CONTINUE, write 'nothing evidenced this sprint' under that heading rather than padding it.",
  "Never attribute a problem to a named person — refer to roles, process or system conditions; if carried-over actions were supplied, address them under ROOT THEME or the experiments, never silently drop them.",
  "Plain text output, no markdown fences, total under 450 words.",
].join(" ");

export default function RetrospectiveFacilitator() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", sprint: "", facts: "", mood: "Neutral", actionsOpen: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.facts.trim()) {
      setError("Describe what actually happened this sprint before running the retro.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Sprint / period", values.sprint),
        promptLine("What happened", values.facts),
        promptLine("Team mood", values.mood),
        promptLine("Carried-over actions", values.actionsOpen),
        "",
        "Facilitate this retrospective now: start/stop/continue, one root theme, three experiments and four mood-fit prompts.",
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
      id="f044"
      rank={44}
      name="Retrospective Facilitator"
      tagline="Runs start/stop/continue on the facts, finds one root theme and lands 3 measured next-sprint experiments."
      category="Agile & Delivery"
      icon={Repeat}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Facilitate the retro"
    />
  );
}
