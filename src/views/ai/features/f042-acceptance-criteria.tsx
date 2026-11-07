"use client";
// PM CONTROL TOWER — AI Feature f042 · Acceptance Criteria Writer
// Category: Agile & Delivery · importance rank 42. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListChecks } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "story",
    label: "User story",
    type: "textarea",
    rows: 5,
    required: true,
    placeholder: "As a delivery coordinator, I want to reschedule a drop to the next available slot so that missed collections do not stall the yard.",
    hint: "Include any rules, roles or fields the story already mentions.",
  },
  {
    key: "style",
    label: "Style",
    type: "select",
    options: [
      { value: "Gherkin", label: "Gherkin (Given / When / Then)" },
      { value: "Bullets", label: "Bullets (one testable statement each)" },
    ],
  },
  {
    key: "edgeCases",
    label: "Edge cases",
    type: "select",
    options: [
      { value: "Include", label: "Include edge cases" },
      { value: "Skip", label: "Skip edge cases" },
    ],
  },
  { key: "rules", label: "Known rules & validations", type: "textarea", rows: 3, placeholder: "Optional: who may do what, limits, error messages, thresholds the story must obey…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You write acceptance criteria a tester can execute without asking a single follow-up question.",
  "Produce between 5 and 9 acceptance criteria, ordered as: happy path first (1–3), then permissions and validation (2–3), then edge cases only when the operator asked to include them.",
  "Style 'Gherkin': number each scenario and write Given / When / Then lines using concrete roles, data and results taken from the story. Style 'Bullets': one criterion per '-' bullet, each with an explicit observable, measurable outcome.",
  "Every criterion must be testable — ban vague words such as 'works correctly', 'quickly', 'intuitive' or 'as expected'; replace each with the exact observable result.",
  "Never invent business rules, field names, roles, thresholds or integrations that the story does not state; where a rule is unspecified write 'NEEDS DECISION: <the question the team must settle>' instead of guessing.",
  "Plain text output, no markdown fences; start with 'AC 1', 'AC 2' … and keep the whole answer under 300 words plus the criteria themselves.",
].join(" ");

export default function AcceptanceCriteriaWriter() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", story: "", style: "Gherkin", edgeCases: "Include", rules: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.story.trim()) {
      setError("Paste the user story the criteria must cover.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("User story", values.story),
        promptLine("Style", values.style),
        promptLine("Edge cases", values.edgeCases),
        promptLine("Known rules & validations", values.rules),
        "",
        "Write the acceptance criteria for this story now.",
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
      id="f042"
      rank={42}
      name="Acceptance Criteria Writer"
      tagline="5–9 testable acceptance criteria — Gherkin or bullets — covering happy path, permissions and edges."
      category="Agile & Delivery"
      icon={ListChecks}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write acceptance criteria"
    />
  );
}
