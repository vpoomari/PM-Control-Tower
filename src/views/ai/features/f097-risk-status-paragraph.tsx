"use client";
// PM CONTROL TOWER — AI Feature f097 · Risk-Adjusted Status Paragraph
// Category: Risk & RAID · importance rank 97. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { BadgeAlert } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "topRisks", label: "Top risks", type: "textarea", rows: 5, required: true, placeholder: "R1 · Supplier tooling date missed, score 16, owner procurement\nR2 · Data-migration window too short, score 12, owner data lead", hint: "Reference, description, score and owner role — one per line." },
  { key: "movement", label: "Movement since last status", type: "textarea", rows: 3, placeholder: "R1 escalated after the supplier missed the tooling date; R3 closed; new R5 added for the regulator review.", hint: "Leave empty when nothing moved — the output will say so." },
  { key: "dimension", label: "Dimension", type: "select", options: [
    { value: "Overall", label: "Overall" },
    { value: "Risk", label: "Risk" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write ONE status paragraph of 60 to 90 words in plain text — no headings, no bullets, no markdown, nothing else in the output.",
  "It must open with the current position, reflect the movement supplied since the last status (when no movement was supplied, state that the position is unchanged rather than inventing change), name exactly one risk as the risk that decides the outcome — quoting its supplied reference such as R1 — and close with the action already underway plus its owner role if one was given.",
  "Use the chosen dimension to set the angle: Overall weighs delivery, cost and risk together, Risk concentrates on how the risk position moved since the last report.",
  "Quote no score, date, percentage, amount or name that is not in the inputs; if the deciding risk has no reference, call it 'the top risk' and append 'NEEDS DATA: risk reference'.",
  "Plain sentences a steering committee can paste straight into the report — concrete, no hedging clichés, no new recommendations.",
].join(" ");

export default function RiskAdjustedStatusParagraph() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", topRisks: "", movement: "", dimension: "Overall",
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
        promptLine("Project", values.project),
        promptLine("Top risks", values.topRisks),
        promptLine("Movement since last status", values.movement),
        promptLine("Dimension", values.dimension),
        "",
        "Write the single 60–90-word risk-adjusted status paragraph now, naming the one risk that decides the outcome and the action already underway.",
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
      id="f097"
      rank={97}
      name="Risk-Adjusted Status Paragraph"
      tagline="One 60–90-word paragraph that moves with the risk position and names the risk that decides it."
      category="Risk & RAID"
      icon={BadgeAlert}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write the paragraph"
    />
  );
}
