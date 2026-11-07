"use client";
// PM CONTROL TOWER — AI Feature f017 · Issue Escalation Brief
// Category: Risk & RAID · importance rank 17. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Megaphone } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "issue",
    label: "The issue",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "What happened, when, and the current state — facts only, no blame: nightly settlement failed for 2 nights, root cause unknown",
  },
  {
    key: "impact",
    label: "Business impact",
    type: "textarea",
    rows: 3,
    required: true,
    placeholder: "e.g. 4 hours of failed payments · 12,000 orders at risk · SLA credit exposure not yet quantified",
    hint: "Include any number you have — the brief will not invent one.",
  },
  { key: "ownerRole", label: "Issue owner role", type: "text", placeholder: "e.g. Head of Engineering" },
  { key: "decisionBy", label: "Decision needed by", type: "date", hint: "Leave empty if no date is fixed yet." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write a one-page escalation brief for a sponsor-level audience using exactly these plain-text headings: WHAT HAPPENED, BUSINESS IMPACT, OPTIONS, RECOMMENDATION, THE ASK.",
  "WHAT HAPPENED is at most 60 words of fact with no speculation and no blame; BUSINESS IMPACT quantifies only from numbers supplied — when no number was given, write 'IMPACT NOT QUANTIFIED — need <the specific measure>' instead of estimating.",
  "OPTIONS gives exactly 3 options, each one line with effort (S/M/L), risk (Low/Med/High) and what it resolves; RECOMMENDATION picks one option in no more than 2 lines.",
  "THE ASK states the exact decision requested, the by-when date supplied (or 'DATE NEEDED' if none was), and the roles that must be in the room — the owner role if given, the sponsor, and any role whose budget, scope or team is touched.",
  "Include one line on what the team has already tried, but only when the input states it.",
  "Never invent a cost, headcount, SLA, penalty, customer name, root cause or date — list anything absent under DATA NEEDED.",
  "Maximum 300 words.",
].join(" ");

export default function IssueEscalationBrief() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    issue: "",
    impact: "",
    ownerRole: "",
    decisionBy: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.impact.trim().length < 15) {
      setError("Describe the business impact in at least a sentence — the brief cannot quantify what is not stated.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Issue", values.issue),
        promptLine("Business impact", values.impact),
        promptLine("Issue owner role", values.ownerRole),
        promptLine("Decision needed by", values.decisionBy),
        "",
        "Draft the escalation brief now.",
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
      id="f017"
      rank={17}
      name="Issue Escalation Brief"
      tagline="Turns a live issue into an escalation brief with options, a recommendation and the exact decision asked."
      category="Risk & RAID"
      icon={Megaphone}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft escalation brief"
    />
  );
}
