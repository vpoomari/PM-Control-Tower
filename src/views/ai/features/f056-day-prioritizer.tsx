"use client";
// PM CONTROL TOWER — AI Feature f056 · My Day Prioritizer
// Category: Personal & Data · importance rank 56. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListChecks } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "tasks", label: "Today's tasks", type: "textarea", rows: 7, required: true, placeholder: "One per line — e.g.\nDraft UAT plan — due today\nReview supplier quote\n1:1 with Priya", hint: "Include any deadline you know; one task per line." },
  { key: "hours", label: "Working hours available", type: "number", required: true, placeholder: "e.g. 7" },
  { key: "deadlineNote", label: "Fixed deadlines today", type: "text", placeholder: "e.g. Board pack due 16:00; nothing else is fixed" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Turn the pasted tasks into an ordered plan for the stated number of working hours, in plain text (no markdown fences), in this order: MUST-FINISH (the single item that must be complete today, with a one-clause reason), TIME BLOCKS (lines of 'HH:MM–HH:MM · task' starting at 09:00, non-overlapping), DEFER (every task pushed out, each with a one-clause reason), BREAK DOWN FURTHER (exactly 2 tasks that are too vague or too large, each with its first concrete sub-step).",
  "Blocks must total no more than the hours supplied; leave a 30-minute interruption buffer when the hours are 4 or more, and never schedule past the end of the day the hours imply.",
  "Order by stated deadline first, then by dependency on other listed tasks, then by effort; a task with no stated urgency keeps its place and is marked 'urgency: unknown' rather than being promoted or buried.",
  "Every pasted task must appear exactly once — under a time block, under DEFER or under BREAK DOWN FURTHER; if tasks exceed the hours, defer the lowest-ranked ones and say how many were deferred.",
  "Never invent a duration, priority, owner or deadline that was not pasted; when the deadline note conflicts with a task's own date, flag it on a 'NEEDS DATA: <conflict>' line instead of resolving it silently.",
].join(" ");

export default function MyDayPrioritizer() {
  const [values, setValues] = useState<Record<string, string>>({
    tasks: "", hours: "", deadlineNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const hours = Number(values.hours);
    if (!values.hours.trim() || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError("Enter how many working hours you have today — a number between 1 and 24.");
      return;
    }
    const taskCount = values.tasks.split("\n").filter((line) => line.trim()).length;
    if (taskCount < 2) {
      setError("Paste at least two tasks, one per line — the plan needs something to order.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Today's tasks", values.tasks),
        promptLine("Working hours available", values.hours),
        promptLine("Fixed deadlines today", values.deadlineNote),
        "",
        "Order the day now — must-finish first, time blocks that total the hours given, deferrals and the 2 tasks to break down.",
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
      id="f056"
      rank={56}
      name="My Day Prioritizer"
      tagline="Orders today into time blocks: the one must-finish item, what to defer and what to break down."
      category="Personal & Data"
      icon={ListChecks}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Plan my day"
    />
  );
}
