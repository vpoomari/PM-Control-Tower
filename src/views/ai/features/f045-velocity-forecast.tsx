"use client";
// PM CONTROL TOWER — AI Feature f045 · Velocity Forecast
// Category: Agile & Delivery · importance rank 45. The arithmetic happens here
// (deterministic, client-side): the pasted history is parsed, the mean and the
// least-squares trend are computed locally and passed into the prompt — the model
// advises on the commitment, it never computes averages.
// Studio protocol: embedded SYSTEM_PROMPT + local input state + explicit
// try/catch around the central askAI server action (never throws → honest
// fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gauge } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project / team", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "history",
    label: "Completed points per sprint",
    type: "textarea",
    rows: 6,
    required: true,
    placeholder: "One sprint per line (or just the numbers):\nSprint 09: 24\nSprint 10: 27\nSprint 11: 26\nSprint 12: 31",
    hint: "Only completed (accepted) points — the mean and trend are computed from this here, not by the model.",
  },
  {
    key: "confidence",
    label: "Commitment confidence",
    type: "select",
    options: [
      { value: "Optimistic", label: "Optimistic (near the high end)" },
      { value: "Realistic", label: "Realistic (near the mean)" },
      { value: "Conservative", label: "Conservative (at or below the floor)" },
    ],
  },
  { key: "context", label: "Context that moves velocity", type: "textarea", rows: 3, placeholder: "Optional: holiday weeks, a new team member, on-call rotation, carry-over policy…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are an agile delivery lead forecasting team velocity going into sprint planning.",
  "The client has already parsed the sprint history and computed every statistic you receive — treat them as fact, never recompute or contradict them, and never introduce a sprint, points or team figure that was not supplied or computed for you; your job is the advice, not the arithmetic.",
  "Use exactly these headings in plain text: INPUT, FORECAST, COMMITMENT, WHAT WOULD BREAK IT.",
  "INPUT restates the supplied statistics in one line. FORECAST gives the next three sprints — 'Next sprint: low–high points', 'Sprint +2: …', 'Sprint +3: …' — anchored on the supplied mean and trend with the band widening as the horizon extends; if the history is too short or too volatile to trend, say so in one line and forecast flat on the mean instead.",
  "COMMITMENT gives one recommended commitment in points for the operator's chosen confidence — Optimistic near the high end of the band, Realistic at or just below the mean, Conservative at or just below the floor — then exactly 2 '-' bullets tying it to the mean, trend and range you were given.",
  "WHAT WOULD BREAK IT states the single assumption that would invalidate the forecast (team change, carry-over, interrupted sprint, holidays) as one question the operator must confirm; never invent team size, sprint length or historical figures, and use 'NEEDS DATA: <the figure needed>' for anything absent.",
  "Plain text output, no markdown fences, total under 300 words.",
].join(" ");

interface SprintSample {
  label: string;
  points: number;
}

/** Read one sprint per non-empty line; the last number on a line is its points. */
function parseHistory(raw: string): SprintSample[] {
  const out: SprintSample[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    const nums = text.match(/\d+(?:\.\d+)?/g) ?? [];
    if (nums.length === 0) continue;
    const numbersOnly = nums.length > 1 && /^[\d\s,;/|.]+$/.test(text);
    if (numbersOnly) {
      for (const n of nums) out.push({ label: `Sprint ${out.length + 1}`, points: Number(n) });
      continue;
    }
    const last = nums[nums.length - 1];
    const head = text.slice(0, text.lastIndexOf(last)).replace(/[\s:：\-–—]+$/, "").trim();
    out.push({ label: head || `Sprint ${out.length + 1}`, points: Number(last) });
  }
  return out;
}

export default function VelocityForecast() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", history: "", confidence: "Realistic", context: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);

    if (!values.history.trim()) {
      setError("Paste the completed points for at least two sprints.");
      return;
    }
    const samples = parseHistory(values.history);
    if (samples.length < 2) {
      setError(
        `I could only read ${samples.length} numeric sprint value(s) — use one number per line, e.g. "Sprint 12: 28".`,
      );
      return;
    }
    if (samples.some((s) => !Number.isFinite(s.points) || s.points < 0)) {
      setError("Completed points must be zero or greater on every line — fix the flagged value.");
      return;
    }

    const points = samples.map((s) => s.points);
    const n = points.length;
    const mean = points.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const latest = points[n - 1];
    const meanIndex = (n - 1) / 2;
    let num = 0;
    let den = 0;
    points.forEach((v, i) => {
      num += (i - meanIndex) * (v - mean);
      den += (i - meanIndex) * (i - meanIndex);
    });
    const slope = den > 0 ? num / den : 0;
    const direction = slope > 0.5 ? "rising" : slope < -0.5 ? "falling" : "flat";

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project / team", values.project),
        promptLine("Completed points per sprint (as pasted)", values.history),
        promptLine(
          "Computed client-side — treat as fact",
          `${n} sprints · mean ${mean.toFixed(1)} · trend ${direction} at ${slope.toFixed(1)} points per sprint · range ${min}–${max} · latest ${latest}`,
        ),
        promptLine("Context that moves velocity", values.context),
        promptLine("Commitment confidence", values.confidence),
        "",
        "Forecast the next three sprints and give the commitment recommendation now.",
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
      id="f045"
      rank={45}
      name="Velocity Forecast"
      tagline="Computes mean and trend from the sprint history client-side, then commits the next 3 sprints safely."
      category="Agile & Delivery"
      icon={Gauge}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Forecast velocity"
    />
  );
}
