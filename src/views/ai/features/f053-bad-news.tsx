"use client";
// PM CONTROL TOWER — AI Feature f053 · Bad News Delivery
// Category: Status & Reporting · importance rank 53. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Siren } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "news", label: "The bad news", type: "textarea", rows: 5, required: true, placeholder: "What happened, what is known so far, what is being done, any date that matters…", hint: "Facts only — the message must not add anything you did not write." },
  { key: "recipient", label: "Recipient", type: "text", placeholder: "e.g. Dana Reyes, Programme Sponsor" },
  { key: "relationship", label: "Recipient type", type: "select", options: [
    { value: "Sponsor", label: "Sponsor" },
    { value: "Client", label: "Client" },
    { value: "Team", label: "Team" },
    { value: "Supplier", label: "Supplier" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write the message in plain text (no markdown fences) in this order: THE FACT — the first sentence states the bad news plainly and unambiguously; WHAT HAPPENED — the cause, described through sequence, systems or external events, never by blaming a named person; RECOVERY PLAN — the steps underway, with owner roles only where the input supplies them; DECISION NEEDED — what the recipient must decide or do, and by when.",
  "Then add a second section titled WHAT NOT TO SAY with exactly 3 phrases to avoid in this situation, each with one clause on why it makes things worse.",
  "Tone: short, kind and specific — the message itself under 200 words, no corporate hedging ('unforeseen circumstances'), no passive evasion of the fact, no apology stacked on apology.",
  "If the cause is not in the input, write 'Cause: under investigation' instead of inventing one.",
  "Never invent a date, name, number or consequence; anything essential but missing goes on a final 'NEEDS DATA: <exact fact>' line.",
].join(" ");

export default function BadNewsDelivery() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", news: "", recipient: "", relationship: "Sponsor",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.news.trim().length < 15) {
      setError("State the news in at least one full sentence — the message needs the fact to lead with.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("The bad news", values.news),
        promptLine("Recipient", values.recipient),
        promptLine("Recipient type", values.relationship),
        "",
        "Write the message now — lead with the fact, then add the WHAT NOT TO SAY section.",
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
      id="f053"
      rank={53}
      name="Bad News Delivery"
      tagline="Leads with the hard fact, gives cause without blame, recovery, the decision needed — and what not to say."
      category="Status & Reporting"
      icon={Siren}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write the message"
    />
  );
}
