"use client";
// PM CONTROL TOWER — AI Feature f046 · Bug Triage Assistant
// Category: Agile & Delivery · importance rank 46. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Bug } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "reports",
    label: "Bug reports",
    type: "textarea",
    rows: 7,
    required: true,
    placeholder: "One per line or a block each:\n1. CSV export fails for drops with 0 lines — no error shown\n2. Yard dashboard shows yesterday's count after refresh\n3. Password reset email arrives twice",
    hint: "Paste them as they came from support/testing — gaps are part of what gets triaged.",
  },
  {
    key: "severityScale",
    label: "Severity scale",
    type: "select",
    options: [
      { value: "S1–S4", label: "S1–S4 (S1 most severe)" },
      { value: "Blocker–Trivial", label: "Blocker – Critical – Major – Minor – Trivial" },
    ],
  },
  { key: "sprintCapacity", label: "Fix capacity", type: "text", placeholder: "e.g. 2 engineers, half of sprint 14 capacity" },
  { key: "knownDuplicates", label: "Known duplicates", type: "textarea", rows: 3, placeholder: "Optional: bugs you already suspect are the same issue…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You triage pasted bug reports for a sprint planning session with a delivery team.",
  "Start the output with 'TOTAL BUGS: <n>', then give one numbered block per report in the pasted order containing exactly: 'Title:' a shortened action-first summary, 'Severity:' on the chosen scale, 'Priority:' P1 / P2 / P3, 'Likely area:' only if the report hints at one else 'unknown from this report', 'Duplicate suspicion:' either 'possible duplicate of #<n>' or 'none seen', 'Missing info:' listing what is absent (repro steps, environment, expected vs actual, frequency).",
  "Severity discipline: judge only the impact the report states — users blocked with no workaround is the top band, degraded work with a workaround is the middle band, cosmetic is the lowest; never raise severity because a report sounds dramatic.",
  "Then use exactly these headings in plain text: FIX FIRST (a ranked order of what must be fixed this sprint, each with a one-line reason and its number) and CAN WAIT (what may be deferred to the next sprint, each with a one-line reason).",
  "Never invent bug ids, dates, affected versions, customers or components; where the report lacks a field write 'NEEDS INFO: <specific field>' instead of guessing.",
  "Plain text output, no markdown fences, one line per field inside each block, total under 500 words.",
].join(" ");

export default function BugTriageAssistant() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", reports: "", severityScale: "S1–S4", sprintCapacity: "", knownDuplicates: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.reports.trim()) {
      setError("Paste at least one bug report to triage.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Bug reports", values.reports),
        promptLine("Severity scale", values.severityScale),
        promptLine("Fix capacity", values.sprintCapacity),
        promptLine("Known duplicates", values.knownDuplicates),
        "",
        "Triage these bug reports now: severity, priority, missing info, fix-first order and what can wait.",
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
      id="f046"
      rank={46}
      name="Bug Triage Assistant"
      tagline="Scores every bug for severity, priority and missing repro info, then orders the fix-first list."
      category="Agile & Delivery"
      icon={Bug}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Triage the bugs"
    />
  );
}
