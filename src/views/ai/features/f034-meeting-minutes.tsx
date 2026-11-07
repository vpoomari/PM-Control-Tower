"use client";
// PM CONTROL TOWER — AI Feature f034 · Meeting Minutes & Actions
// Category: Status & Reporting · importance rank 34. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { NotebookPen } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "notes", label: "Raw notes", type: "textarea", rows: 7, required: true, placeholder: "Paste notes, rough as they are:\nSam – data feed still failing, vendor chasing\nGo-live: Priya says slips unless extract fixed – agreed to hold 14 Nov\nBudget sign-off – action? someone with finance\nRecurring: no change", hint: "Anything goes: shorthand, partial sentences, half-recorded actions." },
  { key: "attendees", label: "Attendees", type: "text", placeholder: "e.g. S. Okafor (chair), P. Nowak, J. Reyes, A. Khan" },
  { key: "date", label: "Meeting date", type: "date" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Turn raw meeting notes into clean, publishable minutes that an absent attendee could act on without asking what was meant.",
  "Use these headings in plain text: SUMMARY (max 80 words), DISCUSSION (3–6 '-' bullets, one topic each, neutral and factual), DECISIONS (numbered, each phrased as the decision that was actually taken), ACTIONS (one line each: action · owner · due date — write NEEDS OWNER and/or NEEDS DATE where the notes do not state one), ATTENDEES (only if supplied, otherwise omit the line), NEXT MEETING (date/time if supplied, else 'To be scheduled').",
  "Promote to DECISIONS only what the notes clearly record as agreed; anything agreed 'in principle', still open or proposed stays in DISCUSSION prefixed with 'OPEN —'.",
  "Never assign an owner or a due date that is not written in the notes, never attribute an opinion or a number to a person who did not say it, and never invent a follow-up action the notes do not imply.",
  "Total length under 400 words.",
].join(" ");

export default function MeetingMinutesActions() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", notes: "", attendees: "", date: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.notes.trim().length < 20) {
      setError("Paste the meeting notes — at least a few lines to work from.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Meeting date", values.date),
        promptLine("Attendees", values.attendees),
        "",
        "Raw notes:",
        values.notes.trim(),
        "",
        "Write the minutes and the action list now.",
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
      id="f034"
      rank={34}
      name="Meeting Minutes & Actions"
      tagline="Turns raw meeting notes into clean minutes with numbered decisions and owner-dated actions."
      category="Status & Reporting"
      icon={NotebookPen}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write minutes"
    />
  );
}
