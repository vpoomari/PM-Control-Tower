"use client";
// PM CONTROL TOWER — AI Feature f043 · Backlog Grooming Assistant
// Category: Agile & Delivery · importance rank 43. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ListFilter } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "items",
    label: "Raw backlog lines",
    type: "textarea",
    rows: 7,
    required: true,
    placeholder: "One item per line, exactly as they came in:\n- export delivery notes to csv (urgent!!)\n- customer wants a weekly email of failed drops\n- fix the login thing reported last week",
    hint: "Keep them rough — the point is to clean what is actually there.",
  },
  {
    key: "teamNote",
    label: "Team & sprint context",
    type: "text",
    placeholder: "e.g. 6-engineer platform team, 2-week sprints, sprint 14 starts 2 Nov",
  },
  { key: "sizeRule", label: "Size bucketing note", type: "textarea", rows: 3, placeholder: "Optional: e.g. anything over 3 days must be split before it can be estimated…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are the agile delivery lead preparing an unrefined backlog for a refinement session; the operator pasted the raw lines exactly as they exist today.",
  "Output exactly these headings in plain text: REFINE FIRST (the 3 items that most need attention, numbered, each with a one-line reason), then ITEMS (one block per pasted line, in the pasted order).",
  "Each ITEMS block must contain: 'Title:' an action-first rewrite starting with a verb, 'Missing:' the specific gaps as one-line bullets or 'none', 'Size:' S / M / L with a one-line reason, 'Verdict:' READY or NOT READY with the single reason.",
  "Size buckets: S = under one day for one person, M = one to three days, L = more than three days or not estimable — state which assumption you used; if the line gives no size evidence, put 'Size: unknown — needs a spike or split'.",
  "Verdict rule: NOT READY unless the line states what to build, for whom and how success is checked — never upgrade a thin line to READY; use 'NEEDS OWNER', 'NEEDS DATE' or 'NEEDS DETAIL: <what>' for gaps instead of inventing them.",
  "Plain text output, no markdown fences, one block per input line, total under 500 words.",
].join(" ");

export default function BacklogGroomingAssistant() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", items: "", teamNote: "", sizeRule: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const lines = values.items.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) {
      setError("Paste at least one backlog line to groom.");
      return;
    }
    if (lines.length > 60) {
      setError(`That is ${lines.length} lines — groom up to 60 items per run so nothing is summarised away.`);
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Raw backlog lines", values.items),
        promptLine("Team & sprint context", values.teamNote),
        promptLine("Size bucketing note", values.sizeRule),
        "",
        "Groom this backlog now: refine every item and give the ready / not-ready verdicts.",
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
      id="f043"
      rank={43}
      name="Backlog Grooming Assistant"
      tagline="Turns raw backlog lines into action-first titles, size buckets and an honest ready / not-ready verdict."
      category="Agile & Delivery"
      icon={ListFilter}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Groom the backlog"
    />
  );
}
