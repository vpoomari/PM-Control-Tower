"use client";
// PM CONTROL TOWER — AI Feature f020 · RAG Rating Justifier
// Category: Status & Reporting · importance rank 20. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gauge } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "evidence",
    label: "Evidence (facts only)",
    type: "textarea",
    rows: 5,
    required: true,
    placeholder: "One fact per line: design sign-off 6 days late · SPI 0.86 · no cost report since Sep · 2 of 5 regions tested",
    hint: "Facts and numbers only — no conclusions, the rating is what gets tested.",
  },
  {
    key: "current",
    label: "Current rating",
    type: "select",
    options: [
      { value: "GREEN", label: "GREEN" },
      { value: "AMBER", label: "AMBER" },
      { value: "RED", label: "RED" },
    ],
  },
  {
    key: "dimension",
    label: "Dimension",
    type: "select",
    options: [
      { value: "Overall", label: "Overall" },
      { value: "Schedule", label: "Schedule" },
      { value: "Cost", label: "Cost" },
      { value: "Scope", label: "Scope" },
      { value: "Quality", label: "Quality" },
      { value: "Risk", label: "Risk" },
    ],
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Rate the stated dimension from the supplied evidence only. The first line must read exactly: RECOMMENDED: GREEN|AMBER|RED (current: X) using the current rating given.",
  "If the recommendation differs from the current rating, the second sentence says so plainly and names the single fact that forces the change.",
  "Use exactly these headings: RATIONALE, WHAT WOULD CHANGE IT, STATUS SENTENCE.",
  "RATIONALE is 2–3 bullets, each tied to one specific fact from the evidence — no bullet may lean on a fact that was not supplied, and each bullet must say what that fact means for the dimension.",
  "WHAT WOULD CHANGE IT lists the observable event that would move the rating up and the one that would move it down, each phrased as a fact to watch rather than a new metric.",
  "STATUS SENTENCE is one sentence of 35 words or fewer to paste straight into the status report — confident and free of hedging words such as 'appears', 'seems' or 'probably'.",
  "Evidence rules: stale, missing or unquantified evidence caps the rating at AMBER and must be called out; never invent a percentage, date, budget, milestone or prior rating, and put anything absent under DATA NEEDED.",
  "Maximum 250 words.",
].join(" ");

export default function RagRatingJustifier() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    evidence: "",
    current: "AMBER",
    dimension: "Overall",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.evidence.trim().length < 30) {
      setError("List the facts first — a rating cannot be justified from a line or two of evidence.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Evidence (facts only)", values.evidence),
        promptLine("Current rating", values.current),
        promptLine("Dimension", values.dimension),
        "",
        "Justify the RAG rating for this dimension now.",
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
      id="f020"
      rank={20}
      name="RAG Rating Justifier"
      tagline="Tests a RAG rating against the evidence supplied and returns a sentence ready for the status report."
      category="Status & Reporting"
      icon={Gauge}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Justify rating"
    />
  );
}
