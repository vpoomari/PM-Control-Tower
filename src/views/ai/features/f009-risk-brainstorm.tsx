"use client";
// PM CONTROL TOWER — AI Feature f009 · Risk Brainstorm (threats & opportunities)
// Category: Risk & RAID · importance rank 9. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Lightbulb } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "context", label: "Project context", type: "textarea", rows: 5, required: true, placeholder: "What is being delivered, who is involved, what is unusual about it, known constraints…" },
  { key: "phase", label: "Lifecycle phase", type: "select", options: [
    { value: "Concept", label: "Concept" },
    { value: "Planning", label: "Planning" },
    { value: "Execution", label: "Execution" },
    { value: "Closure", label: "Closure" },
  ] },
  { key: "kind", label: "What to brainstorm", type: "select", options: [
    { value: "Both threats and opportunities", label: "Both threats and opportunities" },
    { value: "Threats only", label: "Threats only" },
    { value: "Opportunities only", label: "Opportunities only" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Brainstorm the risks and opportunities that this specific project context creates — not a generic risk library.",
  "Return 12 to 15 items, each on one line: ref (T-01… for threats, O-01… for opportunities) · statement of at most 16 words, phrased as 'event → effect' · category (Schedule/Cost/Scope/Resource/Technical/External/Commercial/Compliance) · initial score as P×I (1-5 each).",
  "Group them under two headings: THREATS and OPPORTUNITIES (omit whichever the operator excluded). Then add 'NOT VISIBLE FROM HERE' — 2 to 3 bullets naming what this context does not tell you that would change the list.",
  "Maximum one item per underlying cause; no duplicates in different words; every item must be specific to the context pasted.",
].join(" ");

export default function RiskBrainstorm() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", context: "", phase: "Execution", kind: "Both threats and opportunities",
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
        promptLine("Lifecycle phase", values.phase),
        promptLine("What to brainstorm", values.kind),
        "",
        "Project context:",
        values.context.trim(),
        "",
        "Produce the brainstorm now.",
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
      id="f009"
      rank={9}
      name="Risk Brainstorm"
      tagline="Generates 12–15 context-specific threats and opportunities with initial scores — plus what it cannot see."
      category="Risk & RAID"
      icon={Lightbulb}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Brainstorm risks"
    />
  );
}
