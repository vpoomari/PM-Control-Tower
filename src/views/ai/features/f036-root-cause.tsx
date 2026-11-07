"use client";
// PM CONTROL TOWER — AI Feature f036 · Root Cause Analysis (5 Whys)
// Category: Risk & RAID · importance rank 36. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Microscope } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "problem", label: "Problem", type: "textarea", rows: 3, required: true, placeholder: "e.g. The data extract failed in 4 of the last 6 nightly runs, delaying the morning report by 3 hours." },
  { key: "facts", label: "Known facts", type: "textarea", rows: 6, required: true, placeholder: "Evidence only, one fact per line:\nRun log 12 Oct: connection timeout after 900s\nChange 441 cut the extract window from 60 to 20 minutes\nNo monitoring alert fired\nTeam has no runbook for retrying a partial load", hint: "Every 'why' must be answerable from these lines — the analysis stops where the facts stop." },
  { key: "scope", label: "Scope of causes", type: "select", options: [
    { value: "Single team", label: "Single team" },
    { value: "Cross-team", label: "Cross-team" },
    { value: "Systemic", label: "Systemic" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Run a 5 Whys analysis of the stated problem, answering each why only from the supplied facts.",
  "Use these headings in plain text: PROBLEM STATEMENT (one observable, neutral sentence — no blame and no cause baked in), 5-WHYS CHAIN (exactly five numbered lines, each written as 'Why n: <answer> — evidence: <the supplied fact or line it rests on>'), CONTRIBUTING FACTORS (grouped under Process, People, Technology, Suppliers, Environment with '-' bullets, omitting any group with no evidence), ROOT CAUSE (one sentence naming the controllable condition that produced the problem), CORRECTIVE ACTIONS (exactly 3, each: action · owner role · how it prevents recurrence).",
  "When the facts stop supporting the chain, write 'CANNOT ANSWER FROM SUPPLIED FACTS — need: <the specific data>' and stop that branch rather than speculating; a chain that ends early is reported honestly, not padded to five.",
  "Match the stated scope: Single team keeps causes inside one team, Cross-team examines hand-offs between groups, Systemic must consider governance, incentives and process design as candidates.",
  "Never restate an answer as its own why, never introduce a person, system or date that is not in the facts. Total length under 450 words.",
].join(" ");

export default function RootCauseAnalysis() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", problem: "", facts: "", scope: "Single team",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.facts.trim().length < 30) {
      setError("Add the known facts — the 5 whys must be answerable from them.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Scope of causes", values.scope),
        "",
        "Problem:",
        values.problem.trim(),
        "",
        "Known facts:",
        values.facts.trim(),
        "",
        "Run the 5 Whys analysis and produce the corrective actions now.",
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
      id="f036"
      rank={36}
      name="Root Cause Analysis (5 Whys)"
      tagline="Chains five whys through the supplied facts to one root cause and three prevention actions."
      category="Risk & RAID"
      icon={Microscope}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Run 5 Whys"
    />
  );
}
