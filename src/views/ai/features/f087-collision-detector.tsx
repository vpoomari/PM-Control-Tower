"use client";
// PM CONTROL TOWER — AI Feature f087 · Cross-Project Collision Detector
// Category: Personal & Data · importance rank 87. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Network } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "projects", label: "Project lines", type: "textarea", rows: 8, required: true, placeholder: "PRJ-12 · ERP cutover · 3–21 Nov · needs 2 platform engineers\nPRJ-19 · Data migration · 10–24 Nov · needs Priya full-time", hint: "One line per project: project + date + what it needs." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Every pasted line is one project demand and those lines are the whole portfolio you may reason about — detect collisions only between them.",
  "Use exactly these headings in plain text (no markdown fences): COLLISIONS, SEQUENCE RECOMMENDATION.",
  "COLLISIONS prints one block per collision as: Collision: <shared people, dates or dependency> · Projects: <the offending pasted lines quoted verbatim> · Overlap: <the dates as pasted> · Severity: <Critical|High|Medium|Low> · Options: <2–3 resolution options>.",
  "Severity rules: same named person or team with overlapping dates = Critical; same team claimed in the same weeks = High; a dependency whose dates do not line up = Medium; a soft contention such as one approver or one environment = Low.",
  "Quote every offending line verbatim — never paraphrase a name, team, date or need — and number the pasted lines from 1 in the order given so each collision is traceable.",
  "A line that lacks a date or a stated need is reported as 'NEEDS DATE' or 'NEEDS NEED' and excluded from detection rather than guessed at.",
  "SEQUENCE RECOMMENDATION gives 1–5 steps that reorder the pasted lines to remove the worst overlap, each step naming the collision it clears and the cost of moving that line.",
  "Never invent people, teams, dates or dependencies that are not printed in the input.",
].join(" ");

export default function CrossProjectCollisionDetector() {
  const [values, setValues] = useState<Record<string, string>>({
    projects: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const lines = values.projects.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      setError("Paste at least two project lines — one per line — otherwise there is nothing to collide.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project lines", values.projects),
        "",
        "Detect the collisions now.",
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
      id="f087"
      rank={87}
      name="Cross-Project Collision Detector"
      tagline="Finds people, date and dependency collisions across pasted project lines and sequences around them."
      category="Personal & Data"
      icon={Network}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Detect collisions"
    />
  );
}
