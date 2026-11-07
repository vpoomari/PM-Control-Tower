"use client";
// PM CONTROL TOWER — AI Feature f086 · Kickoff Agenda Designer
// Category: Personal & Data · importance rank 86. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Rocket } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", required: true, hint: "Live list from the project register." },
  { key: "attendees", label: "Attendees", type: "text", placeholder: "e.g. Sponsor, PM, tech lead, 2 vendor leads, ops manager" },
  { key: "duration", label: "Duration (minutes)", type: "number", placeholder: "e.g. 90", hint: "Leave empty to assume 60 minutes." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Design a kickoff meeting agenda for the project that fits the duration supplied in minutes; if no duration was given, assume 60 minutes and say so in one line above the agenda.",
  "Use exactly these headings in plain text (no markdown fences): AGENDA, PRE-READS, ASSUMPTION-TESTING QUESTIONS, CLOSE-OUT.",
  "AGENDA prints one line per block as '<start>–<end> min · <block> · <purpose>' covering objectives, roles, ways of working, plan overview, top risks and decisions — the blocks must add up exactly to the duration and the total must be restated.",
  "Build the roles block only from the attendee list supplied; if a decision-making role (sponsor, approver, product owner) is missing from that list, flag it as 'NEEDS ROLE: <the missing role>' rather than inventing a person.",
  "PRE-READS lists 3–5 documents to send beforehand, each with one line on what to extract from it.",
  "ASSUMPTION-TESTING QUESTIONS asks exactly 3 questions that surface hidden assumptions about scope, dates and ownership for this project.",
  "CLOSE-OUT states the commitment to collect before people leave: what is agreed, who captures it and by when — use a supplied date or write 'NEEDS DATE'.",
  "Never invent attendee names, calendar dates or budget figures.",
].join(" ");

export default function KickoffAgendaDesigner() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", attendees: "", duration: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.duration.trim()) {
      const duration = Number(values.duration);
      if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
        setError("Duration must be between 15 and 480 minutes — or leave it empty to assume 60.");
        return;
      }
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Attendees", values.attendees),
        promptLine("Duration (minutes)", values.duration),
        "",
        "Design the kickoff agenda now.",
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
      id="f086"
      rank={86}
      name="Kickoff Agenda Designer"
      tagline="A timed kickoff agenda with pre-reads, three assumption-testing questions and a closing commitment."
      category="Personal & Data"
      icon={Rocket}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Design the agenda"
    />
  );
}
