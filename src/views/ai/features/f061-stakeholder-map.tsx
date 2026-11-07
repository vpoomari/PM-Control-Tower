"use client";
// PM CONTROL TOWER — AI Feature f061 · Stakeholder Map
// Category: Strategy & Stakeholders · importance rank 61. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Network } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "stakeholders", label: "Stakeholders", type: "textarea", rows: 5, required: true, placeholder: "One per line: Name — Role — influence or stance\nAmina Rahman — CFO — approves budget, sceptical of scope\nTom Vidal — Ops lead — runs the process being changed", hint: "Name and role are enough; add leverage or attitude if you know it." },
  { key: "context", label: "Context", type: "textarea", rows: 3, placeholder: "What the initiative is, the relationship climate, upcoming decisions, past friction…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Map the supplied stakeholders the way a programme director would before a kick-off meeting.",
  "Use these plain-text headings (no markdown fences, no bold): STAKEHOLDER MAP, ENGAGEMENT APPROACH, DANGER ZONES, MISSING FROM THE LIST, GROUNDING NOTES.",
  "STAKEHOLDER MAP is a pipe-separated table with one row per named person or group: name · role · power (High/Medium/Low) · interest (High/Medium/Low) · quadrant · engagement approach, ordered by power then interest.",
  "Assign exactly one quadrant per stakeholder using these four: manage closely (high power, high interest), keep satisfied (high power, low interest), keep informed (low power, high interest), monitor (low power, low interest).",
  "ENGAGEMENT APPROACH gives one concrete sentence per stakeholder — what to do, how often, and what they must never be surprised by.",
  "DANGER ZONES names the 2 most dangerous relationships (including friction between two stakeholders, not only their attitude to the project) with the reason and the first move; MISSING FROM THE LIST names roles only — never invented people — that this kind of initiative normally needs but the input lacks.",
  "Where power or interest cannot be judged from the inputs, write 'NEEDS DATA: <stakeholder> — <what to learn>'; never invent names, titles or opinions. Total length under 450 words.",
].join(" ");

export default function StakeholderMap() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", stakeholders: "", context: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const named = values.stakeholders.split("\n").filter((line) => line.trim()).length;
    if (named < 2) {
      setError("Enter at least two stakeholders, one per line, so the map can compare them.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Stakeholders (one per line)", values.stakeholders),
        promptLine("Context", values.context),
        "",
        "Produce the stakeholder map now.",
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
      id="f061"
      rank={61}
      name="Stakeholder Map"
      tagline="Places every stakeholder in a power/interest quadrant and tells you how to work each relationship."
      category="Strategy & Stakeholders"
      icon={Network}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Map stakeholders"
    />
  );
}
