"use client";
// PM CONTROL TOWER — AI Feature f003 · Schedule Recovery Advisor
// Category: Plan & Schedule · importance rank 3. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { CalendarClock } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "situation", label: "Where the schedule stands", type: "textarea", rows: 5, required: true, placeholder: "Which phases slipped, by how much, what is still to do, what is fixed…" },
  { key: "mustHitDate", label: "Must-hit date", type: "date" },
  { key: "daysLate", label: "Days late today", type: "number", placeholder: "e.g. 18" },
  { key: "constraints", label: "Constraints", type: "text", placeholder: "e.g. No weekend work; freeze window 12–15 Nov" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Advise on recovering a slipping schedule. Be decisive: name the option you would take and why.",
  "Use these headings in plain text: DIAGNOSIS (why it slipped, max 3 bullets, only causes implied by the inputs), OPTIONS (crash, fast-track, descope, re-baseline — for each: what it means here, cost, risk, feasibility, and a verdict TAKE / CONSIDER / REJECT), RECOVERY SEQUENCE (exactly 5 numbered steps for the next 10 working days), ESCALATIONS (the 3 items only a sponsor can unblock).",
  "Respect every constraint supplied — never propose weekend or freeze-window work if the constraints forbid it.",
  "If the must-hit date is unachievable with the given facts, say so plainly and quantify the gap rather than manufacturing optimism.",
].join(" ");

export default function ScheduleRecoveryAdvisor() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", situation: "", mustHitDate: "", daysLate: "", constraints: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.daysLate && !Number.isFinite(Number(values.daysLate))) {
      setError("Days late must be a number (or leave it empty).");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Where the schedule stands", values.situation),
        promptLine("Must-hit date", values.mustHitDate),
        promptLine("Days late today", values.daysLate),
        promptLine("Constraints", values.constraints),
        "",
        "Advise the recovery plan now.",
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
      id="f003"
      rank={3}
      name="Schedule Recovery Advisor"
      tagline="Diagnoses a slipping plan and returns a ranked crash / fast-track / descope recovery sequence."
      category="Plan & Schedule"
      icon={CalendarClock}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Get recovery plan"
    />
  );
}
