"use client";
// PM CONTROL TOWER — AI Feature f084 · Project Data Quality Audit
// Category: Personal & Data · importance rank 84. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ScanSearch } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "records", label: "Records", type: "textarea", rows: 8, required: true, placeholder: "A-102 | owner: Priya | 2026-11-02 → 2026-11-04 | Done\nA-103 | owner: — | 2026-11-05 → 2026-10-30 | In progress", hint: "One record per line with owner, dates and status exactly as exported." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The pasted records are the entire dataset — audit them as raw rows and never assume a row, owner, date or status that is not printed.",
  "Number the rows from 1 in the order pasted, and quote the offending row verbatim (copied exactly as pasted) before every finding so the operator can locate it.",
  "Use exactly these headings in plain text (no markdown fences): ISSUES BY ROW, QUALITY SCORE, FIX FIRST FIVE.",
  "ISSUES BY ROW prints one entry per defective row as: Row <n> — <defect> — <exact fix>, where the defect is one of: missing owner, invalid or conflicting dates, stuck status, orphan item, outlier.",
  "Where a row lacks an owner or a usable date, the fix is 'NEEDS OWNER' or 'NEEDS DATE' — never supply a name or a date yourself; if two dates contradict each other, quote both.",
  "QUALITY SCORE is 0–100 with a one-line justification that counts the defective rows out of the total rows pasted.",
  "FIX FIRST FIVE names the 5 records to correct first, in priority order, each with one line on why it distorts reporting today — flag and fix, never silently repair a row.",
].join(" ");

export default function ProjectDataQualityAudit() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", records: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const rows = values.records.split("\n").map((line) => line.trim()).filter(Boolean);
    if (rows.length < 2) {
      setError("Paste at least two records — one per line — so the audit has rows to compare.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Records", values.records),
        "",
        "Audit the records now.",
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
      id="f084"
      rank={84}
      name="Project Data Quality Audit"
      tagline="Finds defective rows in pasted records, quotes each one, and ranks the five fixes that matter first."
      category="Personal & Data"
      icon={ScanSearch}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Audit the records"
    />
  );
}
