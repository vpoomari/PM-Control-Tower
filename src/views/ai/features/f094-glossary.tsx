"use client";
// PM CONTROL TOWER — AI Feature f094 · Glossary & Naming Standard
// Category: Documents & Knowledge · importance rank 94. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Languages } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "terms", label: "Raw terms & acronyms", type: "textarea", rows: 6, required: true, placeholder: "EAC, BAC, RAG, RAID, swimlane, hypercare, golden source, PMO", hint: "One per line or comma-separated — keep your own casing." },
  { key: "domain", label: "Domain", type: "text", placeholder: "e.g. Programme controls & PPM reporting", hint: "The context the definitions and naming rule must fit." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Produce a glossary and a naming standard from the supplied terms only, in plain text with no markdown fences and no preamble.",
  "Use exactly these sections: GLOSSARY, NAMING STANDARD, AMBIGUOUS TERMS.",
  "GLOSSARY has one line per supplied term in the form 'TERM — definition of at most 20 words — synonym to avoid'; keep the supplied casing, sort alphabetically, and never split, merge, add or drop a term.",
  "Definitions must fit the stated domain; where the supplied context does not support a definition, keep the line and write 'NEEDS DATA: <the source needed to define it>' instead of guessing.",
  "NAMING STANDARD gives the rule for naming new artefacts in this domain — pattern, casing, separator, dating and versioning — plus 3 worked examples built only from the supplied terms.",
  "AMBIGUOUS TERMS names at most the 3 terms whose ambiguity causes rework, each with the two readings that collide and the ruling to adopt; if fewer than 3 are genuinely ambiguous, list only the real ones and say how many there were.",
  "Total under 700 words, plain definitional language, no marketing phrasing.",
].join(" ");

export default function GlossaryNamingStandard() {
  const [values, setValues] = useState<Record<string, string>>({
    terms: "", domain: "",
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
        promptLine("Raw terms & acronyms", values.terms),
        promptLine("Domain", values.domain),
        "",
        "Produce the glossary (term · definition ≤20 words · synonym to avoid), the naming standard for new artefacts, and the ambiguous terms that cause rework.",
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
      id="f094"
      rank={94}
      name="Glossary & Naming Standard"
      tagline="Defines each term in 20 words or less, kills the synonyms to avoid, and sets the naming rule."
      category="Documents & Knowledge"
      icon={Languages}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build the glossary"
    />
  );
}
