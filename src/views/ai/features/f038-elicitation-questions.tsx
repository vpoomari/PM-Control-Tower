"use client";
// PM CONTROL TOWER — AI Feature f038 · Requirements Elicitation Questions
// Category: Documents & Knowledge · importance rank 38. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { MessageCircleQuestion } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "idea", label: "The idea or change", type: "textarea", rows: 4, required: true, placeholder: "What is being explored — e.g. 'Self-serve onboarding for wholesale clients, replacing the current advisor-led sign-up'", hint: "The more concrete the idea, the less generic the questions." },
  { key: "stakeholders", label: "Stakeholders involved", type: "text", placeholder: "e.g. Operations leads, Compliance, Client onboarding team, IT architecture" },
  { key: "method", label: "Elicitation method", type: "select", options: [
    { value: "Workshop", label: "Workshop" },
    { value: "Interview", label: "Interview" },
    { value: "Survey", label: "Survey" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Generate an elicitation question set for the stated idea, tuned to the chosen method and the stakeholders named.",
  "Use these headings in plain text: QUESTIONS BY THEME — run the themes User, Process, Data, Integration, Compliance, Edge cases in that order, number every question continuously so the whole set totals 18 to 24, and prefix each question with the stakeholder group most likely to answer it; then ASK LAST (exactly 5 questions with one line each on why they belong at the end), then CHALLENGE FIRST (the single assumption built into the idea and the one question that tests it).",
  "Every question must be open, specific to the pasted idea, and answerable in the chosen method: a Workshop question can be put to the room, an Interview question must be asked of one person, a Survey question must be answerable without discussion — and no question may restate another one.",
  "Never assume a process, system, regulation, user group or volume that the inputs do not mention: write the theme as 'not yet scoped — need: <what>' instead of inventing content, and if the idea is too vague to question, say what must be pinned down first.",
  "Total length under 550 words.",
].join(" ");

export default function RequirementsElicitationQuestions() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", idea: "", stakeholders: "", method: "Workshop",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.idea.trim().length < 20) {
      setError("Describe the idea or change first — the questions must be specific to it.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Stakeholders involved", values.stakeholders),
        promptLine("Elicitation method", values.method),
        "",
        "Idea or change:",
        values.idea.trim(),
        "",
        "Produce the elicitation question set now.",
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
      id="f038"
      rank={38}
      name="Requirements Elicitation Questions"
      tagline="Returns 18–24 grouped elicitation questions, the five to ask last and the assumption to challenge."
      category="Documents & Knowledge"
      icon={MessageCircleQuestion}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Generate questions"
    />
  );
}
