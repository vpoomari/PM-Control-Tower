"use client";
// PM CONTROL TOWER — AI Feature f005 · Overdue Work Recovery Plan
// Category: Plan & Schedule · importance rank 5. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { AlarmClock } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "items", label: "Overdue items", type: "textarea", rows: 6, required: true, placeholder: "One per line with its date, e.g.\nData load script — due 09 Oct\nUAT sign-off — due 14 Oct" },
  { key: "capacity", label: "Capacity left", type: "text", placeholder: "e.g. 2 people, 6 days before month end" },
  { key: "rule", label: "Recovery rule", type: "select", options: [
    { value: "Recover the dates", label: "Recover the dates" },
    { value: "Re-plan to the next window", label: "Re-plan to the next window" },
    { value: "Escalate what cannot move", label: "Escalate what cannot move" },
    { value: "Close what is no longer needed", label: "Close what is no longer needed" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Recover a list of overdue work items under the recovery rule the operator chose.",
  "Use these headings in plain text: TRIAGE (one line per item: item · age implied by its date · recommendation RECOVER/REPLAN/ESCALATE/CLOSE · suggested new date or action), RESEQUENCED PLAN (numbered steps in the order the work should actually happen, honouring the stated capacity), ESCALATIONS (max 3, each stating who decides and what exactly is being asked), STOP DOING (max 2 items to drop or defer so the plan fits).",
  "Only use the capacity supplied — if the plan does not fit the capacity, say so and show the shortfall instead of assuming extra people.",
  "Never propose a date earlier than today's date (supplied in the prompt), and never close an item without stating what happens to its deliverable.",
].join(" ");

export default function OverdueWorkRecoveryPlan() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", items: "", capacity: "", rule: "Recover the dates",
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
        promptLine("Today's date", new Date().toISOString().slice(0, 10)),
        promptLine("Project", values.project),
        promptLine("Overdue items (one per line)", values.items),
        promptLine("Capacity left", values.capacity),
        promptLine("Recovery rule", values.rule),
        "",
        "Triage the items and produce the recovery plan now.",
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
      id="f005"
      rank={5}
      name="Overdue Work Recovery Plan"
      tagline="Triages pasted overdue items into recover / replan / escalate / close with a plan that fits real capacity."
      category="Plan & Schedule"
      icon={AlarmClock}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build recovery plan"
    />
  );
}
