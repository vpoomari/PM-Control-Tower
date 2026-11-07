"use client";
// PM CONTROL TOWER — AI Feature f095 · User Story → Test Cases
// Category: Documents & Knowledge · importance rank 95. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListChecks } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "story", label: "User story", type: "textarea", rows: 5, required: true, placeholder: "As a regional controller I want to approve invoices up to 25,000 so small spends are not delayed. AC: blocks above the limit, emails the approver, logs the rejection reason.", hint: "Include the acceptance criteria — the tests must come from them." },
  { key: "style", label: "Test case format", type: "select", options: [
    { value: "Table", label: "Table" },
    { value: "Gherkin", label: "Gherkin" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Derive test cases from the story and its acceptance criteria only — never test behaviour the story does not mention, and never invent a business rule.",
  "Output plain text in this order: POSITIVE, NEGATIVE, BOUNDARY, then COVERAGE GAPS, then DATA SETUP — no other prose outside the chosen case format.",
  "Every case carries an id (TC-1, TC-2 …), preconditions, steps and expected result; in Table style render them as pipe-separated rows with a header row, in Gherkin style as Scenario / Given / When / Then lines.",
  "Positive cases prove the stated criteria work, negative cases prove the stated rejections and validations fire, and boundary cases bracket every stated limit (just below, exactly at, just above).",
  "Where the story states no limit, threshold or format, write 'NEEDS DATA: threshold to boundary-test' for that dimension instead of inventing one.",
  "Generate 6 to 12 cases in total. COVERAGE GAPS lists what the story leaves untestable (permissions, error paths, data states, concurrency); DATA SETUP lists the records, roles and states needed to run every case.",
  "Expected results may only restate behaviour given in the story. Total under 800 words.",
].join(" ");

export default function UserStoryTestCases() {
  const [values, setValues] = useState<Record<string, string>>({
    story: "", style: "Table",
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
        promptLine("User story", values.story),
        promptLine("Test case format", values.style),
        "",
        "Generate the test cases now in the chosen format: positive, negative and boundary blocks with preconditions, steps and expected results, then coverage gaps and the data setup needed to run them.",
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
      id="f095"
      rank={95}
      name="User Story → Test Cases"
      tagline="Turns a user story into positive, negative and boundary test cases with the data to run them."
      category="Documents & Knowledge"
      icon={ListChecks}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Generate test cases"
    />
  );
}
