"use client";
// PM CONTROL TOWER — AI Feature f002 · Risk → Mitigation Designer
// Category: Risk & RAID · importance rank 2. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ShieldAlert } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "risk", label: "Risk statement", type: "textarea", rows: 3, required: true, placeholder: "e.g. The data migration slips because the source system freeze window is unconfirmed." },
  { key: "category", label: "Category", type: "select", options: [
    { value: "Schedule", label: "Schedule" },
    { value: "Cost", label: "Cost" },
    { value: "Scope", label: "Scope" },
    { value: "Resource", label: "Resource" },
    { value: "Technical", label: "Technical" },
    { value: "External", label: "External" },
    { value: "Commercial", label: "Commercial" },
    { value: "Compliance", label: "Compliance" },
  ] },
  { key: "impact", label: "What it would cost us", type: "textarea", rows: 3, placeholder: "Impact if it happens — time, money, people, reputation…", hint: "Optional, but scoring is much sharper with it." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Turn the supplied risk statement into a fully worked risk record for an enterprise RAID log.",
  "Output these lines in plain text, one per line: SCORE (probability 1-5 × impact 1-5, the product, and the band HIGH/MEDIUM/LOW), WHY NOW (1 sentence), ROOT CAUSES (max 3 '-' bullets), MITIGATION (preventive actions, max 4 '-' bullets, each with an owner role), CONTINGENCY (what we do if it fires, 1-2 sentences), TRIGGER (the observable signal that says it is happening, 1 sentence), OWNER ROLE, REVIEW (how often to re-check).",
  "Score from the facts given: if probability or impact cannot be evidenced, score conservatively and say which input you assumed.",
  "Mitigations must reduce probability or impact — 'monitor it' alone is not a mitigation.",
].join(" ");

export default function RiskMitigationDesigner() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", risk: "", category: "Schedule", impact: "",
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
        promptLine("Risk statement", values.risk),
        promptLine("Category", values.category),
        promptLine("Impact if it happens", values.impact),
        "",
        "Design the full risk record now.",
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
      id="f002"
      rank={2}
      name="Risk → Mitigation Designer"
      tagline="Scores a raw risk and returns mitigation, contingency, trigger and owner in one pass."
      category="Risk & RAID"
      icon={ShieldAlert}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Design risk record"
    />
  );
}
