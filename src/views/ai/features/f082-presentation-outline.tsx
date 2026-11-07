"use client";
// PM CONTROL TOWER — AI Feature f082 · Presentation Outline Builder
// Category: Status & Reporting · importance rank 82. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Presentation } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "topic", label: "Topic", type: "text", required: true, placeholder: "e.g. Q3 portfolio review for the investment committee" },
  { key: "audience", label: "Audience", type: "text", required: true, placeholder: "e.g. Steering committee — two non-technical board members" },
  { key: "minutes", label: "Slot length (minutes)", type: "number", placeholder: "e.g. 25", hint: "Leave empty to assume 20 minutes." },
  { key: "message", label: "The one message", type: "text", placeholder: "e.g. We need a decision on the cutover date by 7 Nov" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build a slide-by-slide presentation outline for the topic, audience and slot length supplied.",
  "First fix the slide count: roughly one slide per 1.5–2 minutes; if no slot length was given, assume 20 minutes and say so in one line above the plan.",
  "Use exactly these headings in plain text (no markdown fences): OPENING, SLIDE PLAN, CLOSING.",
  "SLIDE PLAN prints one block per slide as: Slide <n> — <title> · Message: <one sentence the audience takes away> · Detail: <2–3 supporting bullets traceable to the inputs> · Timing: <minutes>.",
  "OPENING gives the exact opening line to speak. CLOSING gives the closing ask: what the audience must decide or do, and by when if a date was supplied.",
  "Every slide timing must be shown in minutes and the timings must add up to the slot length — restate the total after the plan.",
  "Never quote a statistic, date or name that was not supplied: write 'NEEDS DATA: <specific fact>' in that slide's Detail instead.",
  "Total length under 450 words.",
].join(" ");

export default function PresentationOutlineBuilder() {
  const [values, setValues] = useState<Record<string, string>>({
    topic: "", audience: "", minutes: "", message: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.minutes.trim()) {
      const minutes = Number(values.minutes);
      if (!Number.isFinite(minutes) || minutes < 5 || minutes > 300) {
        setError("Slot length must be between 5 and 300 minutes — or leave it empty to assume 20.");
        return;
      }
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Topic", values.topic),
        promptLine("Audience", values.audience),
        promptLine("Slot length (minutes)", values.minutes),
        promptLine("The one message", values.message),
        "",
        "Produce the slide-by-slide outline now.",
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
      id="f082"
      rank={82}
      name="Presentation Outline Builder"
      tagline="Slide-by-slide outline with one message per slide, honest timings, an opening line and a closing ask."
      category="Status & Reporting"
      icon={Presentation}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Outline the deck"
    />
  );
}
