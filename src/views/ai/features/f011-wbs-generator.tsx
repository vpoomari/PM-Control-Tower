"use client";
// PM CONTROL TOWER — AI Feature f011 · WBS Generator
// Category: Plan & Schedule · importance rank 11. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FolderKanban } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "objective",
    label: "Objective / deliverable",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "e.g. Migrate billing to the new platform and go live in all 3 regions by Q3 2027",
    hint: "One outcome-based sentence a phase can be judged against.",
  },
  {
    key: "depth",
    label: "Breakdown depth",
    type: "select",
    options: [
      { value: "Phases", label: "Phases" },
      { value: "Work packages", label: "Work packages" },
      { value: "Tasks", label: "Tasks" },
    ],
  },
  { key: "count", label: "Number of phases", type: "number", placeholder: "e.g. 5", hint: "Whole number, 3–8." },
  {
    key: "constraints",
    label: "Constraints",
    type: "text",
    placeholder: "e.g. Two squads only, no new tooling, fixed go-live 30 Jun 2027",
  },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Produce a work breakdown structure as plain text with box-drawing indentation: phases as '1. PHASE NAME', work packages indented one level with '├ ' or '└ ' prefixes, tasks indented one level further — no markdown fences, no bold, no code blocks.",
  "Expand exactly to the requested depth and no deeper: Phases stops after the phase lines, Work packages stops after the packages, Tasks goes one level further.",
  "Every leaf line ends with a duration estimate in working days in square brackets, e.g. [12d], then a one-line description of the deliverable — label the whole duration set 'ESTIMATED (no schedule supplied)' because durations were not provided.",
  "Split the objective into exactly the requested number of phases (within 3–8), number them sequentially, and make every phase outcome-based so completion is verifiable.",
  "Treat each constraint as a hard rule: no package or task may break it, and flag any constraint the breakdown cannot satisfy.",
  "Close with an ASSUMPTIONS section (numbered, max 6) followed by one DATA NEEDED line listing exactly what would replace each guess — dates, team sizes, vendor lead times.",
  "Maximum 60 lines in total.",
].join(" ");

export default function WbsGenerator() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    objective: "",
    depth: "Work packages",
    count: "",
    constraints: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);

    const count = values.count.trim();
    if (count) {
      const n = Number(count);
      if (!Number.isInteger(n) || n < 3 || n > 8) {
        setError("Number of phases must be a whole number between 3 and 8.");
        return;
      }
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Objective", values.objective),
        promptLine("Breakdown depth", values.depth),
        promptLine("Number of phases", count),
        promptLine("Constraints", values.constraints),
        "",
        "Generate the indented WBS outline now.",
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
      id="f011"
      rank={11}
      name="WBS Generator"
      tagline="Builds an indented phase → work package → task WBS with working-day durations and stated assumptions."
      category="Plan & Schedule"
      icon={FolderKanban}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Generate WBS"
    />
  );
}
