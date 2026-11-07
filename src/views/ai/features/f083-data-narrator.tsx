"use client";
// PM CONTROL TOWER — AI Feature f083 · Data Narrator
// Category: Status & Reporting · importance rank 83. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { BarChart3 } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "data", label: "Pasted data", type: "textarea", rows: 6, required: true, placeholder: "Period, actual, plan\n2026-07, 412k, 380k\n2026-08, 455k, 420k\n2026-09, 511k, 460k", hint: "Paste rows exactly as they appear — these are the only figures allowed in the output." },
  { key: "focus", label: "Focus of the narrative", type: "text", placeholder: "e.g. spend run-rate versus plan for the steering note" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The pasted rows and figures are the entire dataset: treat them as the sole source of truth, restate them exactly as written (same units, periods and labels) and never introduce a number that is not present in the input.",
  "Use exactly these headings in plain text (no markdown fences): NARRATIVE, KEY MOVEMENTS, WHAT THIS DOES NOT SHOW, DATA WORTH COLLECTING.",
  "NARRATIVE is 3–4 short paragraphs explaining the trend in the supplied figures, written for a steering update and anchored to the focus question when one was given.",
  "KEY MOVEMENTS lists the 3 most important movements, each one line naming the rows or periods compared and the difference calculated only from the pasted numbers — show the arithmetic you used.",
  "WHAT THIS DOES NOT SHOW lists 2–4 conclusions the data cannot support (missing baseline, no comparison period, small sample, mixed units, one-off events).",
  "DATA WORTH COLLECTING lists 3–5 follow-up figures, each with one line on why it would change a decision.",
  "If the focus question cannot be answered from the rows given, say so plainly and end with 'NEEDS DATA: <exact figure or period>' rather than estimating it.",
].join(" ");

export default function DataNarrator() {
  const [values, setValues] = useState<Record<string, string>>({
    data: "", focus: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const rows = values.data.split("\n").map((line) => line.trim()).filter(Boolean);
    if (rows.length < 2) {
      setError("Paste at least two rows or figures — one per line — so a trend can be described.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Pasted data", values.data),
        promptLine("Focus of the narrative", values.focus),
        "",
        "Narrate this data now.",
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
      id="f083"
      rank={83}
      name="Data Narrator"
      tagline="Explains the trend in pasted figures only — plus the three movements and what the data cannot show."
      category="Status & Reporting"
      icon={BarChart3}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Narrate the data"
    />
  );
}
