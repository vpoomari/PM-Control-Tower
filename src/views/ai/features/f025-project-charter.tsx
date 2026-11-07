"use client";
// PM CONTROL TOWER — AI Feature f025 · Project Charter Drafter
// Category: Plan & Schedule · importance rank 25. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ScrollText } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "name", label: "Project name", type: "text", required: true, placeholder: "e.g. Billing Query Automation" },
  { key: "sponsor", label: "Sponsor", type: "text", placeholder: "e.g. Head of Finance Operations" },
  { key: "objective", label: "Objective & background", type: "textarea", rows: 4, required: true, placeholder: "Why this project exists, what it must change, and how success will be recognised…" },
  { key: "budget", label: "Budget & funding", type: "text", placeholder: "e.g. 480000 approved, funded from the 2027 opex envelope" },
  { key: "start", label: "Start date", type: "date" },
  { key: "end", label: "End date", type: "date" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are drafting a project charter for signature; every name, date, amount and objective supplied is a fact and anything else must be asked for.",
  "Use exactly these headings in plain text (no markdown fences, no bold): PURPOSE, OBJECTIVES & SUCCESS CRITERIA, SCOPE SUMMARY, HIGH-LEVEL MILESTONES, BUDGET & FUNDING, SPONSOR & ROLES, TOP 3 RISKS, APPROVAL.",
  "PURPOSE is 2–3 sentences from the supplied objective only. OBJECTIVES & SUCCESS CRITERIA turns the objective into 2–4 numbered criteria; a criterion may only carry a number that was supplied.",
  "SCOPE SUMMARY is at most 4 sentences and must not introduce deliverables that were not implied by the objective.",
  "HIGH-LEVEL MILESTONES is 4–6 rows of 'name · date'. Derive dates only from the supplied start and end dates by even spacing, and label each derived date 'indicative'; if a date was not supplied, write 'date: NEEDS DATA'.",
  "BUDGET & FUNDING quotes the supplied budget verbatim and otherwise writes 'NEEDS DATA: approved budget'.",
  "SPONSOR & ROLES uses the supplied sponsor and lists 4–6 governance roles as 'role — responsibility', with names only where given (otherwise 'NEEDS NAME').",
  "TOP 3 RISKS are generic-but-relevant charter risks drawn only from the stated objective and dates; if neither was supplied, list the 3 risks to confirm instead of inventing project facts.",
  "APPROVAL is a single ready-to-sign line: project name · sponsor · budget · start · end, repeating 'NEEDS DATA' for any of those that is missing. Total length under 550 words.",
].join(" ");

export default function ProjectCharterDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    name: "", sponsor: "", objective: "", budget: "", start: "", end: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.name.trim() || !values.objective.trim()) {
      setError("The project name and objective are both needed to draft a charter.");
      return;
    }
    if (values.start && values.end && values.start > values.end) {
      setError("The end date is before the start date — correct the dates before drafting.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project name", values.name),
        promptLine("Sponsor", values.sponsor),
        promptLine("Objective & background", values.objective),
        promptLine("Budget & funding", values.budget),
        promptLine("Start date", values.start),
        promptLine("End date", values.end),
        "",
        "Draft the project charter now with the eight sections in order.",
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
      id="f025"
      rank={25}
      name="Project Charter Drafter"
      tagline="Eight charter sections drafted only from the sponsor, dates, budget and objectives you supply."
      category="Plan & Schedule"
      icon={ScrollText}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft project charter"
    />
  );
}
