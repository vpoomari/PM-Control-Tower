"use client";
// PM CONTROL TOWER — AI Feature f071 · 1:1 Agenda Builder
// Category: Resources & Teams · importance rank 71. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { MessagesSquare } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "report", label: "Direct report", type: "text", required: true, placeholder: "e.g. Ana Ruiz · Delivery Analyst" },
  { key: "since", label: "Since the last 1:1", type: "text", placeholder: "e.g. 14 Oct 2026" },
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "focus", label: "Focus", type: "select", options: [
    { value: "Delivery", label: "Delivery" },
    { value: "Growth", label: "Growth" },
    { value: "Wellbeing", label: "Wellbeing" },
    { value: "Mixed", label: "Mixed" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build a focused 1:1 meeting agenda for a people leader and one direct report. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: STATUS CHECK, BLOCKERS TO CLEAR, GROWTH QUESTION, WELLBEING CHECK, AGREED ACTIONS.",
  "Time-box the whole meeting to 25 minutes or less and show the minutes at the end of every heading: STATUS CHECK 5 min, BLOCKERS TO CLEAR 8 min, GROWTH QUESTION 6 min, WELLBEING CHECK 3 min, AGREED ACTIONS 3 min.",
  "STATUS CHECK holds at most 3 short prompts that let the report speak first. BLOCKERS TO CLEAR holds at most 3 concrete blockers the leader can act on, drawn only from the supplied facts; if no blockers were supplied, write 'Ask: what is in your way right now?' and nothing invented.",
  "Include exactly one growth question and one wellbeing check in every agenda, weighted by the chosen focus: Delivery keeps both short and delivery-adjacent, Growth makes the growth question richer, Wellbeing makes the wellbeing check richer, Mixed gives them equal weight.",
  "AGREED ACTIONS lists each action on one line as 'action — owner — by when'; write NEEDS OWNER or NEEDS DATE rather than inventing a person or a date.",
  "Tone: neutral, non-judgemental, written for spoken conversation — short second-person sentences, no HR jargon, no personality labels or diagnoses.",
  "Total length under 350 words, and never invent a person's performance, dates or metrics that were not supplied.",
].join(" ");

export default function OneToOneAgendaBuilder() {
  const [values, setValues] = useState<Record<string, string>>({
    report: "", since: "", project: "", focus: "Mixed",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.report.trim()) {
      setError("Direct report is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Direct report", values.report),
        promptLine("Since the last 1:1", values.since),
        promptLine("Project", values.project),
        promptLine("Focus", values.focus),
        "",
        "Build the 1:1 agenda now.",
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
      id="f071"
      rank={71}
      name="1:1 Agenda Builder"
      tagline="A 25-minute 1:1 agenda with time boxes, one growth question and agreed actions."
      category="Resources & Teams"
      icon={MessagesSquare}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build 1:1 agenda"
    />
  );
}
