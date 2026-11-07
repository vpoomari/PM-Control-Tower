"use client";
// PM CONTROL TOWER — AI Feature f052 · Client Update Drafter
// Category: Status & Reporting · importance rank 52. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Handshake } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "facts", label: "The facts to share", type: "textarea", rows: 6, required: true, placeholder: "What was delivered, dates, the issue if any, what you propose next — client-safe facts only…", hint: "Only what the client may see: no internal names, budgets or blame." },
  { key: "relationship", label: "Relationship", type: "select", options: [
    { value: "New", label: "New" },
    { value: "Stable", label: "Stable" },
    { value: "At risk", label: "At risk" },
  ] },
  { key: "news", label: "Nature of the news", type: "select", options: [
    { value: "Good", label: "Good" },
    { value: "Mixed", label: "Mixed" },
    { value: "Bad", label: "Bad" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write one client-facing update in plain text (no markdown fences) with four headings: DELIVERED (only work the input says was completed), NEXT (what follows, only if stated), ISSUE (only when the news is Mixed or Bad — state the problem and attach the remedy in the same breath: what we are doing and by when), QUESTION (exactly one question back to the client, answerable in one line).",
  "Omit any heading that has nothing behind it rather than padding it; never claim a delivery the input does not state.",
  "Honest but composed: the client reads it in under 90 seconds — body under 180 words, short paragraphs, no internal jargon, no blame, no over-promising.",
  "Relationship rules: New = slightly more formal and spells out what happens next; Stable = warm, brief and low-ceremony; At risk = takes ownership in the first two sentences and restates the commitment before the news.",
  "News rules: Good = lead with the win; Mixed = lead with progress, then the issue and its remedy; Bad = lead with the issue, then the remedy — never bury it under the good news.",
  "Never invent dates, percentages, names or money — anything essential but missing ends the update as 'NEEDS DATA: <exact fact>'.",
].join(" ");

export default function ClientUpdateDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", facts: "", relationship: "Stable", news: "Mixed",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.facts.trim().length < 15) {
      setError("Give the client-safe facts in at least one full sentence — the update cannot be built from a fragment.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Facts to share", values.facts),
        promptLine("Relationship", values.relationship),
        promptLine("Nature of the news", values.news),
        "",
        "Write the client-facing update now — under 180 words, closing with one question back to the client.",
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
      id="f052"
      rank={52}
      name="Client Update Drafter"
      tagline="A composed client update: what we delivered, what's next, an issue with a remedy, one question back."
      category="Status & Reporting"
      icon={Handshake}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft client update"
    />
  );
}
