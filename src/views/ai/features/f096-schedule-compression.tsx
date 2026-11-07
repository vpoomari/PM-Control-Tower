"use client";
// PM CONTROL TOWER — AI Feature f096 · Schedule Compression Advisor
// Category: Plan & Schedule · importance rank 96. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Hourglass } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "phase", label: "Phase or work package", type: "text", required: true, placeholder: "e.g. Fit-out & commissioning, Phase 3", hint: "The part of the plan that must be compressed." },
  { key: "save", label: "Days to save", type: "number", required: true, placeholder: "e.g. 15" },
  { key: "budget", label: "Crash budget available", type: "text", placeholder: "e.g. 80,000 for overtime and extra contractors", hint: "Leave empty if no contingency is released." },
  { key: "riskAppetite", label: "Risk appetite", type: "select", options: [
    { value: "Low", label: "Low" },
    { value: "Medium", label: "Medium" },
    { value: "High", label: "High" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Advise how to recover the requested number of days for the stated phase, in plain text with no markdown fences and no preamble.",
  "Use exactly these sections: OPTIONS, SAFEST SEQUENCE, DAILY WATCHLIST.",
  "OPTIONS covers FAST-TRACK, CRASH and DESCOPE: for each give the days realistically recoverable (never more than requested), the added cost against the supplied crash budget, the risk cost (what quality, certainty or warranty degrades), and feasibility High/Medium/Low under the stated risk appetite.",
  "Never quote a cost, duration or productivity uplift that was not supplied — write 'NEEDS DATA: <the figure needed>' instead; if the crash budget is empty, state that crashing is unfunded rather than estimating a number.",
  "SAFEST SEQUENCE orders the chosen moves into 4 to 5 numbered steps that respect the stated appetite (Low appetite takes fast-track before crash, High appetite may accept crash first), each with the decision gate that must clear before the next step begins.",
  "DAILY WATCHLIST lists exactly 5 things to monitor — dependency slip, defect rate, rework hours, cost burn, quality rejections — each with the threshold that triggers stopping the compression.",
  "Rank the options by days recovered per unit of risk under the stated appetite. Total under 700 words.",
].join(" ");

export default function ScheduleCompressionAdvisor() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", phase: "", save: "", budget: "", riskAppetite: "Medium",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const rawSave = values.save.trim();
    const days = Number(rawSave);
    if (rawSave === "" || !Number.isInteger(days) || days < 1 || days > 365) {
      setError("Days to save must be a whole number between 1 and 365.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Phase or work package", values.phase),
        promptLine("Days to save", String(days)),
        promptLine("Crash budget available", values.budget),
        promptLine("Risk appetite", values.riskAppetite),
        "",
        "Compare fast-track, crash and descope for recovering those days now: cost and risk cost per option, the safest sequence under this appetite, and the 5 things to monitor daily afterwards.",
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
      id="f096"
      rank={96}
      name="Schedule Compression Advisor"
      tagline="Prices fast-track, crash and descope moves, then sequences the safest way to win the days back."
      category="Plan & Schedule"
      icon={Hourglass}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Compare compression options"
    />
  );
}
