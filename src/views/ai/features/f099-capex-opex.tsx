"use client";
// PM CONTROL TOWER — AI Feature f099 · Capex/Opex Classification Guide
// Category: Cost & Finance · importance rank 99. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).
// Classification is rule-based reasoning: every rule cell must quote the policy
// line applied, or say NEEDS POLICY — never a fabricated policy sentence.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Receipt } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "items", label: "Spend lines", type: "textarea", rows: 6, required: true, placeholder: "1. 40,000 — server rack refresh\n2. 6,000 — annual CRM licence renewal\n3. 12,000 — data-migration contractor build", hint: "One line per item: amount and what it buys." },
  { key: "policy", label: "Finance policy (optional)", type: "text", placeholder: "e.g. Capitalise when useful life > 12 months and it creates an asset; otherwise opex.", hint: "Paste the rule — the output quotes the line it applied." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Classify every supplied spend line as CAPEX, OPEX or NEEDS FINANCE REVIEW using rule-based reasoning, in plain text with no markdown fences and no preamble.",
  "Use exactly these sections: CLASSIFICATION, AMBIGUOUS ITEMS, QUESTION FOR FINANCE.",
  "CLASSIFICATION is a pipe-separated table with the header 'line | item | classification | rule applied'; the rule applied must quote the exact policy line used, closely enough that a finance reviewer can audit it.",
  "When no policy text was supplied, still give the best-reading classification marked '(heuristic)', put 'NEEDS POLICY' in the rule column, and never write a policy sentence that was not given.",
  "When the policy is silent, contradictory, or an item both creates an asset and is consumed within a year, classify it as NEEDS FINANCE REVIEW and state the conflict in one line.",
  "AMBIGUOUS ITEMS lists only the genuinely ambiguous lines with the single fact that would settle each; QUESTION FOR FINANCE is the one question that, once answered, would classify the remaining items.",
  "Do not invent amounts, capitalisation thresholds, tax treatment or useful lives, and repeat no amount that was not supplied. Total under 500 words.",
].join(" ");

export default function CapexOpexClassificationGuide() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", items: "", policy: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.items.split("\n").every((line) => !line.trim())) {
      setError("Paste at least one spend line to classify.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Spend lines", values.items),
        promptLine("Finance policy", values.policy),
        "",
        "Classify each spend line now as Capex, Opex or needs finance review, citing the policy line applied (or NEEDS POLICY), then list the ambiguous items and the single question for Finance.",
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
      id="f099"
      rank={99}
      name="Capex/Opex Classification Guide"
      tagline="Classifies every spend line as Capex, Opex or needs-review with the policy line cited."
      category="Cost & Finance"
      icon={Receipt}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Classify spend lines"
    />
  );
}
