"use client";
// PM CONTROL TOWER — AI Feature f024 · Scope Statement Writer
// Category: Plan & Schedule · importance rank 24. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileText } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "objective", label: "Objective", type: "textarea", rows: 3, required: true, placeholder: "Reduce invoice query handling from 6 days to 2 days for all EU customers by Q3 2027" },
  { key: "inScope", label: "In scope", type: "textarea", rows: 4, required: true, placeholder: "Invoice query intake form\nAI triage of query reasons\nIntegration with the billing API", hint: "One deliverable or area per line." },
  { key: "outScope", label: "Out of scope", type: "textarea", rows: 3, placeholder: "Rewriting the pricing engine\nMobile app work\nAny changes to payment capture", hint: "One exclusion per line. Leave empty if none yet." },
  { key: "acceptance", label: "Acceptance criteria", type: "textarea", rows: 3, placeholder: "95% of queries answered within 2 working days\nZero P1 defects at go-live\nSign-off from the Head of Finance", hint: "One measurable criterion per line." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are writing a formal scope statement from the supplied objective, in-scope list, exclusions and acceptance criteria; those inputs are the only source of truth.",
  "Use exactly these headings in plain text (no markdown fences, no bold): OBJECTIVE, IN-SCOPE DELIVERABLES, EXPLICIT EXCLUSIONS, ACCEPTANCE CRITERIA, ASSUMPTIONS, BOUNDARY CASES.",
  "OBJECTIVE restates the supplied objective in one or two sentences without adding any target, date or number that was not given.",
  "IN-SCOPE DELIVERABLES turns the pasted lines into numbered deliverables with a one-line description each; do not add deliverables that were not listed.",
  "EXPLICIT EXCLUSIONS reproduces every exclusion given and adds a short 'this means…' clarification per line; if no exclusions were supplied, say 'No exclusions supplied — confirm the top 3 before baselining.'",
  "ACCEPTANCE CRITERIA keeps every criterion supplied and marks any that is not measurable as 'NOT MEASURABLE — needs a threshold'.",
  "ASSUMPTIONS lists at most 5 assumptions, each derived from a supplied fact; when an assumption would need an unsupplied fact, write 'NEEDS DATA: <specific fact>' instead.",
  "BOUNDARY CASES gives 3–5 items most likely to be argued later, each phrased as 'If X, then it is in scope / out of scope / needs a change request' — only decide a side when the supplied exclusions decide it, otherwise mark it 'disputed until confirmed'.",
  "Total length under 450 words, plain text with '-' bullets under each heading.",
].join(" ");

export default function ScopeStatementWriter() {
  const [values, setValues] = useState<Record<string, string>>({
    objective: "", inScope: "", outScope: "", acceptance: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.objective.trim() || !values.inScope.trim()) {
      setError("The objective and the in-scope list are both needed to write the scope statement.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Objective", values.objective),
        promptLine("In scope", values.inScope),
        promptLine("Out of scope", values.outScope),
        promptLine("Acceptance criteria", values.acceptance),
        "",
        "Write the scope statement now with the six sections in order.",
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
      id="f024"
      rank={24}
      name="Scope Statement Writer"
      tagline="Turns objectives and boundaries into a scope statement with exclusions and arguable edge cases."
      category="Plan & Schedule"
      icon={FileText}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft scope statement"
    />
  );
}
