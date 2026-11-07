"use client";
// PM CONTROL TOWER — AI Feature f035 · Steering Committee Pack Outline
// Category: Status & Reporting · importance rank 35. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Presentation } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "period", label: "Reporting period", type: "text", placeholder: "e.g. October 2026 (steerco 05 Nov)" },
  { key: "highlights", label: "Highlights & position", type: "textarea", rows: 5, required: true, placeholder: "What happened this period — deliverables, RAG, spend vs budget, key dates, top RAID movements…\nFacts only; figures you give can be quoted.", hint: "The pack can only show numbers you supply — everything else is marked NEEDS DATA." },
  { key: "asks", label: "Asks & decisions", type: "textarea", rows: 3, placeholder: "Decisions you need from the committee, each with a by-when:\nApprove £40k change for the data migration by 05 Nov", hint: "Powers slide 1 — the first thing the committee sees." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Lay out a steering committee pack of 8 to 12 slides for the stated reporting period — an outline the PM can drop straight into a deck.",
  "Use this plain-text structure: start with 'SLIDE 1 · DECISIONS' listing each ask with its by-when if supplied (or 'No decisions requested this period' when none was given), then one block per slide written as 'SLIDE n · <title>' followed by a 'Headline:' line carrying the one message of that slide, a 'Data:' line with exactly 3 figures that must appear on it (write NEEDS DATA: <what is missing> for any figure not supplied), and a 'Note:' line of one sentence for the presenter; finish with 'THE 3 DATA POINTS TO SHOW' naming the three figures the chair must see, chosen from the slides.",
  "Slide order: decisions, position & RAG, progress this period, plan ahead, RAID & issues, cost, timeline & milestones, resources, close — merge or split slides to land between 8 and 12 total.",
  "Never quote a metric, percentage, budget figure, milestone date or RAG rating that was not supplied: every missing figure becomes NEEDS DATA: <what> instead of an estimate, and the position slide must say 'RAG not supplied' rather than picking one.",
  "Total length under 550 words.",
].join(" ");

export default function SteeringCommitteePackOutline() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", period: "", highlights: "", asks: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.highlights.trim().length < 30) {
      setError("Add the period's highlights — the pack outline is built from them.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Reporting period", values.period),
        promptLine("Highlights & position", values.highlights),
        promptLine("Asks & decisions for the committee", values.asks),
        "",
        "Build the slide-by-slide steering pack outline now.",
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
      id="f035"
      rank={35}
      name="Steering Committee Pack Outline"
      tagline="Lays out an 8–12 slide steering pack with headlines, data points and slide-1 decisions."
      category="Status & Reporting"
      icon={Presentation}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Outline the pack"
    />
  );
}
