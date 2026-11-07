"use client";
// PM CONTROL TOWER — AI Feature f078 · Audit Finding Response
// Category: Governance & Quality · importance rank 78. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ClipboardCheck } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "finding", label: "Audit finding", type: "textarea", rows: 6, required: true, placeholder: "Paste the finding: what the auditor observed, the reference if given, the evidence cited and the auditor's wording…", hint: "Verbatim text keeps the response aligned with the finding." },
  { key: "severity", label: "Severity", type: "select", options: [
    { value: "Critical", label: "Critical" },
    { value: "Major", label: "Major" },
    { value: "Minor", label: "Minor" },
    { value: "Observation", label: "Observation" },
  ] },
  { key: "owner", label: "Response owner", type: "text", placeholder: "e.g. A. Nwosu · Head of Delivery Ops — leave blank to write NEEDS OWNER" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Draft the formal response to an audit finding, paste-ready for the audit response tracker. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: AGREED STATEMENT, ROOT CAUSE, CORRECTIVE ACTION, PREVENTIVE ACTION, EVIDENCE TO ATTACH, CLOSURE STATEMENT.",
  "AGREED STATEMENT restates the finding in one or two factual lines in the auditor's own terms; if the input does not show the finding was agreed, add the line 'Agreement date: NEEDS DATE'.",
  "ROOT CAUSE is at most 3 lines and must reach a process or system cause, never a person; when the input gives no causal facts, write 'Root cause: NEEDS DATA: <the specific fact you need>'.",
  "CORRECTIVE ACTION fixes this instance: 2–4 numbered lines, each with an owner and a due date — use the supplied owner verbatim, write NEEDS OWNER when none was supplied and NEEDS DATE when no due date is given; never invent a calendar date.",
  "PREVENTIVE ACTION stops the recurrence: one or two lines introducing a control, using the same NEEDS OWNER / NEEDS DATE rule. EVIDENCE TO ATTACH lists 3–5 artefacts the input supports, each with a plain 'Evidence · Where it is stored' line.",
  "CLOSURE STATEMENT is a paragraph of 60 words or fewer addressed to the auditor, referencing the supplied severity and the corrective action, and stating what will be true when the finding is closed.",
  "Never invent audit references, system names, dates, quantities or figures; total under 450 words.",
].join(" ");

export default function AuditFindingResponse() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", finding: "", severity: "Major", owner: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.finding.trim()) {
      setError("Audit finding is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Severity", values.severity),
        promptLine("Response owner", values.owner),
        "",
        "Audit finding:",
        values.finding.trim(),
        "",
        "Draft the audit finding response now.",
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
      id="f078"
      rank={78}
      name="Audit Finding Response"
      tagline="Agreed statement, root cause, corrective and preventive actions, evidence and closure line."
      category="Governance & Quality"
      icon={ClipboardCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft audit response"
    />
  );
}
