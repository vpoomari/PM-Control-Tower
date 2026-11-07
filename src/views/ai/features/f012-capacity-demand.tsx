"use client";
// PM CONTROL TOWER — AI Feature f012 · Capacity vs Demand Planner
// Category: Resources & Teams · importance rank 12. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ArrowLeftRight } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "period", label: "Planning period", type: "text", placeholder: "e.g. Nov 2026 – Mar 2027" },
  {
    key: "demand",
    label: "Demand (roles & weeks needed)",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "One per line: role · person-weeks needed\nBusiness analyst · 6\nQA lead · 4",
    hint: "Person-weeks, one role per line.",
  },
  {
    key: "capacity",
    label: "Capacity (roles & weeks available)",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "One per line: role · person-weeks available\nBusiness analyst · 3\nQA lead · 4",
    hint: "Available person-weeks after other commitments.",
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Compare demand with capacity for the stated period and use exactly these plain-text headings: DEMAND VS CAPACITY, GAP SUMMARY, MITIGATIONS, FASTEST FIX, DATA NEEDED.",
  "DEMAND VS CAPACITY is a table with one row per role: role · demand (person-weeks) · capacity (person-weeks) · gap, where gap = capacity − demand so a negative number is a shortfall and a positive number is a surplus — show the subtraction in every row.",
  "A role that appears in only one list is shown with 'not stated' on the other side and repeated under DATA NEEDED; never assume an unstated role has zero capacity or zero demand.",
  "GAP SUMMARY totals the person-week shortfall and names the roles that drive it; MITIGATIONS is exactly 3 options — re-sequence, hire or contract, re-scope — each with time to apply, cost implication and what it sacrifices.",
  "FASTEST FIX names the single option that closes the largest gap soonest and says what must be decided this week to make it work.",
  "Never invent headcount, availability percentages, rates, salaries or calendars that were not supplied.",
  "Maximum 400 words.",
].join(" ");

export default function CapacityDemandPlanner() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    period: "",
    demand: "",
    capacity: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!/\d/.test(values.demand)) {
      setError("Demand needs person-week numbers — one role and its weeks per line.");
      return;
    }
    if (!/\d/.test(values.capacity)) {
      setError("Capacity needs person-week numbers — one role and its available weeks per line.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Planning period", values.period),
        promptLine("Demand (role · person-weeks needed)", values.demand),
        promptLine("Capacity (role · person-weeks available)", values.capacity),
        "",
        "Produce the capacity vs demand analysis now.",
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
      id="f012"
      rank={12}
      name="Capacity vs Demand Planner"
      tagline="Compares demand with capacity role by role, quantifies the person-week gap and picks the fastest fix."
      category="Resources & Teams"
      icon={ArrowLeftRight}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Plan capacity"
    />
  );
}
