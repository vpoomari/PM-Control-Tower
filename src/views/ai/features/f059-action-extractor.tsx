"use client";
// PM CONTROL TOWER — AI Feature f059 · Action Item Extractor
// Category: Documents & Knowledge · importance rank 59. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ClipboardCheck } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "source", label: "Minutes, email or notes", type: "textarea", rows: 8, required: true, placeholder: "Paste the raw text — meeting minutes, an email thread or scribbled notes…", hint: "Pasted text only; every action must trace back to a sentence here." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Scan the pasted minutes, email or notes and return plain text (no markdown fences) with two sections in this order: DECISIONS (numbered, each with the deciding body or person only if stated — write 'none stated' if there are none) and ACTIONS.",
  "ACTIONS is a table with the header row 'Action | Owner | Due | Priority': one action per row; Owner = exactly 'NEEDS OWNER' when the source names no owner; Due = exactly 'NEEDS DATE' when the source gives no date; Priority = High/Medium/Low only when the wording supports it (a deadline, a blocker, the word 'urgent'), otherwise '—'.",
  "FIDELITY RULE: every name, date and number in the table must appear in the source verbatim — preserve them or use NEEDS OWNER / NEEDS DATE; never invent, complete or normalise an owner, a date or a figure.",
  "Extract only actions that an explicit sentence in the source commits someone to; combine rows only when the source clearly means the same piece of work, and never drop a line without flagging it.",
  "Finish with a line 'LOST IN EXTRACTION: none' or 'LOST IN EXTRACTION: <what you dropped as ambiguous>' so nothing vanishes silently.",
  "No commentary, no meeting summary, no advice — the two sections and the table only.",
].join(" ");

export default function ActionItemExtractor() {
  const [values, setValues] = useState<Record<string, string>>({
    source: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.source.trim().length < 40) {
      setError("Paste the minutes, email or notes — at least a few sentences, so actions can be traced to them.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Minutes, email or notes", values.source),
        "",
        "Extract the actions now — the decisions section, then the table with owner, due and priority, and the LOST IN EXTRACTION line.",
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
      id="f059"
      rank={59}
      name="Action Item Extractor"
      tagline="Pulls actions out of pasted minutes with owner, due date and priority — decisions kept separate."
      category="Documents & Knowledge"
      icon={ClipboardCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Extract actions"
    />
  );
}
