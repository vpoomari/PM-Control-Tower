"use client";
// PM CONTROL TOWER — AI Feature f055 · Meeting Prep Brief
// Category: Personal & Data · importance rank 55. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { CalendarCheck } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "purpose", label: "Purpose of the meeting", type: "text", required: true, placeholder: "e.g. Agree the revised go-live date with the client", hint: "What the meeting exists to achieve." },
  { key: "attendees", label: "Attendees", type: "text", placeholder: "e.g. Client PM, our tech lead, sponsor" },
  { key: "length", label: "Meeting length", type: "text", placeholder: "e.g. 45 minutes" },
  { key: "prepTime", label: "Prep time available", type: "text", placeholder: "e.g. 20 minutes" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Produce a meeting prep brief in plain text (no markdown fences) with these headings: OBJECTIVE (one sentence — why this meeting exists), DESIRED OUTCOME (the concrete result to walk out with), 5 QUESTIONS TO ASK (numbered 1–5), LIKELY OBJECTIONS (3, each with a one-sentence response), DECISION TO LEAVE WITH (one sentence), 10-MINUTE PRE-READ (a short list).",
  "The 5 questions must be specific to the stated purpose and attendees — each must be capable of changing what happens after the meeting; no generic 'what are the risks?' filler.",
  "Likely objections must be ones this audience would plausibly raise from the input alone; if no attendees were supplied, write 'NEEDS DATA: attendee list' under that heading instead of inventing stakeholders.",
  "The 10-minute pre-read lists document types or data (e.g. 'latest RAID extract') unless the input names specific documents — never invent a document title or a version date.",
  "Respect the timings: if the prep time is under 10 minutes, cut the pre-read to the top 2 items and say so; if the meeting is under 30 minutes, mark questions 4 and 5 'only if time'.",
  "Ground every line in the purpose, attendees, length or prep time supplied; never fabricate a date, name or figure — list missing essentials as 'NEEDS DATA: <exact fact>'.",
].join(" ");

export default function MeetingPrepBrief() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", purpose: "", attendees: "", length: "", prepTime: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.purpose.trim().length < 8) {
      setError("State the purpose of the meeting in a full sentence — the brief is built around it.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Purpose of the meeting", values.purpose),
        promptLine("Attendees", values.attendees),
        promptLine("Meeting length", values.length),
        promptLine("Prep time available", values.prepTime),
        "",
        "Build the meeting prep brief now — objective, 5 questions, objections, the decision to leave with and the 10-minute pre-read.",
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
      id="f055"
      rank={55}
      name="Meeting Prep Brief"
      tagline="Turns a meeting purpose into an objective, five sharp questions and the decision to leave with."
      category="Personal & Data"
      icon={CalendarCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build meeting prep"
    />
  );
}
