"use client";
// PM CONTROL TOWER — AI Feature f054 · Stakeholder Tailored Update
// Category: Status & Reporting · importance rank 54. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Megaphone } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "update", label: "The update", type: "textarea", rows: 6, required: true, placeholder: "The raw facts for this update — progress, changes, dates, numbers, what you need…", hint: "One set of facts; the variants may differ in depth, never in content." },
  { key: "segments", label: "Audience segments", type: "select", options: [
    { value: "Sponsor", label: "Sponsor" },
    { value: "Team", label: "Team" },
    { value: "Client", label: "Client" },
    { value: "All three", label: "All three" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Render the supplied facts as audience variants in plain text (no markdown fences), driven by the Segments input: 'All three' produces three variants headed SPONSOR VARIANT, TEAM VARIANT and CLIENT VARIANT in that order; a single segment produces only that variant.",
  "Variants share facts: every date, number and name must be identical across variants — only depth and emphasis may change. Sponsor ≤80 words (outcome, decisions, money), Team ≤120 words (what changes for their work and what is needed from them), Client ≤100 words (progress, impact and next step, no internal names, no blame).",
  "After each variant add one line 'THEY WILL ASK NEXT: <the single most likely follow-up question for that audience>' — derived only from the facts supplied.",
  "Never add a fact to a variant that is not in the input, and never restate the same figure two different ways.",
  "If an audience variant cannot be written from the input (for example no client-visible outcome is stated), write 'NEEDS DATA: <fact>' under that variant's heading instead of filling the gap.",
].join(" ");

export default function StakeholderTailoredUpdate() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", update: "", segments: "All three",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.update.trim().length < 15) {
      setError("Write the update in at least one full sentence — the variants can only re-weigh facts that exist.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("The update", values.update),
        promptLine("Audience segments", values.segments),
        "",
        "Render the update for the chosen audience now — same facts, tailored depth, plus what they will ask next.",
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
      id="f054"
      rank={54}
      name="Stakeholder Tailored Update"
      tagline="One set of facts rendered for sponsor, team or client — plus what each audience will ask next."
      category="Status & Reporting"
      icon={Megaphone}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft audience variants"
    />
  );
}
