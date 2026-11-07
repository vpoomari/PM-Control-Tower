"use client";
// PM CONTROL TOWER — AI Feature f014 · PERT Duration Estimator
// Category: Plan & Schedule · importance rank 14. The arithmetic happens here
// (deterministic, client-side) and the model only explains what the range means
// — the expected duration and sigma are never left to the LLM to invent.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Calculator } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "optimistic", label: "Optimistic (O)", type: "number", required: true, placeholder: "e.g. 10", hint: "Best case, working days." },
  { key: "mostLikely", label: "Most likely (M)", type: "number", required: true, placeholder: "e.g. 20", hint: "Best single-point estimate, working days." },
  { key: "pessimistic", label: "Pessimistic (P)", type: "number", required: true, placeholder: "e.g. 45", hint: "Worst credible case, working days." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The client has already computed the PERT expected duration, sigma, variance, the ±1σ and ±2σ bounds and both distances from the most likely value — treat every one of those figures as fact: never re-derive, re-round, correct or introduce a different number.",
  "Use exactly these plain-text headings: CONFIDENCE RANGE, SKEW RISK, WHY THE RANGE IS WIDE, HOW TO NARROW IT, VERDICT.",
  "CONFIDENCE RANGE restates the supplied ±1σ window as roughly the 68% range of outcomes and the ±2σ window as roughly 95%, then names the single planning number to commit to; SKEW RISK compares the two supplied distances and identifies which tail threatens the schedule.",
  "WHY THE RANGE IS WIDE explains in 2 bullets what a gap that size usually means for an activity of this kind, without inventing causes that were not supplied; HOW TO NARROW IT gives exactly 3 de-risking actions (spike, prototype, supplier lead-time check, splitting the activity) each with an owner role.",
  "VERDICT is one sentence stating whether the estimate is committable today or must be re-estimated after the narrowing actions.",
  "If sigma is zero, say the three estimates are identical and that this signals groupthink rather than certainty.",
  "Never quote a completion date, calendar duration or cost that was not supplied or computed above; put anything else under DATA NEEDED.",
  "Maximum 300 words.",
].join(" ");

const toNum = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number): string => n.toFixed(2);

export default function PertDurationEstimator() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    optimistic: "",
    mostLikely: "",
    pessimistic: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const o = toNum(values.optimistic);
    const m = toNum(values.mostLikely);
    const p = toNum(values.pessimistic);
    if (o === null || m === null || p === null) {
      setError("Optimistic, most likely and pessimistic must all be numbers.");
      return;
    }
    if (o <= 0 || m <= 0 || p <= 0) {
      setError("PERT durations must be greater than zero working days.");
      return;
    }
    if (o > m || m > p) {
      setError("PERT needs optimistic ≤ most likely ≤ pessimistic — check the three estimates.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      // Deterministic PERT maths — the model only explains these figures.
      const expected = (o + 4 * m + p) / 6;
      const sigma = (p - o) / 6;
      const variance = sigma * sigma;
      const low1 = expected - sigma;
      const high1 = expected + sigma;
      const low2 = expected - 2 * sigma;
      const high2 = expected + 2 * sigma;
      const toOptimistic = m - o;
      const toPessimistic = p - m;

      const prompt = [
        promptLine("Project", values.project),
        promptLine("Supplied estimates", `O ${o} · M ${m} · P ${p} (working days)`),
        promptLine(
          "Computed for you",
          `expected ${fmt(expected)} · sigma ${fmt(sigma)} · variance ${fmt(variance)} · ±1σ ${fmt(low1)} to ${fmt(high1)} · ±2σ ${fmt(low2)} to ${fmt(high2)} · most likely − optimistic ${fmt(toOptimistic)} · pessimistic − most likely ${fmt(toPessimistic)}`,
        ),
        "",
        "Explain the confidence range, skew risk and how to narrow the estimate now.",
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
      id="f014"
      rank={14}
      name="PERT Duration Estimator"
      tagline="Computes expected duration and sigma locally, then explains the confidence range and the skew risk."
      category="Plan & Schedule"
      icon={Calculator}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Estimate duration"
    />
  );
}
