"use client";
// PM CONTROL TOWER — AI Feature f023 · Budget Phasing Advisor
// Category: Cost & Finance · importance rank 23. The phasing arithmetic happens
// here (deterministic, client-side): weights per shape are normalised so the
// month-by-month amounts sum EXACTLY to the total, and the model only reads the
// finished table — money is never left to the LLM to invent or re-add.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { CalendarRange } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "total", label: "Total budget", type: "number", required: true, placeholder: "e.g. 480000" },
  { key: "months", label: "Number of months", type: "number", required: true, placeholder: "e.g. 12" },
  { key: "shape", label: "Phasing shape", type: "select", options: [
    { value: "S-curve", label: "S-curve" },
    { value: "Linear", label: "Linear" },
    { value: "Front-loaded", label: "Front-loaded" },
    { value: "Back-loaded", label: "Back-loaded" },
  ] },
  { key: "notes", label: "Phasing notes", type: "textarea", rows: 3, placeholder: "Optional: mobilisation fee in month 1, hardware landing in month 4, funding drawn quarterly…", wide: true },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The client has already computed the month-by-month phasing you receive — treat every amount as fact, never re-add, re-round, rescale or replace any of them.",
  "Use exactly these headings in plain text (no markdown fences, no bold): PHASING READ, PEAK MONTH, CASH RISK, WHAT WOULD CHANGE THE SHAPE.",
  "PHASING READ describes the shape in 2–3 sentences using the supplied amounts only (slow start, steady, back-heavy, and so on) and states the first and last month amounts exactly as given.",
  "PEAK MONTH names the single month with the highest amount (use the peak the client computed for you) and how much larger it is than the average month, where the average is the total divided by the number of months.",
  "CASH RISK explains when spend could outpace funding: when the cumulative spend of the early months would strain a funding line, and what breaks first if a payment slips by one month. Work only from the table — if funding instalments were not supplied, ask for them instead of assuming a drawdown schedule.",
  "WHAT WOULD CHANGE THE SHAPE lists 3–4 concrete events (re-scope, delayed procurement, resource ramp, early completion) that would move the profile, each with the direction of the change — no amounts invented.",
  "Never quote a currency, month name, inflation rate or funding date that was not supplied — write 'NEEDS DATA: <specific fact>' instead. Total length under 300 words.",
].join(" ");

/** Normalised shape weights — the month amounts are derived from these, never from the model. */
const shapeWeights = (shape: string, months: number): number[] => {
  if (shape === "Linear") return Array.from({ length: months }, () => 1);
  if (shape === "Front-loaded") return Array.from({ length: months }, (_, i) => (months - i) ** 2);
  if (shape === "Back-loaded") return Array.from({ length: months }, (_, i) => (i + 1) ** 2);
  // S-curve: increments of a smoothstep cumulative curve (slow start, steep middle, slow finish).
  const weights: number[] = [];
  let previous = 0;
  for (let i = 1; i <= months; i += 1) {
    const t = i / months;
    const cumulative = t * t * (3 - 2 * t);
    weights.push(cumulative - previous);
    previous = cumulative;
  }
  return weights;
};

/** Exact split of the total (in cents) across months; the rounding remainder lands on the last month. */
const phaseInCents = (total: number, months: number, shape: string): number[] => {
  const cents = Math.round(total * 100);
  const weights = shapeWeights(shape, months);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const amounts: number[] = [];
  let allocated = 0;
  for (let i = 0; i < months - 1; i += 1) {
    const share = Math.floor((cents * weights[i]) / weightSum);
    amounts.push(share);
    allocated += share;
  }
  amounts.push(cents - allocated);
  return amounts;
};

const money = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const toNum = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function BudgetPhasingAdvisor() {
  const [values, setValues] = useState<Record<string, string>>({
    total: "", months: "", shape: "S-curve", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const total = toNum(values.total);
    const months = toNum(values.months);
    if (total === null) {
      setError("Total budget must be a number.");
      return;
    }
    if (total <= 0) {
      setError("Total budget must be greater than zero.");
      return;
    }
    if (months === null || !Number.isInteger(months)) {
      setError("Number of months must be a whole number.");
      return;
    }
    if (months < 1 || months > 120) {
      setError("Phase across between 1 and 120 months.");
      return;
    }
    if (!["S-curve", "Linear", "Front-loaded", "Back-loaded"].includes(values.shape)) {
      setError("Choose one of the four phasing shapes.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const amounts = phaseInCents(total, months, values.shape);
      const totalCents = amounts.reduce((a, b) => a + b, 0);
      let peakIndex = 0;
      amounts.forEach((c, i) => {
        if (c > amounts[peakIndex]) peakIndex = i;
      });
      const averageCents = Math.round(totalCents / months);

      const prompt = [
        promptLine("Total budget", money(totalCents)),
        promptLine("Number of months", String(months)),
        promptLine("Phasing shape", values.shape),
        promptLine("Phasing notes", values.notes),
        "",
        "Computed month-by-month phasing (client-side, sums exactly to the total):",
        ...amounts.map((c, i) => `Month ${i + 1}: ${money(c)}`),
        `Total of all months: ${money(totalCents)}`,
        `Computed peak: Month ${peakIndex + 1} at ${money(amounts[peakIndex])}`,
        `Computed average per month: ${money(averageCents)}`,
        "",
        "Interpret the phasing now: PHASING READ, PEAK MONTH, CASH RISK and WHAT WOULD CHANGE THE SHAPE.",
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
      id="f023"
      rank={23}
      name="Budget Phasing Advisor"
      tagline="Phases the total client-side so the month table sums exactly to the budget, then reads the cash risk."
      category="Cost & Finance"
      icon={CalendarRange}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Phase the budget"
    />
  );
}
