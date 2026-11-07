"use client";
// PM CONTROL TOWER — AI Feature f037 · Definition of Done Reviewer
// Category: Governance & Quality · importance rank 37. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListChecks } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "dod", label: "Current definition of done", type: "textarea", rows: 6, required: true, placeholder: "Paste the team's DoD exactly as written, one item per line:\nCode complete and peer reviewed\nUnit tests passing\nQA sign-off\nDemoed to product owner\nDeployed to staging", hint: "Keep the team's own wording — items are judged, not renumbered." },
  { key: "teamType", label: "Team type", type: "select", options: [
    { value: "Software", label: "Software" },
    { value: "Delivery", label: "Delivery" },
    { value: "Research", label: "Research" },
    { value: "Operations", label: "Operations" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Review a team's written definition of done against the standard a mature team of the stated type would hold, and strengthen it without turning it into boilerplate.",
  "Use these headings in plain text: GAPS (one line each: area · what is missing · why it matters — check the areas Quality, Security, Operations, Review & approval, Documentation and Compliance, and drop any area irrelevant to the stated team type), STRONGER DEFINITION OF DONE (the full revised checklist, numbered, every item phrased as a yes/no check, keeping each existing item that already earns its place), 3 ITEMS WHOSE ABSENCE CAUSES REWORK (the three most damaging omissions, each with a one-line rationale grounded in the pasted text).",
  "Every proposed item must be checkable by the team without holding a meeting, must fit the stated team type, and must be absent from the pasted list before it is proposed — never propose something the team already has.",
  "Never claim the team breaches an item that is not in the pasted text: absence from the list is the finding, not evidence of a breach. Total length under 450 words.",
].join(" ");

export default function DefinitionOfDoneReviewer() {
  const [values, setValues] = useState<Record<string, string>>({
    dod: "", teamType: "Software",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.dod.trim().length < 15) {
      setError("Paste the current definition of done — at least one item to review.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Team type", values.teamType),
        "",
        "Current definition of done:",
        values.dod.trim(),
        "",
        "Review it and produce the strengthened definition now.",
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
      id="f037"
      rank={37}
      name="Definition of Done Reviewer"
      tagline="Finds the gaps in a definition of done and returns a stronger, rework-preventing version."
      category="Governance & Quality"
      icon={ListChecks}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Review definition of done"
    />
  );
}
