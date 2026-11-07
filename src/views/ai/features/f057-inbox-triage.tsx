"use client";
// PM CONTROL TOWER — AI Feature f057 · Inbox Triage
// Category: Personal & Data · importance rank 57. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Inbox } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "messages", label: "Messages", type: "textarea", rows: 7, required: true, placeholder: "One ask per line — e.g.\nSam: can you confirm the budget by Thu?\nFYI: release notes published\nPriya needs the test scripts", hint: "Copy the ask from each message — one per line." },
  { key: "timebox", label: "Timebox (minutes)", type: "number", placeholder: "e.g. 45" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Triage every pasted line into exactly one of five buckets, in plain text (no markdown fences): DO NOW, SCHEDULE, DELEGATE, REPLY IN 2 LINES, IGNORE — keep each item's original wording so nothing is lost or softened.",
  "Under REPLY IN 2 LINES give each item there a ready-to-paste reply of no more than 2 lines (30 words max) that actually answers the ask.",
  "Routing rules: answerable in a few minutes → REPLY IN 2 LINES or DO NOW; needs more than 30 minutes of focused work → SCHEDULE with a suggested slot; owned by another person → DELEGATE and name the role; FYI with no ask → IGNORE.",
  "Ambiguous lines still must appear: place them in IGNORE and append '— ambiguous, needs sender context' rather than dropping them or guessing at them.",
  "End with a TIME PLAN line: the total minutes the plan takes and how it compares with the timebox if one was supplied — if it exceeds the timebox, name the bucket that must shrink.",
  "Never invent names, dates, amounts or senders that are not in the pasted lines; anything essential but missing goes on a 'NEEDS DATA: <exact fact>' line.",
].join(" ");

export default function InboxTriage() {
  const [values, setValues] = useState<Record<string, string>>({
    messages: "", timebox: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const lines = values.messages.split("\n").filter((line) => line.trim());
    if (lines.length < 1) {
      setError("Paste at least one message — one ask per line.");
      return;
    }
    if (values.timebox.trim()) {
      const minutes = Number(values.timebox);
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 480) {
        setError("The timebox must be a number of minutes between 1 and 480 — or leave it empty.");
        return;
      }
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Messages", values.messages),
        promptLine("Timebox (minutes)", values.timebox),
        "",
        "Triage the inbox now — bucket every line, give the two-line replies, and total the time the plan takes.",
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
      id="f057"
      rank={57}
      name="Inbox Triage"
      tagline="Buckets every pasted ask into do now, schedule, delegate, two-line reply or ignore — with timings."
      category="Personal & Data"
      icon={Inbox}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Triage inbox"
    />
  );
}
