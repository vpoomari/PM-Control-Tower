"use client";
// PM CONTROL TOWER — AI Feature f029 · Sprint Planner
// Category: Agile & Delivery · importance rank 29. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListTodo } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "backlog", label: "Backlog", type: "textarea", rows: 6, required: true, placeholder: "PAY-142 As a payer I can download a receipt (5)\nPAY-151 As an admin I can void a payment (8)\nPAY-160 Fix duplicate webhook delivery (3)", hint: "One story per line with its point estimate in brackets." },
  { key: "capacity", label: "Sprint capacity (points)", type: "number", required: true, placeholder: "e.g. 42" },
  { key: "goal", label: "Sprint goal", type: "text", placeholder: "e.g. Receipts downloadable end-to-end for payers" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are planning one sprint from a pasted backlog and a point capacity; every story and point value supplied is a fact and the capacity is a hard ceiling.",
  "Use exactly these headings in plain text (no markdown fences, no bold): SPRINT GOAL, SELECTED STORIES, NOT SELECTED, CAPACITY RISK, DEPENDENCY BLOCKERS.",
  "SPRINT GOAL uses the supplied goal if there is one; otherwise write one ≤20-word goal from the top stories only.",
  "SELECTED STORIES is a plain-text table: id · title · points · running total. The running total must never exceed the supplied capacity; select highest-value items first and stop when the next story would breach capacity.",
  "A story with no stated point estimate cannot be summed: list it under NOT SELECTED as 'NEEDS POINTS' and exclude it from the running total — never guess a size.",
  "NOT SELECTED gives id · points · one-line reason (over capacity, needs points, blocked, lower value than what was chosen) for every story left out.",
  "CAPACITY RISK states the capacity in points, what fraction is left after selection, and what happens to the sprint if unplanned work arrives — quantify the damage in points using only the supplied values (e.g. a 5-point bug consumes X of the remaining Y points).",
  "DEPENDENCY BLOCKERS names exactly 2 items most likely to block the selected stories, drawn from the backlog text; if no dependencies are visible in the inputs, write 'NEEDS DATA: dependency information' rather than inventing any.",
  "Never invent story ids, titles, point values, dates or team members. Total length under 400 words.",
].join(" ");

const toNum = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function SprintPlanner() {
  const [values, setValues] = useState<Record<string, string>>({
    backlog: "", capacity: "", goal: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.backlog.trim()) {
      setError("Paste the backlog — one story per line with its points — before planning.");
      return;
    }
    const capacity = toNum(values.capacity);
    if (capacity === null) {
      setError("Sprint capacity must be a number of points.");
      return;
    }
    if (capacity <= 0) {
      setError("Sprint capacity must be greater than zero.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Backlog", values.backlog),
        promptLine("Sprint capacity (points)", String(capacity)),
        promptLine("Sprint goal", values.goal),
        "",
        "Plan the sprint now with the five sections in order and keep the running total within capacity.",
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
      id="f029"
      rank={29}
      name="Sprint Planner"
      tagline="Selects stories inside the point capacity with a running total, exclusions and dependency blockers."
      category="Agile & Delivery"
      icon={ListTodo}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Plan the sprint"
    />
  );
}
