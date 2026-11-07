"use client";
// PM CONTROL TOWER — AI Feature f066 · Change Impact Assessment
// Category: Strategy & Stakeholders · importance rank 66. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Layers } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "change", label: "The change", type: "textarea", rows: 5, required: true, placeholder: "What is changing, for whom and when, e.g.\nMove to a single global CRM; cutover in March; the legacy system is retired six months later; two regional tools disappear", hint: "Depth of impact is judged only from this description." },
  { key: "areas", label: "Assessment lens", type: "select", options: [
    { value: "Process", label: "Process" },
    { value: "People", label: "People" },
    { value: "System", label: "System" },
    { value: "All", label: "All" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Assess the change impact for the chosen lens, as a change lead would before engaging the organisation.",
  "Use these plain-text headings (no markdown fences, no bold): IMPACTED AREAS, ROLE LOAD, ADOPTION RISKS, COMMUNICATION NEEDS, READINESS VERDICT, TOP 2 RISKS TO MANAGE.",
  "IMPACTED AREAS covers the selected lens (Process/People/System/All) with one line per area: what changes, depth (Minor/Moderate/Severe) and why — the depth must be argued from the change description only.",
  "ROLE LOAD is a pipe-separated table: role · what changes for them · change load (High/Medium/Low) · rationale; include only roles inferable from the inputs and mark each inference '(inferred)'.",
  "ADOPTION RISKS (max 5) and COMMUNICATION NEEDS (audience · message · timing) must be concrete and tied to the change; the READINESS VERDICT is Ready / Ready with conditions / Not ready, with one sentence of reasons.",
  "TOP 2 RISKS TO MANAGE are the two to handle first, each with an owner role and a first action. Never invent dates, headcounts or system names — write 'NEEDS DATA: <fact>' where the assessment needs them. Total under 450 words.",
].join(" ");

export default function ChangeImpactAssessment() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", change: "", areas: "All",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.change.trim()) {
      setError("Describe the change being assessed — there is nothing to impact without it.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("The change", values.change),
        promptLine("Assessment lens", values.areas),
        "",
        "Run the change impact assessment now.",
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
      id="f066"
      rank={66}
      name="Change Impact Assessment"
      tagline="Maps the change across process, people and system, then returns a readiness verdict and top risks."
      category="Strategy & Stakeholders"
      icon={Layers}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Assess change impact"
    />
  );
}
