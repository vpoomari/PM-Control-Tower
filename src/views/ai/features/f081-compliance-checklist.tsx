"use client";
// PM CONTROL TOWER — AI Feature f081 · Compliance Checklist Generator
// Category: Governance & Quality · importance rank 81. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ClipboardCheck } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "standard", label: "Standard or framework", type: "text", required: true, placeholder: "e.g. ISO/IEC 27001:2022, ISO 9001:2015, client supplier policy" },
  { key: "clauses", label: "Clause list", type: "textarea", rows: 6, required: true, placeholder: "8.1.5 Access control — access rights are defined and authorised\n9.2.1 Internal audit — an audit programme is planned and implemented", hint: "Paste the clause list exactly as published — one clause per line." },
  { key: "context", label: "Scope & context", type: "textarea", rows: 3, placeholder: "Certification scope, audit window, systems and sites in scope, who currently holds the evidence…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Turn the pasted clause list into an audit-ready compliance checklist for the standard supplied.",
  "Use exactly these headings in plain text (no markdown fences, no markdown tables): CHECKLIST, CONTROLS MOST OFTEN FAILED, EVIDENCE FIRST.",
  "CHECKLIST groups the clauses under theme headings (such as Access control, Change management, Supplier management) and prints one row per pasted clause as: clause · control to evidence · owner role · status Open — keep every clause number and wording exactly as pasted and never add a clause that was not supplied.",
  "CONTROLS MOST OFTEN FAILED lists exactly 5 rows chosen only from the pasted clauses, each with the one line explaining why that clause typically fails an audit.",
  "EVIDENCE FIRST is an ordered list of at most 5 items: the artefact to gather first, the owner role to ask, and why it is the priority.",
  "Owner roles and scope must come from the supplied context; where a role, site or audit date is not stated, write 'NEEDS DATA: <specific fact>' instead of assuming one.",
  "Total length under 500 words.",
].join(" ");

export default function ComplianceChecklistGenerator() {
  const [values, setValues] = useState<Record<string, string>>({
    standard: "", clauses: "", context: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const clauses = values.clauses.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!values.standard.trim()) {
      setError("Name the standard or framework the checklist must cover.");
      return;
    }
    if (clauses.length < 2) {
      setError("Paste at least two clauses — one per line — so the checklist can be grouped by theme.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Standard or framework", values.standard),
        promptLine("Clause list", values.clauses),
        promptLine("Scope & context", values.context),
        "",
        "Build the compliance checklist now.",
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
      id="f081"
      rank={81}
      name="Compliance Checklist Generator"
      tagline="Turns a published clause list into a themed audit checklist with owners, status and evidence order."
      category="Governance & Quality"
      icon={ClipboardCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build the checklist"
    />
  );
}
