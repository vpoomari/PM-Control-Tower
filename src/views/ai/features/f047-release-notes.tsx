"use client";
// PM CONTROL TOWER — AI Feature f047 · Release Notes Drafter
// Category: Agile & Delivery · importance rank 47. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Newspaper } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "version", label: "Version / release", type: "text", placeholder: "e.g. v3.14 · 28 Oct 2026" },
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "changes",
    label: "What changed",
    type: "textarea",
    rows: 7,
    required: true,
    placeholder: "One per line:\n- added CSV export for delivery confirmations\n- drop rescheduling now warns when the slot is outside yard hours\n- fixed: duplicate password reset emails\n- known: export times out above 10k rows",
    hint: "Raw change lines are fine — ticket ids and branch names are stripped out for customers.",
  },
  {
    key: "audience",
    label: "Audience",
    type: "select",
    options: [
      { value: "Customers", label: "Customers" },
      { value: "Internal", label: "Internal" },
      { value: "Both", label: "Both" },
    ],
  },
  { key: "highlights", label: "Headline change", type: "text", placeholder: "Optional: the one change this release is really about…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You write release notes a reader can understand without knowing the codebase or the team structure.",
  "Use exactly these headings in plain text, in this order: NEW, CHANGED, FIXED, KNOWN ISSUES, SUMMARY — each with 0 to 6 '-' bullets drawn only from the supplied change lines (an empty heading is printed as 'none in this release').",
  "One bullet per supplied change, written as a benefit in plain language: for Customers remove all internal jargon, ticket ids, branch and module names; for Internal keep the technical identifiers the team needs; for Both write the customer wording and append the internal reference in brackets.",
  "FIXED bullets start with what no longer happens; KNOWN ISSUES state the impact and the workaround if one was supplied, otherwise 'no workaround yet'.",
  "SUMMARY is exactly two sentences for the changelog header, using only changes that were listed; if the headline change was supplied, it leads the summary.",
  "If a change line is too thin to describe safely, write 'NEEDS DETAIL: <what is missing>' rather than guessing at user-facing behaviour; never invent features, dates or versions that were not supplied.",
  "Plain text output, no markdown fences, total under 350 words.",
].join(" ");

export default function ReleaseNotesDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    version: "", project: "", changes: "", audience: "Customers", highlights: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.changes.trim()) {
      setError("List what changed before drafting the release notes.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Version / release", values.version),
        promptLine("Project", values.project),
        promptLine("What changed", values.changes),
        promptLine("Audience", values.audience),
        promptLine("Headline change", values.highlights),
        "",
        "Draft the grouped release notes and the two-sentence changelog summary now.",
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
      id="f047"
      rank={47}
      name="Release Notes Drafter"
      tagline="Groups shipped changes into New / Changed / Fixed / Known issues plus a two-sentence changelog summary."
      category="Agile & Delivery"
      icon={Newspaper}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft release notes"
    />
  );
}
