"use client";
// PM CONTROL TOWER — AI Feature f098 · Opportunity Realisation Brief
// Category: Risk & RAID · importance rank 98. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gem } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "opportunity", label: "The opportunity", type: "textarea", rows: 4, required: true, placeholder: "Early supplier involvement could pull design freeze forward by up to 6 weeks if the vendor accepts a joint workshop — roughly 60% likely per the vendor lead.", hint: "Include any probability or timing that is already known." },
  { key: "value", label: "Value if realised", type: "text", placeholder: "e.g. ~6 weeks earlier go-live; benefit est. 120,000" },
  { key: "cost", label: "Cost to pursue", type: "text", placeholder: "e.g. 2 workshop days plus 5,000 travel" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Produce a capture plan for the supplied opportunity, in plain text with no markdown fences and no preamble.",
  "Use exactly these headings: OPPORTUNITY, VALUE & ODDS, ACTIONS, OWNER & TRIGGER, TRADE-OFF.",
  "VALUE & ODDS states probability × value using only supplied numbers: take the probability from the opportunity text when it is stated there and show the arithmetic (probability × value); when no probability was supplied write 'NEEDS DATA: probability of realisation' and express the value as the range it was given as, never as a point figure.",
  "ACTIONS lists 3 to 5 concrete moves that raise the probability of realising it, each with an owner role — supplied, or written 'ROLE NEEDED: <function>' — and a by-when only when a date was supplied.",
  "OWNER & TRIGGER names the single trigger event that starts the action and the owner role accountable for noticing it, both taken from the inputs.",
  "TRADE-OFF weighs this opportunity against the threats competing for the same attention, using only supplied facts; where none are supplied, list what is missing instead of speculating.",
  "Never invent percentages, amounts, dates or names, and never present an estimate as a fact. Total under 650 words.",
].join(" ");

export default function OpportunityRealisationBrief() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", opportunity: "", value: "", cost: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("The opportunity", values.opportunity),
        promptLine("Value if realised", values.value),
        promptLine("Cost to pursue", values.cost),
        "",
        "Write the capture plan now: probability × value where both are given, the actions that raise the odds, the owner role, the trigger to act, and the trade-off against the threats it competes with.",
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
      id="f098"
      rank={98}
      name="Opportunity Realisation Brief"
      tagline="Scores the opportunity, the actions that raise the odds, the trigger to act and the trade-off."
      category="Risk & RAID"
      icon={Gem}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft capture plan"
    />
  );
}
