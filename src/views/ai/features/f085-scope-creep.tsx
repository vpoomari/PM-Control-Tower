"use client";
// PM CONTROL TOWER — AI Feature f085 · Scope Creep Detector
// Category: Personal & Data · importance rank 85. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Layers3 } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "baseline", label: "Approved baseline scope", type: "textarea", rows: 4, required: true, placeholder: "What was agreed — deliverables, exclusions, key dates, budget as they stand today…" },
  { key: "requests", label: "New asks", type: "textarea", rows: 4, required: true, placeholder: "Add an extra report format for the ops team\nInclude the Polish locale in phase 1\nBring the UAT environment forward by a week", hint: "One request per line, quoted as they arrived." },
  { key: "budget", label: "Float left", type: "text", placeholder: "e.g. £35k and 10 working days of float" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Classify every new request against the supplied baseline scope and decide: IN SCOPE, SCOPE CREEP, or LEGITIMATE CHANGE.",
  "Use exactly these headings in plain text (no markdown fences): REQUEST CLASSIFICATION, CUMULATIVE IMPACT, CHANGE REQUEST NEEDED, HOW TO DECLINE.",
  "REQUEST CLASSIFICATION prints one block per request as: <request quoted as pasted> — <verdict> — <one line naming the baseline item it matches, or the baseline silence it exploits>.",
  "CUMULATIVE IMPACT states the combined effect if every request were accepted, across scope, schedule and cost, using only supplied figures; where no figure exists give the direction of travel and end that line with 'NEEDS DATA: <specific figure>'.",
  "CHANGE REQUEST NEEDED gives the single CR to raise (title, what changes, why, who decides) when at least one request is creep or legitimate change; if every request is already in scope, write 'No change request required.'",
  "HOW TO DECLINE gives one ready-to-send sentence per creep request — polite, specific, and pointing at the legitimate route instead.",
  "Never invent budget, effort, dates or stakeholder names that were not supplied.",
].join(" ");

export default function ScopeCreepDetector() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", baseline: "", requests: "", budget: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const requests = values.requests.split("\n").map((line) => line.trim()).filter(Boolean);
    if (requests.length < 1) {
      setError("List at least one new ask — one request per line — to classify.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Approved baseline scope", values.baseline),
        promptLine("New asks", values.requests),
        promptLine("Float left", values.budget),
        "",
        "Classify every request against the baseline now.",
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
      id="f085"
      rank={85}
      name="Scope Creep Detector"
      tagline="Classifies every new ask as scope, creep or change, then hands back the CR and the sentence to decline."
      category="Personal & Data"
      icon={Layers3}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Detect scope creep"
    />
  );
}
