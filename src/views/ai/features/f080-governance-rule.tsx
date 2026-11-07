"use client";
// PM CONTROL TOWER — AI Feature f080 · Governance Rule Author
// Category: Governance & Quality · importance rank 80. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Ruler } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "requirement", label: "Requirement to enforce", type: "textarea", rows: 4, required: true, placeholder: "'Any change to the data model must be reviewed before release' — the control you need to exist…", hint: "Write what must happen; the rule's trigger, owner and evidence are built from it." },
  { key: "scope", label: "Scope", type: "select", options: [
    { value: "All projects", label: "All projects" },
    { value: "Portfolio", label: "Portfolio" },
    { value: "Programme", label: "Programme" },
    { value: "Team", label: "Team" },
  ] },
  { key: "strictness", label: "Strictness", type: "select", options: [
    { value: "Advisory", label: "Advisory" },
    { value: "Mandatory", label: "Mandatory" },
    { value: "Blocking", label: "Blocking" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Author one governance rule ready to paste into the governance rule register. Plain text only: no markdown fences, no bold.",
  "Use exactly these headings, in this order: SCOPE, RULE, EXCEPTION PATH, EVIDENCE REQUIRED, WORKED EXAMPLE.",
  "SCOPE repeats the supplied scope and states in one line who must apply the rule at that scope.",
  "RULE gives four labelled lines — 'Trigger:', 'Condition:', 'Action:', 'Owner:' — followed by a plain-language rule statement of 1–2 sentences that a new team member could follow. Owner uses the supplied owner verbatim; when none was supplied write 'Owner: NEEDS OWNER' and never invent a person.",
  "Strictness decides the verbs and the teeth: Advisory uses 'should' and says how non-compliance is reported; Mandatory uses 'must' and states the consequence of non-compliance; Blocking uses 'must' and states that the work cannot proceed until the rule is satisfied.",
  "EXCEPTION PATH states who may grant an exception, what evidence they need, and when it expires — mark any missing element NEEDS OWNER or NEEDS DATE. EVIDENCE REQUIRED lists 3–5 checkable proofs as a plain three-column table without markdown pipes: 'Evidence · Where it lives · How often checked'.",
  "WORKED EXAMPLE gives one compliant and one non-compliant case, two lines each, both labelled 'Example project' and marked as illustration. Total under 450 words; never invent policy names, system names, dates, figures or people beyond that marked example.",
].join(" ");

export default function GovernanceRuleAuthor() {
  const [values, setValues] = useState<Record<string, string>>({
    requirement: "", scope: "All projects", strictness: "Mandatory",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.requirement.trim()) {
      setError("Requirement to enforce is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Requirement to enforce", values.requirement),
        promptLine("Scope", values.scope),
        promptLine("Strictness", values.strictness),
        "",
        "Author the governance rule now.",
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
      id="f080"
      rank={80}
      name="Governance Rule Author"
      tagline="Turns a requirement into a plain-language rule with trigger, owner, exception path and evidence."
      category="Governance & Quality"
      icon={Ruler}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Author governance rule"
    />
  );
}
