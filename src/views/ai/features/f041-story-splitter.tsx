"use client";
// PM CONTROL TOWER — AI Feature f041 · Story Splitter
// Category: Agile & Delivery · importance rank 41. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Scissors } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "story",
    label: "Story to split",
    type: "textarea",
    rows: 5,
    required: true,
    placeholder: "As a warehouse supervisor, I want to export delivery confirmations to CSV so that I can reconcile them against invoicing before month-end close.",
    hint: "Paste the story as it stands — statement, context, any acceptance notes.",
  },
  {
    key: "mode",
    label: "Splitting mode",
    type: "select",
    options: [
      { value: "By workflow", label: "By workflow (steps in the process)" },
      { value: "By business rule", label: "By business rule (variations)" },
      { value: "By data operations", label: "By data operations (CRUD)" },
    ],
  },
  { key: "constraints", label: "Constraints & dependencies", type: "textarea", rows: 3, placeholder: "Optional: team boundaries, system APIs that must exist first, dates the slices must hit…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are an experienced agile coach splitting one user story into smaller, vertically sliced stories that a single team can deliver within one sprint.",
  "Return 5 to 8 stories, ordered with the smallest shippable slice first. Format each as: 'N. <action-first title>' then 'Scope: <one line describing exactly what this slice delivers>' then 'INVEST: <one line — the one INVEST letter this slice strains and why>'.",
  "Use the chosen split mode as the primary technique (workflow steps in order, business-rule variations one at a time, or data operations create/read/update/delete) and name the technique you used after each title in brackets.",
  "After the stories use exactly these headings in plain text: LEFT OUT (3 to 5 '-' bullets of what this split deliberately excludes) and NEXT STEP (the single question to put to the product owner before refining further).",
  "Never invent screens, fields, integrations, roles or acceptance criteria that the source story does not imply; if the story is too thin to split safely, list the exact detail you need instead of fabricating it.",
  "Plain text output, no markdown fences, total length under 400 words.",
].join(" ");

export default function StorySplitter() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", story: "", mode: "By workflow", constraints: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.story.trim()) {
      setError("Paste the story you want split.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Story to split", values.story),
        promptLine("Splitting mode", values.mode),
        promptLine("Constraints & dependencies", values.constraints),
        "",
        "Split this story into 5–8 INVEST-shaped stories now, smallest shippable slice first.",
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
      id="f041"
      rank={41}
      name="Story Splitter"
      tagline="Splits one story into 5–8 INVEST-shaped slices, smallest shippable first, and says what stays out."
      category="Agile & Delivery"
      icon={Scissors}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Split the story"
    />
  );
}
